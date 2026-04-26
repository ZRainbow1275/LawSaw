use crate::tenant::with_tenant_tx;
use law_eye_common::{Error, Result};
use law_eye_db::{AuthRelation, ChannelAccessPolicy, CreateAuthRelation};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

pub const ROLE_TIER_BASIC_USER: &str = "basic_user";
pub const ROLE_TIER_VERIFIED_USER: &str = "verified_user";
pub const ROLE_TIER_PREMIUM_USER: &str = "premium_user";
pub const ROLE_TIER_TENANT_ADMIN: &str = "tenant_admin";
pub const ROLE_TIER_SUPER_ADMIN: &str = "super_admin";

#[derive(Debug, Clone)]
pub struct CreateAuthRelationInput {
    pub resource_type: String,
    pub resource_id: Uuid,
    pub relation: String,
    pub subject_type: String,
    pub subject_key: String,
    pub subject_relation: Option<String>,
    pub properties: Value,
    pub created_by: Option<Uuid>,
}

impl From<CreateAuthRelationInput> for CreateAuthRelation {
    fn from(value: CreateAuthRelationInput) -> Self {
        Self {
            resource_type: value.resource_type,
            resource_id: value.resource_id,
            relation: value.relation,
            subject_type: value.subject_type,
            subject_key: value.subject_key,
            subject_relation: value.subject_relation,
            properties: value.properties,
            created_by: value.created_by,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthzDecision {
    pub allow: bool,
    pub decision_path: Vec<String>,
    pub role_tier: String,
    pub matched_relation_id: Option<Uuid>,
    pub matched_policy_id: Option<Uuid>,
    pub matched_relation: Option<String>,
    pub matched_subject: Option<String>,
    pub roles: Vec<String>,
    pub permissions: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct AuthzCheckInput {
    pub resource_type: String,
    pub resource_id: Uuid,
    pub permission: String,
}

pub struct AuthzService {
    pool: PgPool,
}

impl AuthzService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn create_relation(
        &self,
        tenant_id: Uuid,
        input: CreateAuthRelation,
    ) -> Result<AuthRelation> {
        validate_resource_type(&input.resource_type)?;
        validate_subject_type(&input.subject_type)?;
        validate_relation_name(&input.relation)?;
        validate_subject_key(&input.subject_type, &input.subject_key)?;

        let subject_id = if input.subject_type == "user" {
            Some(Uuid::parse_str(&input.subject_key).map_err(|_| {
                Error::Validation("subject_key must be a UUID when subject_type=user".to_string())
            })?)
        } else {
            None
        };

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, AuthRelation>(
                    r#"
                    INSERT INTO auth_relations (
                        tenant_id,
                        resource_type,
                        resource_id,
                        relation,
                        subject_type,
                        subject_id,
                        subject_key,
                        subject_relation,
                        properties,
                        created_by,
                        updated_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
                    RETURNING *
                    "#,
                )
                .bind(tenant_id)
                .bind(&input.resource_type)
                .bind(input.resource_id)
                .bind(&input.relation)
                .bind(&input.subject_type)
                .bind(subject_id)
                .bind(&input.subject_key)
                .bind(&input.subject_relation)
                .bind(&input.properties)
                .bind(input.created_by)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    pub async fn upsert_relation(
        &self,
        tenant_id: Uuid,
        input: CreateAuthRelationInput,
    ) -> Result<AuthRelation> {
        self.create_relation(tenant_id, input.into()).await
    }

    pub async fn get_relation_by_id(&self, tenant_id: Uuid, id: Uuid) -> Result<AuthRelation> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, AuthRelation>("SELECT * FROM auth_relations WHERE id = $1")
                    .bind(id)
                    .fetch_optional(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?
                    .ok_or_else(|| Error::NotFound(format!("Relation {} not found", id)))
            })
        })
        .await
    }

    pub async fn delete_relation(&self, tenant_id: Uuid, id: Uuid) -> Result<AuthRelation> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let relation =
                    sqlx::query_as::<_, AuthRelation>("SELECT * FROM auth_relations WHERE id = $1")
                        .bind(id)
                        .fetch_optional(tx.as_mut())
                        .await
                        .map_err(|e| Error::Database(e.to_string()))?
                        .ok_or_else(|| Error::NotFound(format!("Relation {} not found", id)))?;

                let result = sqlx::query("DELETE FROM auth_relations WHERE id = $1")
                    .bind(id)
                    .execute(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;

                if result.rows_affected() == 0 {
                    return Err(Error::NotFound(format!("Relation {} not found", id)));
                }

                Ok(relation)
            })
        })
        .await
    }

    /// Paginated tenant-scoped relation list for the admin matrix.
    ///
    /// Filters are AND-combined; all are optional. Resource_type / subject_type /
    /// relation are matched as exact strings. Pagination is `LIMIT/OFFSET`.
    /// Returns `(rows, total_unfiltered_by_pagination)`.
    pub async fn list_relations(
        &self,
        tenant_id: Uuid,
        subject_type: Option<&str>,
        resource_type: Option<&str>,
        relation: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> Result<(Vec<AuthRelation>, i64)> {
        let subject_type = subject_type.map(str::to_string);
        let resource_type = resource_type.map(str::to_string);
        let relation = relation.map(str::to_string);

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            let subject_type = subject_type.clone();
            let resource_type = resource_type.clone();
            let relation = relation.clone();
            Box::pin(async move {
                let rows = sqlx::query_as::<_, AuthRelation>(
                    r#"
                    SELECT *
                    FROM auth_relations
                    WHERE ($1::text IS NULL OR subject_type = $1)
                      AND ($2::text IS NULL OR resource_type = $2)
                      AND ($3::text IS NULL OR relation = $3)
                    ORDER BY created_at DESC, id DESC
                    LIMIT $4 OFFSET $5
                    "#,
                )
                .bind(subject_type.as_deref())
                .bind(resource_type.as_deref())
                .bind(relation.as_deref())
                .bind(limit)
                .bind(offset)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let total: i64 = sqlx::query_scalar(
                    r#"
                    SELECT COUNT(*)
                    FROM auth_relations
                    WHERE ($1::text IS NULL OR subject_type = $1)
                      AND ($2::text IS NULL OR resource_type = $2)
                      AND ($3::text IS NULL OR relation = $3)
                    "#,
                )
                .bind(subject_type.as_deref())
                .bind(resource_type.as_deref())
                .bind(relation.as_deref())
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                Ok((rows, total))
            })
        })
        .await
    }

    pub async fn list_channel_policies(
        &self,
        tenant_id: Uuid,
        channel_id: Uuid,
    ) -> Result<Vec<ChannelAccessPolicy>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, ChannelAccessPolicy>(
                    "SELECT * FROM channel_access_policies WHERE channel_id = $1 ORDER BY priority DESC, created_at ASC",
                )
                .bind(channel_id)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        }).await
    }

    pub async fn get_user_role_tier(&self, tenant_id: Uuid, user_id: Uuid) -> Result<String> {
        let role_names = self.fetch_user_role_names(tenant_id, user_id).await?;
        Ok(derive_role_tier_from_names(&role_names))
    }

    pub async fn check(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        input: AuthzCheckInput,
    ) -> Result<AuthzDecision> {
        validate_resource_type(&input.resource_type)?;
        if input.permission.trim().is_empty() {
            return Err(Error::Validation("permission cannot be empty".to_string()));
        }

        let role_names = self.fetch_user_role_names(tenant_id, user_id).await?;
        let permissions = self.fetch_user_permissions(tenant_id, user_id).await?;
        let role_tier = derive_role_tier_from_names(&role_names);
        let mut decision_path = Vec::new();

        let resource_tenant = self
            .resolve_resource_tenant(tenant_id, &input.resource_type, input.resource_id)
            .await?;
        if resource_tenant != Some(tenant_id) {
            decision_path
                .push("tenant:deny:resource is not visible in current tenant context".to_string());
            decision_path.push("final:deny:deny by default".to_string());
            return Ok(AuthzDecision {
                allow: false,
                decision_path,
                role_tier,
                matched_relation_id: None,
                matched_policy_id: None,
                matched_relation: None,
                matched_subject: None,
                roles: role_names,
                permissions,
            });
        }

        decision_path.push(format!(
            "tenant:allow:resource resolved inside tenant {}",
            tenant_id
        ));

        let accepted = accepted_relations(&input.resource_type, &input.permission);
        let user_key = user_id.to_string();
        let resource_relations = self
            .get_relations_for_resource(tenant_id, &input.resource_type, input.resource_id)
            .await?;
        let tenant_relations = self
            .get_relations_for_resource(tenant_id, "tenant", tenant_id)
            .await?;

        if let Some((relation, subject)) = match_relation(
            resource_relations.iter().chain(tenant_relations.iter()),
            &accepted,
            &user_key,
            &role_names,
        ) {
            decision_path.push(format!(
                "relation:allow:matched {} for {}",
                relation.relation, subject
            ));
            decision_path.push("final:allow:granted by relationship tuple".to_string());
            return Ok(AuthzDecision {
                allow: true,
                decision_path,
                role_tier,
                matched_relation_id: Some(relation.id),
                matched_policy_id: None,
                matched_relation: Some(relation.relation.clone()),
                matched_subject: Some(subject),
                roles: role_names,
                permissions,
            });
        }

        decision_path.push(format!(
            "relation:skip:no matching relation found for {}",
            input.permission
        ));

        if permissions
            .iter()
            .any(|permission| permission == "*" || permission == &input.permission)
        {
            decision_path.push(format!(
                "role:allow:granted by role baseline for {}",
                input.permission
            ));
            decision_path.push("final:allow:granted by role baseline".to_string());
            return Ok(AuthzDecision {
                allow: true,
                decision_path,
                role_tier,
                matched_relation_id: None,
                matched_policy_id: None,
                matched_relation: None,
                matched_subject: None,
                roles: role_names,
                permissions,
            });
        }

        decision_path.push(format!(
            "role:deny:permission {} missing from role baseline",
            input.permission
        ));
        decision_path.push("final:deny:deny by default".to_string());
        Ok(AuthzDecision {
            allow: false,
            decision_path,
            role_tier,
            matched_relation_id: None,
            matched_policy_id: None,
            matched_relation: None,
            matched_subject: None,
            roles: role_names,
            permissions,
        })
    }

    async fn fetch_user_role_names(&self, tenant_id: Uuid, user_id: Uuid) -> Result<Vec<String>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_scalar::<_, String>(
                    r#"
                    SELECT r.name
                    FROM roles r
                    INNER JOIN user_roles ur ON r.id = ur.role_id AND r.tenant_id = ur.tenant_id
                    WHERE ur.tenant_id = $1 AND ur.user_id = $2
                    ORDER BY r.name ASC
                    "#,
                )
                .bind(tenant_id)
                .bind(user_id)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    async fn fetch_user_permissions(&self, tenant_id: Uuid, user_id: Uuid) -> Result<Vec<String>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let rows = sqlx::query_scalar::<_, Value>(
                    r#"
                    SELECT r.permissions
                    FROM roles r
                    INNER JOIN user_roles ur ON r.id = ur.role_id AND r.tenant_id = ur.tenant_id
                    WHERE ur.tenant_id = $1 AND ur.user_id = $2
                    "#,
                )
                .bind(tenant_id)
                .bind(user_id)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;

                let mut permissions = Vec::new();
                for row in rows {
                    if let Some(items) = row.as_array() {
                        for item in items {
                            if let Some(permission) = item.as_str() {
                                if !permissions.iter().any(|existing| existing == permission) {
                                    permissions.push(permission.to_string());
                                }
                            }
                        }
                    }
                }

                Ok(permissions)
            })
        })
        .await
    }

    async fn get_relations_for_resource(
        &self,
        tenant_id: Uuid,
        resource_type: &str,
        resource_id: Uuid,
    ) -> Result<Vec<AuthRelation>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query_as::<_, AuthRelation>(
                    r#"
                    SELECT * FROM auth_relations
                    WHERE resource_type = $1 AND resource_id = $2
                    ORDER BY created_at ASC
                    "#,
                )
                .bind(resource_type)
                .bind(resource_id)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }

    async fn resolve_resource_tenant(
        &self,
        tenant_id: Uuid,
        resource_type: &str,
        resource_id: Uuid,
    ) -> Result<Option<Uuid>> {
        if resource_type == "tenant" {
            return Ok((tenant_id == resource_id).then_some(tenant_id));
        }

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let query = match resource_type {
                    "article" => {
                        Some("SELECT tenant_id FROM articles WHERE id = $1 AND deleted_at IS NULL")
                    }
                    "source" => {
                        Some("SELECT tenant_id FROM sources WHERE id = $1 AND deleted_at IS NULL")
                    }
                    "report" => {
                        Some("SELECT tenant_id FROM reports WHERE id = $1 AND deleted_at IS NULL")
                    }
                    "feedback" => {
                        Some("SELECT tenant_id FROM feedbacks WHERE id = $1 AND deleted_at IS NULL")
                    }
                    "object" => {
                        Some("SELECT tenant_id FROM objects WHERE id = $1 AND deleted_at IS NULL")
                    }
                    "channel" => {
                        Some("SELECT tenant_id FROM channels WHERE id = $1 AND deleted_at IS NULL")
                    }
                    "banner" => {
                        Some("SELECT tenant_id FROM banners WHERE id = $1 AND deleted_at IS NULL")
                    }
                    _ => None,
                }
                .ok_or_else(|| {
                    Error::Validation(format!("unsupported resource_type: {}", resource_type))
                })?;

                sqlx::query_scalar::<_, Uuid>(query)
                    .bind(resource_id)
                    .fetch_optional(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))
            })
        })
        .await
    }
}

