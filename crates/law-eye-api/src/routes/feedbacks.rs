use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;
use law_eye_db::{CreateFeedback, UpdateFeedback};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_feedbacks).post(create_feedback))
        .route("/my", get(list_my_feedbacks))
        .route("/{id}", get(get_feedback).patch(update_feedback))
}

fn is_valid_feedback_type(value: &str) -> bool {
    matches!(
        value,
        "source_suggestion" | "bug_report" | "feature_request" | "other"
    )
}

fn is_valid_feedback_status(value: &str) -> bool {
    matches!(value, "pending" | "reviewing" | "resolved" | "rejected")
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct FeedbackResponse {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    #[serde(rename = "type")]
    pub feedback_type: String,
    pub title: String,
    pub content: String,
    pub contact_email: Option<String>,
    pub source_url: Option<String>,
    pub source_name: Option<String>,
    pub status: String,
    pub admin_response: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<law_eye_db::Feedback> for FeedbackResponse {
    fn from(f: law_eye_db::Feedback) -> Self {
        Self {
            id: f.id,
            user_id: f.user_id,
            feedback_type: f.feedback_type,
            title: f.title,
            content: f.content,
            contact_email: f.contact_email,
            source_url: f.source_url,
            source_name: f.source_name,
            status: f.status,
            admin_response: f.admin_response,
            created_at: f.created_at,
            updated_at: f.updated_at,
        }
    }
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct ListParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateFeedbackRequest {
    #[serde(rename = "type")]
    pub feedback_type: String,
    pub title: String,
    pub content: String,
    pub contact_email: Option<String>,
    pub source_url: Option<String>,
    pub source_name: Option<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateFeedbackRequest {
    pub status: Option<String>,
    pub admin_response: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ErrorResponse {
    pub error: String,
    pub code: String,
}

/// Admin: list all feedbacks
#[utoipa::path(
    get,
    path = "/api/v1/feedbacks",
    params(
        ("limit" = Option<i64>, Query, description = "Max results (default 50, max 200)"),
        ("offset" = Option<i64>, Query, description = "Offset (default 0)")
    ),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Feedback list", body = Vec<FeedbackResponse>),
        (status = 401, description = "Not authenticated", body = ErrorResponse),
        (status = 403, description = "Admin permission required", body = ErrorResponse),
        (status = 500, description = "Server error", body = ErrorResponse)
    )
)]
pub(crate) async fn list_feedbacks(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(params): Query<ListParams>,
) -> impl IntoResponse {
    let user = match auth_session.user {
        Some(u) => u,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse {
                    error: "Not authenticated".to_string(),
                    code: "UNAUTHORIZED".to_string(),
                }),
            )
                .into_response()
        }
    };

    let is_admin = state.user_service.has_permission(user.id, "*").await.unwrap_or(false);
    if !is_admin {
        return (
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Admin permission required".to_string(),
                code: "FORBIDDEN".to_string(),
            }),
        )
            .into_response();
    }

    let limit = params.limit.unwrap_or(50).min(200);
    let offset = params.offset.unwrap_or(0);

    match state.feedback_service.list_all(limit, offset).await {
        Ok(rows) => {
            let rows: Vec<FeedbackResponse> = rows.into_iter().map(FeedbackResponse::from).collect();
            (StatusCode::OK, Json(rows)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
                code: "FETCH_ERROR".to_string(),
            }),
        )
            .into_response(),
    }
}

/// Current user: list my feedbacks
#[utoipa::path(
    get,
    path = "/api/v1/feedbacks/my",
    params(
        ("limit" = Option<i64>, Query, description = "Max results (default 50, max 200)"),
        ("offset" = Option<i64>, Query, description = "Offset (default 0)")
    ),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "My feedback list", body = Vec<FeedbackResponse>),
        (status = 401, description = "Not authenticated", body = ErrorResponse),
        (status = 500, description = "Server error", body = ErrorResponse)
    )
)]
pub(crate) async fn list_my_feedbacks(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(params): Query<ListParams>,
) -> impl IntoResponse {
    let user = match auth_session.user {
        Some(u) => u,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse {
                    error: "Not authenticated".to_string(),
                    code: "UNAUTHORIZED".to_string(),
                }),
            )
                .into_response()
        }
    };

    let limit = params.limit.unwrap_or(50).min(200);
    let offset = params.offset.unwrap_or(0);

    match state.feedback_service.list_by_user(user.id, limit, offset).await {
        Ok(rows) => {
            let rows: Vec<FeedbackResponse> = rows.into_iter().map(FeedbackResponse::from).collect();
            (StatusCode::OK, Json(rows)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
                code: "FETCH_ERROR".to_string(),
            }),
        )
            .into_response(),
    }
}

