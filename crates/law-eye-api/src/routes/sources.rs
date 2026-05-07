use axum::{
    extract::ConnectInfo,
    extract::{Path, State},
    http::HeaderMap,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use law_eye_common::Error;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::{AuthSession, AuthenticatedUser};
use crate::middleware::role_tier_at_least;
use crate::state::AppState;
use crate::{ApiError, ApiJson, ApiQuery, ApiResult, AppError};
use law_eye_common::egress::{validate_outbound_url, OutboundUrlPolicy};
use law_eye_core::role_tier::{
    derive_role_tier_from_names, ROLE_TIER_PREMIUM_USER, ROLE_TIER_VERIFIED_USER,
};
use law_eye_core::AuthzCheckInput;
use law_eye_db::{CreateAuditLog, CreateSource};
use law_eye_queue::IngestTask;
use serde_json::Value;
use std::net::SocketAddr;
use std::time::Duration;

const SOURCE_NAME_MAX_LEN: usize = 100;
const SOURCE_URL_MAX_LEN: usize = 2048;
const SOURCE_SCHEDULE_MAX_LEN: usize = 128;
const SOURCE_PRIORITY_MIN: i32 = 0;
const SOURCE_PRIORITY_MAX: i32 = 100;
const SOURCE_LIST_DEFAULT_LIMIT: i64 = 100;
const SOURCE_LIST_MAX_LIMIT: i64 = 1000;
const SOURCE_VISIBLE_COUNT_BATCH: i64 = 200;
const QUEUE_INGEST_PRIORITY: &str = "queue:ingest:priority";

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/stats", get(get_source_stats))
        .route("/", get(list_sources).post(create_source))
        .route("/{id}", get(get_source).delete(delete_source))
        .route("/{id}/restore", post(restore_source))
        .route("/{id}/fetch", post(trigger_fetch))
}

pub fn admin_router() -> Router<AppState> {
    Router::new()
        .route("/{id}", axum::routing::patch(admin_patch_source))
        .route("/{id}/run", post(admin_run_source))
        .route("/{id}/runs", get(admin_list_source_runs))
}

fn source_read_permission_for_tier(tier: &str) -> &'static str {
    if role_tier_at_least(tier, ROLE_TIER_PREMIUM_USER) {
        "sources:read:full"
    } else if role_tier_at_least(tier, ROLE_TIER_VERIFIED_USER) {
        "sources:read:meta"
    } else {
        "sources:read:name"
    }
}

async fn source_authz_allows(
    state: &AppState,
    user: &AuthenticatedUser,
    source_id: Uuid,
    permission: &str,
) -> ApiResult<bool> {
    let decision = state
        .authz_service
        .check(
            user.tenant_id,
            user.id,
            AuthzCheckInput {
                resource_type: "source".to_string(),
                resource_id: source_id,
                permission: permission.to_string(),
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok(decision.allow)
}

async fn ensure_source_authz(
    state: &AppState,
    user: &AuthenticatedUser,
    source_id: Uuid,
    permission: &str,
) -> ApiResult<()> {
    if !source_authz_allows(state, user, source_id, permission).await? {
        return Err(AppError::forbidden("Permission denied"));
    }
    Ok(())
}

async fn count_visible_sources(
    state: &AppState,
    user: &AuthenticatedUser,
    read_permission: &str,
) -> ApiResult<i64> {
    let raw_total = state
        .source_service
        .count(user.tenant_id)
        .await
        .map_err(|e| AppError::internal_with_code("COUNT_ERROR", e.to_string()))?;
    if raw_total == 0 {
        return Ok(0);
    }

    let mut visible_total = 0i64;
    let mut offset = 0i64;
    while offset < raw_total {
        let batch = state
            .source_service
            .list(
                user.tenant_id,
                SOURCE_VISIBLE_COUNT_BATCH.min(raw_total - offset),
                offset,
            )
            .await
            .map_err(|e| AppError::internal_with_code("COUNT_ERROR", e.to_string()))?;
        if batch.is_empty() {
            break;
        }

        for source in batch {
            if source_authz_allows(state, user, source.id, read_permission).await? {
                visible_total += 1;
            }
        }
        offset += SOURCE_VISIBLE_COUNT_BATCH;
    }

    Ok(visible_total)
}

fn validate_source_name(name: &str) -> Result<String, AppError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::validation("Source name cannot be empty"));
    }
    if trimmed.len() > SOURCE_NAME_MAX_LEN {
        return Err(AppError::validation(format!(
            "Source name too long (max {SOURCE_NAME_MAX_LEN})"
        )));
    }
    Ok(trimmed.to_string())
}

async fn validate_source_url(raw: &str, allow_internal: bool) -> Result<String, AppError> {
    let policy = OutboundUrlPolicy::http_and_https(allow_internal)
        .with_max_len(SOURCE_URL_MAX_LEN)
        .with_dns_lookup_timeout(Duration::from_secs(2));

    let url = validate_outbound_url(raw, &policy)
        .await
        .map_err(|err| AppError::validation_with_code(err.code(), err.to_string()))?;

    Ok(url.to_string())
}

