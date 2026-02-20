use crate::with_tenant_tx;
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use law_eye_common::{Error, Result};
use law_eye_db::{CreateUser, Role, UpdateUser, User};
use sqlx::{Executor, PgPool, Postgres, Transaction};
use uuid::Uuid;

pub struct UserService {
    pool: PgPool,
}

async fn fetch_user_roles<'e, E>(executor: E, tenant_id: Uuid, user_id: Uuid) -> Result<Vec<Role>>
where
    E: Executor<'e, Database = Postgres>,
{
    let roles = sqlx::query_as::<_, Role>(
        r#"
        SELECT r.* FROM roles r
        INNER JOIN user_roles ur ON r.id = ur.role_id AND r.tenant_id = ur.tenant_id
        INNER JOIN users u ON u.id = ur.user_id
        WHERE ur.tenant_id = $1
          AND ur.user_id = $2
          AND u.tenant_id = $1
        "#,
    )
    .bind(tenant_id)
    .bind(user_id)
    .fetch_all(executor)
    .await
    .map_err(|e| Error::Database(e.to_string()))?;

    Ok(roles)
}

async fn assign_role_inner<'e, E>(
    executor: E,
    user_id: Uuid,
    role_name: &str,
    granted_by: Option<Uuid>,
) -> Result<()>
where
    E: Executor<'e, Database = Postgres>,
{
    let result = sqlx::query(
        r#"
        INSERT INTO user_roles (tenant_id, user_id, role_id, granted_by)
        SELECT u.tenant_id, u.id, r.id, $3
        FROM users u
        INNER JOIN roles r ON r.tenant_id = u.tenant_id
        WHERE u.id = $1 AND r.name = $2
        ON CONFLICT DO NOTHING
        "#,
    )
    .bind(user_id)
    .bind(role_name)
    .bind(granted_by)
    .execute(executor)
    .await
    .map_err(|e| Error::Database(e.to_string()))?;

    if result.rows_affected() == 0 {
        return Err(Error::Validation(format!(
            "Role '{}' does not exist for user {} tenant",
            role_name, user_id
        )));
    }

    Ok(())
}

async fn remove_role_inner<'e, E>(executor: E, user_id: Uuid, role_name: &str) -> Result<()>
where
    E: Executor<'e, Database = Postgres>,
{
    sqlx::query(
        r#"
        DELETE FROM user_roles ur
        USING users u, roles r
        WHERE ur.user_id = u.id
          AND ur.role_id = r.id
          AND ur.tenant_id = u.tenant_id
          AND ur.tenant_id = r.tenant_id
          AND ur.user_id = $1
          AND r.name = $2
        "#,
    )
    .bind(user_id)
    .bind(role_name)
    .execute(executor)
    .await
    .map_err(|e| Error::Database(e.to_string()))?;

    Ok(())
}

async fn validate_roles_exist_inner<'e, E>(executor: E, role_names: &[String]) -> Result<()>
where
    E: Executor<'e, Database = Postgres>,
{
    use std::collections::BTreeSet;

    if role_names.is_empty() {
        return Ok(());
    }

    let unique: Vec<String> = BTreeSet::<String>::from_iter(role_names.iter().cloned())
        .into_iter()
        .collect();

    let existing: Vec<String> =
        sqlx::query_scalar::<_, String>("SELECT DISTINCT name FROM roles WHERE name = ANY($1)")
            .bind(&unique)
            .fetch_all(executor)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

    let existing_set: BTreeSet<String> = existing.into_iter().collect();
    let missing: Vec<String> = unique
        .into_iter()
        .filter(|name| !existing_set.contains(name))
        .collect();

    if missing.is_empty() {
        Ok(())
    } else {
        Err(Error::Validation(format!(
            "Unknown role(s): {}",
            missing.join(", ")
        )))
    }
}