/// Create a feedback (any authenticated user)
#[utoipa::path(
    post,
    path = "/api/v1/feedbacks",
    request_body = CreateFeedbackRequest,
    security(
        ("session" = [])
    ),
    responses(
        (status = 201, description = "Feedback created", body = FeedbackResponse),
        (status = 400, description = "Validation error", body = ErrorResponse),
        (status = 401, description = "Not authenticated", body = ErrorResponse),
        (status = 500, description = "Server error", body = ErrorResponse)
    )
)]
pub(crate) async fn create_feedback(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Json(req): Json<CreateFeedbackRequest>,
) -> impl IntoResponse {
    let user = match auth_session.user {
        Some(u) => u,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse {
                    error: "Not authenticated".to_string(),
                    code: "UNAUTHORIZED".to_string(),
                }),
            )
                .into_response()
        }
    };

    if req.title.trim().is_empty() || req.content.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "title/content is required".to_string(),
                code: "VALIDATION_ERROR".to_string(),
            }),
        )
            .into_response();
    }

    if !is_valid_feedback_type(&req.feedback_type) {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Invalid feedback type".to_string(),
                code: "VALIDATION_ERROR".to_string(),
            }),
        )
            .into_response();
    }

    let input = CreateFeedback {
        user_id: Some(user.id),
        feedback_type: req.feedback_type,
        title: req.title,
        content: req.content,
        contact_email: req.contact_email,
        source_url: req.source_url,
        source_name: req.source_name,
    };

    match state.feedback_service.create(input).await {
        Ok(row) => (StatusCode::CREATED, Json(FeedbackResponse::from(row))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
                code: "CREATE_ERROR".to_string(),
            }),
        )
            .into_response(),
    }
}

/// Get a feedback by id (owner or admin)
#[utoipa::path(
    get,
    path = "/api/v1/feedbacks/{id}",
    params(("id" = Uuid, Path, description = "Feedback ID")),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Feedback", body = FeedbackResponse),
        (status = 401, description = "Not authenticated", body = ErrorResponse),
        (status = 403, description = "Forbidden", body = ErrorResponse),
        (status = 404, description = "Not found", body = ErrorResponse),
        (status = 500, description = "Server error", body = ErrorResponse)
    )
)]
pub(crate) async fn get_feedback(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let user = match auth_session.user {
        Some(u) => u,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse {
                    error: "Not authenticated".to_string(),
                    code: "UNAUTHORIZED".to_string(),
                }),
            )
                .into_response()
        }
    };

    let is_admin = state.user_service.has_permission(user.id, "*").await.unwrap_or(false);
    match state.feedback_service.get_by_id(id).await {
        Ok(row) => {
            if !is_admin && row.user_id != Some(user.id) {
                return (
                    StatusCode::FORBIDDEN,
                    Json(ErrorResponse {
                        error: "Access denied".to_string(),
                        code: "FORBIDDEN".to_string(),
                    }),
                )
                    .into_response();
            }

            (StatusCode::OK, Json(FeedbackResponse::from(row))).into_response()
        }
        Err(e) => {
            let (status, code) = if matches!(e, law_eye_common::Error::NotFound(_)) {
                (StatusCode::NOT_FOUND, "NOT_FOUND")
            } else {
                (StatusCode::INTERNAL_SERVER_ERROR, "FETCH_ERROR")
            };
            (
                status,
                Json(ErrorResponse {
                    error: e.to_string(),
                    code: code.to_string(),
                }),
            )
                .into_response()
        }
    }
}

/// Admin: update a feedback status / response
#[utoipa::path(
    patch,
    path = "/api/v1/feedbacks/{id}",
    params(("id" = Uuid, Path, description = "Feedback ID")),
    request_body = UpdateFeedbackRequest,
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Feedback updated", body = FeedbackResponse),
        (status = 400, description = "Validation error", body = ErrorResponse),
        (status = 401, description = "Not authenticated", body = ErrorResponse),
        (status = 403, description = "Admin permission required", body = ErrorResponse),
        (status = 404, description = "Not found", body = ErrorResponse),
        (status = 500, description = "Server error", body = ErrorResponse)
    )
)]
pub(crate) async fn update_feedback(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateFeedbackRequest>,
) -> impl IntoResponse {
    let user = match auth_session.user {
        Some(u) => u,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse {
                    error: "Not authenticated".to_string(),
                    code: "UNAUTHORIZED".to_string(),
                }),
            )
                .into_response()
        }
    };

    let is_admin = state.user_service.has_permission(user.id, "*").await.unwrap_or(false);
    if !is_admin {
        return (
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Admin permission required".to_string(),
                code: "FORBIDDEN".to_string(),
            }),
        )
            .into_response();
    }

    if let Some(status) = req.status.as_deref() {
        if !is_valid_feedback_status(status) {
            return (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "Invalid status".to_string(),
                    code: "VALIDATION_ERROR".to_string(),
                }),
            )
                .into_response();
        }
    }

    let input = UpdateFeedback {
        status: req.status,
        admin_response: req.admin_response,
    };

    match state.feedback_service.update(id, input).await {
        Ok(row) => (StatusCode::OK, Json(FeedbackResponse::from(row))).into_response(),
        Err(e) => {
            let (status, code) = if matches!(e, law_eye_common::Error::NotFound(_)) {
                (StatusCode::NOT_FOUND, "NOT_FOUND")
            } else {
                (StatusCode::INTERNAL_SERVER_ERROR, "UPDATE_ERROR")
            };
            (
                status,
                Json(ErrorResponse {
                    error: e.to_string(),
                    code: code.to_string(),
                }),
            )
                .into_response()
        }
    }
}
