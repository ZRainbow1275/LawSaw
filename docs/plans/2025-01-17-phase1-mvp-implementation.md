# Phase 1: MVP 基础设施实施计划

> **维护状态（2026-02-08）**
> - 本文档属于 2025-01 的历史规划归档，主要用于追溯早期决策背景。
> - 当前系统交付状态请以 `prompt/audit-report.md`（v2.6 修复清单）与 `prompts/audit/2.6audit.md`（审计基线）为准。
> - 研发规范请参考 `.trellis/spec/`（`backend/`、`frontend/`、`guides/`）。
> - 若本文内容与现行代码冲突，请以代码与上述“真相源”文档为准。


> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 跑通采集→存储→推送核心闭环，实现可运行的 MVP 系统

**Architecture:** Rust 后端 (Axum + SQLx) + PostgreSQL + Redis + n8n 工作流 + Next.js 前端

**Tech Stack:** Rust 1.75+, Axum 0.7, SQLx 0.8, PostgreSQL 16, Redis 7, Next.js 15, TypeScript, pnpm

---

## Task 1: 项目根目录初始化

**Files:**
- Create: `D:/Desktop/LawSaw/Cargo.toml`
- Create: `D:/Desktop/LawSaw/.gitignore`
- Create: `D:/Desktop/LawSaw/rust-toolchain.toml`

**Step 1: 创建 Rust workspace Cargo.toml**

```toml
[workspace]
resolver = "2"
members = [
    "crates/law-eye-api",
    "crates/law-eye-worker",
    "crates/law-eye-core",
    "crates/law-eye-crawler",
    "crates/law-eye-db",
    "crates/law-eye-queue",
    "crates/law-eye-common",
]

[workspace.package]
version = "0.1.0"
edition = "2021"
license = "MIT"
repository = "https://github.com/user/law-eye"

[workspace.dependencies]
# Async runtime
tokio = { version = "1.43", features = ["full"] }

# Web framework
axum = { version = "0.7", features = ["macros"] }
tower = "0.5"
tower-http = { version = "0.6", features = ["cors", "trace", "compression-gzip"] }

# Database
sqlx = { version = "0.8", features = ["runtime-tokio", "postgres", "uuid", "chrono", "json"] }
deadpool-redis = "0.18"
redis = { version = "0.27", features = ["tokio-comp"] }

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# HTTP client
reqwest = { version = "0.12", features = ["json", "cookies"] }

# HTML/RSS parsing
scraper = "0.21"
feed-rs = "2.1"

# Error handling
thiserror = "2.0"
anyhow = "1.0"

# Logging
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json"] }

# Config
config = "0.14"
dotenvy = "0.15"

# Utils
uuid = { version = "1.11", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
url = "2.5"

# OpenAPI
utoipa = { version = "5", features = ["axum_extras", "chrono", "uuid"] }
utoipa-swagger-ui = { version = "8", features = ["axum"] }

[profile.release]
lto = true
codegen-units = 1
panic = "abort"
```

**Step 2: 创建 .gitignore**

```gitignore
# Rust
/target/
Cargo.lock

# Environment
.env
.env.local
.env.*.local

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Node
node_modules/
.next/
.turbo/
dist/

# Logs
*.log
logs/

# Database
*.db
*.sqlite

# Temp
tmp/
temp/
*.tmp
tmpclaude-*
```

**Step 3: 创建 rust-toolchain.toml**

```toml
[toolchain]
channel = "stable"
components = ["rustfmt", "clippy"]
```

**Step 4: 验证 Rust 环境**

Run: `rustc --version && cargo --version`
Expected: Rust 版本 >= 1.75

**Step 5: 初始化 Git 仓库**

Run: `cd D:/Desktop/LawSaw && git init`
Expected: Initialized empty Git repository

---

## Task 2: 创建 law-eye-common crate

**Files:**
- Create: `D:/Desktop/LawSaw/crates/law-eye-common/Cargo.toml`
- Create: `D:/Desktop/LawSaw/crates/law-eye-common/src/lib.rs`
- Create: `D:/Desktop/LawSaw/crates/law-eye-common/src/error.rs`
- Create: `D:/Desktop/LawSaw/crates/law-eye-common/src/config.rs`

**Step 1: 创建 Cargo.toml**

```toml
[package]
name = "law-eye-common"
version.workspace = true
edition.workspace = true

[dependencies]
thiserror.workspace = true
anyhow.workspace = true
serde.workspace = true
serde_json.workspace = true
config.workspace = true
dotenvy.workspace = true
tracing.workspace = true
```

**Step 2: 创建 src/lib.rs**

```rust
pub mod config;
pub mod error;

pub use config::AppConfig;
pub use error::{Error, Result};
```

**Step 3: 创建 src/error.rs**

```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum Error {
    #[error("Database error: {0}")]
    Database(String),

    #[error("Configuration error: {0}")]
    Config(String),

    #[error("HTTP error: {0}")]
    Http(String),

    #[error("Parse error: {0}")]
    Parse(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

pub type Result<T> = std::result::Result<T, Error>;

impl From<config::ConfigError> for Error {
    fn from(err: config::ConfigError) -> Self {
        Error::Config(err.to_string())
    }
}
```

**Step 4: 创建 src/config.rs**

```rust
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct AppConfig {
    pub server: ServerConfig,
    pub database: DatabaseConfig,
    pub redis: RedisConfig,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DatabaseConfig {
    pub url: String,
    pub max_connections: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RedisConfig {
    pub url: String,
}

impl AppConfig {
    pub fn load() -> crate::Result<Self> {
        dotenvy::dotenv().ok();

        let config = config::Config::builder()
            .add_source(config::File::with_name("config/default").required(false))
            .add_source(config::Environment::with_prefix("LAW_EYE").separator("__"))
            .build()?;

        config.try_deserialize().map_err(Into::into)
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            server: ServerConfig {
                host: "0.0.0.0".to_string(),
                port: 3000,
            },
            database: DatabaseConfig {
                url: "postgres://law_eye:your_password@localhost:5432/law_eye".to_string(),
                max_connections: 10,
            },
            redis: RedisConfig {
                url: "redis://localhost:6379".to_string(),
            },
        }
    }
}
```

