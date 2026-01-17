pub mod ai;
pub mod apikeys;
pub mod articles;
pub mod auth;
pub mod categories;
pub mod health;
pub mod search;
pub mod sources;
pub mod users;

use axum::Router;

use crate::state::AppState;

pub fn create_router(state: AppState) -> Router {
    Router::new()
        .nest("/api/v1/articles", articles::router())
        .nest("/api/v1/sources", sources::router())
        .nest("/api/v1/categories", categories::router())
        .nest("/api/v1/ai", ai::router())
        .nest("/api/v1/auth", auth::router())
        .nest("/api/v1/users", users::router())
        .nest("/api/v1/search", search::router())
        .nest("/api/v1/apikeys", apikeys::router())
        .nest("/health", health::router())
        .with_state(state)
}