fn validate_source_schedule(schedule: Option<String>) -> Result<Option<String>, AppError> {
    let Some(schedule) = schedule else {
        return Ok(None);
    };
    let trimmed = schedule.trim().to_string();
    if trimmed.is_empty() {
        return Ok(None);
    }
    if trimmed.len() > SOURCE_SCHEDULE_MAX_LEN {
        return Err(AppError::validation(format!(
            "Schedule too long (max {SOURCE_SCHEDULE_MAX_LEN})"
        )));
    }
    Ok(Some(trimmed))
}

fn validate_source_priority(priority: Option<i32>) -> Result<Option<i32>, AppError> {
    let Some(priority) = priority else {
        return Ok(None);
    };
    if !(SOURCE_PRIORITY_MIN..=SOURCE_PRIORITY_MAX).contains(&priority) {
        return Err(AppError::validation(format!(
            "Priority must be between {SOURCE_PRIORITY_MIN} and {SOURCE_PRIORITY_MAX}"
        )));
    }
    Ok(Some(priority))
}

fn validate_spider_config(config: &Value) -> Result<(), AppError> {
    let obj = config
        .as_object()
        .ok_or_else(|| AppError::validation("Spider config must be a JSON object"))?;

    for field in ["list_selector", "title_selector", "link_selector"] {
        let value = obj
            .get(field)
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|v| !v.is_empty());

        if value.is_none() {
            return Err(AppError::validation(format!(
                "Spider config missing required field: {}",
                field
            )));
        }
    }

    Ok(())
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct SourceResponse {
    pub id: Uuid,
    pub name: String,
    pub url: String,
    pub source_type: String,
    pub config: serde_json::Value,
    pub schedule: Option<String>,
    pub priority: i32,
    pub is_active: bool,
    pub last_fetch: Option<DateTime<Utc>>,
    pub last_error: Option<String>,
    // Crawler enhancement: health monitoring fields
    pub health_status: String,
    pub consecutive_failures: i32,
    pub total_articles_fetched: i64,
    pub avg_fetch_duration_ms: Option<i32>,
    pub render_mode: String,
    pub encoding: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ListSourcesParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    /// Cursor for keyset pagination (base64url-encoded JSON).
    pub cursor: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SourceListResponse {
    pub data: Vec<SourceResponse>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SourceStatsResponse {
    pub total: i64,
    pub active_count: i64,
    pub error_count: i64,
}

impl From<law_eye_db::Source> for SourceResponse {
    fn from(source: law_eye_db::Source) -> Self {
        Self {
            id: source.id,
            name: source.name,
            url: source.url,
            source_type: source.source_type,
            config: source.config,
            schedule: source.schedule,
            priority: source.priority,
            is_active: source.is_active,
            last_fetch: source.last_fetch,
            last_error: source.last_error,
            health_status: source.health_status,
            consecutive_failures: source.consecutive_failures,
            total_articles_fetched: source.total_articles_fetched,
            avg_fetch_duration_ms: source.avg_fetch_duration_ms,
            render_mode: source.render_mode,
            encoding: source.encoding,
            created_at: source.created_at,
            updated_at: source.updated_at,
        }
    }
}

/// Trim a SourceResponse to honour the SPEC-01 source visibility tiers.
///
/// - basic_user (`sources:read:name`): name + url only; everything else cleared
/// - verified_user (`sources:read:meta`): + schedule/priority/health metadata, but config still hidden
/// - premium_user and above (`sources:read:full`): full record passed through
fn trim_source_for_tier(source: SourceResponse, tier: &str) -> SourceResponse {
    // Premium / tenant_admin / super_admin all hold `sources:read:full` — pass through.
    if role_tier_at_least(tier, ROLE_TIER_PREMIUM_USER) {
        return source;
    }

    let mut trimmed = source;
    if !role_tier_at_least(tier, ROLE_TIER_VERIFIED_USER) {
        trimmed.config = serde_json::Value::Null;
        trimmed.schedule = None;
        trimmed.priority = 0;
        trimmed.last_fetch = None;
        trimmed.last_error = None;
        trimmed.health_status = String::new();
        trimmed.consecutive_failures = 0;
        trimmed.total_articles_fetched = 0;
        trimmed.avg_fetch_duration_ms = None;
        trimmed.render_mode = String::new();
        trimmed.encoding = None;
    } else {
        trimmed.config = serde_json::Value::Null;
        trimmed.last_error = None;
    }
    trimmed
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateSourceRequest {
    pub name: String,
    pub url: String,
    pub source_type: String,
    pub config: serde_json::Value,
    pub schedule: Option<String>,
    pub priority: Option<i32>,
}

impl From<CreateSourceRequest> for CreateSource {
    fn from(request: CreateSourceRequest) -> Self {
        Self {
            name: request.name,
            url: request.url,
            source_type: request.source_type,
            config: request.config,
            schedule: request.schedule,
            priority: request.priority,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct EnqueueResponse {
    pub message: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct MessageResponse {
    pub message: String,
}

/// Source stats (total/active/error)
#[utoipa::path(
    get,
    path = "/api/v1/sources/stats",
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Source stats", body = SourceStatsResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn get_source_stats(
    State(state): State<AppState>,
    auth_session: AuthSession,
) -> ApiResult<Json<SourceStatsResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let can_read = state
        .user_service
        .has_permission(user.tenant_id, user.id, "sources:read")
        .await
        .map_err(AppError::from)?;
    if !can_read {
        return Err(AppError::forbidden("Permission denied"));
    }

    let stats = state
        .source_service
        .stats(user.tenant_id)
        .await
        .map_err(|e| AppError::internal_with_code("STATS_ERROR", e.to_string()))?;

    Ok(Json(SourceStatsResponse {
        total: stats.total,
        active_count: stats.active_count,
        error_count: stats.error_count,
    }))
}

/// List sources
#[utoipa::path(
    get,
    path = "/api/v1/sources",
    params(
        ("limit" = Option<i64>, Query, description = "Max results (default 100, max 1000)"),
        ("offset" = Option<i64>, Query, description = "Offset (default 0)"),
        ("cursor" = Option<String>, Query, description = "Cursor for keyset pagination (base64url JSON). When set, offset is ignored.")
    ),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Sources", body = SourceListResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn list_sources(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiQuery(params): ApiQuery<ListSourcesParams>,
) -> ApiResult<Json<SourceListResponse>> {
    #[derive(Debug, Clone, Serialize, Deserialize)]
    struct SourceCursor {
        priority: i32,
        name: String,
        id: Uuid,
    }

    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let can_read = state
        .user_service
        .has_permission(user.tenant_id, user.id, "sources:read")
        .await
        .map_err(AppError::from)?;
    if !can_read {
        return Err(AppError::forbidden("Permission denied"));
    }

    let mut limit = params.limit.unwrap_or(SOURCE_LIST_DEFAULT_LIMIT);
    if limit < 1 {
        return Err(AppError::validation("limit must be >= 1"));
    }
    limit = limit.min(SOURCE_LIST_MAX_LIMIT);

    let offset = params.offset.unwrap_or(0);
    if offset < 0 {
        return Err(AppError::validation("offset must be >= 0"));
    }

    let cursor = params
        .cursor
        .as_deref()
        .map(crate::pagination::decode_cursor::<SourceCursor>)
        .transpose()?;

    let mut next_cursor: Option<String> = None;
    let sources = if let Some(cursor) = cursor {
        let fetch_limit = limit.saturating_add(1);
        let mut items = state
            .source_service
            .list_cursor(
                user.tenant_id,
                fetch_limit,
                cursor.priority,
                &cursor.name,
                cursor.id,
            )
            .await
            .map_err(|e| AppError::internal_with_code("FETCH_ERROR", e.to_string()))?;

        if items.len() as i64 > limit {
            items.truncate(limit as usize);
            if let Some(last) = items.last() {
                next_cursor = Some(crate::pagination::encode_cursor(&SourceCursor {
                    priority: last.priority,
                    name: last.name.clone(),
                    id: last.id,
                })?);
            }
        }

        items
    } else {
        state
            .source_service
            .list(user.tenant_id, limit, offset)
            .await
            .map_err(|e| AppError::internal_with_code("FETCH_ERROR", e.to_string()))?
    };

    let roles = state
        .user_service
        .get_user_roles(user.tenant_id, user.id)
        .await
        .map_err(AppError::from)?;
    let role_names: Vec<String> = roles.into_iter().map(|role| role.name).collect();
    let role_tier = derive_role_tier_from_names(&role_names);

    let read_permission = source_read_permission_for_tier(&role_tier);
    let visible_total = count_visible_sources(&state, &user, read_permission).await?;
    let mut data = Vec::with_capacity(sources.len());
    for source in sources {
        if source_authz_allows(&state, &user, source.id, read_permission).await? {
            data.push(trim_source_for_tier(
                SourceResponse::from(source),
                &role_tier,
            ));
        }
    }

    Ok(Json(SourceListResponse {
        data,
        total: visible_total,
        limit,
        offset: if params.cursor.is_some() { 0 } else { offset },
        next_cursor,
    }))
}

/// Get source by id
#[utoipa::path(
    get,
    path = "/api/v1/sources/{id}",
    params(("id" = Uuid, Path, description = "Source ID")),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Source", body = SourceResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn get_source(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<SourceResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let can_read = state
        .user_service
        .has_permission(user.tenant_id, user.id, "sources:read")
        .await
        .map_err(AppError::from)?;
    if !can_read {
        return Err(AppError::forbidden("Permission denied"));
    }

    let source = state
        .source_service
        .get_by_id(user.tenant_id, id)
        .await
        .map_err(AppError::from)?;

    let roles = state
        .user_service
        .get_user_roles(user.tenant_id, user.id)
        .await
        .map_err(AppError::from)?;
    let role_names: Vec<String> = roles.into_iter().map(|role| role.name).collect();
    let role_tier = derive_role_tier_from_names(&role_names);
    ensure_source_authz(
        &state,
        &user,
        source.id,
        source_read_permission_for_tier(&role_tier),
    )
    .await?;

    Ok(Json(trim_source_for_tier(
        SourceResponse::from(source),
        &role_tier,
    )))
}

#[utoipa::path(
    delete,
    path = "/api/v1/sources/{id}",
    params(("id" = Uuid, Path, description = "Source ID")),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Source deleted", body = MessageResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Admin permission required", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn delete_source(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<MessageResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let is_admin = state
        .user_service
        .has_permission(user.tenant_id, user.id, "*")
        .await
        .map_err(AppError::from)?;
    if !is_admin {
        return Err(AppError::forbidden("Admin permission required"));
    }
    state
        .source_service
        .get_by_id(user.tenant_id, id)
        .await
        .map_err(AppError::from)?;
    ensure_source_authz(&state, &user, id, "sources:write").await?;

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    let tenant_id = user.tenant_id;
    let user_id = user.id;

    law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
        let source_service = state.source_service.clone();
        let audit_service = state.audit_service.clone();
        let ip_address = ip_address.clone();
        let user_agent = user_agent.clone();

        Box::pin(async move {
            let before = source_service.get_by_id_tx(tenant_id, tx, id).await?;
            let after = source_service.delete_tx(tenant_id, tx, id).await?;

            audit_service
                .log_tx(
                    tenant_id,
                    tx,
                    CreateAuditLog {
                        user_id: Some(user_id),
                        action: "sources.delete".to_string(),
                        resource: "sources".to_string(),
                        resource_id: Some(id),
                        old_value: Some(serde_json::json!({
                            "name": before.name,
                            "url": before.url,
                            "type": before.source_type,
                            "priority": before.priority,
                            "schedule": before.schedule,
                            "is_active": before.is_active,
                        })),
                        new_value: Some(serde_json::json!({
                            "deleted": true,
                            "is_active": after.is_active,
                        })),
                        ip_address,
                        user_agent,
                    },
                )
                .await?;

            Ok::<(), law_eye_common::Error>(())
        })
    })
    .await
    .map_err(|e| match e {
        Error::NotFound(_) | Error::Validation(_) | Error::Conflict(_) => AppError::from(e),
        _ => AppError::internal_with_code("DELETE_ERROR", e.to_string()),
    })?;

    Ok(Json(MessageResponse {
        message: "Source deleted".to_string(),
    }))
}

#[utoipa::path(
    post,
    path = "/api/v1/sources/{id}/restore",
    params(("id" = Uuid, Path, description = "Source ID")),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Source restored", body = SourceResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Admin permission required", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn restore_source(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<SourceResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let is_admin = state
        .user_service
        .has_permission(user.tenant_id, user.id, "*")
        .await
        .map_err(AppError::from)?;
    if !is_admin {
        return Err(AppError::forbidden("Admin permission required"));
    }

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    let tenant_id = user.tenant_id;
    let user_id = user.id;

    let source = law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
        let source_service = state.source_service.clone();
        let audit_service = state.audit_service.clone();
        let ip_address = ip_address.clone();
        let user_agent = user_agent.clone();

        Box::pin(async move {
            let before = source_service.get_by_id_any_tx(tenant_id, tx, id).await?;
            let before_deleted_at: Option<DateTime<Utc>> =
                sqlx::query_scalar("SELECT deleted_at FROM sources WHERE id = $1")
                    .bind(id)
                    .fetch_one(tx.as_mut())
                    .await
                    .map_err(|e| law_eye_common::Error::Database(e.to_string()))?;
            let after = source_service.restore_tx(tenant_id, tx, id).await?;

            audit_service
                .log_tx(
                    tenant_id,
                    tx,
                    CreateAuditLog {
                        user_id: Some(user_id),
                        action: "sources.restore".to_string(),
                        resource: "sources".to_string(),
                        resource_id: Some(id),
                        old_value: Some(serde_json::json!({
                            "deleted": before_deleted_at.is_some(),
                            "is_active": before.is_active,
                        })),
                        new_value: Some(serde_json::json!({
                            "restored": true,
                            "is_active": after.is_active,
                        })),
                        ip_address,
                        user_agent,
                    },
                )
                .await?;

            Ok(after)
        })
    })
    .await
    .map_err(|e| match e {
        Error::NotFound(_) | Error::Validation(_) | Error::Conflict(_) => AppError::from(e),
        _ => AppError::internal_with_code("RESTORE_ERROR", e.to_string()),
    })?;

    Ok(Json(SourceResponse::from(source)))
}