**Step 5: 验证编译**

Run: `cd D:/Desktop/LawSaw && cargo check -p law-eye-common`
Expected: Finished `dev` profile

---

## Task 3: 创建 law-eye-db crate (数据库层)

**Files:**
- Create: `D:/Desktop/LawSaw/crates/law-eye-db/Cargo.toml`
- Create: `D:/Desktop/LawSaw/crates/law-eye-db/src/lib.rs`
- Create: `D:/Desktop/LawSaw/crates/law-eye-db/src/models.rs`
- Create: `D:/Desktop/LawSaw/crates/law-eye-db/migrations/001_initial.sql`

**Step 1: 创建 Cargo.toml**

```toml
[package]
name = "law-eye-db"
version.workspace = true
edition.workspace = true

[dependencies]
law-eye-common = { path = "../law-eye-common" }
sqlx.workspace = true
uuid.workspace = true
chrono.workspace = true
serde.workspace = true
serde_json.workspace = true
tracing.workspace = true
```

**Step 2: 创建 src/lib.rs**

```rust
pub mod models;

use sqlx::postgres::{PgPool, PgPoolOptions};
use std::time::Duration;

pub use models::*;

pub async fn create_pool(database_url: &str, max_connections: u32) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(max_connections)
        .acquire_timeout(Duration::from_secs(30))
        .connect(database_url)
        .await
}

pub async fn run_migrations(pool: &PgPool) -> Result<(), sqlx::migrate::MigrateError> {
    sqlx::migrate!("./migrations").run(pool).await
}
```

**Step 3: 创建 src/models.rs**

```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Source {
    pub id: Uuid,
    pub name: String,
    pub url: String,
    #[sqlx(rename = "type")]
    pub source_type: String,
    pub config: serde_json::Value,
    pub schedule: Option<String>,
    pub priority: i32,
    pub is_active: bool,
    pub last_fetch: Option<DateTime<Utc>>,
    pub last_error: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Category {
    pub id: Uuid,
    pub slug: String,
    pub name: String,
    pub description: Option<String>,
    pub parent_id: Option<Uuid>,
    pub sort_order: i32,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Article {
    pub id: Uuid,
    pub source_id: Uuid,
    pub category_id: Option<Uuid>,
    pub title: String,
    pub link: String,
    pub content: Option<String>,
    pub summary: Option<String>,
    pub author: Option<String>,
    pub published_at: Option<DateTime<Utc>>,
    pub risk_score: Option<i32>,
    pub importance: Option<i32>,
    pub sentiment: Option<String>,
    pub ai_metadata: serde_json::Value,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateArticle {
    pub source_id: Uuid,
    pub title: String,
    pub link: String,
    pub content: Option<String>,
    pub author: Option<String>,
    pub published_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSource {
    pub name: String,
    pub url: String,
    pub source_type: String,
    pub config: serde_json::Value,
    pub schedule: Option<String>,
    pub priority: Option<i32>,
}
```

**Step 4: 创建 migrations/001_initial.sql**

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Sources table
CREATE TABLE sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('rss', 'spider', 'api')),
    config JSONB NOT NULL DEFAULT '{}',
    schedule TEXT,
    priority INT NOT NULL DEFAULT 5,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_fetch TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Categories table
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES categories(id),
    sort_order INT NOT NULL DEFAULT 0,
    icon TEXT,
    color TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default categories
INSERT INTO categories (slug, name, description, icon, color, sort_order) VALUES
('legislation',    '立法前沿', '法律法规、政策文件、立法动态',     '📜', '#3498DB', 1),
('regulation',     '监管动向', '监管机构公告、处罚决定、指导意见', '🏛️', '#9B59B6', 2),
('enforcement',    '执法案例', '行政执法、司法判例、典型案例',     '⚖️', '#E74C3C', 3),
('industry',       '业界资讯', '企业动态、行业报告、市场分析',     '🏢', '#F39C12', 4),
('compliance',     '合规前沿', '合规指南、最佳实践、合规工具',     '✅', '#27AE60', 5),
('data',           '数据动态', '数据保护、隐私政策、跨境传输',     '📊', '#1ABC9C', 6),
('security',       '安全前哨', '网络安全、漏洞预警、威胁情报',     '🛡️', '#E91E63', 7),
('academic',       '学术文章', '论文研究、学术观点、专家解读',     '📚', '#795548', 8),
('events',         '重大事件', '突发事件、重大新闻、热点追踪',     '🔥', '#FF5722', 9),
('international',  '国际视野', '国际法规、跨境动态、全球趋势',     '🌍', '#2196F3', 10);

-- Articles table
CREATE TABLE articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES sources(id),
    category_id UUID REFERENCES categories(id),
    title TEXT NOT NULL,
    link TEXT NOT NULL UNIQUE,
    content TEXT,
    summary TEXT,
    author TEXT,
    published_at TIMESTAMPTZ,
    risk_score INT CHECK (risk_score BETWEEN 0 AND 100),
    importance INT CHECK (importance BETWEEN 1 AND 5),
    sentiment TEXT CHECK (sentiment IN ('positive', 'negative', 'neutral', 'mixed')),
    ai_metadata JSONB DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'published', 'archived', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_articles_category ON articles(category_id);
CREATE INDEX idx_articles_status ON articles(status);
CREATE INDEX idx_articles_published ON articles(published_at DESC);
CREATE INDEX idx_articles_created ON articles(created_at DESC);
CREATE INDEX idx_articles_source ON articles(source_id);
CREATE INDEX idx_sources_active ON sources(is_active) WHERE is_active = true;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_sources_updated_at
    BEFORE UPDATE ON sources
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_articles_updated_at
    BEFORE UPDATE ON articles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

