# Phase 3: 完整 CMS 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 完善管理后台，开放用户系统，实现完整的内容管理功能

**Architecture:** 基于 Phase 1/2 的后端基础，添加用户认证、RBAC 权限、审计日志和前端管理界面

**Tech Stack:** Rust (axum-login, argon2, casbin-rs) + Next.js 15 (shadcn/ui)

---

## Task 1: 添加用户认证依赖

**Files:**
- Modify: `Cargo.toml` (workspace)
- Modify: `crates/law-eye-api/Cargo.toml`
- Modify: `crates/law-eye-db/Cargo.toml`

**Step 1: 添加 workspace 依赖**

在根 `Cargo.toml` 的 `[workspace.dependencies]` 添加：

```toml
argon2 = "0.5"
axum-login = "0.15"
tower-sessions = "0.12"
tower-sessions-redis-store = "0.12"
async-trait = "0.1"
```

**Step 2: 更新 law-eye-api 依赖**

在 `crates/law-eye-api/Cargo.toml` 添加：

```toml
argon2.workspace = true
axum-login.workspace = true
tower-sessions.workspace = true
tower-sessions-redis-store.workspace = true
async-trait.workspace = true
```

**Step 3: 更新 law-eye-db 依赖**

在 `crates/law-eye-db/Cargo.toml` 添加：

```toml
argon2.workspace = true
```

**Step 4: 验证编译**

Run: `cargo check --workspace`
Expected: 成功

---

## Task 2: 创建用户相关数据库表

**Files:**
- Create: `crates/law-eye-db/migrations/003_users.sql`
- Modify: `crates/law-eye-db/src/models.rs`
- Modify: `crates/law-eye-db/src/lib.rs`

**Step 1: 创建迁移文件**

```sql
-- 003_users.sql
-- 用户表
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    preferences JSONB DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 角色表
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    permissions JSONB NOT NULL DEFAULT '[]',
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 用户角色关联表
CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    granted_by UUID REFERENCES users(id),
    PRIMARY KEY (user_id, role_id)
);

-- 审计日志表
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    action TEXT NOT NULL,
    resource TEXT NOT NULL,
    resource_id UUID,
    old_value JSONB,
    new_value JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 会话表 (用于 tower-sessions)
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    data BYTEA NOT NULL,
    expiry_date TIMESTAMPTZ NOT NULL
);

-- 索引
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_resource ON audit_logs(resource, resource_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX idx_sessions_expiry ON sessions(expiry_date);

-- 预设角色
INSERT INTO roles (name, permissions, description) VALUES
('admin', '["*"]', '系统管理员，拥有所有权限'),
('editor', '["articles:read", "articles:write", "articles:publish", "sources:read"]', '编辑，可以管理文章'),
('viewer', '["articles:read", "sources:read", "categories:read"]', '只读用户');
```

**Step 2: 添加 User 模型到 models.rs**

```rust
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub password_hash: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub preferences: serde_json::Value,
    pub is_active: bool,
    pub last_login: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateUser {
    pub email: String,
    pub password: String,
    pub display_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Role {
    pub id: Uuid,
    pub name: String,
    pub permissions: serde_json::Value,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AuditLog {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    pub action: String,
    pub resource: String,
    pub resource_id: Option<Uuid>,
    pub old_value: Option<serde_json::Value>,
    pub new_value: Option<serde_json::Value>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub created_at: DateTime<Utc>,
}
```

**Step 3: 验证编译**

Run: `cargo check --package law-eye-db`
Expected: 成功

---

## Task 3: 实现用户服务层

**Files:**
- Create: `crates/law-eye-core/src/user.rs`
- Modify: `crates/law-eye-core/src/lib.rs`
- Modify: `crates/law-eye-core/Cargo.toml`

**Step 1: 添加依赖到 law-eye-core**

```toml
argon2.workspace = true
```

**Step 2: 创建 user.rs**

```rust
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use law_eye_common::{Error, Result};
use law_eye_db::{CreateUser, Role, User};
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
        .map_err(|e| Error::Internal(e.to_string()))?;

        Ok(user)
    }

    pub async fn get_by_id(&self, id: Uuid) -> Result<User> {
        sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
            .bind(id)
            .fetch_one(&self.pool)
            .await
            .map_err(|e| Error::NotFound(format!("User not found: {}", e)))
    }

    pub async fn get_by_email(&self, email: &str) -> Result<User> {
        sqlx::query_as::<_, User>("SELECT * FROM users WHERE email = $1")
            .bind(email)
            .fetch_one(&self.pool)
            .await
            .map_err(|e| Error::NotFound(format!("User not found: {}", e)))
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
        .map_err(|e| Error::Internal(e.to_string()))?;

        Ok(roles)
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
        .map_err(|e| Error::Internal(e.to_string()))?;

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
        .map_err(|e| Error::Internal(e.to_string()))?;

        Ok(users)
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
```

