use axum::{
    extract::FromRequestParts,
    http::Method,
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

#[derive(Debug, Clone, Copy)]
pub struct RequiredPermission(pub &'static str);

#[derive(Debug, Clone, Copy)]
pub struct RequiredPermissions {
    pub read: &'static str,
    pub write: &'static str,
}

/// Default-deny permission guard.
///
/// Usage pattern:
/// - Attach either:
///   - `RequiredPermission("<perm>")`, or
///   - `RequiredPermissions { read: "<perm>", write: "<perm>" }`
///     to a router/route via `Extension`
/// - Add `middleware::from_extractor::<RequirePermission>()`
///
/// If no required permission policy is attached, the request is rejected (403).
pub struct RequirePermission;

impl<S> FromRequestParts<S> for RequirePermission
where
    S: Send + Sync,
{
    type Rejection = Response;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let required = if let Some(exact) = parts.extensions.get::<RequiredPermission>() {
            exact.0
        } else if let Some(policy) = parts.extensions.get::<RequiredPermissions>() {
            match parts.method {
                Method::GET | Method::HEAD | Method::OPTIONS => policy.read,
                _ => policy.write,
            }
        } else {
            return Err(
                AppError::forbidden("Permission policy is not configured for this route")
                    .into_response(),
            );
        };

        let auth_session = AuthSession::from_request_parts(parts, state)
            .await
            .map_err(|e| e.into_response())?;

        let user = auth_session.user.ok_or_else(|| {
            AppError::unauthorized("Authentication required").into_response()
        })?;

        let allowed = auth_session
            .backend
            .user_service()
            .has_permission(user.id, required)
            .await
            .map_err(|e| AppError::from(e).into_response())?;

        if !allowed {
            return Err(AppError::forbidden("Permission denied").into_response());
        }

        Ok(RequirePermission)
    }
}