**Step 5: 验证编译**

Run: `cd D:/Desktop/LawSaw && cargo check -p law-eye-db`
Expected: Finished `dev` profile

---

## Task 4: 创建 law-eye-core crate (领域模型)

**Files:**
- Create: `D:/Desktop/LawSaw/crates/law-eye-core/Cargo.toml`
- Create: `D:/Desktop/LawSaw/crates/law-eye-core/src/lib.rs`
- Create: `D:/Desktop/LawSaw/crates/law-eye-core/src/article.rs`
- Create: `D:/Desktop/LawSaw/crates/law-eye-core/src/source.rs`
- Create: `D:/Desktop/LawSaw/crates/law-eye-core/src/category.rs`

**Step 1: 创建 Cargo.toml**

```toml
[package]
name = "law-eye-core"
version.workspace = true
edition.workspace = true

[dependencies]
law-eye-common = { path = "../law-eye-common" }
law-eye-db = { path = "../law-eye-db" }
sqlx.workspace = true
uuid.workspace = true
chrono.workspace = true
serde.workspace = true
serde_json.workspace = true
tracing.workspace = true
```

**Step 2: 创建 src/lib.rs**

```rust
pub mod article;
pub mod category;
pub mod source;

pub use article::ArticleService;
pub use category::CategoryService;
pub use source::SourceService;
```

**Step 3: 创建 src/article.rs**

```rust
use law_eye_common::{Error, Result};
use law_eye_db::{Article, CreateArticle};
use sqlx::PgPool;
use uuid::Uuid;

pub struct ArticleService {
    pool: PgPool,
}

impl ArticleService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn list(&self, limit: i64, offset: i64) -> Result<Vec<Article>> {
        sqlx::query_as::<_, Article>(
            r#"
            SELECT * FROM articles
            ORDER BY created_at DESC
            LIMIT $1 OFFSET $2
            "#,
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))
    }

    pub async fn get_by_id(&self, id: Uuid) -> Result<Article> {
        sqlx::query_as::<_, Article>("SELECT * FROM articles WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?
            .ok_or_else(|| Error::NotFound(format!("Article {} not found", id)))
    }

    pub async fn create(&self, input: CreateArticle) -> Result<Article> {
        sqlx::query_as::<_, Article>(
            r#"
            INSERT INTO articles (source_id, title, link, content, author, published_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
            "#,
        )
        .bind(input.source_id)
        .bind(&input.title)
        .bind(&input.link)
        .bind(&input.content)
        .bind(&input.author)
        .bind(input.published_at)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))
    }

    pub async fn exists_by_link(&self, link: &str) -> Result<bool> {
        let result: (bool,) =
            sqlx::query_as("SELECT EXISTS(SELECT 1 FROM articles WHERE link = $1)")
                .bind(link)
                .fetch_one(&self.pool)
                .await
                .map_err(|e| Error::Database(e.to_string()))?;
        Ok(result.0)
    }

    pub async fn update_status(&self, id: Uuid, status: &str) -> Result<Article> {
        sqlx::query_as::<_, Article>(
            r#"
            UPDATE articles SET status = $2 WHERE id = $1
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(status)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))
    }

    pub async fn list_by_category(&self, category_id: Uuid, limit: i64) -> Result<Vec<Article>> {
        sqlx::query_as::<_, Article>(
            r#"
            SELECT * FROM articles
            WHERE category_id = $1
            ORDER BY created_at DESC
            LIMIT $2
            "#,
        )
        .bind(category_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))
    }
}
```

**Step 4: 创建 src/source.rs**

```rust
use law_eye_common::{Error, Result};
use law_eye_db::{CreateSource, Source};
use sqlx::PgPool;
use uuid::Uuid;

pub struct SourceService {
    pool: PgPool,
}

impl SourceService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn list(&self) -> Result<Vec<Source>> {
        sqlx::query_as::<_, Source>("SELECT * FROM sources ORDER BY priority DESC, name")
            .fetch_all(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))
    }

    pub async fn list_active(&self) -> Result<Vec<Source>> {
        sqlx::query_as::<_, Source>(
            "SELECT * FROM sources WHERE is_active = true ORDER BY priority DESC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))
    }

    pub async fn get_by_id(&self, id: Uuid) -> Result<Source> {
        sqlx::query_as::<_, Source>("SELECT * FROM sources WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?
            .ok_or_else(|| Error::NotFound(format!("Source {} not found", id)))
    }

    pub async fn create(&self, input: CreateSource) -> Result<Source> {
        sqlx::query_as::<_, Source>(
            r#"
            INSERT INTO sources (name, url, type, config, schedule, priority)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
            "#,
        )
        .bind(&input.name)
        .bind(&input.url)
        .bind(&input.source_type)
        .bind(&input.config)
        .bind(&input.schedule)
        .bind(input.priority.unwrap_or(5))
        .fetch_one(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))
    }

    pub async fn update_last_fetch(&self, id: Uuid, error: Option<&str>) -> Result<()> {
        sqlx::query(
            r#"
            UPDATE sources
            SET last_fetch = NOW(), last_error = $2
            WHERE id = $1
            "#,
        )
        .bind(id)
        .bind(error)
        .execute(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;
        Ok(())
    }
}
```

**Step 5: 创建 src/category.rs**

```rust
use law_eye_common::{Error, Result};
use law_eye_db::Category;
use sqlx::PgPool;
use uuid::Uuid;

pub struct CategoryService {
    pool: PgPool,
}

impl CategoryService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn list(&self) -> Result<Vec<Category>> {
        sqlx::query_as::<_, Category>("SELECT * FROM categories ORDER BY sort_order")
            .fetch_all(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))
    }

    pub async fn get_by_slug(&self, slug: &str) -> Result<Category> {
        sqlx::query_as::<_, Category>("SELECT * FROM categories WHERE slug = $1")
            .bind(slug)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?
            .ok_or_else(|| Error::NotFound(format!("Category {} not found", slug)))
    }

    pub async fn get_by_id(&self, id: Uuid) -> Result<Category> {
        sqlx::query_as::<_, Category>("SELECT * FROM categories WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?
            .ok_or_else(|| Error::NotFound(format!("Category {} not found", id)))
    }
}
```