/// Create source (admin only)
#[utoipa::path(
    post,
    path = "/api/v1/sources",
    request_body = CreateSourceRequest,
    security(
        ("session" = [])
    ),
    responses(
        (status = 201, description = "Source created", body = SourceResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Admin permission required", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn create_source(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    ApiJson(mut input): ApiJson<CreateSourceRequest>,
) -> ApiResult<(StatusCode, Json<SourceResponse>)> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let is_admin = state
        .user_service
        .has_permission(user.tenant_id, user.id, "*")
        .await
        .map_err(AppError::from)?;
    if !is_admin {
        return Err(AppError::forbidden("Admin permission required"));
    }

    input.name = validate_source_name(&input.name)?;
    input.url = validate_source_url(&input.url, state.allow_internal_source_urls).await?;
    input.schedule = validate_source_schedule(input.schedule)?;
    input.priority = validate_source_priority(input.priority)?;

    match input.source_type.as_str() {
        "rss" => {}
        "spider" => validate_spider_config(&input.config)?,
        "api" => {
            return Err(AppError::bad_request_with_code(
                "UNSUPPORTED_SOURCE_TYPE",
                "API source type is not supported yet (worker does not implement it)",
            ));
        }
        // Government site adapters and future adapter types are accepted
        // without config validation — the adapter registry validates at crawl time.
        other if !other.is_empty() => {}
        _ => return Err(AppError::validation("Invalid source type")),
    }

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    let tenant_id = user.tenant_id;
    let user_id = user.id;

    let input_for_db: CreateSource = input.into();

    let source = law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
        let source_service = state.source_service.clone();
        let audit_service = state.audit_service.clone();
        let ip_address = ip_address.clone();
        let user_agent = user_agent.clone();
        let input_for_db = input_for_db.clone();

        Box::pin(async move {
            let source = source_service
                .create_tx(tenant_id, tx, input_for_db)
                .await?;

            audit_service
                .log_tx(
                    tenant_id,
                    tx,
                    CreateAuditLog {
                        user_id: Some(user_id),
                        action: "sources.create".to_string(),
                        resource: "sources".to_string(),
                        resource_id: Some(source.id),
                        old_value: None,
                        new_value: Some(serde_json::json!({
                            "id": source.id,
                            "name": source.name,
                            "url": source.url,
                            "type": source.source_type,
                            "priority": source.priority,
                            "schedule": source.schedule,
                            "is_active": source.is_active,
                        })),
                        ip_address,
                        user_agent,
                    },
                )
                .await?;

            Ok(source)
        })
    })
    .await
    .map_err(AppError::from)?;

    Ok((StatusCode::CREATED, Json(SourceResponse::from(source))))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn validate_source_url_allows_localhost_in_non_production() {
        let url = validate_source_url("http://127.0.0.1:1234/rss.xml", true)
            .await
            .unwrap();
        assert_eq!(url, "http://127.0.0.1:1234/rss.xml");
    }

    #[tokio::test]
    async fn validate_source_url_blocks_localhost_in_production() {
        let err = validate_source_url("http://127.0.0.1:1234/rss.xml", false)
            .await
            .unwrap_err();
        assert_eq!(err.status, StatusCode::BAD_REQUEST);
        assert_eq!(err.body.code.as_deref(), Some("SSRF_BLOCKED"));
    }

    #[tokio::test]
    async fn validate_source_url_rejects_non_http_scheme() {
        let err = validate_source_url("file:///etc/passwd", true)
            .await
            .unwrap_err();
        assert_eq!(err.body.code.as_deref(), Some("INVALID_URL"));
    }

    fn fixture_source() -> SourceResponse {
        let now = Utc::now();
        SourceResponse {
            id: Uuid::new_v4(),
            name: "Test Source".to_string(),
            url: "https://example.com/feed".to_string(),
            source_type: "rss".to_string(),
            config: serde_json::json!({"selector": ".item"}),
            schedule: Some("0 */15 * * * *".to_string()),
            priority: 50,
            is_active: true,
            last_fetch: Some(now),
            last_error: Some("transient".to_string()),
            health_status: "healthy".to_string(),
            consecutive_failures: 0,
            total_articles_fetched: 1234,
            avg_fetch_duration_ms: Some(450),
            render_mode: "static".to_string(),
            encoding: Some("utf-8".to_string()),
            created_at: now,
            updated_at: now,
        }
    }

    #[test]
    fn trim_source_for_basic_user_keeps_only_name_and_url() {
        let trimmed = trim_source_for_tier(
            fixture_source(),
            law_eye_core::role_tier::ROLE_TIER_BASIC_USER,
        );
        assert_eq!(trimmed.name, "Test Source");
        assert_eq!(trimmed.url, "https://example.com/feed");
        assert!(trimmed.config.is_null());
        assert!(trimmed.schedule.is_none());
        assert_eq!(trimmed.priority, 0);
        assert!(trimmed.last_fetch.is_none());
        assert!(trimmed.last_error.is_none());
        assert_eq!(trimmed.health_status, "");
        assert_eq!(trimmed.consecutive_failures, 0);
        assert_eq!(trimmed.total_articles_fetched, 0);
        assert!(trimmed.avg_fetch_duration_ms.is_none());
        assert_eq!(trimmed.render_mode, "");
        assert!(trimmed.encoding.is_none());
    }

    #[test]
    fn trim_source_for_verified_user_exposes_metadata_but_hides_config() {
        let trimmed = trim_source_for_tier(
            fixture_source(),
            law_eye_core::role_tier::ROLE_TIER_VERIFIED_USER,
        );
        assert_eq!(trimmed.name, "Test Source");
        assert!(trimmed.config.is_null(), "config remains hidden");
        assert!(trimmed.last_error.is_none(), "last_error masked");
        assert!(trimmed.schedule.is_some(), "schedule visible");
        assert_eq!(trimmed.priority, 50);
        assert!(trimmed.last_fetch.is_some());
        assert_eq!(trimmed.health_status, "healthy");
        assert_eq!(trimmed.total_articles_fetched, 1234);
    }

    #[test]
    fn trim_source_for_premium_user_passes_through_full_record() {
        let original = fixture_source();
        let trimmed = trim_source_for_tier(
            original.clone(),
            law_eye_core::role_tier::ROLE_TIER_PREMIUM_USER,
        );
        assert_eq!(trimmed.config, original.config);
        assert_eq!(trimmed.schedule, original.schedule);
        assert_eq!(trimmed.last_error, original.last_error);
        assert_eq!(trimmed.priority, original.priority);
    }

    #[test]
    fn trim_source_for_tenant_admin_passes_through_full_record() {
        let original = fixture_source();
        let trimmed = trim_source_for_tier(
            original.clone(),
            law_eye_core::role_tier::ROLE_TIER_TENANT_ADMIN,
        );
        assert_eq!(trimmed.config, original.config);
        assert_eq!(trimmed.last_error, original.last_error);
    }

    #[test]
    fn trim_source_for_super_admin_passes_through_full_record() {
        let original = fixture_source();
        let trimmed = trim_source_for_tier(
            original.clone(),
            law_eye_core::role_tier::ROLE_TIER_SUPER_ADMIN,
        );
        assert_eq!(trimmed.config, original.config);
        assert_eq!(trimmed.last_error, original.last_error);
    }

    #[test]
    fn source_read_permission_tracks_role_tier_visibility() {
        assert_eq!(
            source_read_permission_for_tier(law_eye_core::role_tier::ROLE_TIER_BASIC_USER),
            "sources:read:name"
        );
        assert_eq!(
            source_read_permission_for_tier(law_eye_core::role_tier::ROLE_TIER_VERIFIED_USER),
            "sources:read:meta"
        );
        assert_eq!(
            source_read_permission_for_tier(law_eye_core::role_tier::ROLE_TIER_PREMIUM_USER),
            "sources:read:full"
        );
    }
}

