use axum::{
    extract::{Path, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use chrono::Utc;
use uuid::Uuid;

use super::dto::{
    CreateReportRequest, CreateTemplateRequest, DeleteResponse, ExportReportRequest,
    ListReportsParams, ListTemplatesParams, ReportListResponse, ReportResponse,
    ReportTemplateResponse, TaskEnqueuedResponse, TransitionStatusRequest, UpdateReportRequest,
    UpdateTemplateRequest,
};
use crate::auth::AuthSession;
use crate::routes::{etag_for_version, require_if_match_version};
use crate::state::AppState;
use crate::{ApiJson, ApiQuery, ApiResult, AppError};

use law_eye_core::report::{
    CreateReportInput, ExportFormat, ListReportsQuery, ReportStatus,
    UpdateReportInput,
};
use law_eye_queue::ReportExportTask;

// ══════════════════════════════════════════════════════════════
// Report handlers
// ══════════════════════════════════════════════════════════════

/// GET /api/v1/reports - List reports with pagination and filters
pub(crate) async fn list_reports(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiQuery(params): ApiQuery<ListReportsParams>,
) -> ApiResult<Json<ReportListResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let limit = params.limit.unwrap_or(20).clamp(1, 100);
    let offset = params.offset.unwrap_or(0);
    if offset < 0 {
        return Err(AppError::validation("offset must be >= 0"));
    }

    let query = ListReportsQuery {
        status: params.status,
        period_type: params.period_type,
        author_id: params.author_id,
        date_from: params.date_from,
        date_to: params.date_to,
        limit: Some(limit),
        offset: Some(offset),
    };

    let (reports, total) = state
        .report_service
        .list_reports(user.tenant_id, query)
        .await
        .map_err(AppError::from)?;

    let data: Vec<ReportResponse> = reports.into_iter().map(ReportResponse::from).collect();

    Ok(Json(ReportListResponse {
        data,
        total,
        limit,
        offset,
    }))
}

/// POST /api/v1/reports - Create a new report
pub(crate) async fn create_report(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiJson(req): ApiJson<CreateReportRequest>,
) -> ApiResult<(StatusCode, Json<ReportResponse>)> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let title = req.title.trim();
    if title.is_empty() {
        return Err(AppError::validation("title cannot be empty"));
    }

    let input = CreateReportInput {
        title: title.to_string(),
        period_type: req.period_type,
        period_start: req.period_start,
        period_end: req.period_end,
        template_id: req.template_id,
        author_id: user.id,
    };

    let report = state
        .report_service
        .create_report(user.tenant_id, input)
        .await
        .map_err(AppError::from)?;

    Ok((StatusCode::CREATED, Json(ReportResponse::from(report))))
}

/// GET /api/v1/reports/:id - Get report details
pub(crate) async fn get_report(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let report = state
        .report_service
        .get_report_by_id(user.tenant_id, id)
        .await
        .map_err(AppError::from)?;

    let body = ReportResponse::from(report);
    let etag = etag_for_version(body.version)?;
    let mut response = Json(body).into_response();
    response.headers_mut().insert(header::ETAG, etag);
    Ok(response)
}

/// PUT /api/v1/reports/:id - Update report content
pub(crate) async fn update_report(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    ApiJson(req): ApiJson<UpdateReportRequest>,
) -> ApiResult<Response> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let expected_version = require_if_match_version(&headers)?;

    let title = req.title.as_deref().map(str::trim);
    if matches!(title, Some("")) {
        return Err(AppError::validation("title cannot be empty"));
    }

    let has_changes = title.is_some() || req.content.is_some();
    if !has_changes {
        return Err(AppError::validation("No fields to update"));
    }

    let input = UpdateReportInput {
        title: title.map(String::from),
        content: req.content,
        expected_version: None,
    };

    let report = state
        .report_service
        .update_report(user.tenant_id, id, input, expected_version)
        .await
        .map_err(AppError::from)?;

    let body = ReportResponse::from(report);
    let etag = etag_for_version(body.version)?;
    let mut response = Json(body).into_response();
    response.headers_mut().insert(header::ETAG, etag);
    Ok(response)
}