**Step 6: 验证编译**

Run: `cd D:/Desktop/LawSaw && cargo check -p law-eye-core`
Expected: Finished `dev` profile

---

## Task 5: 创建 law-eye-crawler crate (采集引擎)

**Files:**
- Create: `D:/Desktop/LawSaw/crates/law-eye-crawler/Cargo.toml`
- Create: `D:/Desktop/LawSaw/crates/law-eye-crawler/src/lib.rs`
- Create: `D:/Desktop/LawSaw/crates/law-eye-crawler/src/rss.rs`
- Create: `D:/Desktop/LawSaw/crates/law-eye-crawler/src/spider.rs`
- Create: `D:/Desktop/LawSaw/crates/law-eye-crawler/src/pipeline.rs`

**Step 1: 创建 Cargo.toml**

```toml
[package]
name = "law-eye-crawler"
version.workspace = true
edition.workspace = true

[dependencies]
law-eye-common = { path = "../law-eye-common" }
law-eye-db = { path = "../law-eye-db" }
reqwest.workspace = true
feed-rs.workspace = true
scraper.workspace = true
tokio.workspace = true
url.workspace = true
chrono.workspace = true
serde.workspace = true
serde_json.workspace = true
tracing.workspace = true
thiserror.workspace = true
```

**Step 2: 创建 src/lib.rs**

```rust
pub mod pipeline;
pub mod rss;
pub mod spider;

pub use pipeline::{Pipeline, RawArticle};
pub use rss::RssFetcher;
pub use spider::WebSpider;
```

**Step 3: 创建 src/rss.rs**

```rust
use crate::RawArticle;
use chrono::{DateTime, Utc};
use feed_rs::parser;
use law_eye_common::{Error, Result};
use reqwest::Client;
use tracing::info;

pub struct RssFetcher {
    client: Client,
}

impl RssFetcher {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .user_agent("LawEye/1.0")
                .build()
                .expect("Failed to create HTTP client"),
        }
    }

    pub async fn fetch(&self, url: &str) -> Result<Vec<RawArticle>> {
        info!("Fetching RSS feed: {}", url);

        let response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| Error::Http(e.to_string()))?;

        let bytes = response
            .bytes()
            .await
            .map_err(|e| Error::Http(e.to_string()))?;

        let feed = parser::parse(&bytes[..]).map_err(|e| Error::Parse(e.to_string()))?;

        let articles: Vec<RawArticle> = feed
            .entries
            .into_iter()
            .filter_map(|entry| {
                let link = entry.links.first()?.href.clone();
                let title = entry.title.map(|t| t.content)?;
                let content = entry
                    .summary
                    .map(|s| s.content)
                    .or_else(|| entry.content.and_then(|c| c.body));
                let published_at = entry.published.or(entry.updated);

                Some(RawArticle {
                    title,
                    link,
                    content,
                    author: entry.authors.first().map(|a| a.name.clone()),
                    published_at: published_at.map(|dt| DateTime::<Utc>::from(dt)),
                })
            })
            .collect();

        info!("Fetched {} articles from RSS", articles.len());
        Ok(articles)
    }
}

impl Default for RssFetcher {
    fn default() -> Self {
        Self::new()
    }
}
```

**Step 4: 创建 src/spider.rs**

```rust
use crate::RawArticle;
use law_eye_common::{Error, Result};
use reqwest::Client;
use scraper::{Html, Selector};
use serde::Deserialize;
use tracing::info;

#[derive(Debug, Clone, Deserialize)]
pub struct SpiderConfig {
    pub list_selector: String,
    pub title_selector: String,
    pub link_selector: String,
    pub content_selector: Option<String>,
    pub date_selector: Option<String>,
    pub delay_ms: Option<u64>,
}

pub struct WebSpider {
    client: Client,
}

impl WebSpider {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .user_agent("LawEye/1.0")
                .build()
                .expect("Failed to create HTTP client"),
        }
    }

    pub async fn fetch(&self, url: &str, config: &SpiderConfig) -> Result<Vec<RawArticle>> {
        info!("Spidering page: {}", url);

        let response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| Error::Http(e.to_string()))?;

        let html = response
            .text()
            .await
            .map_err(|e| Error::Http(e.to_string()))?;

        let document = Html::parse_document(&html);

        let list_selector =
            Selector::parse(&config.list_selector).map_err(|e| Error::Parse(format!("{:?}", e)))?;

        let title_selector = Selector::parse(&config.title_selector)
            .map_err(|e| Error::Parse(format!("{:?}", e)))?;

        let link_selector =
            Selector::parse(&config.link_selector).map_err(|e| Error::Parse(format!("{:?}", e)))?;

        let mut articles = Vec::new();

        for element in document.select(&list_selector) {
            let title = element
                .select(&title_selector)
                .next()
                .map(|e| e.text().collect::<String>().trim().to_string());

            let link = element
                .select(&link_selector)
                .next()
                .and_then(|e| e.value().attr("href").map(|s| s.to_string()));

            if let (Some(title), Some(link)) = (title, link) {
                let full_link = if link.starts_with("http") {
                    link
                } else {
                    let base = url::Url::parse(url).map_err(|e| Error::Parse(e.to_string()))?;
                    base.join(&link)
                        .map_err(|e| Error::Parse(e.to_string()))?
                        .to_string()
                };

                articles.push(RawArticle {
                    title,
                    link: full_link,
                    content: None,
                    author: None,
                    published_at: None,
                });
            }
        }

        info!("Spidered {} articles", articles.len());
        Ok(articles)
    }
}

impl Default for WebSpider {
    fn default() -> Self {
        Self::new()
    }
}
```

