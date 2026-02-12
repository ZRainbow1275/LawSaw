use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Response,
    routing::{get, post},
    Json, Router,
};
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiError, ApiJson, ApiQuery, ApiResult};

mod dto;
mod handlers;

pub use dto::{
    CreateReportRequest, CreateTemplateRequest, DeleteResponse, ExportReportRequest,
    ListReportsParams, ListTemplatesParams, ReportListResponse, ReportResponse,
    ReportTemplateResponse, TaskEnqueuedResponse, TransitionStatusRequest, UpdateReportRequest,
    UpdateTemplateRequest,
};

/// Report CRUD routes: mounted at /api/v1/reports
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_reports).post(create_report))
        .route(
            "/{id}",
            get(get_report).put(update_report).delete(delete_report),
        )
        .route("/{id}/transition", post(transition_status))
        .route("/{id}/generate", post(generate_report))
        .route("/{id}/export", post(export_report))
}

/// Report template routes: mounted at /api/v1/report-templates
pub fn template_router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_templates).post(create_template))
        .route(
            "/{id}",
            get(get_template).put(update_template).delete(delete_template),
        )
}

// ── Report endpoint wrappers with utoipa annotations ──────────

#[utoipa::path(
    get,
    path = "/api/v1/reports",
    params(
        ("limit" = Option<i64>, Query, description = "Max results (default 20, max 100)"),
        ("offset" = Option<i64>, Query, description = "Offset (default 0)"),
        ("status" = Option<String>, Query, description = "Filter by status (draft/generating/review/approved/published/archived)"),
        ("period_type" = Option<String>, Query, description = "Filter by period type (weekly/monthly/quarterly/custom)"),
        ("author_id" = Option<Uuid>, Query, description = "Filter by author"),
        ("date_from" = Option<String>, Query, description = "Period start >= date (YYYY-MM-DD)"),
        ("date_to" = Option<String>, Query, description = "Period end <= date (YYYY-MM-DD)")
    ),
    security(("session" = [])),
    responses(
        (status = 200, description = "Report list", body = ReportListResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    ),
    tag = "reports"
)]
pub(crate) async fn list_reports(
    state: State<AppState>,
    auth_session: AuthSession,
    query: ApiQuery<ListReportsParams>,
) -> ApiResult<Json<ReportListResponse>> {
    handlers::list_reports(state, auth_session, query).await
}

#[utoipa::path(
    post,
    path = "/api/v1/reports",
    request_body = CreateReportRequest,
    security(("session" = [])),
    responses(
        (status = 201, description = "Report created", body = ReportResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    ),
    tag = "reports"
)]
pub(crate) async fn create_report(
    state: State<AppState>,
    auth_session: AuthSession,
    req: ApiJson<CreateReportRequest>,
) -> ApiResult<(StatusCode, Json<ReportResponse>)> {
    handlers::create_report(state, auth_session, req).await
}

#[utoipa::path(
    get,
    path = "/api/v1/reports/{id}",
    params(("id" = Uuid, Path, description = "Report ID")),
    security(("session" = [])),
    responses(
        (status = 200, description = "Report details", body = ReportResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    ),
    tag = "reports"
)]
pub(crate) async fn get_report(
    state: State<AppState>,
    auth_session: AuthSession,
    id: Path<Uuid>,
) -> ApiResult<Response> {
    handlers::get_report(state, auth_session, id).await
}

#[utoipa::path(
    put,
    path = "/api/v1/reports/{id}",
    params(("id" = Uuid, Path, description = "Report ID")),
    request_body = UpdateReportRequest,
    security(("session" = [])),
    responses(
        (status = 200, description = "Report updated", body = ReportResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 409, description = "Version conflict", body = ApiError),
        (status = 428, description = "Missing If-Match header", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    ),
    tag = "reports"
)]
pub(crate) async fn update_report(
    state: State<AppState>,
    auth_session: AuthSession,
    headers: axum::http::HeaderMap,
    id: Path<Uuid>,
    req: ApiJson<UpdateReportRequest>,
) -> ApiResult<Response> {
    handlers::update_report(state, auth_session, headers, id, req).await
}

#[utoipa::path(
    delete,
    path = "/api/v1/reports/{id}",
    params(("id" = Uuid, Path, description = "Report ID")),
    security(("session" = [])),
    responses(
        (status = 200, description = "Report deleted", body = DeleteResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    ),
    tag = "reports"
)]
pub(crate) async fn delete_report(
    state: State<AppState>,
    auth_session: AuthSession,
    id: Path<Uuid>,
) -> ApiResult<Json<DeleteResponse>> {
    handlers::delete_report(state, auth_session, id).await
}