fn match_relation<'a>(
    mut relations: impl Iterator<Item = &'a AuthRelation>,
    accepted_relations: &[&str],
    user_key: &str,
    role_names: &[String],
) -> Option<(&'a AuthRelation, String)> {
    relations.find_map(|relation| {
        if !accepted_relations.contains(&relation.relation.as_str()) {
            return None;
        }
        match relation.subject_type.as_str() {
            "user" if relation.subject_key == user_key => {
                Some((relation, format!("user:{}", relation.subject_key)))
            }
            "role" if role_names.iter().any(|role| role == &relation.subject_key) => {
                Some((relation, format!("role:{}", relation.subject_key)))
            }
            _ => None,
        }
    })
}

fn accepted_relations<'a>(resource_type: &str, permission: &str) -> Vec<&'a str> {
    match (resource_type, permission) {
        (_, "*") => vec!["owner", "admin", "manager", "editor"],
        ("tenant", "tenants:manage") => vec!["owner", "admin"],
        ("source", "sources:write") => vec!["manager", "owner", "editor"],
        ("source", "sources:read") => vec!["viewer", "manager", "owner"],
        ("article", "articles:write") => vec!["editor", "owner"],
        ("article", "articles:publish") => vec!["editor", "owner", "approver"],
        ("article", "articles:read") => vec!["viewer", "reader", "owner"],
        ("report", "reports:write") => vec!["editor", "owner", "approver"],
        ("report", "reports:read") => vec!["viewer", "approver", "owner"],
        ("feedback", "feedbacks:read") => vec!["resolver", "owner"],
        ("feedback", "feedbacks:write") => vec!["resolver", "owner"],
        ("object", "objects:read") => vec!["viewer", "owner"],
        ("channel", _) => vec!["viewer", "editor", "manager", "owner"],
        _ => vec!["owner", "admin", "manager", "editor", "viewer"],
    }
}

