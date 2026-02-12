# 01 - 现状审计：现有爬虫代码全面分析

> 审计日期: 2026-02-10
> 审计范围: crates/law-eye-crawler, crates/law-eye-worker, crates/law-eye-core, crates/law-eye-db, crates/law-eye-api

---

## 1. 代码文件清单与功能概述

### 1.1 爬虫核心层 (`crates/law-eye-crawler/src/`)

| 文件 | 行数 | 功能 | 实现完整度 |
|------|------|------|------------|
| `lib.rs` (L1-7) | 7 | 模块导出：Pipeline, RawArticle, RssFetcher, SpiderConfig, WebSpider | ✅ 完整 |
| `spider.rs` (L1-675) | 675 | 网页爬虫核心：HTTP 抓取 + HTML CSS Selector 解析 | ⚠️ 基础功能完整，缺少高级特性 |
| `rss.rs` (L1-70) | 70 | RSS/Atom Feed 解析器 | ✅ 功能完整 |
| `pipeline.rs` (L1-74) | 74 | 数据处理管线框架 + 基础清洗 | ⚠️ 框架完整，但只有一个 CleaningStage |

### 1.2 Worker 调度层 (`crates/law-eye-worker/src/`)

| 文件 | 功能 | 实现完整度 |
|------|------|------------|
| `main.rs` (~1500行) | Worker 全部逻辑集中在此：队列定义、Ingest/AI/Push 三队列处理、维护任务、健康检查 HTTP 服务 | ✅ 调度框架完整 |

**⚠️ 修正说明**：Worker 逻辑全部在 `main.rs` 中（非 `worker.rs`），包含：
- 三级队列：`queue:ingest`（10min可见性）、`queue:ai`（20min）、`queue:push`（5min）
- AI 降级规则引擎：关键词分类/截断摘要/关键词风险评分/关键词标签提取（L77-251）
- Worker 健康检查 HTTP 服务（端口 3002，`/health/live` + `/health/ready`）
- 错误消息脱敏（过滤含 token/password/secret 的信息，L455-489）

### 1.3 数据库层 (`crates/law-eye-db/`)

| 迁移文件 | 功能 |
|----------|------|
| `0001_initial.sql` | 初始表结构：tenants, users, sources, articles, categories 等 |
| `0002_knowledge.sql` | 知识图谱表：knowledge_entities, knowledge_relations |
| `0003_feedback.sql` | 反馈表 |
| `0004_objects.sql` | 对象存储表 |
| `0005_webhooks.sql` | Webhook 端点和事件表 |
| `0006_push.sql` | Web Push 订阅表 |
| `0007_apikeys.sql` | API Key 表 |
| `0008_ai.sql` | AI 处理表：article_embeddings, ai_summaries |
| `0009_audit.sql` | 审计日志表 |
| `0010_domain_events.sql` | 领域事件表 |
| `0011_queue_outbox.sql` | 队列 Outbox 表 |
| `0012_article_revisions.sql` | 文章版本历史表 |

### 1.4 业务逻辑层 (`crates/law-eye-core/src/`)

| 文件 | 功能 | 与爬虫的关系 |
|------|------|-------------|
| `source.rs` | 数据源 CRUD 业务逻辑 | 直接关联：定义了数据源的创建、更新、删除 |
| `article.rs` + `article/service.rs` | 文章业务逻辑（创建、更新、查询、AI摘要、嵌入生成） | 直接关联：爬取结果的最终落地 |
| `tenant.rs` | 多租户支持 | 间接关联：所有数据隔离在租户下 |

### 1.5 API 路由层 (`crates/law-eye-api/src/routes/`)

| 文件 | 功能 |
|------|------|
| `sources.rs` | 数据源管理 API：CRUD + 手动触发同步 |
| `articles.rs` | 文章 API：列表、详情、搜索 |

---

## 2. 核心模块详细分析

### 2.1 WebSpider (`spider.rs`)

**架构**：单一 `WebSpider` struct，持有一个 `reqwest::Client`。

