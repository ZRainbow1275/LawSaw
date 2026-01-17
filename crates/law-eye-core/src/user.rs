use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use law_eye_common::{Error, Result};
use law_eye_db::{CreateUser, Role, UpdateUser, User};
use sqlx::PgPool;
use uuid::Uuid;

pub struct UserService {
    pool: PgPool,
}

impl UserService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn create(&self, input: CreateUser) -> Result<User> {
        let password_hash = hash_password(&input.password)?;

        let user = sqlx::query_as::<_, User>(
            r#"
            INSERT INTO users (email, password_hash, display_name)
            VALUES ($1, $2, $3)
            RETURNING *
            "#,
        )
        .bind(&input.email)
        .bind(&password_hash)
        .bind(&input.display_name)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| {
            if e.to_string().contains("duplicate key") {
                Error::Validation("Email already exists".to_string())
            } else {
                Error::Database(e.to_string())
            }
        })?;

        Ok(user)
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

        // Update last login
        sqlx::query("UPDATE users SET last_login = NOW() WHERE id = $1")
            .bind(user.id)
            .execute(&self.pool)
            .await
            .ok();

        Ok(user)
    }

    pub async fn update(&self, id: Uuid, input: UpdateUser) -> Result<User> {
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
        .fetch_one(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(user)
    }

    pub async fn update_password(&self, id: Uuid, new_password: &str) -> Result<()> {
        let password_hash = hash_password(new_password)?;

        sqlx::query("UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1")
            .bind(id)
            .bind(&password_hash)
            .execute(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        Ok(())
    }

    pub async fn deactivate(&self, id: Uuid) -> Result<()> {
        sqlx::query("UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        Ok(())
    }

    pub async fn get_user_roles(&self, user_id: Uuid) -> Result<Vec<Role>> {
        let roles = sqlx::query_as::<_, Role>(
            r#"
            SELECT r.* FROM roles r
            INNER JOIN user_roles ur ON r.id = ur.role_id
            WHERE ur.user_id = $1
            "#,
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(roles)
    }

    pub async fn get_user_permissions(&self, user_id: Uuid) -> Result<Vec<String>> {
        let roles = self.get_user_roles(user_id).await?;

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

    pub async fn has_permission(&self, user_id: Uuid, permission: &str) -> Result<bool> {
        let permissions = self.get_user_permissions(user_id).await?;

        // Check for wildcard permission
        if permissions.contains(&"*".to_string()) {
            return Ok(true);
        }

        Ok(permissions.contains(&permission.to_string()))
    }

    pub async fn assign_role(&self, user_id: Uuid, role_name: &str, granted_by: Option<Uuid>) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO user_roles (user_id, role_id, granted_by)
            SELECT $1, id, $3 FROM roles WHERE name = $2
            ON CONFLICT DO NOTHING
            "#,
        )
        .bind(user_id)
        .bind(role_name)
        .bind(granted_by)
        .execute(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(())
    }

    pub async fn remove_role(&self, user_id: Uuid, role_name: &str) -> Result<()> {
        sqlx::query(
            r#"
            DELETE FROM user_roles
            WHERE user_id = $1 AND role_id = (SELECT id FROM roles WHERE name = $2)
            "#,
        )
        .bind(user_id)
        .bind(role_name)
        .execute(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(())
    }

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

    pub async fn count(&self) -> Result<i64> {
        let result: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
            .fetch_one(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        Ok(result.0)
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