async fn validate_roles_exist_for_tenant_inner<'e, E>(
    executor: E,
    tenant_id: Uuid,
    role_names: &[String],
) -> Result<()>
where
    E: Executor<'e, Database = Postgres>,
{
    use std::collections::BTreeSet;

    if role_names.is_empty() {
        return Ok(());
    }

    let unique: Vec<String> = BTreeSet::<String>::from_iter(role_names.iter().cloned())
        .into_iter()
        .collect();

    let existing: Vec<String> = sqlx::query_scalar::<_, String>(
        "SELECT name FROM roles WHERE tenant_id = $1 AND name = ANY($2)",
    )
    .bind(tenant_id)
    .bind(&unique)
    .fetch_all(executor)
    .await
    .map_err(|e| Error::Database(e.to_string()))?;

    let existing_set: BTreeSet<String> = existing.into_iter().collect();
    let missing: Vec<String> = unique
        .into_iter()
        .filter(|name| !existing_set.contains(name))
        .collect();

    if missing.is_empty() {
        Ok(())
    } else {
        Err(Error::Validation(format!(
            "Unknown role(s): {}",
            missing.join(", ")
        )))
    }
}

impl UserService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn create(&self, input: CreateUser) -> Result<User> {
        let password_hash = hash_password(&input.password)?;
        let tenant_id = input.tenant_id;

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let user = sqlx::query_as::<_, User>(
                    r#"
                    INSERT INTO users (tenant_id, email, password_hash, display_name)
                    VALUES ($1, $2, $3, $4)
                    RETURNING *
                    "#,
                )
                .bind(tenant_id)
                .bind(&input.email)
                .bind(&password_hash)
                .bind(&input.display_name)
                .fetch_one(tx.as_mut())
                .await
                .map_err(|e| {
                    if e.to_string().contains("duplicate key") {
                        Error::Validation("Email already exists".to_string())
                    } else {
                        Error::Database(e.to_string())
                    }
                })?;
                Ok(user)
            })
        })
        .await
    }

    pub async fn get_by_id(&self, id: Uuid) -> Result<User> {
        sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?
            .ok_or_else(|| Error::NotFound(format!("User {} not found", id)))
    }

    pub async fn get_by_email(&self, email: &str) -> Result<User> {
        sqlx::query_as::<_, User>("SELECT * FROM users WHERE email = $1")
            .bind(email)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?
            .ok_or_else(|| Error::NotFound("User not found".to_string()))
    }

    pub async fn verify_password(&self, email: &str, password: &str) -> Result<User> {
        let user = self.get_by_email(email).await?;

        if !verify_password(password, &user.password_hash)? {
            return Err(Error::Unauthorized("Invalid password".to_string()));
        }

        if !user.is_active {
            return Err(Error::Unauthorized("User is deactivated".to_string()));
        }

        // Update last login with proper tenant context
        let user_id = user.id;
        let tenant_id = user.tenant_id;
        let _ = with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query("UPDATE users SET last_login = NOW() WHERE id = $1")
                    .bind(user_id)
                    .execute(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;
                Ok(())
            })
        })
        .await;

        Ok(user)
    }

    pub async fn update(&self, tenant_id: Uuid, id: Uuid, input: UpdateUser) -> Result<User> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let user = sqlx::query_as::<_, User>(
                    r#"
                    UPDATE users SET
                        display_name = COALESCE($2, display_name),
                        avatar_url = COALESCE($3, avatar_url),
                        preferences = COALESCE($4, preferences),
                        updated_at = NOW()
                    WHERE id = $1
                    RETURNING *
                    "#,
                )
                .bind(id)
                .bind(&input.display_name)
                .bind(&input.avatar_url)
                .bind(&input.preferences)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
                .ok_or_else(|| Error::NotFound(format!("User {} not found", id)))?;
                Ok(user)
            })
        })
        .await
    }

    pub async fn update_with_version(
        &self,
        tenant_id: Uuid,
        id: Uuid,
        expected_version: i64,
        input: UpdateUser,
    ) -> Result<User> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let user = sqlx::query_as::<_, User>(
                    r#"
                    UPDATE users SET
                        display_name = COALESCE($4, display_name),
                        avatar_url = COALESCE($5, avatar_url),
                        preferences = COALESCE($6, preferences),
                        updated_at = NOW()
                    WHERE id = $1 AND tenant_id = $2 AND version = $3
                    RETURNING *
                    "#,
                )
                .bind(id)
                .bind(tenant_id)
                .bind(expected_version)
                .bind(&input.display_name)
                .bind(&input.avatar_url)
                .bind(&input.preferences)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?
                .ok_or_else(|| Error::Conflict("User version conflict".to_string()))?;
                Ok(user)
            })
        })
        .await
    }

    pub async fn touch_with_version_tx(
        &self,
        tenant_id: Uuid,
        tx: &mut Transaction<'_, Postgres>,
        id: Uuid,
        expected_version: i64,
    ) -> Result<User> {
        let user = sqlx::query_as::<_, User>(
            r#"
            UPDATE users
            SET updated_at = NOW()
            WHERE id = $1 AND tenant_id = $2 AND version = $3
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(tenant_id)
        .bind(expected_version)
        .fetch_optional(tx.as_mut())
        .await
        .map_err(|e| Error::Database(e.to_string()))?
        .ok_or_else(|| Error::Conflict("User version conflict".to_string()))?;

        Ok(user)
    }

    pub async fn update_password(
        &self,
        tenant_id: Uuid,
        id: Uuid,
        new_password: &str,
    ) -> Result<()> {
        let password_hash = hash_password(new_password)?;
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query(
                    "UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1",
                )
                .bind(id)
                .bind(&password_hash)
                .execute(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;
                Ok(())
            })
        })
        .await
    }

    pub async fn deactivate(&self, tenant_id: Uuid, id: Uuid) -> Result<()> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                sqlx::query("UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1")
                    .bind(id)
                    .execute(tx.as_mut())
                    .await
                    .map_err(|e| Error::Database(e.to_string()))?;
                Ok(())
            })
        })
        .await
    }

    pub async fn get_user_roles(&self, tenant_id: Uuid, user_id: Uuid) -> Result<Vec<Role>> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move { fetch_user_roles(tx.as_mut(), tenant_id, user_id).await })
        })
        .await
    }

    pub async fn get_user_roles_tx(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        tenant_id: Uuid,
        user_id: Uuid,
    ) -> Result<Vec<Role>> {
        fetch_user_roles(&mut **tx, tenant_id, user_id).await
    }

    pub async fn get_user_permissions(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
    ) -> Result<Vec<String>> {
        let roles = self.get_user_roles(tenant_id, user_id).await?;

        let mut permissions = Vec::new();
        for role in roles {
            if let Some(perms) = role.permissions.as_array() {
                for perm in perms {
                    if let Some(p) = perm.as_str() {
                        if !permissions.contains(&p.to_string()) {
                            permissions.push(p.to_string());
                        }
                    }
                }
            }
        }

        Ok(permissions)
    }

    pub async fn has_permission(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        permission: &str,
    ) -> Result<bool> {
        let permissions = self.get_user_permissions(tenant_id, user_id).await?;

        // Check for wildcard permission
        if permissions.contains(&"*".to_string()) {
            return Ok(true);
        }

        Ok(permissions.contains(&permission.to_string()))
    }

    pub async fn assign_role(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        role_name: &str,
        granted_by: Option<Uuid>,
    ) -> Result<()> {
        let role_name = role_name.to_string();
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                assign_role_inner(tx.as_mut(), user_id, &role_name, granted_by).await
            })
        })
        .await
    }

    pub async fn assign_role_tx(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        user_id: Uuid,
        role_name: &str,
        granted_by: Option<Uuid>,
    ) -> Result<()> {
        assign_role_inner(&mut **tx, user_id, role_name, granted_by).await
    }

    pub async fn remove_role(&self, tenant_id: Uuid, user_id: Uuid, role_name: &str) -> Result<()> {
        let role_name = role_name.to_string();
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move { remove_role_inner(tx.as_mut(), user_id, &role_name).await })
        })
        .await
    }

    pub async fn remove_role_tx(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        user_id: Uuid,
        role_name: &str,
    ) -> Result<()> {
        remove_role_inner(&mut **tx, user_id, role_name).await
    }

    pub async fn validate_roles_exist(&self, tenant_id: Uuid, role_names: &[String]) -> Result<()> {
        let role_names = role_names.to_vec();
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move { validate_roles_exist_inner(tx.as_mut(), &role_names).await })
        })
        .await
    }

    pub async fn validate_roles_exist_tx(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        role_names: &[String],
    ) -> Result<()> {
        validate_roles_exist_inner(&mut **tx, role_names).await
    }

    pub async fn validate_roles_exist_for_tenant(
        &self,
        tenant_id: Uuid,
        role_names: &[String],
    ) -> Result<()> {
        let role_names = role_names.to_vec();
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                validate_roles_exist_for_tenant_inner(tx.as_mut(), tenant_id, &role_names).await
            })
        })
        .await
    }

    pub async fn validate_roles_exist_for_tenant_tx(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        tenant_id: Uuid,
        role_names: &[String],
    ) -> Result<()> {
        validate_roles_exist_for_tenant_inner(&mut **tx, tenant_id, role_names).await
    }

    /// List users across ALL tenants (no tenant isolation).
    ///
    /// # Safety
    /// This is a **superadmin-only** method. It must NEVER be exposed through
    /// tenant-scoped API routes. Use [`list_by_tenant`] for tenant-scoped queries.
    pub async fn list(&self, limit: i64, offset: i64) -> Result<Vec<User>> {
        let users = sqlx::query_as::<_, User>(
            "SELECT * FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2",
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(users)
    }

    /// Count users across ALL tenants (no tenant isolation).
    ///
    /// # Safety
    /// This is a **superadmin-only** method. It must NEVER be exposed through
    /// tenant-scoped API routes. Use [`count_by_tenant`] for tenant-scoped queries.
    pub async fn count(&self) -> Result<i64> {
        let result: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
            .fetch_one(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        Ok(result.0)
    }

    pub async fn count_by_tenant(&self, tenant_id: Uuid) -> Result<i64> {
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let result: (i64,) =
                    sqlx::query_as("SELECT COUNT(*) FROM users WHERE tenant_id = $1")
                        .bind(tenant_id)
                        .fetch_one(tx.as_mut())
                        .await
                        .map_err(|e| Error::Database(e.to_string()))?;
                Ok(result.0)
            })
        })
        .await
    }

    pub async fn list_by_tenant(
        &self,
        tenant_id: Uuid,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<User>> {
        if limit < 1 {
            return Err(Error::Validation("limit must be >= 1".to_string()));
        }
        if offset < 0 {
            return Err(Error::Validation("offset must be >= 0".to_string()));
        }
        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let users = sqlx::query_as::<_, User>(
                    "SELECT * FROM users WHERE tenant_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3",
                )
                .bind(tenant_id)
                .bind(limit)
                .bind(offset)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;
                Ok(users)
            })
        })
        .await
    }

    pub async fn list_by_tenant_cursor(
        &self,
        tenant_id: Uuid,
        limit: i64,
        cursor_created_at: chrono::DateTime<chrono::Utc>,
        cursor_id: Uuid,
    ) -> Result<Vec<User>> {
        if limit < 1 {
            return Err(Error::Validation("limit must be >= 1".to_string()));
        }

        with_tenant_tx(&self.pool, tenant_id, |tx| {
            Box::pin(async move {
                let users = sqlx::query_as::<_, User>(
                    "SELECT * FROM users WHERE tenant_id = $1 AND (created_at, id) < ($2, $3) ORDER BY created_at DESC, id DESC LIMIT $4",
                )
                .bind(tenant_id)
                .bind(cursor_created_at)
                .bind(cursor_id)
                .bind(limit)
                .fetch_all(tx.as_mut())
                .await
                .map_err(|e| Error::Database(e.to_string()))?;
                Ok(users)
            })
        })
        .await
    }
}

fn hash_password(password: &str) -> Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| Error::Internal(format!("Failed to hash password: {}", e)))?
        .to_string();
    Ok(password_hash)
}

fn verify_password(password: &str, hash: &str) -> Result<bool> {
    let parsed_hash = PasswordHash::new(hash)
        .map_err(|e| Error::Internal(format!("Invalid password hash: {}", e)))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}