**核心流程**：
```
fetch(url, config, allow_internal)
  → validate_outbound_url (SSRF 防护)
  → fetch_html_with_retry (指数退避重试)
  → Html::parse_document (静态 HTML 解析)
  → 遍历 list_selector 匹配的元素
    → 提取 title (title_selector)
    → 提取 link (link_selector)
    → 如果有 content_selector/date_selector
      → fetch_detail_fields (访问详情页)
    → 构建 RawArticle
```

**已实现的能力**：
- CSS Selector 配置化解析（list/title/link/content/date 五个 selector）
- 指数退避重试（429/5xx 状态码 + 网络错误），最大重试 3 次
- 可配置的请求间延迟（`delay_ms`），防止对目标站点造成压力
- 相对链接自动拼接为绝对链接
- 详情页抓取失败时优雅降级（仅保留列表页数据）
- SSRF 防护（`validate_outbound_url` 校验出站 URL）
- 多种日期格式解析（RFC3339, RFC2822, 常见日期格式）

**缺失的能力**（关键缺陷）：
1. **无 JavaScript 渲染支持** — 只能解析静态 HTML，无法处理 SPA/动态渲染页面
2. **无代理池** — 单一 IP 出口，容易被封禁
3. **无请求头定制** — User-Agent 固定为 `LawEye/1.0`，无浏览器指纹模拟
4. **无 Cookie/Session 管理** — 无法处理需要登录的数据源
5. **无编码检测** — 假设 UTF-8，中国政府网站常用 GBK/GB2312
6. **无分页支持** — 只能抓取单页列表
7. **无 robots.txt 检查** — 未实现合规性检查
8. **无 Sitemap 支持** — 无法利用 sitemap.xml 发现页面
9. **无增量爬取** — 无 Last-Modified/ETag/If-Modified-Since 支持
10. **无并发控制** — 列表内文章串行抓取（仅有延迟控制）

### 2.2 RssFetcher (`rss.rs`)

**架构**：单一 `RssFetcher` struct，使用 feed-rs 库。

**已实现**：
- RSS 2.0 和 Atom Feed 解析
- 提取 title、link、content(summary/body)、author、published_at
- SSRF 防护

**缺失**：
1. **无重试机制** — 不同于 WebSpider，RssFetcher 无重试
2. **无条件请求** — 无 ETag/Last-Modified 缓存
3. **无 Feed 自动发现** — 无法从网页 HTML 中自动发现 RSS 链接
4. **无 Feed 格式修复** — 许多中国网站的 RSS 不标准，需要修复

### 2.3 Pipeline (`pipeline.rs`)

**架构**：基于 trait 的管线模式，支持任意 `PipelineStage` 组合。

**已实现**：
- `Pipeline` 框架：`add_stage()`, `process()`, `process_batch()`
- `CleaningStage`：HTML 标签清除（br/p 转换 + 正则移除标签）

**严重缺失**：
1. **无去重阶段** — Pipeline 中无去重逻辑（去重依赖数据库 `link UNIQUE`）
2. **无分类阶段** — 无法自动分类到八大领域
3. **无 AI 增强阶段** — 无 LLM 摘要/结构化提取
4. **无内容质量评估** — 无垃圾/广告过滤
5. **无元数据提取** — 无发布机构、法律层级、行政区划等关键信息提取
6. **无中文特殊处理** — 无中文分词、繁简转换

### 2.4 Worker 调度 (`main.rs`)

**⚠️ 重要修正**：Worker 逻辑全部在 `main.rs` 中（~1500行），不存在独立的 `worker.rs`。