**Step 5: 创建 src/pipeline.rs**

```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawArticle {
    pub title: String,
    pub link: String,
    pub content: Option<String>,
    pub author: Option<String>,
    pub published_at: Option<DateTime<Utc>>,
}

pub struct Pipeline {
    stages: Vec<Box<dyn PipelineStage>>,
}

pub trait PipelineStage: Send + Sync {
    fn process(&self, article: RawArticle) -> Option<RawArticle>;
}

impl Pipeline {
    pub fn new() -> Self {
        Self { stages: Vec::new() }
    }

    pub fn add_stage<S: PipelineStage + 'static>(mut self, stage: S) -> Self {
        self.stages.push(Box::new(stage));
        self
    }

    pub fn process(&self, mut article: RawArticle) -> Option<RawArticle> {
        for stage in &self.stages {
            article = stage.process(article)?;
        }
        Some(article)
    }

    pub fn process_batch(&self, articles: Vec<RawArticle>) -> Vec<RawArticle> {
        articles
            .into_iter()
            .filter_map(|a| self.process(a))
            .collect()
    }
}

impl Default for Pipeline {
    fn default() -> Self {
        Self::new()
    }
}

// Cleaning stage: removes HTML tags, normalizes whitespace
pub struct CleaningStage;

impl PipelineStage for CleaningStage {
    fn process(&self, mut article: RawArticle) -> Option<RawArticle> {
        article.title = article.title.trim().to_string();
        if let Some(content) = &article.content {
            // Basic HTML stripping
            let stripped = content
                .replace("<br>", "\n")
                .replace("<br/>", "\n")
                .replace("<p>", "\n")
                .replace("</p>", "");
            // Remove remaining HTML tags
            let re = regex::Regex::new(r"<[^>]+>").ok()?;
            article.content = Some(re.replace_all(&stripped, "").trim().to_string());
        }
        Some(article)
    }
}
```

**Step 6: 添加 regex 依赖到 Cargo.toml**

在 law-eye-crawler/Cargo.toml 的 [dependencies] 中添加：
```toml
regex = "1.11"
```

**Step 7: 验证编译**

Run: `cd D:/Desktop/LawSaw && cargo check -p law-eye-crawler`
Expected: Finished `dev` profile

---

## Task 6: 创建 law-eye-queue crate (任务队列)

**Files:**
- Create: `D:/Desktop/LawSaw/crates/law-eye-queue/Cargo.toml`
- Create: `D:/Desktop/LawSaw/crates/law-eye-queue/src/lib.rs`

**Step 1: 创建 Cargo.toml**

```toml
[package]
name = "law-eye-queue"
version.workspace = true
edition.workspace = true

[dependencies]
law-eye-common = { path = "../law-eye-common" }
deadpool-redis.workspace = true
redis.workspace = true
tokio.workspace = true
serde.workspace = true
serde_json.workspace = true
tracing.workspace = true
uuid.workspace = true
```

**Step 2: 创建 src/lib.rs**

```rust
use deadpool_redis::{Config, Pool, Runtime};
use law_eye_common::{Error, Result};
use redis::AsyncCommands;
use serde::{de::DeserializeOwned, Serialize};
use tracing::info;

pub struct TaskQueue {
    pool: Pool,
}

impl TaskQueue {
    pub fn new(redis_url: &str) -> Result<Self> {
        let config = Config::from_url(redis_url);
        let pool = config
            .create_pool(Some(Runtime::Tokio1))
            .map_err(|e| Error::Internal(e.to_string()))?;
        Ok(Self { pool })
    }

    pub async fn enqueue<T: Serialize>(&self, queue: &str, task: &T) -> Result<()> {
        let mut conn = self
            .pool
            .get()
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;

        let payload = serde_json::to_string(task).map_err(|e| Error::Internal(e.to_string()))?;

        conn.rpush::<_, _, ()>(queue, &payload)
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;

        info!("Enqueued task to {}", queue);
        Ok(())
    }

    pub async fn dequeue<T: DeserializeOwned>(&self, queue: &str, timeout: u64) -> Result<Option<T>> {
        let mut conn = self
            .pool
            .get()
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;

        let result: Option<(String, String)> = conn
            .blpop(queue, timeout as f64)
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;

        match result {
            Some((_, payload)) => {
                let task =
                    serde_json::from_str(&payload).map_err(|e| Error::Internal(e.to_string()))?;
                Ok(Some(task))
            }
            None => Ok(None),
        }
    }

    pub async fn queue_length(&self, queue: &str) -> Result<usize> {
        let mut conn = self
            .pool
            .get()
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;

        let len: usize = conn
            .llen(queue)
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;

        Ok(len)
    }
}

// Task types
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct IngestTask {
    pub source_id: uuid::Uuid,
    pub source_type: String,
    pub url: String,
    pub config: serde_json::Value,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PushTask {
    pub article_ids: Vec<uuid::Uuid>,
    pub channel: String,
    pub webhook_url: String,
}
```

**Step 3: 验证编译**

Run: `cd D:/Desktop/LawSaw && cargo check -p law-eye-queue`
Expected: Finished `dev` profile

---

## Task 7: 创建 law-eye-api crate (API 服务)

**Files:**
- Create: `D:/Desktop/LawSaw/crates/law-eye-api/Cargo.toml`
- Create: `D:/Desktop/LawSaw/crates/law-eye-api/src/main.rs`
- Create: `D:/Desktop/LawSaw/crates/law-eye-api/src/routes/mod.rs`
- Create: `D:/Desktop/LawSaw/crates/law-eye-api/src/routes/articles.rs`
- Create: `D:/Desktop/LawSaw/crates/law-eye-api/src/routes/sources.rs`
- Create: `D:/Desktop/LawSaw/crates/law-eye-api/src/routes/categories.rs`
- Create: `D:/Desktop/LawSaw/crates/law-eye-api/src/routes/health.rs`
- Create: `D:/Desktop/LawSaw/crates/law-eye-api/src/state.rs`

