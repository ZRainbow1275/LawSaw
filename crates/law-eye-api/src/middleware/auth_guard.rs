use axum::{
    extract::FromRequestParts,
    http::request::Parts,
    http::Method,
    response::{IntoResponse, Response},
};
pub use law_eye_core::role_tier::{
    derive_role_tier_from_names, role_tier_at_least, role_tier_rank,
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
            Some(ref user) if !user.is_active => {
                Err(AppError::forbidden("User account is disabled").into_response())
            }
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

        let user = auth_session
            .user
            .ok_or_else(|| AppError::unauthorized("Authentication required").into_response())?;

        if !user.is_active {
            return Err(AppError::forbidden("User account is disabled").into_response());
        }

        let allowed = auth_session
            .backend
            .user_service()
            .has_permission(user.tenant_id, user.id, required)
            .await
            .map_err(|e| AppError::from(e).into_response())?;

        if !allowed {
            return Err(AppError::forbidden("Permission denied").into_response());
        }

        Ok(RequirePermission)
    }
}

/// Minimum role tier required to access a route. Attach via `Extension(RequiredRoleTier(...))`.
#[derive(Debug, Clone)]
pub struct RequiredRoleTier(pub &'static str);

/// Default-deny role-tier guard.
///
/// Usage pattern (mirrors `RequirePermission`):
/// - Attach `RequiredRoleTier("<tier>")` via `Extension`
/// - Add `middleware::from_extractor::<RequireRoleTier>()`
///
/// If no required tier is attached, the request is rejected (403).
pub struct RequireRoleTier;

impl<S> FromRequestParts<S> for RequireRoleTier
where
    S: Send + Sync,
{
    type Rejection = Response;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let required = parts
            .extensions
            .get::<RequiredRoleTier>()
            .map(|value| value.0)
            .ok_or_else(|| {
                AppError::forbidden("Role tier policy is not configured for this route")
                    .into_response()
            })?;

        let auth_session = AuthSession::from_request_parts(parts, state)
            .await
            .map_err(|e| e.into_response())?;

        let user = auth_session
            .user
            .ok_or_else(|| AppError::unauthorized("Authentication required").into_response())?;

        if !user.is_active {
            return Err(AppError::forbidden("User account is disabled").into_response());
        }

        let roles = auth_session
            .backend
            .user_service()
            .get_user_roles(user.tenant_id, user.id)
            .await
            .map_err(|e| AppError::from(e).into_response())?;
        let role_names: Vec<String> = roles.into_iter().map(|role| role.name).collect();
        let role_tier = derive_role_tier_from_names(&role_names);

        if !role_tier_at_least(&role_tier, required) {
            return Err(AppError::forbidden(format!(
                "Requires role tier '{required}', current '{role_tier}'"
            ))
            .into_response());
        }

        Ok(RequireRoleTier)
    }
}