**三级队列架构**：
```
Worker 主循环 (while loop):
  → 维护任务 (每15秒):
    → process_delayed_tasks()
    → requeue_stuck_tasks()           // 超时任务重入队（每批200条）
    → flush_queue_outbox_all_tenants()
    → flush_webhook_events_all_tenants()
  → queue:ingest (可见性10min, 超时8min, 每批reserve 5条)
    → 根据 source_type 调用 RssFetcher 或 WebSpider
    → Pipeline 清洗
    → upsert_many 批量入库 (ON CONFLICT tenant_id,link)
    → 新文章 → AiTask 入 queue:ai
    → 更新 source.last_fetch / last_error
    → 发出领域事件 source.ingested
  → queue:ai (可见性20min, 超时10min, 每批reserve 1条)
    → AiTaskType: Classify/Summarize/RiskAssess/ExtractTags/Embed/Full
    → AI 降级规则引擎 (见下方)
  → queue:push (可见性5min, 超时1min, 每批reserve 1条)
  → 对象存储清理 (定期)
```

**已实现（比预期更完整）**：
- Redis 三级队列架构（Ingest/AI/Push），含可见性超时和死锁检测
- RSS 和 Spider 两种采集模式
- 基础的 Pipeline 清洗
- `ON CONFLICT (tenant_id, link) DO UPDATE` 智能去重（仅当字段实际变化才写入）
- **AI 全量处理**: 分类 → 摘要 → 风险评估 → 标签提取 → 嵌入生成
- **AI 降级规则引擎** (L77-251): 当 AI 服务不可用时自动回退：
  - `ai_fallback_classify`: 基于中文关键词匹配分类（立法/监管/执法等）
  - `ai_fallback_summary`: 截取内容前300字符作为摘要
  - `ai_fallback_risk`: 基于关键词累加风险分数（处罚+15, 刑事+25 等）
  - `ai_fallback_tags`: 基于关键词提取标签
- AI 速率限制处理（检测 429/rate_limit，触发延迟重试，L438-450）
- Worker 健康检查 HTTP 服务（端口 3002）
- 错误消息脱敏（过滤含 token/password/secret 的信息，L455-489）
- 向量嵌入回填
- 租户隔离的任务处理（RLS `set_config('app.tenant_id')`）
- 领域事件 + Queue Outbox + Webhook 投递（完整的事件驱动架构）

**⚠️ 关键问题**：
1. **`source.schedule` 字段未被消费** — 数据库和 API 都支持存储调度表达式，但 Worker 内部没有解析 schedule 进行定时调度的代码。**定时调度完全依赖外部 n8n 工作流**
2. **n8n 工作流 API 端点不匹配** — `rss-crawler.json` 调用 `/api/sources/{id}/crawl`，但实际 API 路由是 `/api/v1/sources/{id}/fetch`
3. **n8n 需要显式启用** — 在 `profiles: ["n8n"]` 下，需要 `docker compose --profile n8n up`
4. **无并行爬取** — Ingest 队列每次 reserve 5 条，但处理仍为串行
5. **无爬取指标监控** — 无 Prometheus metrics 导出

---

## 3. 数据库表结构分析

### 3.1 `sources` 表

```sql
CREATE TABLE sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('rss', 'spider', 'api')),  -- 注意: 'api' 被 API 层显式阻止
    config JSONB NOT NULL DEFAULT '{}',       -- SpiderConfig (selectors等)
    schedule TEXT,                            -- 调度表达式（⚠️ 存储但未被 Worker 消费）
    priority INT NOT NULL DEFAULT 5,          -- 0-100 优先级（已有）
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_fetch TIMESTAMPTZ,                   -- 最后抓取时间（已有）
    last_error TEXT,                          -- 最后错误信息（已有）
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,                   -- 软删除（migration 016）
    UNIQUE(tenant_id, url) WHERE deleted_at IS NULL  -- 条件唯一约束（migration 027）
);
```

**⚠️ 修正说明（基于深入调研）**：
- 实际上 `priority`、`last_error` 字段**已存在**（初始迁移即包含）
- `schedule` 字段已存在但**未被 Worker 内部消费**（定时调度完全依赖外部 n8n）
- `api` 类型在数据库 CHECK 约束中允许，但 API 创建端点**显式拒绝**（`sources.rs` L636-641）
- 唯一约束为条件唯一（`WHERE deleted_at IS NULL`），支持软删除后重新创建同 URL 数据源
- 缺少：健康状态字段、爬取统计、渲染模式、编码配置