/// Trigger ingest fetch (admin only)
#[utoipa::path(
    post,
    path = "/api/v1/sources/{id}/fetch",
    params(("id" = Uuid, Path, description = "Source ID")),
    security(
        ("session" = [])
    ),
    responses(
        (status = 202, description = "Task enqueued", body = EnqueueResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Admin permission required", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn trigger_fetch(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(id): Path<Uuid>,
) -> ApiResult<(StatusCode, Json<EnqueueResponse>)> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let is_admin = state
        .user_service
        .has_permission(user.tenant_id, user.id, "*")
        .await
        .map_err(AppError::from)?;
    if !is_admin {
        return Err(AppError::forbidden("Admin permission required"));
    }

    let source = state
        .source_service
        .get_by_id(user.tenant_id, id)
        .await
        .map_err(AppError::from)?;
    ensure_source_authz(&state, &user, source.id, "sources:write").await?;

    let task = IngestTask {
        tenant_id: user.tenant_id,
        source_id: source.id,
        source_type: source.source_type,
        url: source.url,
        config: source.config,
    };

    state
        .task_queue
        .enqueue_retryable(QUEUE_INGEST_PRIORITY, task)
        .await
        .map_err(AppError::from)?;

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    state
        .audit_service
        .log(
            user.tenant_id,
            CreateAuditLog {
                user_id: Some(user.id),
                action: "sources.fetch.enqueue".to_string(),
                resource: "sources".to_string(),
                resource_id: Some(source.id),
                old_value: None,
                new_value: Some(serde_json::json!({
                    "queue": QUEUE_INGEST_PRIORITY,
                })),
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok((
        StatusCode::ACCEPTED,
        Json(EnqueueResponse {
            message: "Ingest task enqueued".to_string(),
        }),
    ))
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AdminRunSourceResponse {
    pub job_id: Uuid,
    pub run_id: Uuid,
    pub queued_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, ToSchema, sqlx::FromRow)]
pub struct SourceRunResponse {
    pub id: Uuid,
    pub source_id: Uuid,
    pub job_id: Option<Uuid>,
    pub triggered_by: Option<Uuid>,
    pub trigger_kind: String,
    pub status: String,
    pub articles_ingested: i32,
    pub error_message: Option<String>,
    pub started_at: Option<DateTime<Utc>>,
    pub finished_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[utoipa::path(
    post,
    path = "/api/v1/admin/sources/{id}/run",
    params(("id" = Uuid, Path, description = "Source ID")),
    security(("session" = [])),
    responses(
        (status = 202, description = "Manual crawl run queued", body = AdminRunSourceResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Admin permission required", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    ),
    tag = "admin"
)]
pub(crate) async fn admin_run_source(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(id): Path<Uuid>,
) -> ApiResult<(StatusCode, Json<AdminRunSourceResponse>)> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let can_manage = state
        .user_service
        .has_permission(user.tenant_id, user.id, "sources:manage")
        .await
        .map_err(AppError::from)?;
    if !can_manage {
        return Err(AppError::forbidden("Permission denied"));
    }

    let source = state
        .source_service
        .get_by_id(user.tenant_id, id)
        .await
        .map_err(AppError::from)?;
    ensure_source_authz(&state, &user, source.id, "sources:write").await?;

    let job_id = Uuid::new_v4();
    let queued_at = Utc::now();

    let task = IngestTask {
        tenant_id: user.tenant_id,
        source_id: source.id,
        source_type: source.source_type.clone(),
        url: source.url.clone(),
        config: source.config.clone(),
    };

    let tenant_id = user.tenant_id;
    let user_id = user.id;
    let source_id = source.id;
    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);

    let run_id = law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
        let audit_service = state.audit_service.clone();
        let ip_address = ip_address.clone();
        let user_agent = user_agent.clone();

        Box::pin(async move {
            let row: (Uuid,) = sqlx::query_as(
                r#"
                INSERT INTO source_runs (
                    tenant_id, source_id, job_id, triggered_by, trigger_kind, status, created_at
                )
                VALUES ($1, $2, $3, $4, 'manual', 'queued', $5)
                RETURNING id
                "#,
            )
            .bind(tenant_id)
            .bind(source_id)
            .bind(job_id)
            .bind(user_id)
            .bind(queued_at)
            .fetch_one(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

            audit_service
                .log_tx(
                    tenant_id,
                    tx,
                    CreateAuditLog {
                        user_id: Some(user_id),
                        action: "sources.run.enqueue".to_string(),
                        resource: "sources".to_string(),
                        resource_id: Some(source_id),
                        old_value: None,
                        new_value: Some(serde_json::json!({
                            "job_id": job_id,
                            "run_id": row.0,
                            "trigger_kind": "manual",
                        })),
                        ip_address,
                        user_agent,
                    },
                )
                .await?;

            Ok::<Uuid, Error>(row.0)
        })
    })
    .await
    .map_err(AppError::from)?;

    state
        .task_queue
        .enqueue_retryable(QUEUE_INGEST_PRIORITY, task)
        .await
        .map_err(AppError::from)?;

    Ok((
        StatusCode::ACCEPTED,
        Json(AdminRunSourceResponse {
            job_id,
            run_id,
            queued_at,
        }),
    ))
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SourceRunListResponse {
    pub data: Vec<SourceRunResponse>,
}

#[utoipa::path(
    get,
    path = "/api/v1/admin/sources/{id}/runs",
    params(("id" = Uuid, Path, description = "Source ID")),
    security(("session" = [])),
    responses(
        (status = 200, description = "Recent crawl runs (most recent 50)", body = SourceRunListResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Admin permission required", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    ),
    tag = "admin"
)]
pub(crate) async fn admin_list_source_runs(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<SourceRunListResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let can_manage = state
        .user_service
        .has_permission(user.tenant_id, user.id, "sources:manage")
        .await
        .map_err(AppError::from)?;
    if !can_manage {
        return Err(AppError::forbidden("Permission denied"));
    }

    let source = state
        .source_service
        .get_by_id(user.tenant_id, id)
        .await
        .map_err(AppError::from)?;
    ensure_source_authz(&state, &user, source.id, "sources:read:full").await?;

    let tenant_id = user.tenant_id;
    let runs = law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
        Box::pin(async move {
            sqlx::query_as::<_, SourceRunResponse>(
                r#"
                SELECT id, source_id, job_id, triggered_by, trigger_kind, status,
                       articles_ingested, error_message, started_at, finished_at, created_at
                FROM source_runs
                WHERE source_id = $1
                ORDER BY created_at DESC
                LIMIT 50
                "#,
            )
            .bind(id)
            .fetch_all(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))
        })
    })
    .await
    .map_err(AppError::from)?;

    Ok(Json(SourceRunListResponse { data: runs }))
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct AdminPatchSourceRequest {
    pub name: Option<String>,
    pub source_type: Option<String>,
    /// Cron schedule. Use `Some(None)` to clear (set NULL); omit field to keep.
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    pub schedule: Option<Option<String>>,
    pub config: Option<serde_json::Value>,
    /// Page encoding. `Some(None)` clears.
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    pub encoding: Option<Option<String>>,
    pub render_mode: Option<String>,
    pub priority: Option<i32>,
    pub is_active: Option<bool>,
}

fn deserialize_optional_field<'de, T, D>(de: D) -> Result<Option<Option<T>>, D::Error>
where
    T: serde::Deserialize<'de>,
    D: serde::Deserializer<'de>,
{
    Option::<T>::deserialize(de).map(Some)
}

#[utoipa::path(
    patch,
    path = "/api/v1/admin/sources/{id}",
    params(("id" = Uuid, Path, description = "Source ID")),
    request_body = AdminPatchSourceRequest,
    security(("session" = [])),
    responses(
        (status = 200, description = "Source updated", body = SourceResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    ),
    tag = "admin"
)]
pub(crate) async fn admin_patch_source(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(id): Path<Uuid>,
    ApiJson(req): ApiJson<AdminPatchSourceRequest>,
) -> ApiResult<Json<SourceResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let can_manage = state
        .user_service
        .has_permission(user.tenant_id, user.id, "sources:manage")
        .await
        .map_err(AppError::from)?;
    if !can_manage {
        return Err(AppError::forbidden("Permission denied"));
    }
    state
        .source_service
        .get_by_id(user.tenant_id, id)
        .await
        .map_err(AppError::from)?;
    ensure_source_authz(&state, &user, id, "sources:write").await?;

    let validated_name = match &req.name {
        Some(name) => Some(validate_source_name(name)?),
        None => None,
    };
    let validated_schedule = match &req.schedule {
        Some(Some(s)) => Some(validate_source_schedule(Some(s.clone()))?),
        Some(None) => Some(None),
        None => None,
    };
    let validated_priority = validate_source_priority(req.priority)?;
    if let (Some(source_type), Some(config)) = (req.source_type.as_deref(), req.config.as_ref()) {
        if source_type == "spider" {
            validate_spider_config(config)?;
        }
    }
    if let Some(rm) = req.render_mode.as_deref() {
        if !matches!(rm, "static" | "dynamic" | "hybrid") {
            return Err(AppError::validation(
                "render_mode must be 'static', 'dynamic', or 'hybrid'",
            ));
        }
    }

    let tenant_id = user.tenant_id;
    let user_id = user.id;
    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);

    let updated = law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
        let audit_service = state.audit_service.clone();
        let ip_address = ip_address.clone();
        let user_agent = user_agent.clone();
        let validated_name = validated_name.clone();
        let validated_schedule = validated_schedule.clone();
        let req_source_type = req.source_type.clone();
        let req_config = req.config.clone();
        let req_encoding = req.encoding.clone();
        let req_render_mode = req.render_mode.clone();
        let req_is_active = req.is_active;

        Box::pin(async move {
            let before = sqlx::query_as::<_, law_eye_db::Source>(
                "SELECT * FROM sources WHERE id = $1 AND deleted_at IS NULL",
            )
            .bind(id)
            .fetch_optional(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?
            .ok_or_else(|| Error::NotFound(format!("Source {} not found", id)))?;

            // COALESCE-style PATCH using $N::text/jsonb predicates and option flags
            // (`$X::bool`) lets us distinguish "not provided" from "explicit NULL".
            let after = sqlx::query_as::<_, law_eye_db::Source>(
                r#"
                UPDATE sources
                SET name = COALESCE($2, name),
                    type = COALESCE($3, type),
                    config = COALESCE($4, config),
                    schedule = CASE WHEN $5::bool THEN $6 ELSE schedule END,
                    encoding = CASE WHEN $7::bool THEN $8 ELSE encoding END,
                    render_mode = COALESCE($9, render_mode),
                    priority = COALESCE($10, priority),
                    is_active = COALESCE($11, is_active),
                    updated_at = NOW()
                WHERE id = $1 AND deleted_at IS NULL
                RETURNING *
                "#,
            )
            .bind(id)
            .bind(validated_name)
            .bind(req_source_type)
            .bind(req_config)
            .bind(validated_schedule.is_some())
            .bind(validated_schedule.flatten())
            .bind(req_encoding.is_some())
            .bind(req_encoding.flatten())
            .bind(req_render_mode)
            .bind(validated_priority)
            .bind(req_is_active)
            .fetch_one(tx.as_mut())
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

            audit_service
                .log_tx(
                    tenant_id,
                    tx,
                    CreateAuditLog {
                        user_id: Some(user_id),
                        action: "sources.patch".to_string(),
                        resource: "sources".to_string(),
                        resource_id: Some(id),
                        old_value: Some(serde_json::json!({
                            "name": before.name,
                            "source_type": before.source_type,
                            "schedule": before.schedule,
                            "priority": before.priority,
                            "is_active": before.is_active,
                            "render_mode": before.render_mode,
                            "encoding": before.encoding,
                        })),
                        new_value: Some(serde_json::json!({
                            "name": after.name,
                            "source_type": after.source_type,
                            "schedule": after.schedule,
                            "priority": after.priority,
                            "is_active": after.is_active,
                            "render_mode": after.render_mode,
                            "encoding": after.encoding,
                        })),
                        ip_address,
                        user_agent,
                    },
                )
                .await?;

            Ok::<law_eye_db::Source, Error>(after)
        })
    })
    .await
    .map_err(AppError::from)?;

    Ok(Json(SourceResponse::from(updated)))
}