**Step 1: 创建 Cargo.toml**

```toml
[package]
name = "law-eye-api"
version.workspace = true
edition.workspace = true

[[bin]]
name = "law-eye-api"
path = "src/main.rs"

[dependencies]
law-eye-common = { path = "../law-eye-common" }
law-eye-db = { path = "../law-eye-db" }
law-eye-core = { path = "../law-eye-core" }
law-eye-queue = { path = "../law-eye-queue" }

axum.workspace = true
tower.workspace = true
tower-http.workspace = true
tokio.workspace = true
sqlx.workspace = true
serde.workspace = true
serde_json.workspace = true
tracing.workspace = true
tracing-subscriber.workspace = true
uuid.workspace = true
chrono.workspace = true
utoipa.workspace = true
utoipa-swagger-ui.workspace = true
```

**Step 2: 创建 src/state.rs**

```rust
use law_eye_core::{ArticleService, CategoryService, SourceService};
use law_eye_queue::TaskQueue;
use sqlx::PgPool;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub article_service: Arc<ArticleService>,
    pub source_service: Arc<SourceService>,
    pub category_service: Arc<CategoryService>,
    pub task_queue: Arc<TaskQueue>,
}

impl AppState {
    pub fn new(pool: PgPool, task_queue: TaskQueue) -> Self {
        Self {
            article_service: Arc::new(ArticleService::new(pool.clone())),
            source_service: Arc::new(SourceService::new(pool.clone())),
            category_service: Arc::new(CategoryService::new(pool)),
            task_queue: Arc::new(task_queue),
        }
    }
}
```

**Step 3: 创建 src/routes/mod.rs**

```rust
pub mod articles;
pub mod categories;
pub mod health;
pub mod sources;

use axum::Router;

use crate::state::AppState;

pub fn create_router(state: AppState) -> Router {
    Router::new()
        .nest("/api/v1/articles", articles::router())
        .nest("/api/v1/sources", sources::router())
        .nest("/api/v1/categories", categories::router())
        .nest("/health", health::router())
        .with_state(state)
}
```

**Step 4: 创建 src/routes/health.rs**

```rust
use axum::{routing::get, Json, Router};
use serde::Serialize;

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
}

pub fn router() -> Router<crate::state::AppState> {
    Router::new().route("/", get(health_check))
}

async fn health_check() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}
```

**Step 5: 创建 src/routes/articles.rs**

```rust
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::state::AppState;
use law_eye_db::Article;

#[derive(Deserialize)]
pub struct ListParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Serialize)]
pub struct ArticleListResponse {
    pub data: Vec<Article>,
    pub total: usize,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_articles))
        .route("/:id", get(get_article))
        .route("/:id/publish", post(publish_article))
}

async fn list_articles(
    State(state): State<AppState>,
    Query(params): Query<ListParams>,
) -> Result<Json<ArticleListResponse>, StatusCode> {
    let limit = params.limit.unwrap_or(20);
    let offset = params.offset.unwrap_or(0);

    let articles = state
        .article_service
        .list(limit, offset)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(ArticleListResponse {
        total: articles.len(),
        data: articles,
    }))
}

async fn get_article(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Article>, StatusCode> {
    state
        .article_service
        .get_by_id(id)
        .await
        .map(Json)
        .map_err(|_| StatusCode::NOT_FOUND)
}

async fn publish_article(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Article>, StatusCode> {
    state
        .article_service
        .update_status(id, "published")
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}
```

**Step 6: 创建 src/routes/sources.rs**

```rust
use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use uuid::Uuid;

use crate::state::AppState;
use law_eye_db::{CreateSource, Source};
use law_eye_queue::IngestTask;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_sources).post(create_source))
        .route("/:id", get(get_source))
        .route("/:id/fetch", post(trigger_fetch))
}

async fn list_sources(State(state): State<AppState>) -> Result<Json<Vec<Source>>, StatusCode> {
    state
        .source_service
        .list()
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn get_source(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Source>, StatusCode> {
    state
        .source_service
        .get_by_id(id)
        .await
        .map(Json)
        .map_err(|_| StatusCode::NOT_FOUND)
}

async fn create_source(
    State(state): State<AppState>,
    Json(input): Json<CreateSource>,
) -> Result<(StatusCode, Json<Source>), StatusCode> {
    state
        .source_service
        .create(input)
        .await
        .map(|s| (StatusCode::CREATED, Json(s)))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn trigger_fetch(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, StatusCode> {
    let source = state
        .source_service
        .get_by_id(id)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;

    let task = IngestTask {
        source_id: source.id,
        source_type: source.source_type,
        url: source.url,
        config: source.config,
    };

    state
        .task_queue
        .enqueue("queue:ingest", &task)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::ACCEPTED)
}
```

**Step 7: 创建 src/routes/categories.rs**

```rust
use axum::{extract::State, http::StatusCode, routing::get, Json, Router};

use crate::state::AppState;
use law_eye_db::Category;

pub fn router() -> Router<AppState> {
    Router::new().route("/", get(list_categories))
}

async fn list_categories(
    State(state): State<AppState>,
) -> Result<Json<Vec<Category>>, StatusCode> {
    state
        .category_service
        .list()
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}
```

**Step 8: 创建 src/main.rs**

