use axum::{extract::State, http::StatusCode, routing::get, Json, Router};

use crate::state::AppState;
use law_eye_db::Category;

pub fn router() -> Router<AppState> {
    Router::new().route("/", get(list_categories))
}

async fn list_categories(
    State(state): State<AppState>,
) -> Result<Json<Vec<Category>>, StatusCode> {
    state
        .category_service
        .list()
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}
