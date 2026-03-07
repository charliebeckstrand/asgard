mod auth;
mod error;
mod handlers;
mod models;

use std::net::SocketAddr;
use std::sync::Arc;

use axum::Router;
use axum::http::Method;
use axum::http::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE};
use jsonwebtoken::{DecodingKey, EncodingKey};
use secrecy::{ExposeSecret, SecretString};
use sqlx::postgres::PgPoolOptions;
use tower_http::cors::{Any, CorsLayer};
use tower_http::request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer};
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::trace::TraceLayer;

#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::PgPool,
    pub encoding_key: Arc<EncodingKey>,
    pub decoding_key: Arc<DecodingKey>,
    pub dummy_hash: String,
    pub access_token_minutes: i64,
    pub refresh_token_days: i64,
    pub api_key: Option<String>,
}

fn cors_layer() -> CorsLayer {
    let explicitly_set = std::env::var("CORS_ORIGINS");

    let raw = explicitly_set
        .as_deref()
        .unwrap_or("http://localhost:3000")
        .to_owned();

    let origins: Vec<_> = raw
        .split(',')
        .filter_map(|s| s.trim().parse().ok())
        .collect();

    if origins.is_empty() {
        if explicitly_set.is_ok() {
            tracing::warn!(
                "CORS_ORIGINS is set but contains no valid origins (value: {raw:?}); \
                 falling back to permissive CORS"
            );
        }

        // allow_credentials(true) is intentionally omitted here because
        // browsers reject credentials with a wildcard origin.
        CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any)
    } else {
        CorsLayer::new()
            .allow_origin(origins)
            .allow_methods([
                Method::GET,
                Method::POST,
                Method::PUT,
                Method::PATCH,
                Method::DELETE,
                Method::OPTIONS,
            ])
            .allow_headers([AUTHORIZATION, ACCEPT, CONTENT_TYPE])
            .allow_credentials(true)
    }
}

fn require_env(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| {
        // Use eprintln as a fallback in case tracing isn't initialized yet.
        eprintln!("ERROR: {name} environment variable is not set. \
                   Set it in the DigitalOcean App Platform dashboard under \
                   Settings > heimdall > Environment Variables.");
        std::process::exit(1);
    })
}

#[tokio::main]
async fn main() {
    let _ = dotenvy::dotenv();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "heimdall=info,tower_http=info".parse().unwrap()),
        )
        .json()
        .flatten_event(true)
        .init();

    let database_url = SecretString::from(require_env("DATABASE_URL"));
    let jwt_secret = SecretString::from(require_env("SECRET_KEY"));

    let pool = match PgPoolOptions::new()
        .max_connections(5)
        .connect_lazy(database_url.expose_secret())
    {
        Ok(pool) => pool,
        Err(e) => {
            tracing::error!("Failed to create database connection pool: {e}");
            std::process::exit(1);
        }
    };

    if let Err(e) = sqlx::migrate!().run(&pool).await {
        tracing::error!(
            "Failed to run migrations: {e}. If you see \"permission denied for schema public\", \
             run this SQL as your database admin: \
             GRANT CREATE ON SCHEMA public TO <your_db_user>;"
        );

        std::process::exit(1);
    }

    let secret_bytes = jwt_secret.expose_secret().as_bytes();

    let encoding_key = Arc::new(EncodingKey::from_secret(secret_bytes));
    let decoding_key = Arc::new(DecodingKey::from_secret(secret_bytes));

    let dummy_hash = auth::hash_password("dummy-timing-pad")
        .await
        .expect("Failed to generate dummy hash for timing protection");

    let state = AppState {
        db: pool,
        encoding_key,
        decoding_key,
        dummy_hash,
        access_token_minutes: std::env::var("ACCESS_TOKEN_EXPIRE_MINUTES")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(30),
        refresh_token_days: std::env::var("REFRESH_TOKEN_EXPIRE_DAYS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(7),
        api_key: std::env::var("HEIMDALL_API_KEY").ok(),
    };

    let x_request_id = axum::http::HeaderName::from_static("x-request-id");

    let app = Router::new()
        .merge(handlers::routes())
        .layer(PropagateRequestIdLayer::new(x_request_id.clone()))
        .layer(TraceLayer::new_for_http())
        .layer(SetRequestIdLayer::new(x_request_id, MakeRequestUuid))
        .layer(SetResponseHeaderLayer::if_not_present(
            axum::http::header::CONTENT_DISPOSITION,
            axum::http::HeaderValue::from_static("inline"),
        ))
        .layer(cors_layer())
        .with_state(state);

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(8000);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));

    tracing::info!("Heimdall listening on {addr}");

    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            tracing::error!("Failed to bind to {addr}: {e}");
            std::process::exit(1);
        }
    };

    if let Err(e) = axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())
        .with_graceful_shutdown(shutdown_signal())
        .await
    {
        tracing::error!("Server error: {e}");

        std::process::exit(1);
    }
}

async fn shutdown_signal() {
    tokio::signal::ctrl_c()
        .await
        .expect("Failed to listen for ctrl+c");

    tracing::info!("Shutting down");
}
