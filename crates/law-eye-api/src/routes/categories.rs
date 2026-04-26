use axum::{
    extract::{ConnectInfo, Path, Query, State},
    http::HeaderMap,
    middleware,
    routing::{delete, get, patch, post},
    Extension, Json, Router,
};
use chrono::{DateTime, Utc};
use law_eye_core::category::{CategoryImportRow, ImportSummary};
use law_eye_db::{CreateAuditLog, CreateCategory, UpdateCategory};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::net::SocketAddr;
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::middleware::{RequirePermission, RequiredPermission};
use crate::state::AppState;
use crate::{ApiError, ApiJson, ApiResult, AppError};
use law_eye_core::role_tier::{
    category_visible_for_tier, derive_role_tier_from_names, is_admin_tier,
};

pub fn router() -> Router<AppState> {
    Router::new().route("/", get(list_categories))
}

pub fn admin_router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_admin_categories))
        .route("/", post(create_category))
        .route("/import", post(import_categories))
        .route("/{id}", patch(update_category))
        .route("/{id}", delete(delete_category))
        .route("/{id}/reorder", post(reorder_category))
        .layer(middleware::from_extractor::<RequirePermission>())
        .layer(Extension(RequiredPermission("categories:write")))
}

#[derive(Debug, Serialize, ToSchema)]
pub struct CategoryResponse {
    pub id: Uuid,
    pub slug: String,
    pub name: String,
    pub description: Option<String>,
    pub parent_id: Option<Uuid>,
    pub sort_order: i32,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub visibility_tier: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<law_eye_db::Category> for CategoryResponse {
    fn from(category: law_eye_db::Category) -> Self {
        Self {
            id: category.id,
            slug: category.slug,
            name: category.name,
            description: category.description,
            parent_id: category.parent_id,
            sort_order: category.sort_order,
            icon: category.icon,
            color: category.color,
            visibility_tier: category.visibility_tier,
            created_at: category.created_at,
            updated_at: category.updated_at,
        }
    }
}

#[derive(Debug, Deserialize, IntoParams, ToSchema)]
pub struct ListAdminCategoriesQuery {
    pub include_deleted: Option<bool>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateCategoryRequest {
    pub slug: String,
    pub name: String,
    pub description: Option<String>,
    pub parent_id: Option<Uuid>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub visibility_tier: Option<String>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateCategoryRequest {
    pub slug: Option<String>,
    pub name: Option<String>,
    pub description: Option<String>,
    pub clear_description: Option<bool>,
    pub parent_id: Option<Uuid>,
    pub clear_parent: Option<bool>,
    pub icon: Option<String>,
    pub clear_icon: Option<bool>,
    pub color: Option<String>,
    pub clear_color: Option<bool>,
    pub visibility_tier: Option<String>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ReorderCategoryRequest {
    pub parent_id: Option<Uuid>,
    pub clear_parent: Option<bool>,
    pub sort_order: i32,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ImportCategoryRow {
    pub slug: String,
    pub name: String,
    pub parent_slug: Option<String>,
    pub visibility_tier: Option<String>,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ImportCategoriesRequest {
    pub rows: Vec<ImportCategoryRow>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ImportCategoriesResponse {
    pub created: i32,
    pub updated: i32,
    pub skipped: i32,
}

impl From<ImportSummary> for ImportCategoriesResponse {
    fn from(value: ImportSummary) -> Self {
        Self {
            created: value.created,
            updated: value.updated,
            skipped: value.skipped,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct DeleteCategoryResponse {
    pub success: bool,
    pub id: Uuid,
}

#[utoipa::path(
    get,
    path = "/api/v1/categories",
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Categories", body = Vec<CategoryResponse>),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn list_categories(
    State(state): State<AppState>,
    auth_session: AuthSession,
) -> ApiResult<Json<Vec<CategoryResponse>>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let can_read = state
        .user_service
        .has_permission(user.tenant_id, user.id, "categories:read")
        .await
        .map_err(AppError::from)?;
    if !can_read {
        return Err(AppError::forbidden("Permission denied"));
    }

    let roles = state
        .user_service
        .get_user_roles(user.tenant_id, user.id)
        .await
        .map_err(AppError::from)?;
    let role_names: Vec<String> = roles.into_iter().map(|role| role.name).collect();
    let role_tier = derive_role_tier_from_names(&role_names);

    let categories = state
        .category_service
        .list()
        .await
        .map_err(AppError::from)?;

    // SPEC-01 §2: basic_user → 3 公共类，verified_user → 6 类，premium/admin → 全部。
    let filtered: Vec<CategoryResponse> = if is_admin_tier(&role_tier) {
        categories.into_iter().map(CategoryResponse::from).collect()
    } else {
        categories
            .into_iter()
            .filter(|category| category_visible_for_tier(&category.slug, &role_tier))
            .map(CategoryResponse::from)
            .collect()
    };

    Ok(Json(filtered))
}

#[utoipa::path(
    get,
    path = "/api/v1/admin/categories",
    params(ListAdminCategoriesQuery),
    security(("session" = [])),
    responses((status = 200, body = [CategoryResponse])),
    tag = "categories"
)]
pub(crate) async fn list_admin_categories(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(query): Query<ListAdminCategoriesQuery>,
) -> ApiResult<Json<Vec<CategoryResponse>>> {
    let _user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;
    let items = state
        .category_service
        .list_admin(query.include_deleted.unwrap_or(false))
        .await
        .map_err(AppError::from)?;
    Ok(Json(items.into_iter().map(CategoryResponse::from).collect()))
}

#[utoipa::path(
    post,
    path = "/api/v1/admin/categories",
    request_body = CreateCategoryRequest,
    security(("session" = [])),
    responses((status = 200, body = CategoryResponse)),
    tag = "categories"
)]
pub(crate) async fn create_category(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    ApiJson(req): ApiJson<CreateCategoryRequest>,
) -> ApiResult<Json<CategoryResponse>> {
    let current_user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;
    let category = state
        .category_service
        .create(CreateCategory {
            slug: req.slug,
            name: req.name,
            description: req.description,
            parent_id: req.parent_id,
            icon: req.icon,
            color: req.color,
            visibility_tier: req.visibility_tier,
            sort_order: req.sort_order,
        })
        .await
        .map_err(AppError::from)?;
    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    state
        .audit_service
        .log(
            current_user.tenant_id,
            CreateAuditLog {
                user_id: Some(current_user.id),
                action: "categories.create".to_string(),
                resource: "categories".to_string(),
                resource_id: Some(category.id),
                old_value: None,
                new_value: Some(json!({
                    "slug": category.slug,
                    "name": category.name,
                    "visibility_tier": category.visibility_tier,
                    "parent_id": category.parent_id,
                })),
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;
    Ok(Json(category.into()))
}

#[utoipa::path(
    patch,
    path = "/api/v1/admin/categories/{id}",
    params(("id" = Uuid, Path, description = "Category ID")),
    request_body = UpdateCategoryRequest,
    security(("session" = [])),
    responses((status = 200, body = CategoryResponse)),
    tag = "categories"
)]
pub(crate) async fn update_category(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(id): Path<Uuid>,
    ApiJson(req): ApiJson<UpdateCategoryRequest>,
) -> ApiResult<Json<CategoryResponse>> {
    let current_user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;

    let description = if req.clear_description.unwrap_or(false) {
        Some(None)
    } else {
        req.description.map(Some)
    };
    let parent_id = if req.clear_parent.unwrap_or(false) {
        Some(None)
    } else {
        req.parent_id.map(Some)
    };
    let icon = if req.clear_icon.unwrap_or(false) {
        Some(None)
    } else {
        req.icon.map(Some)
    };
    let color = if req.clear_color.unwrap_or(false) {
        Some(None)
    } else {
        req.color.map(Some)
    };

    let category = state
        .category_service
        .update(
            id,
            UpdateCategory {
                slug: req.slug,
                name: req.name,
                description,
                parent_id,
                icon,
                color,
                visibility_tier: req.visibility_tier,
                sort_order: req.sort_order,
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
                action: "categories.update".to_string(),
                resource: "categories".to_string(),
                resource_id: Some(category.id),
                old_value: None,
                new_value: Some(json!({
                    "slug": category.slug,
                    "name": category.name,
                    "visibility_tier": category.visibility_tier,
                    "parent_id": category.parent_id,
                    "sort_order": category.sort_order,
                })),
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;
    Ok(Json(category.into()))
}

#[utoipa::path(
    delete,
    path = "/api/v1/admin/categories/{id}",
    params(("id" = Uuid, Path, description = "Category ID")),
    security(("session" = [])),
    responses((status = 200, body = DeleteCategoryResponse)),
    tag = "categories"
)]
pub(crate) async fn delete_category(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<DeleteCategoryResponse>> {
    let current_user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;
    state
        .category_service
        .soft_delete(id)
        .await
        .map_err(AppError::from)?;
    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    state
        .audit_service
        .log(
            current_user.tenant_id,
            CreateAuditLog {
                user_id: Some(current_user.id),
                action: "categories.delete".to_string(),
                resource: "categories".to_string(),
                resource_id: Some(id),
                old_value: None,
                new_value: Some(json!({"id": id})),
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;
    Ok(Json(DeleteCategoryResponse { success: true, id }))
}

#[utoipa::path(
    post,
    path = "/api/v1/admin/categories/{id}/reorder",
    params(("id" = Uuid, Path, description = "Category ID")),
    request_body = ReorderCategoryRequest,
    security(("session" = [])),
    responses((status = 200, body = CategoryResponse)),
    tag = "categories"
)]
pub(crate) async fn reorder_category(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(id): Path<Uuid>,
    ApiJson(req): ApiJson<ReorderCategoryRequest>,
) -> ApiResult<Json<CategoryResponse>> {
    let current_user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;
    let new_parent_id = if req.clear_parent.unwrap_or(false) {
        None
    } else {
        req.parent_id
    };
    let category = state
        .category_service
        .reorder(id, new_parent_id, req.sort_order)
        .await
        .map_err(AppError::from)?;
    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    state
        .audit_service
        .log(
            current_user.tenant_id,
            CreateAuditLog {
                user_id: Some(current_user.id),
                action: "categories.reorder".to_string(),
                resource: "categories".to_string(),
                resource_id: Some(category.id),
                old_value: None,
                new_value: Some(json!({
                    "parent_id": category.parent_id,
                    "sort_order": category.sort_order,
                })),
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;
    Ok(Json(category.into()))
}

#[utoipa::path(
    post,
    path = "/api/v1/admin/categories/import",
    request_body = ImportCategoriesRequest,
    security(("session" = [])),
    responses((status = 200, body = ImportCategoriesResponse)),
    tag = "categories"
)]
pub(crate) async fn import_categories(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    ApiJson(req): ApiJson<ImportCategoriesRequest>,
) -> ApiResult<Json<ImportCategoriesResponse>> {
    let current_user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;
    let rows: Vec<CategoryImportRow> = req
        .rows
        .into_iter()
        .map(|r| CategoryImportRow {
            slug: r.slug,
            name: r.name,
            parent_slug: r.parent_slug,
            visibility_tier: r.visibility_tier,
            description: r.description,
            icon: r.icon,
            color: r.color,
        })
        .collect();
    let row_count = rows.len();
    let summary = state
        .category_service
        .bulk_import(rows)
        .await
        .map_err(AppError::from)?;
    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    state
        .audit_service
        .log(
            current_user.tenant_id,
            CreateAuditLog {
                user_id: Some(current_user.id),
                action: "categories.import".to_string(),
                resource: "categories".to_string(),
                resource_id: None,
                old_value: None,
                new_value: Some(json!({
                    "rows": row_count,
                    "created": summary.created,
                    "updated": summary.updated,
                    "skipped": summary.skipped,
                })),
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;
    Ok(Json(summary.into()))
}

#[cfg(test)]
mod tests {
    //! Tier-aware filtering tests for `list_categories`. These exercise the pure
    //! filtering logic against synthetic Category rows so we can hit all 5 tiers
    //! without a live database.

    use super::*;
    use chrono::Utc;
    use law_eye_core::role_tier::{
        ROLE_TIER_BASIC_USER, ROLE_TIER_PREMIUM_USER, ROLE_TIER_SUPER_ADMIN, ROLE_TIER_TENANT_ADMIN,
        ROLE_TIER_VERIFIED_USER,
    };

    fn category(slug: &str) -> law_eye_db::Category {
        law_eye_db::Category {
            id: Uuid::new_v4(),
            slug: slug.to_string(),
            name: slug.to_string(),
            description: None,
            parent_id: None,
            sort_order: 0,
            icon: None,
            color: None,
            created_at: Utc::now(),
            visibility_tier: "verified".to_string(),
            updated_at: Utc::now(),
            deleted_at: None,
        }
    }

    fn all_seed_categories() -> Vec<law_eye_db::Category> {
        [
            "legislation",
            "regulation",
            "enforcement",
            "industry",
            "compliance",
            "data",
            "security",
            "academic",
            "events",
            "international",
        ]
        .into_iter()
        .map(category)
        .collect()
    }

    fn filter_for_tier(tier: &str) -> Vec<String> {
        all_seed_categories()
            .into_iter()
            .filter(|c| is_admin_tier(tier) || category_visible_for_tier(&c.slug, tier))
            .map(|c| c.slug)
            .collect()
    }

    #[test]
    fn list_categories_basic_user_returns_three_public_slugs() {
        let slugs = filter_for_tier(ROLE_TIER_BASIC_USER);
        assert_eq!(slugs.len(), 3);
        assert!(slugs.contains(&"legislation".to_string()));
        assert!(slugs.contains(&"regulation".to_string()));
        assert!(slugs.contains(&"enforcement".to_string()));
    }

    #[test]
    fn list_categories_verified_user_returns_six_slugs() {
        let slugs = filter_for_tier(ROLE_TIER_VERIFIED_USER);
        assert_eq!(slugs.len(), 6);
        for required in [
            "legislation",
            "regulation",
            "enforcement",
            "industry",
            "compliance",
            "data",
        ] {
            assert!(
                slugs.contains(&required.to_string()),
                "verified_user must see {required}"
            );
        }
    }

    #[test]
    fn list_categories_premium_user_returns_all_ten_slugs() {
        assert_eq!(filter_for_tier(ROLE_TIER_PREMIUM_USER).len(), 10);
    }

    #[test]
    fn list_categories_tenant_admin_returns_all_ten_slugs() {
        assert_eq!(filter_for_tier(ROLE_TIER_TENANT_ADMIN).len(), 10);
    }

    #[test]
    fn list_categories_super_admin_returns_all_ten_slugs() {
        assert_eq!(filter_for_tier(ROLE_TIER_SUPER_ADMIN).len(), 10);
    }
}
