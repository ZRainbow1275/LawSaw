use async_trait::async_trait;
use axum_login::{AuthUser, AuthnBackend, UserId};
use law_eye_core::UserService;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::sync::Arc;
use utoipa::ToSchema;
use uuid::Uuid;

// Wrapper type to implement AuthUser for external User type
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthenticatedUser {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub email: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub is_active: bool,
    password_hash: String,
}

impl AuthenticatedUser {
    pub fn from_db_user(user: &law_eye_db::User) -> Self {
        Self {
            id: user.id,
            tenant_id: user.tenant_id,
            email: user.email.clone(),
            display_name: user.display_name.clone(),
            avatar_url: user.avatar_url.clone(),
            is_active: user.is_active,
            password_hash: user.password_hash.clone(),
        }
    }
}

impl AuthUser for AuthenticatedUser {
    type Id = Uuid;

    fn id(&self) -> Self::Id {
        self.id
    }

    fn session_auth_hash(&self) -> &[u8] {
        self.password_hash.as_bytes()
    }
}

// Credentials for login
#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct Credentials {
    pub email: String,
    pub password: String,
}

// Auth backend implementation
#[derive(Clone)]
pub struct AuthBackend {
    user_service: Arc<UserService>,
}

impl std::fmt::Debug for AuthBackend {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AuthBackend").finish()
    }
}

impl AuthBackend {
    pub fn new(pool: PgPool) -> Self {
        Self {
            user_service: Arc::new(UserService::new(pool)),
        }
    }

    #[allow(dead_code)]
    pub fn user_service(&self) -> &Arc<UserService> {
        &self.user_service
    }
}

#[async_trait]
impl AuthnBackend for AuthBackend {
    type User = AuthenticatedUser;
    type Credentials = Credentials;
    type Error = std::convert::Infallible;

    async fn authenticate(
        &self,
        creds: Self::Credentials,
    ) -> Result<Option<Self::User>, Self::Error> {
        match self
            .user_service
            .verify_password(&creds.email, &creds.password)
            .await
        {
            Ok(user) => Ok(Some(AuthenticatedUser::from_db_user(&user))),
            Err(_) => Ok(None),
        }
    }

    async fn get_user(&self, user_id: &UserId<Self>) -> Result<Option<Self::User>, Self::Error> {
        match self.user_service.get_by_id(*user_id).await {
            Ok(user) => Ok(Some(AuthenticatedUser::from_db_user(&user))),
            Err(_) => Ok(None),
        }
    }
}

pub type AuthSession = axum_login::AuthSession<AuthBackend>;

// Response type for auth errors
#[allow(dead_code)]
#[derive(Debug, Serialize)]
pub struct AuthError {
    pub error: String,
}