/// DELETE /api/v1/reports/:id - Soft delete a report
pub(crate) async fn delete_report(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<DeleteResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    state
        .report_service
        .delete_report(user.tenant_id, id)
        .await
        .map_err(AppError::from)?;

    Ok(Json(DeleteResponse {
        success: true,
        message: "Report deleted".to_string(),
    }))
}

/// POST /api/v1/reports/:id/transition - Transition report status
pub(crate) async fn transition_status(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
    ApiJson(req): ApiJson<TransitionStatusRequest>,
) -> ApiResult<Response> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let target_status = ReportStatus::from_db_str(&req.target_status).ok_or_else(|| {
        AppError::validation(format!(
            "Invalid target status: {}. Valid values: draft, generating, review, approved, published, archived",
            req.target_status
        ))
    })?;

    // Fetch current report to get version for optimistic lock
    let current = state
        .report_service
        .get_report_by_id(user.tenant_id, id)
        .await
        .map_err(AppError::from)?;

    let report = state
        .report_service
        .transition_status(user.tenant_id, id, target_status, current.version)
        .await
        .map_err(AppError::from)?;

    let body = ReportResponse::from(report);
    let etag = etag_for_version(body.version)?;
    let mut response = Json(body).into_response();
    response.headers_mut().insert(header::ETAG, etag);
    Ok(response)
}

/// POST /api/v1/reports/:id/generate - Trigger AI generation (async task)
pub(crate) async fn generate_report(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<TaskEnqueuedResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    // Verify report exists and is in a valid state for generation
    let report = state
        .report_service
        .get_report_by_id(user.tenant_id, id)
        .await
        .map_err(AppError::from)?;

    let current_status = ReportStatus::from_db_str(&report.status).ok_or_else(|| {
        AppError::internal(format!("Unknown report status: {}", report.status))
    })?;

    if !current_status.can_transition_to(ReportStatus::Generating) {
        return Err(AppError::validation(format!(
            "Cannot generate report in status '{}'. Report must be in 'draft' status.",
            report.status
        )));
    }

    // Transition to generating status
    state
        .report_service
        .transition_status(user.tenant_id, id, ReportStatus::Generating, report.version)
        .await
        .map_err(AppError::from)?;

    // Enqueue AI generation task
    let task = serde_json::json!({
        "tenant_id": user.tenant_id,
        "report_id": id,
        "task_type": "generate_report",
        "requested_by": user.id,
        "requested_at": Utc::now(),
    });

    state
        .task_queue
        .enqueue("queue:report", &task)
        .await
        .map_err(|e| AppError::internal_with_code("ENQUEUE_ERROR", e.to_string()))?;

    Ok(Json(TaskEnqueuedResponse {
        message: "Report generation task enqueued".to_string(),
        report_id: id,
    }))
}

/// POST /api/v1/reports/:id/export - Trigger export (async task)
pub(crate) async fn export_report(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
    ApiJson(req): ApiJson<ExportReportRequest>,
) -> ApiResult<Json<TaskEnqueuedResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    // Validate export format
    let format = ExportFormat::from_str(&req.format).ok_or_else(|| {
        AppError::validation(format!(
            "Invalid export format: {}. Valid values: pdf, docx, html",
            req.format
        ))
    })?;

    // Verify report exists
    let report = state
        .report_service
        .get_report_by_id(user.tenant_id, id)
        .await
        .map_err(AppError::from)?;

    // Check report content is not empty before exporting
    if report.content == serde_json::json!({}) {
        return Err(AppError::validation(
            "Report content is empty. Generate content before exporting.",
        ));
    }

    // Enqueue export task
    let task = ReportExportTask {
        tenant_id: user.tenant_id,
        report_id: id,
        format: format.extension().to_string(),
        requested_by: user.id,
        requested_at: Utc::now().timestamp(),
    };

    state
        .task_queue
        .enqueue("queue:report-export", &task)
        .await
        .map_err(|e| AppError::internal_with_code("ENQUEUE_ERROR", e.to_string()))?;

    Ok(Json(TaskEnqueuedResponse {
        message: format!("Report export ({}) task enqueued", format.extension()),
        report_id: id,
    }))
}

