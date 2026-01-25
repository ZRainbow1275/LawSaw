pub mod ai;
pub mod apikeys;
pub mod articles;
pub mod auth;
pub mod categories;
pub mod health;
pub mod openapi;
pub mod search;
pub mod sources;
pub mod users;

use axum::Router;

use axum::middleware;

use crate::middleware::RequireAuth;
use crate::state::AppState;

pub fn create_router(state: AppState) -> Router {
    let protected_api = Router::new()
        .nest("/articles", articles::router())
        .nest("/sources", sources::router())
        .nest("/categories", categories::router())
        .nest("/ai", ai::router())
        .nest("/users", users::router())
        .nest("/search", search::router())
        .nest("/apikeys", apikeys::router())
        // Default deny: everything under /api/v1 requires an authenticated session,
        // except routes explicitly mounted outside this protected router (e.g. /api/v1/auth/*).
        .layer(middleware::from_extractor::<RequireAuth>());

    Router::new()
        .merge(openapi::router())
        .nest("/api/v1/auth", auth::router())
        .nest("/api/v1", protected_api)
        .nest("/health", health::router())
        .with_state(state)
}
