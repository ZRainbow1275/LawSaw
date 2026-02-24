use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
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
    CreateReportInput, ExportFormat, ListReportsQuery, ReportStatus, UpdateReportInput,
};
use law_eye_queue::{ReportExportTask, ReportGenerateTask};

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
    if title.len() > super::dto::REPORT_TITLE_MAX_LEN {
        return Err(AppError::validation(format!(
            "title must be at most {} characters",
            super::dto::REPORT_TITLE_MAX_LEN
        )));
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
    if let Some(t) = title {
        if t.len() > super::dto::REPORT_TITLE_MAX_LEN {
            return Err(AppError::validation(format!(
                "title must be at most {} characters",
                super::dto::REPORT_TITLE_MAX_LEN
            )));
        }
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
            "Invalid target status: {}. Valid values: draft, generating, generated, review, approved, published, archived, error",
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

    let current_status = ReportStatus::from_db_str(&report.status)
        .ok_or_else(|| AppError::internal(format!("Unknown report status: {}", report.status)))?;

    if !current_status.can_transition_to(ReportStatus::Generating) {
        return Err(AppError::validation(format!(
            "Cannot generate report in status '{}'. Report must be in 'draft' or 'error' status.",
            report.status
        )));
    }

    // Transition to generating status
    let generating_report = state
        .report_service
        .transition_status(user.tenant_id, id, ReportStatus::Generating, report.version)
        .await
        .map_err(AppError::from)?;

    // Enqueue AI generation task
    let task = ReportGenerateTask {
        tenant_id: user.tenant_id,
        report_id: id,
        task_type: Some("generate_report".to_string()),
        requested_by: Some(user.id),
        requested_at: Some(Utc::now().to_rfc3339()),
    };

    if let Err(e) = state
        .task_queue
        .enqueue_retryable_with_ordering("queue:report", task, Some(format!("report:{id}")), None)
        .await
    {
        // Compensation: avoid leaving report stuck in `generating` when enqueue fails.
        let _ = state
            .report_service
            .transition_status(
                user.tenant_id,
                id,
                ReportStatus::Error,
                generating_report.version,
            )
            .await;
        return Err(AppError::internal_with_code("ENQUEUE_ERROR", e.to_string()));
    }

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
    let format: ExportFormat = req.format.parse().map_err(|_| {
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

    // Check report status: only allow export for certain statuses
    let exportable_statuses = ["review", "approved", "published", "generated"];
    if !exportable_statuses.contains(&report.status.as_str()) {
        return Err(AppError::validation(format!(
            "Cannot export report in status '{}'. Report must be in one of: {}.",
            report.status,
            exportable_statuses.join(", ")
        )));
    }

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
        .enqueue_retryable_with_ordering(
            "queue:report-export",
            task,
            Some(format!("report:{id}")),
            None,
        )
        .await
        .map_err(|e| AppError::internal_with_code("ENQUEUE_ERROR", e.to_string()))?;

    Ok(Json(TaskEnqueuedResponse {
        message: format!("Report export ({}) task enqueued", format.extension()),
        report_id: id,
    }))
}

// ══════════════════════════════════════════════════════════════
// Report export download handler
// ══════════════════════════════════════════════════════════════

/// GET /api/v1/reports/:id/download/:format - Download exported report file
pub(crate) async fn download_report_export(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path((id, format)): Path<(Uuid, String)>,
) -> ApiResult<Response> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let object_service = state
        .object_service
        .as_ref()
        .ok_or_else(|| AppError::service_unavailable("Object storage is not configured"))?;

    // Verify report exists and belongs to the user's tenant
    let report = state
        .report_service
        .get_report_by_id(user.tenant_id, id)
        .await
        .map_err(AppError::from)?;

    // Parse and validate export format
    let export_format: ExportFormat = format.parse().map_err(|_| {
        AppError::validation(format!(
            "Invalid export format: {}. Valid values: pdf, docx, html",
            format
        ))
    })?;

    // Get the corresponding export key based on format
    let export_key = match export_format {
        ExportFormat::Pdf => report.export_pdf_key.as_deref(),
        ExportFormat::Docx => report.export_docx_key.as_deref(),
        ExportFormat::Html => report.export_html_key.as_deref(),
    };

    let export_key = export_key.ok_or_else(|| {
        AppError::not_found(format!(
            "No {} export available for report {}. Trigger an export first.",
            export_format.extension(),
            id
        ))
    })?;

    validate_report_export_key_scope(export_key, user.tenant_id, id, export_format)?;

    // Stream the file from object storage
    let stream = object_service
        .get_stream_by_key(export_key)
        .await
        .map_err(AppError::from)?;

    // Build response with correct headers
    let content_type = HeaderValue::from_static(export_format.content_type());
    let filename = format!("{}.{}", report.report_number, export_format.extension());
    let disposition = HeaderValue::from_str(&format!("attachment; filename=\"{}\"", filename))
        .map_err(|_| AppError::internal("Failed to build Content-Disposition header"))?;

    let mut response = Response::new(Body::new(stream.into_inner()));
    *response.status_mut() = StatusCode::OK;
    response
        .headers_mut()
        .insert(header::CONTENT_TYPE, content_type);
    response
        .headers_mut()
        .insert(header::CONTENT_DISPOSITION, disposition);
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, no-cache"),
    );

    Ok(response)
}

fn validate_report_export_key_scope(
    export_key: &str,
    tenant_id: Uuid,
    report_id: Uuid,
    format: ExportFormat,
) -> ApiResult<()> {
    let expected_prefix = format!("tenants/{}/reports/{}/", tenant_id, report_id);
    if !export_key.starts_with(&expected_prefix) {
        return Err(AppError::conflict(format!(
            "Invalid export key scope for report {}",
            report_id
        )));
    }

    let expected_extension = format!(".{}", format.extension());
    if !export_key.ends_with(&expected_extension) {
        return Err(AppError::conflict(format!(
            "Export key extension mismatch: expected {}",
            expected_extension
        )));
    }

    Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_report_export_key_scope_accepts_valid_key() {
        let tenant_id = Uuid::parse_str("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa").unwrap();
        let report_id = Uuid::parse_str("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb").unwrap();
        let key = format!(
            "tenants/{}/reports/{}/export_20260222120000.pdf",
            tenant_id, report_id
        );

        let result =
            validate_report_export_key_scope(&key, tenant_id, report_id, ExportFormat::Pdf);
        assert!(result.is_ok());
    }

    #[test]
    fn validate_report_export_key_scope_rejects_wrong_tenant_prefix() {
        let tenant_id = Uuid::parse_str("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa").unwrap();
        let report_id = Uuid::parse_str("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb").unwrap();
        let wrong_tenant = Uuid::parse_str("cccccccc-cccc-cccc-cccc-cccccccccccc").unwrap();
        let key = format!(
            "tenants/{}/reports/{}/export_20260222120000.pdf",
            wrong_tenant, report_id
        );

        let result =
            validate_report_export_key_scope(&key, tenant_id, report_id, ExportFormat::Pdf);
        assert!(result.is_err());
    }

    #[test]
    fn validate_report_export_key_scope_rejects_wrong_extension() {
        let tenant_id = Uuid::parse_str("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa").unwrap();
        let report_id = Uuid::parse_str("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb").unwrap();
        let key = format!(
            "tenants/{}/reports/{}/export_20260222120000.docx",
            tenant_id, report_id
        );

        let result =
            validate_report_export_key_scope(&key, tenant_id, report_id, ExportFormat::Pdf);
        assert!(result.is_err());
    }
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
    if name.len() > super::dto::TEMPLATE_NAME_MAX_LEN {
        return Err(AppError::validation(format!(
            "name must be at most {} characters",
            super::dto::TEMPLATE_NAME_MAX_LEN
        )));
    }
    if req.template_body.len() > super::dto::TEMPLATE_BODY_MAX_LEN {
        return Err(AppError::validation(format!(
            "template_body must be at most {} bytes",
            super::dto::TEMPLATE_BODY_MAX_LEN
        )));
    }
    if let Some(css) = &req.css_styles {
        if css.len() > super::dto::TEMPLATE_CSS_MAX_LEN {
            return Err(AppError::validation(format!(
                "css_styles must be at most {} bytes",
                super::dto::TEMPLATE_CSS_MAX_LEN
            )));
        }
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

    let name = req.name.as_deref().map(str::trim).unwrap_or(&existing.name);
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