### 3.2 `articles` 表

```sql
CREATE TABLE articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    source_id UUID NOT NULL REFERENCES sources(id),
    category_id UUID REFERENCES categories(id),
    title TEXT NOT NULL,
    link TEXT NOT NULL,
    content TEXT,
    summary TEXT,                             -- AI 摘要
    author TEXT,
    published_at TIMESTAMPTZ,
    risk_score INT CHECK (risk_score BETWEEN 0 AND 100),    -- 风险评分（已有！0-100）
    importance INT CHECK (importance BETWEEN 1 AND 5),       -- 重要性（已有！1-5）
    sentiment TEXT CHECK (sentiment IN ('positive','negative','neutral','mixed')),
    ai_metadata JSONB DEFAULT '{}',           -- AI 元数据（已有！）
    tags TEXT[],                              -- 标签数组（已有！后续迁移添加）
    keywords TEXT[],                          -- 关键词数组（已有！后续迁移添加）
    ai_processed_at TIMESTAMPTZ,              -- AI 处理时间戳
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','processing','published','archived','rejected')),
    version BIGINT DEFAULT 1,                 -- 乐观并发控制（migration 015）
    deleted_at TIMESTAMPTZ,                   -- 软删除
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, link)
);
-- 触发器: bump_version_column 每次 UPDATE 自动递增 version
```

**⚠️ 修正说明（基于深入调研）**：
- 实际上 `risk_score`(0-100)、`importance`(1-5)、`sentiment`、`ai_metadata` **已存在**于初始迁移
- `tags`、`keywords`、`ai_processed_at` 通过后续迁移添加
- 乐观并发控制 `version` + 触发器自增（migration 015）
- 状态枚举比预期更丰富：`pending → processing → published/archived/rejected`
- **数据大小限制**（article.rs L9-11）：标题 8KB、摘要 256KB、内容 4MB
- 仍缺少：法律特有字段（发布机构 issuer、法律层级 authority_level、行政区划 region_code、
  生效日期 effective_date、结构化摘要 summary_struct、domain_root/domain_sub）

---

## 4. 前端现状

### 4.1 数据源管理页 (`apps/web/src/app/[locale]/sources/page.tsx`)

**已实现**：
- 数据源列表展示（名称、URL、类型、同步间隔、最后同步时间）
- 创建/编辑/删除数据源
- 手动触发同步按钮
- Spider 类型的 CSS Selector 配置表单

**缺失**：
- 无爬取状态监控面板
- 无爬取历史/日志查看
- 无批量操作
- 无数据源健康检查指示器
- 无数据源分组/分类

---

## 5. 测试覆盖分析

### 5.1 已有测试 (`spider.rs` 内的 `#[cfg(test)]`)

| 测试名 | 覆盖场景 |
|--------|----------|
| `fetch_falls_back_when_detail_request_fails` | 详情页抓取失败时的优雅降级 |
| `fetch_extracts_detail_content_and_published_at_when_detail_request_succeeds` | 详情页正常提取 |
| `fetch_skips_invalid_optional_detail_selector` | 无效 Selector 的容错处理 |
| `delay_duration_only_applies_after_first_item` | 延迟控制逻辑 |
| `retry_delay_is_exponential_and_capped` | 重试延迟指数退避 |
| `fetch_applies_delay_between_items` | 请求间延迟 |

**测试方式**：内置 TestServer（TCP 服务器模拟），真实 HTTP 请求测试。

**缺失的测试**：
- 无 RssFetcher 测试
- 无 Pipeline 测试
- 无 Worker 调度集成测试
- 无端到端爬取测试（数据源 → 爬取 → 入库 → API 查询）
- 无中文编码测试
- 无大数据量性能测试

---

## 6. 总结：现状评级（修正版）

