use axum::{
    extract::{ConnectInfo, Path, Query, State},
    http::HeaderMap,
    middleware,
    routing::{delete, get, post},
    Extension, Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::net::SocketAddr;
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::middleware::{RequirePermission, RequiredPermission};
use crate::state::AppState;
use crate::{ApiError, ApiJson, ApiResult, AppError};
use law_eye_core::{AuthzCheckInput, CreateAuthRelationInput};
use law_eye_db::CreateAuditLog;

#[derive(Debug, Deserialize, IntoParams, ToSchema)]
pub struct AuthzCheckQuery {
    pub resource_type: String,
    pub resource_id: Uuid,
    pub permission: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AuthzDecisionResponse {
    pub allow: bool,
    pub decision_path: Vec<String>,
    pub role_tier: String,
    pub matched_relation: Option<String>,
    pub matched_subject: Option<String>,
    pub roles: Vec<String>,
    pub permissions: Vec<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateRelationRequest {
    pub resource_type: String,
    pub resource_id: Uuid,
    pub relation: String,
    pub subject_type: String,
    pub subject_key: String,
    pub subject_relation: Option<String>,
    pub properties: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AuthRelationResponse {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub resource_type: String,
    pub resource_id: Uuid,
    pub relation: String,
    pub subject_type: String,
    pub subject_key: String,
    pub subject_relation: Option<String>,
    pub created_by: Option<Uuid>,
    pub properties: serde_json::Value,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct RelationMutationResponse {
    pub success: bool,
    pub relation: AuthRelationResponse,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct DeleteRelationResponse {
    pub success: bool,
    pub message: String,
    pub id: Uuid,
}

impl From<law_eye_db::AuthRelation> for AuthRelationResponse {
    fn from(value: law_eye_db::AuthRelation) -> Self {
        Self {
            id: value.id,
            tenant_id: value.tenant_id,
            resource_type: value.resource_type,
            resource_id: value.resource_id,
            relation: value.relation,
            subject_type: value.subject_type,
            subject_key: value.subject_key,
            subject_relation: value.subject_relation,
            created_by: value.created_by,
            properties: value.properties,
            created_at: value.created_at,
            updated_at: value.updated_at,
        }
    }
}

pub fn router() -> Router<AppState> {
    let manage_routes = Router::new()
        .route("/relations", post(create_relation))
        .route("/relations/{id}", delete(delete_relation))
        .layer(middleware::from_extractor::<RequirePermission>())
        .layer(Extension(RequiredPermission("tenants:manage")));

    Router::new()
        .route("/check", get(check))
        .merge(manage_routes)
}

#[utoipa::path(
    get,
    path = "/api/v1/authz/check",
    params(AuthzCheckQuery),
    responses(
        (status = 200, description = "Authorization decision", body = AuthzDecisionResponse),
        (status = 400, description = "Invalid request", body = ApiError),
        (status = 401, description = "Authentication required", body = ApiError)
    ),
    security(("session" = [])),
    tag = "authz"
)]
pub(crate) async fn check(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(query): Query<AuthzCheckQuery>,
) -> ApiResult<Json<AuthzDecisionResponse>> {
    let current_user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;

    let decision = state
        .authz_service
        .check(
            current_user.tenant_id,
            current_user.id,
            AuthzCheckInput {
                resource_type: query.resource_type,
                resource_id: query.resource_id,
                permission: query.permission,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(AuthzDecisionResponse {
        allow: decision.allow,
        decision_path: decision.decision_path,
        role_tier: decision.role_tier,
        matched_relation: decision.matched_relation,
        matched_subject: decision.matched_subject,
        roles: decision.roles,
        permissions: decision.permissions,
    }))
}

#[utoipa::path(
    post,
    path = "/api/v1/authz/relations",
    request_body = CreateRelationRequest,
    responses(
        (status = 200, description = "Relation created", body = RelationMutationResponse),
        (status = 400, description = "Invalid request", body = ApiError),
        (status = 401, description = "Authentication required", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError)
    ),
    security(("session" = [])),
    tag = "authz"
)]
pub(crate) async fn create_relation(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    ApiJson(req): ApiJson<CreateRelationRequest>,
) -> ApiResult<Json<RelationMutationResponse>> {
    let current_user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;

    let relation = state
        .authz_service
        .upsert_relation(
            current_user.tenant_id,
            CreateAuthRelationInput {
                resource_type: req.resource_type,
                resource_id: req.resource_id,
                relation: req.relation,
                subject_type: req.subject_type,
                subject_key: req.subject_key,
                subject_relation: req.subject_relation,
                properties: req.properties.unwrap_or_else(|| json!({})),
                created_by: Some(current_user.id),
            },
        )
        .await
        .map_err(AppError::from)?;

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    state
        .audit_service
        .log(
            current_user.tenant_id,
            CreateAuditLog {
                user_id: Some(current_user.id),
                action: "authz.relation.create".to_string(),
                resource: "auth_relation".to_string(),
                resource_id: Some(relation.id),
                old_value: None,
                new_value: Some(json!({
                    "resource_type": relation.resource_type,
                    "resource_id": relation.resource_id,
                    "relation": relation.relation,
                    "subject_type": relation.subject_type,
                    "subject_key": relation.subject_key,
                })),
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(RelationMutationResponse {
        success: true,
        relation: relation.into(),
    }))
}

#[utoipa::path(
    delete,
    path = "/api/v1/authz/relations/{id}",
    params(("id" = Uuid, Path, description = "Relation ID")),
    responses(
        (status = 200, description = "Relation deleted", body = DeleteRelationResponse),
        (status = 401, description = "Authentication required", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Not found", body = ApiError)
    ),
    security(("session" = [])),
    tag = "authz"
)]
pub(crate) async fn delete_relation(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<DeleteRelationResponse>> {
    let current_user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;

    let relation = state
        .authz_service
        .delete_relation(current_user.tenant_id, id)
        .await
        .map_err(AppError::from)?;

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    state
        .audit_service
        .log(
            current_user.tenant_id,
            CreateAuditLog {
                user_id: Some(current_user.id),
                action: "authz.relation.delete".to_string(),
                resource: "auth_relation".to_string(),
                resource_id: Some(relation.id),
                old_value: Some(json!({
                    "resource_type": relation.resource_type,
                    "resource_id": relation.resource_id,
                    "relation": relation.relation,
                    "subject_type": relation.subject_type,
                    "subject_key": relation.subject_key,
                })),
                new_value: None,
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(DeleteRelationResponse {
        success: true,
        message: "Relation deleted".to_string(),
        id,
    }))
}
