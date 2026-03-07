use axum::extract::{FromRequestParts, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{get, post};
use axum::{Json, Router};
use axum_extra::TypedHeader;
use axum_extra::headers::{Authorization, authorization::Bearer};
use tower_governor::GovernorLayer;
use tower_governor::governor::GovernorConfigBuilder;
use tower_governor::key_extractor::SmartIpKeyExtractor;
use uuid::Uuid;

use secrecy::ExposeSecret;

use crate::AppState;
use crate::auth;
use crate::error::AppError;
use crate::models::*;

pub fn routes() -> Router<AppState> {
    let rate_limit_config = GovernorConfigBuilder::default()
        .key_extractor(SmartIpKeyExtractor)
        .per_second(5)
        .burst_size(10)
        .finish()
        .expect("Failed to build rate limiter config");

    let rate_limited = Router::new()
        .route("/auth/register", post(register))
        .route("/auth/login", post(login))
        .layer(GovernorLayer::new(rate_limit_config));

    Router::new()
        .route("/auth/health", get(health))
        .merge(rate_limited)
        .route("/auth/token/refresh", post(refresh))
        .route("/auth/token/verify", post(verify))
        .route("/auth/me", get(me).delete(deactivate))
}

async fn health(State(state): State<AppState>) -> Result<Json<HealthResponse>, AppError> {
    sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&state.db)
        .await?;

    Ok(Json(HealthResponse {
        status: "ok".into(),
        service: "heimdall".into(),
    }))
}

async fn register(
    State(state): State<AppState>,
    Json(body): Json<RegisterRequest>,
) -> Result<(StatusCode, Json<UserResponse>), AppError> {
    let email = normalize_email(&body.email)?;

    let password = body.password.expose_secret();

    if password.len() < 8 || password.len() > 128 {
        return Err(AppError::BadRequest(
            "Password must be between 8 and 128 characters".into(),
        ));
    }

    let hashed = auth::hash_password(password)
        .await
        .map_err(|e| AppError::Internal(format!("Password hash error: {e}")))?;

    let user = sqlx::query_as::<_, UserInfo>(
        "INSERT INTO users (id, email, hashed_password) VALUES ($1, $2, $3) \
         RETURNING id, email, is_active, is_verified, created_at, updated_at",
    )
    .bind(Uuid::new_v4())
    .bind(&email)
    .bind(&hashed)
    .fetch_one(&state.db)
    .await?;

    Ok((StatusCode::CREATED, Json(UserResponse::from(&user))))
}

async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> Result<Json<TokenResponse>, AppError> {
    let email = normalize_email(&body.email)?;

    let creds = sqlx::query_as::<_, Credentials>(
        "SELECT id, hashed_password, is_active FROM users WHERE email = $1",
    )
    .bind(&email)
    .fetch_optional(&state.db)
    .await?;

    // Always run argon2 even when no user found — prevents timing-based email enumeration.
    let hash = creds
        .as_ref()
        .map(|c| c.hashed_password.as_str())
        .unwrap_or(&state.dummy_hash);
    let password_ok = auth::verify_password(body.password.expose_secret(), hash).await;

    let creds = creds
        .filter(|_| password_ok)
        .ok_or_else(|| AppError::Unauthorized("Incorrect email or password".into()))?;

    if !creds.is_active {
        return Err(AppError::Forbidden("Account is inactive".into()));
    }

    let (access_token, expires_in) = auth::create_access_token(&state, creds.id)?;

    let refresh_token = auth::create_refresh_token(&state, creds.id)?;

    Ok(Json(TokenResponse::new(
        access_token,
        refresh_token,
        expires_in,
    )))
}

async fn refresh(
    State(state): State<AppState>,
    Json(body): Json<RefreshRequest>,
) -> Result<Json<TokenResponse>, AppError> {
    let claims = auth::decode_token(&state, &body.refresh_token)?;

    if claims.token_type != auth::TokenType::Refresh {
        return Err(AppError::Unauthorized(
            "Invalid or expired refresh token".into(),
        ));
    }

    let user = sqlx::query_as::<_, UserInfo>(
        "SELECT id, email, is_active, is_verified, created_at, updated_at \
         FROM users WHERE id = $1",
    )
    .bind(claims.sub)
    .fetch_optional(&state.db)
    .await?
    .filter(|u| u.is_active)
    .ok_or_else(|| AppError::Unauthorized("Invalid or expired refresh token".into()))?;

    let (access_token, expires_in) = auth::create_access_token(&state, user.id)?;

    let refresh_token = auth::create_refresh_token(&state, user.id)?;

    Ok(Json(TokenResponse::new(
        access_token,
        refresh_token,
        expires_in,
    )))
}

async fn verify(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<VerifyRequest>,
) -> Result<Json<UserResponse>, AppError> {
    if let Some(expected_key) = &state.api_key {
        let provided_key = headers
            .get("x-api-key")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");

        if provided_key != expected_key {
            return Err(AppError::Unauthorized("Invalid or missing API key".into()));
        }
    }

    let claims = auth::decode_token(&state, &body.token)
        .map_err(|_| AppError::Unauthorized("Invalid or expired token".into()))?;

    if claims.token_type != auth::TokenType::Access {
        return Err(AppError::Unauthorized("Invalid token type".into()));
    }

    let user = sqlx::query_as::<_, UserInfo>(
        "SELECT id, email, is_active, is_verified, created_at, updated_at \
         FROM users WHERE id = $1",
    )
    .bind(claims.sub)
    .fetch_optional(&state.db)
    .await?
    .filter(|u| u.is_active)
    .ok_or_else(|| AppError::Unauthorized("Invalid or expired token".into()))?;

    Ok(Json(UserResponse::from(&user)))
}

async fn me(AuthUser(user): AuthUser) -> Result<Json<UserResponse>, AppError> {
    Ok(Json(UserResponse::from(&user)))
}

async fn deactivate(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<StatusCode, AppError> {
    sqlx::query("UPDATE users SET is_active = false WHERE id = $1")
        .bind(user.id)
        .execute(&state.db)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

pub struct AuthUser(pub UserInfo);

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut axum::http::request::Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let TypedHeader(Authorization(bearer)) =
            TypedHeader::<Authorization<Bearer>>::from_request_parts(parts, state)
                .await
                .map_err(|_| AppError::Unauthorized("Missing or malformed bearer token".into()))?;

        let claims = auth::decode_token(state, bearer.token())?;

        if claims.token_type != auth::TokenType::Access {
            return Err(AppError::Unauthorized("Invalid token type".into()));
        }

        let user = sqlx::query_as::<_, UserInfo>(
            "SELECT id, email, is_active, is_verified, created_at, updated_at \
             FROM users WHERE id = $1",
        )
        .bind(claims.sub)
        .fetch_optional(&state.db)
        .await
        .map_err(AppError::from)?
        .ok_or_else(|| AppError::Unauthorized("User not found".into()))?;

        if !user.is_active {
            return Err(AppError::Forbidden("Account is inactive".into()));
        }

        Ok(AuthUser(user))
    }
}