// ══════════════════════════════════════════════════════════════
// Template handlers
// ══════════════════════════════════════════════════════════════

/// GET /api/v1/report-templates - List templates
pub(crate) async fn list_templates(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiQuery(params): ApiQuery<ListTemplatesParams>,
) -> ApiResult<Json<Vec<ReportTemplateResponse>>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let templates = state
        .report_template_service
        .list(user.tenant_id, params.period_type.as_deref())
        .await
        .map_err(AppError::from)?;

    Ok(Json(
        templates
            .into_iter()
            .map(ReportTemplateResponse::from)
            .collect(),
    ))
}

/// POST /api/v1/report-templates - Create a template
pub(crate) async fn create_template(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiJson(req): ApiJson<CreateTemplateRequest>,
) -> ApiResult<(StatusCode, Json<ReportTemplateResponse>)> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let name = req.name.trim();
    if name.is_empty() {
        return Err(AppError::validation("name cannot be empty"));
    }

    let input = law_eye_db::CreateReportTemplate {
        name: name.to_string(),
        description: req.description,
        period_type: req.period_type,
        template_body: req.template_body,
        css_styles: req.css_styles,
        page_config: req.page_config,
        sections_config: req.sections_config,
    };

    let template = state
        .report_template_service
        .create(user.tenant_id, input)
        .await
        .map_err(AppError::from)?;

    Ok((
        StatusCode::CREATED,
        Json(ReportTemplateResponse::from(template)),
    ))
}

/// GET /api/v1/report-templates/:id - Get template details
pub(crate) async fn get_template(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<ReportTemplateResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let template = state
        .report_template_service
        .get_by_id(user.tenant_id, id)
        .await
        .map_err(AppError::from)?;

    Ok(Json(ReportTemplateResponse::from(template)))
}

/// PUT /api/v1/report-templates/:id - Update template
///
/// Note: The core `ReportTemplateService` does not currently expose an `update`
/// method. For now we create a new template and deactivate the old one.
/// When the core service gains a proper `update` this handler should be revised.
pub(crate) async fn update_template(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
    ApiJson(req): ApiJson<UpdateTemplateRequest>,
) -> ApiResult<Json<ReportTemplateResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    // Fetch existing template to merge with partial update fields
    let existing = state
        .report_template_service
        .get_by_id(user.tenant_id, id)
        .await
        .map_err(AppError::from)?;

    if existing.is_builtin {
        return Err(AppError::validation("Built-in templates cannot be updated"));
    }

    let name = req
        .name
        .as_deref()
        .map(str::trim)
        .unwrap_or(&existing.name);
    if name.is_empty() {
        return Err(AppError::validation("name cannot be empty"));
    }

    // Deactivate old template and create a new version
    state
        .report_template_service
        .deactivate(user.tenant_id, id)
        .await
        .map_err(AppError::from)?;

    let input = law_eye_db::CreateReportTemplate {
        name: name.to_string(),
        description: req.description.or(existing.description),
        period_type: existing.period_type,
        template_body: req.template_body.unwrap_or(existing.template_body),
        css_styles: req.css_styles.or(existing.css_styles),
        page_config: req.page_config.or(Some(existing.page_config)),
        sections_config: req.sections_config.or(Some(existing.sections_config)),
    };

    let new_template = state
        .report_template_service
        .create(user.tenant_id, input)
        .await
        .map_err(AppError::from)?;

    Ok(Json(ReportTemplateResponse::from(new_template)))
}

/// DELETE /api/v1/report-templates/:id - Deactivate (soft delete) a template
pub(crate) async fn delete_template(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<DeleteResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    state
        .report_template_service
        .deactivate(user.tenant_id, id)
        .await
        .map_err(AppError::from)?;

    Ok(Json(DeleteResponse {
        success: true,
        message: "Template deleted".to_string(),
    }))
}