| 维度 | 评分 (1-10) | 说明 |
|------|-------------|------|
| **基础架构** | 8/10 | Rust 技术栈选型优秀，三级队列+事件驱动架构成熟 |
| **静态 HTML 爬取** | 6/10 | CSS Selector 配置化解析，但缺少编码检测/分页/并发 |
| **RSS 订阅** | 7/10 | feed-rs 库使用正确，基本功能完整 |
| **数据管线** | 3/10 | 仅有 HTML 标签清除，严重不足 |
| **AI 处理链** | 6/10 | 分类/摘要/风险/标签/嵌入全流程+降级规则引擎（比预期完整） |
| **调度系统** | 4/10 | Worker 队列消费完整，但 schedule 字段未消费，依赖外部 n8n（且端点不匹配） |
| **数据模型** | 5/10 | 已有 risk_score/importance/tags/keywords/ai_metadata，缺少法律专用字段 |
| **去重机制** | 7/10 | 多层去重（数据源URL/文章link/AI任务dedupe_key/Outbox dedupe_key） |
| **反爬对抗** | 1/10 | 几乎为零 |
| **动态渲染** | 0/10 | 完全无 JS 渲染能力 |
| **监控告警** | 3/10 | Worker 健康检查已有，但无 Prometheus metrics/告警 |
| **测试覆盖** | 4/10 | Spider 有单元测试，其他模块缺失 |
| **生产就绪度** | 4/10 | 比预期高（AI降级+健康检查+错误脱敏），但仍需大量工作 |

**总体评价（修正）**：项目的爬虫基础架构比初始评估更成熟——三级队列、AI降级规则引擎、
多层去重、Worker 健康检查、错误消息脱敏等企业级特性已经具备。核心瓶颈集中在：
1. 无法处理 JS 渲染页面（P0）
2. 无编码检测（P0）
3. Pipeline 只有 HTML 清洗（P0）
4. 无法律领域专用数据源适配器（P0）
5. schedule 字段未消费 + n8n 端点不匹配（调度链断裂）

---

## 7. 补充发现（深入调研后新增）

### 7.1 n8n 工作流问题

| 工作流文件 | 问题 | 严重度 |
|-----------|------|--------|
| `rss-crawler.json` | 调用 `/api/sources/{id}/crawl`，实际路由是 `/api/v1/sources/{id}/fetch` | 🔴 不可用 |
| `daily-digest.json` | 调用 `/api/email/render` 和 `/api/articles`（缺少 v1 前缀） | 🔴 不可用 |
| Docker 配置 | n8n 在 `profiles: ["n8n"]` 下，需显式 `--profile n8n` 启用 | ⚠️ 易忽略 |

### 7.2 已有但未被充分利用的能力

| 能力 | 现状 | 建议 |
|------|------|------|
| `source.schedule` 字段 | 存储但未消费 | Worker 内部实现 cron 解析，去除 n8n 依赖 |
| `source.priority` 字段 | 数据库已有(0-100) | Worker 调度时按优先级排序 |
| `source.last_error` 字段 | 数据库已有 | 前端展示+连续失败告警 |
| `article.risk_score` | 已有(0-100) | AI 填充 + 前端高亮 |
| `article.tags/keywords` | 已有(TEXT[]) | AI 填充 + 前端筛选 |
| `article.ai_metadata` | 已有(JSONB) | 存储法律专用元数据 |
| AI 降级规则引擎 | Worker 已实现 | 增强关键词词典+规则 |

### 7.3 ArticleService 已有高级能力

- **批量 Upsert**: `ON CONFLICT (tenant_id, link) DO UPDATE`，仅字段变化才写入（L262-270 WHERE 子句）
- **全文搜索**: PostgreSQL `to_tsvector` + `plainto_tsquery`，带归一化评分
- **统计 API**: 总数/已发布/待处理/高风险/今日新增
- **趋势分析**: 按天统计文章数量（最多90天）
- **分析摘要**: 按状态/风险/情感分布统计

这些能力在爬虫增强后可以直接复用，无需重建。