#[utoipa::path(
    post,
    path = "/api/v1/reports/{id}/transition",
    params(("id" = Uuid, Path, description = "Report ID")),
    request_body = TransitionStatusRequest,
    security(("session" = [])),
    responses(
        (status = 200, description = "Status transitioned", body = ReportResponse),
        (status = 400, description = "Invalid transition", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    ),
    tag = "reports"
)]
pub(crate) async fn transition_status(
    state: State<AppState>,
    auth_session: AuthSession,
    id: Path<Uuid>,
    req: ApiJson<TransitionStatusRequest>,
) -> ApiResult<Response> {
    handlers::transition_status(state, auth_session, id, req).await
}

#[utoipa::path(
    post,
    path = "/api/v1/reports/{id}/generate",
    params(("id" = Uuid, Path, description = "Report ID")),
    security(("session" = [])),
    responses(
        (status = 200, description = "Generation task enqueued", body = TaskEnqueuedResponse),
        (status = 400, description = "Invalid state for generation", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    ),
    tag = "reports"
)]
pub(crate) async fn generate_report(
    state: State<AppState>,
    auth_session: AuthSession,
    id: Path<Uuid>,
) -> ApiResult<Json<TaskEnqueuedResponse>> {
    handlers::generate_report(state, auth_session, id).await
}

#[utoipa::path(
    post,
    path = "/api/v1/reports/{id}/export",
    params(("id" = Uuid, Path, description = "Report ID")),
    request_body = ExportReportRequest,
    security(("session" = [])),
    responses(
        (status = 200, description = "Export task enqueued", body = TaskEnqueuedResponse),
        (status = 400, description = "Invalid format", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    ),
    tag = "reports"
)]
pub(crate) async fn export_report(
    state: State<AppState>,
    auth_session: AuthSession,
    id: Path<Uuid>,
    req: ApiJson<ExportReportRequest>,
) -> ApiResult<Json<TaskEnqueuedResponse>> {
    handlers::export_report(state, auth_session, id, req).await
}

// ── Template endpoint wrappers with utoipa annotations ────────

#[utoipa::path(
    get,
    path = "/api/v1/report-templates",
    params(
        ("period_type" = Option<String>, Query, description = "Filter by period type (weekly/monthly/quarterly/custom)")
    ),
    security(("session" = [])),
    responses(
        (status = 200, description = "Template list", body = Vec<ReportTemplateResponse>),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    ),
    tag = "report-templates"
)]
pub(crate) async fn list_templates(
    state: State<AppState>,
    auth_session: AuthSession,
    query: ApiQuery<ListTemplatesParams>,
) -> ApiResult<Json<Vec<ReportTemplateResponse>>> {
    handlers::list_templates(state, auth_session, query).await
}

#[utoipa::path(
    post,
    path = "/api/v1/report-templates",
    request_body = CreateTemplateRequest,
    security(("session" = [])),
    responses(
        (status = 201, description = "Template created", body = ReportTemplateResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    ),
    tag = "report-templates"
)]
pub(crate) async fn create_template(
    state: State<AppState>,
    auth_session: AuthSession,
    req: ApiJson<CreateTemplateRequest>,
) -> ApiResult<(StatusCode, Json<ReportTemplateResponse>)> {
    handlers::create_template(state, auth_session, req).await
}

#[utoipa::path(
    get,
    path = "/api/v1/report-templates/{id}",
    params(("id" = Uuid, Path, description = "Template ID")),
    security(("session" = [])),
    responses(
        (status = 200, description = "Template details", body = ReportTemplateResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    ),
    tag = "report-templates"
)]
pub(crate) async fn get_template(
    state: State<AppState>,
    auth_session: AuthSession,
    id: Path<Uuid>,
) -> ApiResult<Json<ReportTemplateResponse>> {
    handlers::get_template(state, auth_session, id).await
}

#[utoipa::path(
    put,
    path = "/api/v1/report-templates/{id}",
    params(("id" = Uuid, Path, description = "Template ID")),
    request_body = UpdateTemplateRequest,
    security(("session" = [])),
    responses(
        (status = 200, description = "Template updated", body = ReportTemplateResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    ),
    tag = "report-templates"
)]
pub(crate) async fn update_template(
    state: State<AppState>,
    auth_session: AuthSession,
    id: Path<Uuid>,
    req: ApiJson<UpdateTemplateRequest>,
) -> ApiResult<Json<ReportTemplateResponse>> {
    handlers::update_template(state, auth_session, id, req).await
}

#[utoipa::path(
    delete,
    path = "/api/v1/report-templates/{id}",
    params(("id" = Uuid, Path, description = "Template ID")),
    security(("session" = [])),
    responses(
        (status = 200, description = "Template deleted", body = DeleteResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    ),
    tag = "report-templates"
)]
pub(crate) async fn delete_template(
    state: State<AppState>,
    auth_session: AuthSession,
    id: Path<Uuid>,
) -> ApiResult<Json<DeleteResponse>> {
    handlers::delete_template(state, auth_session, id).await
}
