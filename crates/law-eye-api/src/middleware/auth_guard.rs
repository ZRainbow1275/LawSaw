use axum::{
    extract::FromRequestParts,
    http::{request::Parts, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;

use crate::auth::{AuthSession, AuthenticatedUser};

#[derive(Debug, Serialize)]
struct AuthError {
    error: String,
}

pub struct RequireAuth(pub AuthenticatedUser);

impl<S> FromRequestParts<S> for RequireAuth
where
    S: Send + Sync,
{
    type Rejection = Response;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let auth_session = AuthSession::from_request_parts(parts, state)
            .await
            .map_err(|e| e.into_response())?;

        match auth_session.user {
            Some(user) => Ok(RequireAuth(user)),
            None => Err((
                StatusCode::UNAUTHORIZED,
                Json(AuthError {
                    error: "Authentication required".to_string(),
                }),
            )
                .into_response()),
        }
    }
}