**Step 3: 更新 lib.rs 导出**

```rust
pub mod user;
pub use user::UserService;
```

**Step 4: 验证编译**

Run: `cargo check --package law-eye-core`
Expected: 成功

---

## Task 4: 实现认证中间件

**Files:**
- Create: `crates/law-eye-api/src/auth.rs`
- Modify: `crates/law-eye-api/src/state.rs`
- Modify: `crates/law-eye-api/src/main.rs`

**Step 1: 创建 auth.rs**

实现基于 Session 的认证中间件，使用 Redis 存储会话。

**Step 2: 更新 AppState 添加 UserService**

**Step 3: 更新 main.rs 配置 Session 中间件**

**Step 4: 验证编译**

Run: `cargo check --package law-eye-api`
Expected: 成功

---

## Task 5: 实现认证 API 端点

**Files:**
- Create: `crates/law-eye-api/src/routes/auth.rs`
- Modify: `crates/law-eye-api/src/routes/mod.rs`

**Step 1: 创建 auth.rs**

实现以下端点：
- `POST /api/v1/auth/register` - 用户注册
- `POST /api/v1/auth/login` - 用户登录
- `POST /api/v1/auth/logout` - 用户登出
- `GET /api/v1/auth/me` - 获取当前用户

**Step 2: 更新 routes/mod.rs 注册认证路由**

**Step 3: 验证编译**

Run: `cargo check --package law-eye-api`
Expected: 成功

---

## Task 6: 实现审计日志服务

**Files:**
- Create: `crates/law-eye-core/src/audit.rs`
- Modify: `crates/law-eye-core/src/lib.rs`

**Step 1: 创建 audit.rs**

```rust
pub struct AuditService {
    pool: PgPool,
}

impl AuditService {
    pub async fn log(&self, input: CreateAuditLog) -> Result<()>;
    pub async fn list(&self, filters: AuditFilters) -> Result<Vec<AuditLog>>;
}
```

**Step 2: 更新 lib.rs 导出**

**Step 3: 验证编译**

Run: `cargo check --package law-eye-core`
Expected: 成功

---

## Task 7: 实现权限检查中间件

**Files:**
- Modify: `crates/law-eye-api/src/auth.rs`

**Step 1: 添加权限检查函数**

```rust
pub fn require_permission(permission: &str) -> impl Fn(...) -> ...
```

**Step 2: 为受保护的路由添加权限检查**

**Step 3: 验证编译**

Run: `cargo check --package law-eye-api`
Expected: 成功

---

## Task 8: 实现用户管理 API 端点

**Files:**
- Create: `crates/law-eye-api/src/routes/users.rs`
- Modify: `crates/law-eye-api/src/routes/mod.rs`

**Step 1: 创建 users.rs**

实现以下端点：
- `GET /api/v1/users` - 获取用户列表 (需要 admin 权限)
- `GET /api/v1/users/:id` - 获取用户详情
- `PATCH /api/v1/users/:id` - 更新用户信息
- `PATCH /api/v1/users/:id/roles` - 分配角色

**Step 2: 更新 routes/mod.rs 注册用户路由**

**Step 3: 验证编译和测试**

Run: `cargo test --package law-eye-api`
Expected: 成功

---

## Task 9: 完整构建和验证

**Files:**
- None (verification only)

**Step 1: 完整编译**

Run: `cargo build --workspace`
Expected: 成功

**Step 2: 运行所有测试**

Run: `cargo test --workspace`
Expected: 所有测试通过

**Step 3: 检查无警告编译**

Run: `cargo clippy --workspace`
Expected: 无错误

---

## 验证清单

- [ ] 用户可以注册新账号
- [ ] 用户可以登录/登出
- [ ] Session 正确存储在 Redis
- [ ] 密码使用 Argon2 安全哈希
- [ ] 权限检查正常工作
- [ ] 审计日志正确记录
- [ ] 所有测试通过
- [ ] 编译无警告

---

**文档版本**: 1.0.0
**状态**: 待执行
