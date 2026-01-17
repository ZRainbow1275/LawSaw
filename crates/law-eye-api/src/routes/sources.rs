use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use uuid::Uuid;

use crate::state::AppState;
use law_eye_db::{CreateSource, Source};
use law_eye_queue::IngestTask;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_sources).post(create_source))
        .route("/{id}", get(get_source))
        .route("/{id}/fetch", post(trigger_fetch))
}

async fn list_sources(State(state): State<AppState>) -> Result<Json<Vec<Source>>, StatusCode> {
    state
        .source_service
        .list()
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn get_source(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Source>, StatusCode> {
    state
        .source_service
        .get_by_id(id)
        .await
        .map(Json)
        .map_err(|_| StatusCode::NOT_FOUND)
}

async fn create_source(
    State(state): State<AppState>,
    Json(input): Json<CreateSource>,
) -> Result<(StatusCode, Json<Source>), StatusCode> {
    state
        .source_service
        .create(input)
        .await
        .map(|s| (StatusCode::CREATED, Json(s)))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn trigger_fetch(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, StatusCode> {
    let source = state
        .source_service
        .get_by_id(id)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;

    let task = IngestTask {
        source_id: source.id,
        source_type: source.source_type,
        url: source.url,
        config: source.config,
    };

    state
        .task_queue
        .enqueue("queue:ingest", &task)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::ACCEPTED)
}
