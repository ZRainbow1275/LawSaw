use axum::{
    extract::FromRequestParts,
    http::request::Parts,
    response::{IntoResponse, Response},
};

use crate::auth::AuthSession;
use crate::AppError;

pub struct RequireAuth;

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
            Some(_) => Ok(RequireAuth),
            None => Err(AppError::unauthorized("Authentication required").into_response()),
        }
    }
}
