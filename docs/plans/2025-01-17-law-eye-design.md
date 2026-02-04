# 法眼 (Law Eye) 系统设计文档

> **版本**: 1.0.0
> **日期**: 2025-01-17
> **状态**: 设计阶段
> **作者**: Claude Code + User

---

## 目录

1. [项目概述](#1-项目概述)
2. [系统架构](#2-系统架构)
3. [前端技术栈](#3-前端技术栈)
4. [后端技术栈 (Rust)](#4-后端技术栈-rust)
5. [数据层设计](#5-数据层设计)
6. [采集层设计](#6-采集层设计)
7. [AI 智能层设计](#7-ai-智能层设计)
8. [推送层设计](#8-推送层设计)
9. [服务模块划分与 API 设计](#9-服务模块划分与-api-设计)
10. [部署架构](#10-部署架构)
11. [开发路线图](#11-开发路线图)

---

## 1. 项目概述

### 1.1 项目定位

**法眼 (Law Eye)** 是数字时代法律赛道的"参考消息"，隶属于 LegalMind 法律生态系统。

**核心价值**:
- 聚合多渠道法律资讯，构建权威信息仓库
- 通过 AI 深度处理实现智能分类、摘要、风险评估
- 为法律从业者提供高效的信息获取与洞察工具

### 1.2 设计目标

| 目标 | 说明 |
|------|------|
| **世界前沿** | 采用最先进的技术栈与架构模式 |
| **技术可靠** | 高可用、容错、可恢复的系统设计 |
| **耐用十年** | 模块化设计，技术选型稳定，易于演进 |

### 1.3 核心需求

| 维度 | 决策 |
|------|------|
| **MVP范围** | 完整CMS（采集→存储→分类→推送），纯文字编辑 |
| **AI深度** | 深度介入（分类/摘要/评分/标签/排序），渐进实现 |
| **采集策略** | 混合（RSS + 爬虫 + API） |
| **LLM** | 自建网关（Claude Relay / NewAPI） |
| **数据库** | 自托管 PostgreSQL + pgvector |
| **用户体系** | 开放平台级（RBAC + 审计日志） |
| **输出形态** | 外部：纯文字 / 平台：融合形态（列表+Dashboard+知识库） |
| **差异化** | 垂直深耕法律 + 集成通用能力 |
| **优先级** | 存储第一，推送核心 |
| **基础设施** | 本地服务器 + 云服务器混合部署 |

### 1.4 10 板块分类

| 序号 | Slug | 名称 | 描述 | 图标 |
|------|------|------|------|------|
| 1 | legislation | 立法前沿 | 法律法规、政策文件、立法动态 | 📜 |
| 2 | regulation | 监管动向 | 监管机构公告、处罚决定、指导意见 | 🏛️ |
| 3 | enforcement | 执法案例 | 行政执法、司法判例、典型案例 | ⚖️ |
| 4 | industry | 业界资讯 | 企业动态、行业报告、市场分析 | 🏢 |
| 5 | compliance | 合规前沿 | 合规指南、最佳实践、合规工具 | ✅ |
| 6 | data | 数据动态 | 数据保护、隐私政策、跨境传输 | 📊 |
| 7 | security | 安全前哨 | 网络安全、漏洞预警、威胁情报 | 🛡️ |
| 8 | academic | 学术文章 | 论文研究、学术观点、专家解读 | 📚 |
| 9 | events | 重大事件 | 突发事件、重大新闻、热点追踪 | 🔥 |
| 10 | international | 国际视野 | 国际法规、跨境动态、全球趋势 | 🌍 |

### 1.5 参考项目

- **TrendRadar** (sansan0/TrendRadar): 舆情监控与热点筛选工具
  - 借鉴：多源聚合、混合采集、AI分析推送、MCP协议集成

---

## 2. 系统架构

### 2.1 五层架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           🌐 Delivery Layer (交付层)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Web App    │  │  REST API   │  │  推送网关    │  │  LawClick 集成接口   │ │
│  │  (Next.js)  │  │  (Axum)     │  │  (多渠道)    │  │  (未来)             │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│                           🧠 Intelligence Layer (智能层)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  分类引擎    │  │  摘要生成    │  │  风险评估    │  │  关联分析 & 排序     │ │
│  │  (Rust+LLM) │  │  (LLM)      │  │  (LLM+规则)  │  │  (pgvector+LLM)    │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│                           ⚙️ Orchestration Layer (编排层)                     │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         n8n Workflow Engine                            │  │
│  │        (采集调度 / 任务编排 / 错误重试 / 状态监控)                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────────────┤
│                           📥 Ingestion Layer (采集层)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  RSS 采集器  │  │  Web 爬虫    │  │  API 连接器  │  │  特殊源监控         │ │
│  │  (Rust)     │  │  (Rust)     │  │  (Rust)     │  │  (Rust)            │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│                           💾 Data Layer (数据层)                              │
│  ┌─────────────────────────┐  ┌─────────────────────────────────────────┐   │
│  │  PostgreSQL + pgvector  │  │  Redis (缓存 + 任务队列 + 去重布隆过滤器)  │   │
│  │  (主存储 + 向量检索)      │  │                                         │   │
│  └─────────────────────────┘  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 设计理念

| 层级 | 职责 | 关键技术 |
|------|------|----------|
| **交付层** | 面向用户的所有接口 | Next.js, Axum REST API, WebSocket |
| **智能层** | AI 能力的统一封装 | LLM Gateway, pgvector, 规则引擎 |
| **编排层** | 可视化工作流管理 | n8n (自托管) |
| **采集层** | 高性能数据采集 | Rust 异步爬虫, feed-rs |
| **数据层** | 持久化与缓存 | PostgreSQL 16, Redis 7 |

---

## 3. 前端技术栈

### 3.1 架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Next.js 15 (App Router)                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Dashboard  │  │  资讯列表    │  │  知识图谱    │  │  管理后台           │ │
│  │  (数据看板)  │  │  (10板块)   │  │  (关联探索)  │  │  (CMS)             │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│                         UI Component Layer                                   │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────────────────────┐ │
│  │ shadcn/ui │  │  Recharts │  │ React Flow│  │  Framer Motion           │ │
│  │ (组件库)   │  │  (图表)    │  │ (知识图谱) │  │  (动效)                  │ │
│  └───────────┘  └───────────┘  └───────────┘  └───────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│                         State & Data Layer                                   │
│  ┌───────────────────┐  ┌───────────────────┐  ┌─────────────────────────┐  │
│  │  TanStack Query   │  │  Zustand          │  │  nuqs                   │  │
│  │  (服务端状态)       │  │  (客户端状态)      │  │  (URL状态同步)          │  │
│  └───────────────────┘  └───────────────────┘  └─────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────────────┤
│                         Infrastructure                                       │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────────────────────┐ │
│  │TypeScript │  │  Tailwind │  │   Biome   │  │  Turborepo               │ │
│  │  (严格模式) │  │  CSS v4   │  │ (Lint+Fmt)│  │  (Monorepo构建)          │ │
│  └───────────┘  └───────────┘  └───────────┘  └───────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 技术选型

| 层级 | 技术 | 选型理由 |
|------|------|----------|
| **框架** | Next.js 15 (App Router) | RSC 支持、流式渲染、SEO 友好 |
| **语言** | TypeScript (Strict) | 端到端类型安全 |
| **组件库** | shadcn/ui | 可定制、无运行时依赖 |
| **样式** | Tailwind CSS v4 | 原子化 CSS、暗色模式支持 |
| **图表** | Recharts | 声明式、React 原生 |
| **知识图谱** | React Flow | 节点图可视化、扩展性强 |
| **动效** | Framer Motion | 流畅自然的动画 |
| **服务端状态** | TanStack Query v5 | 缓存、重试、乐观更新 |
| **客户端状态** | Zustand | 轻量、TypeScript 友好 |
| **URL 状态** | nuqs | 类型安全的 URL 参数 |
| **Lint/Format** | Biome | 比 ESLint+Prettier 快 35x |
| **Monorepo** | Turborepo | 增量构建、远程缓存 |

### 3.3 Monorepo 结构

```
apps/
├── web/              # 主 Web 应用 (Next.js)
├── admin/            # 管理后台 (Next.js)
└── docs/             # 文档站点 (可选, Nextra)

packages/
├── ui/               # 共享 UI 组件 (shadcn 定制)
├── api-client/       # 类型安全的 API 客户端 (自动生成)
├── types/            # 共享 TypeScript 类型
└── config/           # 共享配置 (Tailwind, TypeScript, Biome)
```

### 3.4 端到端类型安全

```
┌─────────────┐    OpenAPI (utoipa)    ┌─────────────┐
│  Rust 后端   │  ─────────────────────▶ │  生成 JSON   │
│  类型定义    │                         │  Schema     │
└─────────────┘                         └──────┬──────┘
                                               │
                              openapi-typescript │
                                               ▼
┌─────────────┐    自动导入              ┌─────────────┐
│  前端调用    │ ◀───────────────────────│  TypeScript │
│  类型安全    │                         │  类型定义    │
└─────────────┘                         └─────────────┘
```

---

## 4. 后端技术栈 (Rust)

### 4.1 架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         API Gateway (Axum)                                   │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────────────────────┐ │
│  │  Router   │  │Middleware │  │  OpenAPI  │  │  WebSocket                │ │
│  │  (路由)    │  │(认证/日志) │  │  (utoipa) │  │  (实时推送)               │ │
│  └───────────┘  └───────────┘  └───────────┘  └───────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│                         Service Layer (业务服务)                              │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────────────────────┐ │
│  │ArticleSvc │  │ ClassifySvc│  │  UserSvc  │  │  AnalyticsSvc            │ │
│  │ (资讯管理) │  │ (分类服务) │  │ (用户权限) │  │  (统计分析)              │ │
│  └───────────┘  └───────────┘  └───────────┘  └───────────────────────────┘ │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────────────────────┐ │
│  │ IngestSvc │  │  PushSvc  │  │  AISvc    │  │  AuditSvc                │ │
│  │ (采集调度) │  │ (推送服务) │  │ (AI网关)  │  │  (审计日志)              │ │
│  └───────────┘  └───────────┘  └───────────┘  └───────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│                         Core Crates (核心库)                                  │
│  ┌───────────────┐  ┌───────────────┐  ┌─────────────────────────────────┐  │
│  │  law-eye-core │  │law-eye-crawler│  │  law-eye-ai                    │  │
│  │  (领域模型)    │  │  (采集引擎)    │  │  (AI集成)                      │  │
│  └───────────────┘  └───────────────┘  └─────────────────────────────────┘  │
│  ┌───────────────┐  ┌───────────────┐  ┌─────────────────────────────────┐  │
│  │ law-eye-db    │  │law-eye-queue  │  │  law-eye-common                │  │
│  │ (数据访问)     │  │  (任务队列)    │  │  (工具函数)                     │  │
│  └───────────────┘  └───────────────┘  └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 技术选型

| 类别 | 技术 | 选型理由 |
|------|------|----------|
| **Web 框架** | Axum | Tokio 官方、模块化、Tower 生态 |
| **异步运行时** | Tokio 1.x | 事实标准、生态最完善 |
| **数据库** | SQLx 0.8+ | 编译时 SQL 校验、纯 Rust |
| **ORM** | SeaORM 1.x | 基于 SQLx、迁移支持 |
| **序列化** | Serde | Rust 序列化标准 |
| **HTTP 客户端** | reqwest 0.12+ | 完备、支持代理/TLS |
| **HTML 解析** | scraper 0.20+ | CSS 选择器语法 |
| **RSS 解析** | feed-rs 2.x | 统一 RSS/Atom 解析 |
| **任务队列** | Apalis 0.6+ | Rust 原生、Redis/Postgres 后端 |
| **缓存** | deadpool-redis | 连接池、async 支持 |
| **认证** | axum-login + argon2 | Session + 安全密码哈希 |
| **授权** | casbin-rs 2.x | RBAC/ABAC 模型 |
| **OpenAPI** | utoipa 5.x | 自动生成 API 文档 |
| **日志** | tracing | 结构化日志、分布式追踪 |
| **错误处理** | thiserror + anyhow | 类型安全 + 便捷传播 |
| **配置** | config-rs + dotenvy | 多源配置 |

### 4.3 Cargo Workspace 结构

```
crates/
├── law-eye-api/          # Axum API 服务 (bin)
├── law-eye-worker/       # 后台任务 Worker (bin)
├── law-eye-core/         # 领域模型、业务逻辑 (lib)
├── law-eye-crawler/      # 采集引擎 (lib)
│   ├── src/
│   │   ├── rss/          # RSS 采集器
│   │   ├── spider/       # 网页爬虫
│   │   └── api/          # API 连接器
├── law-eye-ai/           # AI 能力封装 (lib)
│   ├── src/
│   │   ├── gateway/      # LLM 网关适配
│   │   ├── classify/     # 分类引擎
│   │   ├── summarize/    # 摘要生成
│   │   ├── risk/         # 风险评估
│   │   └── embedding/    # 向量嵌入
├── law-eye-db/           # 数据库访问层 (lib)
├── law-eye-queue/        # 任务队列封装 (lib)
└── law-eye-common/       # 共享工具 (lib)
    ├── src/
    │   ├── error.rs      # 统一错误类型
    │   ├── config.rs     # 配置结构
    │   └── utils.rs      # 工具函数
```

---

## 5. 数据层设计

### 5.1 技术选型

| 组件 | 技术 | 用途 |
|------|------|------|
| **主数据库** | PostgreSQL 16 | 结构化数据存储 |
| **向量扩展** | pgvector | 语义检索、RAG |
| **全文搜索** | pg_trgm + btree_gin | 模糊搜索 |
| **定时任务** | pg_cron | 数据库级定时任务 |
| **缓存** | Redis 7 | 热点缓存、会话存储 |
| **队列** | Redis (Apalis) | 任务队列 |
| **去重** | Redis Bloom Filter | URL 去重 |

### 5.2 核心数据模型

#### 5.2.1 信息源表 (sources)

```sql
CREATE TABLE sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('rss', 'spider', 'api')),
    config JSONB NOT NULL DEFAULT '{}',
    schedule TEXT,  -- cron 表达式
    priority INT NOT NULL DEFAULT 5,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_fetch TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 5.2.2 文章表 (articles)

```sql
CREATE TABLE articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES sources(id),
    category_id UUID REFERENCES categories(id),

    -- 基础信息
    title TEXT NOT NULL,
    link TEXT NOT NULL UNIQUE,
    content TEXT,
    summary TEXT,
    author TEXT,
    published_at TIMESTAMPTZ,

    -- AI 生成字段
    risk_score INT CHECK (risk_score BETWEEN 0 AND 100),
    importance INT CHECK (importance BETWEEN 1 AND 5),
    sentiment TEXT CHECK (sentiment IN ('positive', 'negative', 'neutral', 'mixed')),
    ai_metadata JSONB DEFAULT '{}',

    -- 状态管理
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'published', 'archived', 'rejected')),

    -- 时间戳
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- 索引优化
    CONSTRAINT articles_link_unique UNIQUE (link)
);

CREATE INDEX idx_articles_category ON articles(category_id);
CREATE INDEX idx_articles_status ON articles(status);
CREATE INDEX idx_articles_published ON articles(published_at DESC);
CREATE INDEX idx_articles_created ON articles(created_at DESC);
```

#### 5.2.3 分类表 (categories)

```sql
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

-- 预设 10 板块
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
```

#### 5.2.4 向量块表 (article_chunks)

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE article_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(1536),
    token_count INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(article_id, chunk_index)
);

-- HNSW 索引
CREATE INDEX idx_chunks_embedding ON article_chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

#### 5.2.5 用户与权限表

```sql
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

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    permissions JSONB NOT NULL DEFAULT '[]',
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    granted_by UUID REFERENCES users(id),
    PRIMARY KEY (user_id, role_id)
);

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

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_resource ON audit_logs(resource, resource_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
```

### 5.3 Redis 数据结构

| Key Pattern | 数据结构 | 用途 | TTL |
|-------------|----------|------|-----|
| `session:{id}` | Hash | 用户会话 | 24h |
| `cache:article:{id}` | String (JSON) | 文章缓存 | 1h |
| `cache:category:{slug}:list` | String (JSON) | 分类列表缓存 | 10m |
| `bloom:urls` | Bloom Filter | URL 去重 | 永久 |
| `ratelimit:{ip}:{endpoint}` | String (Counter) | 限流计数 | 1m |
| `queue:ingest` | List (Apalis) | 采集任务队列 | - |
| `queue:ai` | List (Apalis) | AI 处理队列 | - |
| `queue:push` | List (Apalis) | 推送任务队列 | - |
| `pubsub:realtime` | Pub/Sub | 实时通知 | - |
| `stats:daily:{date}` | Hash | 每日统计 | 30d |

### 5.4 备份策略

```yaml
backup:
  postgresql:
    wal_level: replica
    archive_mode: on
    full_backup: "0 2 * * 0"      # 每周日凌晨2点
    incremental_backup: "0 2 * * 1-6"  # 每天凌晨2点
    retention:
      full: 4
      diff: 7

  redis:
    save:
      - "900 1"
      - "300 10"
      - "60 10000"
    appendonly: yes
    appendfsync: everysec
```

---

## 6. 采集层设计

### 6.1 采集器架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         law-eye-crawler                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Crawler Manager (调度器)                          │   │
│  │  ┌───────────────────────────────────────────────────────────────┐  │   │
│  │  │  • 任务调度 (基于 source.schedule)                              │  │   │
│  │  │  • 并发控制 (Semaphore)                                         │  │   │
│  │  │  • 重试策略 (指数退避)                                           │  │   │
│  │  │  • 状态监控                                                     │  │   │
│  │  └───────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│          ┌─────────────────────────┼─────────────────────────┐             │
│          ▼                         ▼                         ▼             │
│  ┌───────────────┐        ┌───────────────┐        ┌───────────────┐       │
│  │  RSS Fetcher  │        │  Web Spider   │        │  API Connector│       │
│  ├───────────────┤        ├───────────────┤        ├───────────────┤       │
│  │ • feed-rs     │        │ • reqwest     │        │ • reqwest     │       │
│  │ • Atom/RSS    │        │ • scraper     │        │ • JSON/XML    │       │
│  │ • JSON Feed   │        │ • 动态渲染     │        │ • OAuth/Token │       │
│  └───────────────┘        └───────────────┘        └───────────────┘       │
│          │                         │                         │             │
│          └─────────────────────────┼─────────────────────────┘             │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Pipeline (处理管道)                               │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌───────────┐ │   │
│  │  │ 去重    │─▶│ 清洗    │─▶│ 提取    │─▶│ 验证    │─▶│ 持久化   │  │   │
│  │  │ (Bloom) │  │ (HTML)  │  │ (结构化) │  │ (Schema) │  │ (DB)     │  │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └───────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 采集器类型

#### 6.2.1 RSS Fetcher

```rust
// 配置示例
pub struct RssSourceConfig {
    pub url: String,
    pub fetch_full_content: bool,  // 是否抓取全文
    pub content_selector: Option<String>,  // 全文 CSS 选择器
    pub max_items: usize,
}

// 支持的格式
// - RSS 2.0
// - Atom 1.0
// - JSON Feed 1.1
```

#### 6.2.2 Web Spider

```rust
// 配置示例
pub struct SpiderSourceConfig {
    pub start_url: String,
    pub list_selector: String,       // 列表项选择器
    pub title_selector: String,      // 标题选择器
    pub link_selector: String,       // 链接选择器
    pub content_selector: String,    // 正文选择器
    pub date_selector: Option<String>,
    pub date_format: Option<String>,
    pub pagination: Option<PaginationConfig>,
    pub headers: HashMap<String, String>,
    pub delay_ms: u64,               // 请求间隔
}

pub struct PaginationConfig {
    pub next_selector: Option<String>,
    pub max_pages: usize,
}
```

#### 6.2.3 API Connector

```rust
// 配置示例
pub struct ApiSourceConfig {
    pub endpoint: String,
    pub method: HttpMethod,
    pub headers: HashMap<String, String>,
    pub auth: Option<AuthConfig>,
    pub response_path: String,  // JSON Path
    pub field_mapping: FieldMapping,
}

pub enum AuthConfig {
    Bearer(String),
    OAuth2 { client_id: String, client_secret: String, token_url: String },
    ApiKey { header: String, value: String },
}
```

### 6.3 处理管道

```rust
pub trait PipelineStage: Send + Sync {
    async fn process(&self, item: RawArticle) -> Result<RawArticle, PipelineError>;
}

// 阶段实现
pub struct DeduplicationStage { bloom_filter: BloomFilter }
pub struct CleaningStage { /* HTML 清洗 */ }
pub struct ExtractionStage { /* 结构化提取 */ }
pub struct ValidationStage { /* Schema 验证 */ }
pub struct PersistenceStage { db: DatabasePool }
```

### 6.4 信息源配置示例

```yaml
# config/sources.yaml
sources:
  # RSS 源示例
  - name: "中国法院网"
    type: rss
    url: "https://www.court.gov.cn/rss.xml"
    schedule: "0 */2 * * *"  # 每2小时
    priority: 10
    config:
      fetch_full_content: true
      content_selector: ".article-content"

  # 爬虫源示例
  - name: "国家互联网信息办公室"
    type: spider
    url: "http://www.cac.gov.cn/gzdt/index.htm"
    schedule: "0 */4 * * *"  # 每4小时
    priority: 10
    config:
      list_selector: ".list-item"
      title_selector: "a"
      link_selector: "a@href"
      content_selector: ".article-content"
      delay_ms: 1000

  # API 源示例
  - name: "威科先行"
    type: api
    url: "https://api.wkinfo.com.cn/v1/news"
    schedule: "0 */6 * * *"
    priority: 5
    config:
      method: GET
      auth:
        type: api_key
        header: "X-API-Key"
        value: "${WKINFO_API_KEY}"
      response_path: "$.data.items"
      field_mapping:
        title: "$.title"
        link: "$.url"
        content: "$.content"
        published_at: "$.publishTime"
```

---

## 7. AI 智能层设计

### 7.1 架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         law-eye-ai                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    LLM Gateway (统一网关)                            │   │
│  │  ┌───────────────────────────────────────────────────────────────┐  │   │
│  │  │  支持后端: Claude Relay / NewAPI / OpenRouter / 直连          │  │   │
│  │  │  负载均衡 / 故障转移 / 速率限制 / 成本追踪                       │  │   │
│  │  └───────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│          ┌─────────────┬───────────┼───────────┬─────────────┐             │
│          ▼             ▼           ▼           ▼             ▼             │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐ │
│  │  分类引擎  │  │  摘要生成  │  │  风险评估  │  │  标签提取  │  │  向量嵌入  │ │
│  │ Classifier │  │ Summarizer│  │ RiskAssess│  │ TagExtract│  │ Embedder  │ │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘  └───────────┘ │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Prompt Templates (提示词模板)                     │   │
│  │  • 分类提示词 (10 板块定义 + Few-shot 示例)                          │   │
│  │  • 摘要提示词 (结构化输出)                                           │   │
│  │  • 风险评估提示词 (合规风险维度)                                      │   │
│  │  • 标签提取提示词 (法律领域关键词)                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 AI 能力模块

#### 7.2.1 分类引擎

```rust
pub struct ClassifyResult {
    pub category_slug: String,      // 主分类
    pub confidence: f32,            // 置信度 0-1
    pub sub_categories: Vec<String>, // 可能的次级分类
    pub reasoning: String,          // 分类理由
}

// 分类策略
// 1. 规则预分类 (关键词匹配, 快速)
// 2. LLM 精分类 (语义理解, 准确)
// 3. 置信度阈值 < 0.7 时人工复核
```

#### 7.2.2 摘要生成

```rust
pub struct SummaryResult {
    pub brief: String,              // 一句话摘要 (< 100 字)
    pub abstract_text: String,      // 详细摘要 (< 300 字)
    pub key_points: Vec<String>,    // 关键要点 (3-5 条)
    pub entities: Vec<Entity>,      // 命名实体 (机构、法规、人物)
}

pub struct Entity {
    pub name: String,
    pub entity_type: EntityType,    // Organization, Regulation, Person, Date
    pub context: String,
}
```

#### 7.2.3 风险评估

```rust
pub struct RiskAssessment {
    pub score: u8,                  // 0-100 风险分
    pub level: RiskLevel,           // Low, Medium, High, Critical
    pub dimensions: Vec<RiskDimension>,
    pub recommendations: Vec<String>,
}

pub struct RiskDimension {
    pub name: String,               // 合规风险、处罚风险、声誉风险
    pub score: u8,
    pub description: String,
}
```

#### 7.2.4 重要性排序

```rust
pub struct ImportanceScore {
    pub score: u8,                  // 1-5 重要性等级
    pub factors: Vec<ImportanceFactor>,
}

pub struct ImportanceFactor {
    pub name: String,               // 时效性、影响范围、权威性、关联度
    pub weight: f32,
    pub value: f32,
}
```

### 7.3 渐进式 AI 能力路线

| 阶段 | 能力 | 实现方式 |
|------|------|----------|
| **Phase 1** | 基础分类 | 规则 + 简单 LLM 调用 |
| **Phase 2** | 摘要生成 | LLM 结构化输出 |
| **Phase 3** | 风险评分 | LLM + 规则引擎 |
| **Phase 4** | 关联标签 | NER + 知识图谱 |
| **Phase 5** | 重要性排序 | 多因子评分模型 |
| **Phase 6** | RAG 问答 | pgvector + LLM |

---

## 8. 推送层设计

### 8.1 推送架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Push Service                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Push Scheduler (推送调度器)                       │   │
│  │  • 定时推送 (每日简报)                                               │   │
│  │  • 即时推送 (重大事件)                                               │   │
│  │  • 智能推送 (个性化时间窗口)                                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│  ┌─────────────────────────────────┴───────────────────────────────────┐   │
│  │                    Content Formatter (内容格式化)                    │   │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────────────┐ │   │
│  │  │  Markdown │  │   HTML    │  │  纯文本    │  │  结构化 JSON      │  │   │
│  │  └───────────┘  └───────────┘  └───────────┘  └───────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│  ┌─────────────────────────────────┴───────────────────────────────────┐   │
│  │                    Channel Adapters (渠道适配器)                     │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────────┐│   │
│  │  │ Webhook │ │  Email  │ │Telegram │ │  Slack  │ │ 自定义 Webhook  ││   │
│  │  │ (通用)  │ │  (SMTP) │ │  (Bot)  │ │  (App)  │ │                 ││   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────────────┘│   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 推送模式

| 模式 | 适用场景 | 说明 |
|------|----------|------|
| **daily** | 每日汇总 | 按时推送当日所有匹配资讯 |
| **incremental** | 增量监控 | 仅推送新增内容，零重复 |
| **realtime** | 重大事件 | 即时推送高优先级资讯 |

### 8.3 推送内容结构

```rust
pub struct PushContent {
    pub title: String,
    pub sections: Vec<PushSection>,
    pub summary: Option<AISummary>,
    pub generated_at: DateTime<Utc>,
}

pub struct PushSection {
    pub category: Category,
    pub articles: Vec<ArticleBrief>,
    pub new_count: usize,
}

pub struct ArticleBrief {
    pub title: String,
    pub source: String,
    pub summary: String,
    pub link: String,
    pub risk_level: Option<RiskLevel>,
    pub is_new: bool,  // 🆕 标记
}
```

---

## 9. 服务模块划分与 API 设计

### 9.1 服务模块

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Services Overview                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │  ArticleService │  │  SourceService  │  │  CategoryService            │ │
│  │  • CRUD 操作     │  │  • 信息源管理    │  │  • 分类管理                  │ │
│  │  • 状态流转      │  │  • 配置验证      │  │  • 层级结构                  │ │
│  │  • 批量操作      │  │  • 健康检查      │  │                             │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘ │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │  IngestService  │  │  AIService      │  │  PushService                │ │
│  │  • 采集调度      │  │  • 分类/摘要     │  │  • 推送调度                  │ │
│  │  • 任务监控      │  │  • 风险评估      │  │  • 渠道管理                  │ │
│  │  • 错误重试      │  │  • 向量嵌入      │  │  • 模板管理                  │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘ │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │  UserService    │  │  AuthService    │  │  AuditService               │ │
│  │  • 用户管理      │  │  • 认证/授权     │  │  • 操作日志                  │ │
│  │  • 偏好设置      │  │  • Session      │  │  • 安全审计                  │ │
│  │  • 角色分配      │  │  • RBAC         │  │  • 数据导出                  │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘ │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                                  │
│  │ AnalyticsService│  │  SearchService  │                                  │
│  │  • 统计报表      │  │  • 全文搜索      │                                  │
│  │  • 趋势分析      │  │  • 语义搜索      │                                  │
│  │  • 数据看板      │  │  • 过滤排序      │                                  │
│  └─────────────────┘  └─────────────────┘                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 API 设计 (RESTful)

#### 9.2.1 资讯模块

| Method | Endpoint | 描述 |
|--------|----------|------|
| GET | `/api/v1/articles` | 获取资讯列表 (分页/筛选) |
| GET | `/api/v1/articles/:id` | 获取资讯详情 |
| POST | `/api/v1/articles` | 创建资讯 (手动) |
| PATCH | `/api/v1/articles/:id` | 更新资讯 |
| DELETE | `/api/v1/articles/:id` | 删除资讯 |
| POST | `/api/v1/articles/:id/publish` | 发布资讯 |
| POST | `/api/v1/articles/:id/archive` | 归档资讯 |
| POST | `/api/v1/articles/batch` | 批量操作 |

#### 9.2.2 信息源模块

| Method | Endpoint | 描述 |
|--------|----------|------|
| GET | `/api/v1/sources` | 获取信息源列表 |
| GET | `/api/v1/sources/:id` | 获取信息源详情 |
| POST | `/api/v1/sources` | 创建信息源 |
| PATCH | `/api/v1/sources/:id` | 更新信息源 |
| DELETE | `/api/v1/sources/:id` | 删除信息源 |
| POST | `/api/v1/sources/:id/test` | 测试信息源 |
| POST | `/api/v1/sources/:id/fetch` | 手动触发采集 |

#### 9.2.3 用户模块

| Method | Endpoint | 描述 |
|--------|----------|------|
| POST | `/api/v1/auth/register` | 用户注册 |
| POST | `/api/v1/auth/login` | 用户登录 |
| POST | `/api/v1/auth/logout` | 用户登出 |
| GET | `/api/v1/users/me` | 获取当前用户 |
| PATCH | `/api/v1/users/me` | 更新个人信息 |
| GET | `/api/v1/users` | 获取用户列表 (管理员) |
| PATCH | `/api/v1/users/:id/roles` | 分配角色 |

#### 9.2.4 搜索模块

| Method | Endpoint | 描述 |
|--------|----------|------|
| GET | `/api/v1/search` | 全文搜索 |
| POST | `/api/v1/search/semantic` | 语义搜索 (向量) |
| GET | `/api/v1/search/suggestions` | 搜索建议 |

#### 9.2.5 统计模块

| Method | Endpoint | 描述 |
|--------|----------|------|
| GET | `/api/v1/analytics/overview` | 总览数据 |
| GET | `/api/v1/analytics/trends` | 趋势数据 |
| GET | `/api/v1/analytics/categories` | 分类统计 |
| GET | `/api/v1/analytics/sources` | 来源统计 |

---

## 10. 部署架构

### 10.1 混合部署架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Cloud (Vercel / Cloudflare)                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Next.js Frontend (SSR/SSG)                                          │   │
│  │  • 自动 CDN 分发                                                      │   │
│  │  • Edge Functions                                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │ HTTPS
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Local Server (Docker Compose)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                    Traefik (反向代理 + SSL)                            │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                    │                                        │
│       ┌────────────────────────────┼────────────────────────────┐          │
│       ▼                            ▼                            ▼          │
│  ┌───────────┐            ┌───────────────┐            ┌───────────────┐   │
│  │ law-eye   │            │  law-eye      │            │     n8n       │   │
│  │   -api    │            │   -worker     │            │               │   │
│  │  (Axum)   │            │  (后台任务)    │            │  (工作流)      │   │
│  └───────────┘            └───────────────┘            └───────────────┘   │
│       │                            │                            │          │
│       └────────────────────────────┼────────────────────────────┘          │
│                                    ▼                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                    PostgreSQL 16 + Redis 7                             │ │
│  │                    (数据持久化卷挂载)                                    │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Docker Compose 结构

```yaml
# docker-compose.yml
version: "3.9"

services:
  traefik:
    image: traefik:v3.0
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./traefik:/etc/traefik

  api:
    build: ./crates/law-eye-api
    environment:
      - DATABASE_URL=postgres://...
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis
    labels:
      - "traefik.http.routers.api.rule=Host(`api.law-eye.local`)"

  worker:
    build: ./crates/law-eye-worker
    environment:
      - DATABASE_URL=postgres://...
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis

  n8n:
    image: docker.n8n.io/n8nio/n8n:2.4.7@sha256:b9c6ff711128fe2c422fb51ada978040ba3cc5c1fe8934af2d3f4cc5dc47069d
    environment:
      - N8N_HOST=n8n.law-eye.local
    volumes:
      - n8n_data:/home/node/.n8n

  postgres:
    image: pgvector/pgvector:pg16
    environment:
      - POSTGRES_DB=law_eye
      - POSTGRES_USER=law_eye
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
  n8n_data:
```

---

## 11. 开发路线图

### 11.1 Phase 1: 基础设施 (MVP)

**目标**: 跑通采集→存储→推送核心闭环

| 任务 | 优先级 | 预估复杂度 |
|------|--------|-----------|
| 项目脚手架搭建 (Cargo workspace + Turborepo) | P0 | 低 |
| PostgreSQL 数据库 Schema 设计与迁移 | P0 | 中 |
| Redis 连接与基础缓存 | P0 | 低 |
| RSS 采集器实现 | P0 | 中 |
| 基础 Web 爬虫实现 | P0 | 中 |
| n8n 工作流集成 | P0 | 中 |
| 基础分类 (规则引擎) | P1 | 低 |
| Webhook 推送 | P0 | 低 |
| 简单管理界面 (资讯列表/编辑) | P1 | 中 |

**交付物**:
- 可运行的采集系统
- 数据入库
- 基础推送能力

### 11.2 Phase 2: AI 能力增强

**目标**: 实现智能分类、摘要生成

| 任务 | 优先级 | 预估复杂度 |
|------|--------|-----------|
| LLM Gateway 实现 (Claude Relay/NewAPI 适配) | P0 | 中 |
| AI 分类引擎 | P0 | 中 |
| 摘要生成模块 | P0 | 中 |
| 风险评估模块 | P1 | 中 |
| 标签提取模块 | P1 | 中 |
| 向量嵌入 (pgvector) | P1 | 中 |
| AI 处理任务队列 | P0 | 低 |

**交付物**:
- 智能分类能力
- 自动摘要生成
- 风险评估

### 11.3 Phase 3: 完整 CMS

**目标**: 完善管理后台，开放用户系统

| 任务 | 优先级 | 预估复杂度 |
|------|--------|-----------|
| 用户注册/登录 | P0 | 中 |
| RBAC 权限系统 | P0 | 中 |
| 审计日志 | P1 | 低 |
| 资讯编辑器 | P0 | 中 |
| 信息源管理界面 | P0 | 中 |
| 推送配置界面 | P1 | 中 |
| 数据看板 | P1 | 中 |

**交付物**:
- 完整用户系统
- 管理后台
- 数据统计

### 11.4 Phase 4: 平台能力

**目标**: 知识图谱、RAG 问答、开放 API

| 任务 | 优先级 | 预估复杂度 |
|------|--------|-----------|
| 知识图谱构建 | P1 | 高 |
| RAG 问答系统 | P1 | 高 |
| API 开放平台 | P2 | 中 |
| MCP 协议支持 | P2 | 中 |
| LawClick 集成接口 | P2 | 中 |

**交付物**:
- 知识图谱
- 智能问答
- 开放 API

---

## 附录

### A. 技术栈速查表

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端框架 | Next.js | 15.x |
| 前端语言 | TypeScript | 5.x |
| UI 组件 | shadcn/ui | latest |
| 样式 | Tailwind CSS | 4.x |
| 后端语言 | Rust | 1.75+ |
| Web 框架 | Axum | 0.7+ |
| 异步运行时 | Tokio | 1.x |
| 数据库 | PostgreSQL | 16 |
| 向量扩展 | pgvector | 0.7+ |
| 缓存 | Redis | 7.x |
| 工作流 | n8n | latest |
| 容器化 | Docker Compose | 3.9 |

### B. 目录结构

```
law-eye/
├── apps/                     # 前端应用
│   ├── web/                  # 主站
│   └── admin/                # 管理后台
├── packages/                 # 共享包
│   ├── ui/
│   ├── api-client/
│   ├── types/
│   └── config/
├── crates/                   # Rust 后端
│   ├── law-eye-api/
│   ├── law-eye-worker/
│   ├── law-eye-core/
│   ├── law-eye-crawler/
│   ├── law-eye-ai/
│   ├── law-eye-db/
│   ├── law-eye-queue/
│   └── law-eye-common/
├── config/                   # 配置文件
│   ├── sources.yaml
│   └── prompts/
├── docker/                   # Docker 配置
├── docs/                     # 文档
│   └── plans/
├── docker-compose.yml
├── Cargo.toml               # Rust workspace
├── package.json             # Node workspace
└── turbo.json
```

---

> **文档版本**: 1.0.0
> **最后更新**: 2025-01-17
> **状态**: 待开发
