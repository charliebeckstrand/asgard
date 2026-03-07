use argon2::{
    Argon2,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString, rand_core::OsRng},
};

use chrono::{TimeDelta, Utc};
use jsonwebtoken::{Algorithm, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::AppState;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TokenType {
    Access,
    Refresh,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: Uuid,
    #[serde(rename = "type")]
    pub token_type: TokenType,
    pub exp: i64,
    pub iat: i64,
    pub jti: String,
}

// Passwords are hashed with Argon2id.
pub async fn hash_password(password: &str) -> Result<String, argon2::password_hash::Error> {
    let password = password.to_owned();

    tokio::task::spawn_blocking(move || {
        let salt = SaltString::generate(&mut OsRng);
        let hash = Argon2::default().hash_password(password.as_bytes(), &salt)?;
        Ok(hash.to_string())
    })
    .await
    .expect("password hash task panicked")
}

pub async fn verify_password(password: &str, hash: &str) -> bool {
    let password = password.to_owned();

    let hash = hash.to_owned();

    tokio::task::spawn_blocking(move || {
        let Ok(parsed) = PasswordHash::new(&hash) else {
            return false;
        };

        Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok()
    })
    .await
    .expect("password verify task panicked")
}

pub fn create_access_token(
    state: &AppState,
    user_id: Uuid,
) -> Result<(String, i64), jsonwebtoken::errors::Error> {
    let expires_in = state.access_token_minutes * 60;

    let token = build_token(
        state,
        user_id,
        TokenType::Access,
        TimeDelta::seconds(expires_in),
    )?;

    Ok((token, expires_in))
}

pub fn create_refresh_token(
    state: &AppState,
    user_id: Uuid,
) -> Result<String, jsonwebtoken::errors::Error> {
    build_token(
        state,
        user_id,
        TokenType::Refresh,
        TimeDelta::days(state.refresh_token_days),
    )
}

fn build_token(
    state: &AppState,
    user_id: Uuid,
    token_type: TokenType,
    duration: TimeDelta,
) -> Result<String, jsonwebtoken::errors::Error> {
    let now = Utc::now();

    let claims = Claims {
        sub: user_id,
        token_type,
        exp: (now + duration).timestamp(),
        iat: now.timestamp(),
        jti: Uuid::new_v4().to_string(),
    };

    encode(&Header::default(), &claims, &state.encoding_key)
}

pub fn decode_token(state: &AppState, token: &str) -> Result<Claims, jsonwebtoken::errors::Error> {
    let data = decode::<Claims>(
        token,
        &state.decoding_key,
        &Validation::new(Algorithm::HS256),
    )?;

    Ok(data.claims)
}