```rust
mod routes;
mod state;

use axum::http::{header, Method};
use law_eye_common::AppConfig;
use law_eye_db::create_pool;
use law_eye_queue::TaskQueue;
use tower_http::cors::{Any, CorsLayer};
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::state::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize logging
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    // Load configuration
    let config = AppConfig::load().unwrap_or_default();

    info!("Starting Law Eye API server...");

    // Create database pool
    let pool = create_pool(&config.database.url, config.database.max_connections).await?;

    // Run migrations
    info!("Running database migrations...");
    law_eye_db::run_migrations(&pool).await?;

    // Create task queue
    let task_queue = TaskQueue::new(&config.redis.url)?;

    // Create app state
    let state = AppState::new(pool, task_queue);

    // CORS configuration
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::PATCH, Method::DELETE])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION]);

    // Create router
    let app = routes::create_router(state).layer(cors);

    // Start server
    let addr = format!("{}:{}", config.server.host, config.server.port);
    info!("Server listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
```

**Step 9: 验证编译**

Run: `cd D:/Desktop/LawSaw && cargo check -p law-eye-api`
Expected: Finished `dev` profile

---

## Task 8: 创建 law-eye-worker crate (后台任务)

**Files:**
- Create: `D:/Desktop/LawSaw/crates/law-eye-worker/Cargo.toml`
- Create: `D:/Desktop/LawSaw/crates/law-eye-worker/src/main.rs`

**Step 1: 创建 Cargo.toml**

```toml
[package]
name = "law-eye-worker"
version.workspace = true
edition.workspace = true

[[bin]]
name = "law-eye-worker"
path = "src/main.rs"

[dependencies]
law-eye-common = { path = "../law-eye-common" }
law-eye-db = { path = "../law-eye-db" }
law-eye-core = { path = "../law-eye-core" }
law-eye-crawler = { path = "../law-eye-crawler" }
law-eye-queue = { path = "../law-eye-queue" }

tokio.workspace = true
sqlx.workspace = true
serde.workspace = true
serde_json.workspace = true
tracing.workspace = true
tracing-subscriber.workspace = true
uuid.workspace = true
reqwest.workspace = true
```

**Step 2: 创建 src/main.rs**

```rust
use law_eye_common::AppConfig;
use law_eye_core::ArticleService;
use law_eye_crawler::{RawArticle, RssFetcher, SpiderConfig, WebSpider};
use law_eye_db::{create_pool, CreateArticle};
use law_eye_queue::{IngestTask, PushTask, TaskQueue};
use sqlx::PgPool;
use std::sync::Arc;
use tracing::{error, info};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

struct Worker {
    pool: PgPool,
    task_queue: Arc<TaskQueue>,
    rss_fetcher: RssFetcher,
    web_spider: WebSpider,
}

impl Worker {
    fn new(pool: PgPool, task_queue: TaskQueue) -> Self {
        Self {
            pool,
            task_queue: Arc::new(task_queue),
            rss_fetcher: RssFetcher::new(),
            web_spider: WebSpider::new(),
        }
    }

    async fn run(&self) -> anyhow::Result<()> {
        info!("Worker started, waiting for tasks...");

        loop {
            // Process ingest tasks
            if let Some(task) = self
                .task_queue
                .dequeue::<IngestTask>("queue:ingest", 5)
                .await?
            {
                self.process_ingest_task(task).await;
            }

            // Process push tasks
            if let Some(task) = self
                .task_queue
                .dequeue::<PushTask>("queue:push", 1)
                .await?
            {
                self.process_push_task(task).await;
            }
        }
    }

    async fn process_ingest_task(&self, task: IngestTask) {
        info!("Processing ingest task for source: {}", task.source_id);

        let articles = match task.source_type.as_str() {
            "rss" => self.rss_fetcher.fetch(&task.url).await,
            "spider" => {
                let config: SpiderConfig = match serde_json::from_value(task.config) {
                    Ok(c) => c,
                    Err(e) => {
                        error!("Failed to parse spider config: {}", e);
                        return;
                    }
                };
                self.web_spider.fetch(&task.url, &config).await
            }
            _ => {
                error!("Unknown source type: {}", task.source_type);
                return;
            }
        };

        match articles {
            Ok(articles) => {
                let article_service = ArticleService::new(self.pool.clone());
                let mut saved = 0;

                for article in articles {
                    if let Err(e) = self
                        .save_article(&article_service, task.source_id, article)
                        .await
                    {
                        error!("Failed to save article: {}", e);
                    } else {
                        saved += 1;
                    }
                }

                info!("Saved {} articles from source {}", saved, task.source_id);
            }
            Err(e) => {
                error!("Failed to fetch articles: {}", e);
            }
        }
    }

    async fn save_article(
        &self,
        service: &ArticleService,
        source_id: uuid::Uuid,
        article: RawArticle,
    ) -> anyhow::Result<()> {
        // Check if article already exists
        if service.exists_by_link(&article.link).await? {
            return Ok(());
        }

        let create = CreateArticle {
            source_id,
            title: article.title,
            link: article.link,
            content: article.content,
            author: article.author,
            published_at: article.published_at,
        };

        service.create(create).await?;
        Ok(())
    }

    async fn process_push_task(&self, task: PushTask) {
        info!("Processing push task for {} articles", task.article_ids.len());

        let client = reqwest::Client::new();
        let article_service = ArticleService::new(self.pool.clone());

        let mut articles = Vec::new();
        for id in &task.article_ids {
            if let Ok(article) = article_service.get_by_id(*id).await {
                articles.push(article);
            }
        }

        if articles.is_empty() {
            return;
        }

        // Format message
        let message = format_push_message(&articles);

        // Send webhook
        let payload = serde_json::json!({
            "content": message,
            "articles": articles.len()
        });

        match client.post(&task.webhook_url).json(&payload).send().await {
            Ok(resp) => {
                if resp.status().is_success() {
                    info!("Push sent successfully");
                } else {
                    error!("Push failed with status: {}", resp.status());
                }
            }
            Err(e) => {
                error!("Push request failed: {}", e);
            }
        }
    }
}

fn format_push_message(articles: &[law_eye_db::Article]) -> String {
    let mut msg = String::from("📰 法眼资讯速递\n\n");

    for article in articles.iter().take(10) {
        msg.push_str(&format!("• {}\n  {}\n\n", article.title, article.link));
    }

    if articles.len() > 10 {
        msg.push_str(&format!("... 及其他 {} 条资讯\n", articles.len() - 10));
    }

    msg
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize logging
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    // Load configuration
    let config = AppConfig::load().unwrap_or_default();

    info!("Starting Law Eye Worker...");

    // Create database pool
    let pool = create_pool(&config.database.url, config.database.max_connections).await?;

    // Create task queue
    let task_queue = TaskQueue::new(&config.redis.url)?;

    // Create and run worker
    let worker = Worker::new(pool, task_queue);
    worker.run().await
}
```