fn validate_resource_type(value: &str) -> Result<()> {
    let allowed = [
        "tenant", "channel", "article", "source", "report", "feedback", "object", "banner",
    ];
    if allowed.contains(&value) {
        Ok(())
    } else {
        Err(Error::Validation(format!(
            "unsupported resource_type: {}",
            value
        )))
    }
}

fn validate_subject_type(value: &str) -> Result<()> {
    if matches!(value, "user" | "role") {
        Ok(())
    } else {
        Err(Error::Validation(format!(
            "unsupported subject_type: {}",
            value
        )))
    }
}

fn validate_subject_key(subject_type: &str, subject_key: &str) -> Result<()> {
    if subject_key.trim().is_empty() {
        return Err(Error::Validation("subject_key cannot be empty".to_string()));
    }
    if subject_type == "user" {
        Uuid::parse_str(subject_key).map(|_| ()).map_err(|_| {
            Error::Validation("subject_key must be a UUID when subject_type=user".to_string())
        })
    } else {
        Ok(())
    }
}

fn validate_relation_name(value: &str) -> Result<()> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(Error::Validation("relation cannot be empty".to_string()));
    }
    if trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-' | ':'))
    {
        Ok(())
    } else {
        Err(Error::Validation(
            "relation contains unsupported characters".to_string(),
        ))
    }
}

pub fn derive_role_tier_from_names(role_names: &[String]) -> String {
    if role_names.iter().any(|role| role == ROLE_TIER_SUPER_ADMIN) {
        return ROLE_TIER_SUPER_ADMIN.to_string();
    }
    if role_names
        .iter()
        .any(|role| role == ROLE_TIER_TENANT_ADMIN || role == "admin")
    {
        return ROLE_TIER_TENANT_ADMIN.to_string();
    }
    if role_names.iter().any(|role| role == ROLE_TIER_PREMIUM_USER) {
        return ROLE_TIER_PREMIUM_USER.to_string();
    }
    if role_names
        .iter()
        .any(|role| role == ROLE_TIER_VERIFIED_USER || role == "editor")
    {
        return ROLE_TIER_VERIFIED_USER.to_string();
    }
    ROLE_TIER_BASIC_USER.to_string()
}