**Step 3: 验证编译**

Run: `cd D:/Desktop/LawSaw && cargo check -p law-eye-worker`
Expected: Finished `dev` profile

---

## Task 9: 创建配置文件和 Docker 环境

**Files:**
- Create: `D:/Desktop/LawSaw/config/default.toml`
- Create: `D:/Desktop/LawSaw/.env.example`
- Create: `D:/Desktop/LawSaw/docker-compose.yml`

**Step 1: 创建 config/default.toml**

```toml
[server]
host = "0.0.0.0"
port = 3000

[database]
url = "postgres://law_eye:your_password@localhost:5432/law_eye"
max_connections = 10

[redis]
url = "redis://localhost:6379"
```

**Step 2: 创建 .env.example**

```env
# Server
LAW_EYE__SERVER__HOST=0.0.0.0
LAW_EYE__SERVER__PORT=3000

# Database
LAW_EYE__DATABASE__URL=postgres://law_eye:your_password@localhost:5432/law_eye
LAW_EYE__DATABASE__MAX_CONNECTIONS=10

# Redis
LAW_EYE__REDIS__URL=redis://localhost:6379

# Logging
RUST_LOG=info,law_eye=debug
```

**Step 3: 创建 docker-compose.yml**

```yaml
version: "3.9"

services:
  postgres:
    image: pgvector/pgvector:pg16
    container_name: law-eye-postgres
    environment:
      POSTGRES_DB: law_eye
      POSTGRES_USER: law_eye
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U law_eye"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: law-eye-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  n8n:
    image: docker.n8n.io/n8nio/n8n:2.4.7@sha256:b9c6ff711128fe2c422fb51ada978040ba3cc5c1fe8934af2d3f4cc5dc47069d
    container_name: law-eye-n8n
    environment:
      - N8N_HOST=localhost
      - N8N_PORT=5678
      - N8N_PROTOCOL=http
      - WEBHOOK_URL=http://localhost:5678/
    ports:
      - "5678:5678"
    volumes:
      - n8n_data:/home/node/.n8n
    depends_on:
      - postgres
      - redis

volumes:
  postgres_data:
  redis_data:
  n8n_data:
```

**Step 4: 复制 .env.example 到 .env**

Run: `cp D:/Desktop/LawSaw/.env.example D:/Desktop/LawSaw/.env`

**Step 5: 验证 Docker Compose 配置**

Run: `cd D:/Desktop/LawSaw && docker compose config`
Expected: 显示完整的 compose 配置

---

## Task 10: 完整构建和验证

**Step 1: 创建所有必要目录**

Run:
```bash
mkdir -p D:/Desktop/LawSaw/crates/law-eye-common/src
mkdir -p D:/Desktop/LawSaw/crates/law-eye-db/src
mkdir -p D:/Desktop/LawSaw/crates/law-eye-db/migrations
mkdir -p D:/Desktop/LawSaw/crates/law-eye-core/src
mkdir -p D:/Desktop/LawSaw/crates/law-eye-crawler/src
mkdir -p D:/Desktop/LawSaw/crates/law-eye-queue/src
mkdir -p D:/Desktop/LawSaw/crates/law-eye-api/src/routes
mkdir -p D:/Desktop/LawSaw/crates/law-eye-worker/src
mkdir -p D:/Desktop/LawSaw/config
```

**Step 2: 完整编译所有 crates**

Run: `cd D:/Desktop/LawSaw && cargo build --release`
Expected: Finished `release` profile

**Step 3: 启动 Docker 服务**

Run: `cd D:/Desktop/LawSaw && docker compose up -d`
Expected: 所有容器启动成功

**Step 4: 运行 API 服务**

Run: `cd D:/Desktop/LawSaw && cargo run -p law-eye-api`
Expected: Server listening on 0.0.0.0:3000

**Step 5: 测试健康检查端点**

Run: `curl http://localhost:3000/health`
Expected: {"status":"ok","version":"0.1.0"}

**Step 6: 测试分类列表 API**

Run: `curl http://localhost:3000/api/v1/categories`
Expected: 返回 10 个预设分类的 JSON 数组

**Step 7: 提交代码**

Run:
```bash
cd D:/Desktop/LawSaw
git add .
git commit -m "feat: Phase 1 MVP - Rust backend infrastructure

- law-eye-common: error handling, config management
- law-eye-db: PostgreSQL with SQLx, migrations, models
- law-eye-core: business services (Article, Source, Category)
- law-eye-crawler: RSS fetcher, Web spider, pipeline
- law-eye-queue: Redis task queue
- law-eye-api: Axum REST API with routes
- law-eye-worker: background task processor
- Docker Compose for local development

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 验收标准

Phase 1 完成后应满足：

1. ✅ Rust workspace 结构完整
2. ✅ 所有 7 个 crates 编译通过
3. ✅ PostgreSQL 数据库 schema 就绪 (10 分类预设)
4. ✅ Redis 任务队列可用
5. ✅ API 服务可启动并响应请求
6. ✅ Worker 服务可处理采集和推送任务
7. ✅ Docker Compose 一键启动开发环境
8. ✅ 代码提交到 Git

---

> **文档版本**: 1.0.0
> **创建日期**: 2025-01-17
> **状态**: 待执行
