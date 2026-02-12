# 03 - 架构设计：企业级爬虫系统蓝图

> 设计日期: 2026-02-10
> 设计目标: 面向大型公司 10 年以上商用的法律信息采集系统

---

## 1. 架构全景图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Layer 1: 数据源适配层                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│  │ RSS      │ │ Static   │ │ Dynamic  │ │ API      │ │ Custom   │     │
│  │ Adapter  │ │ Spider   │ │ Renderer │ │ Client   │ │ Adapter  │     │
│  │ (feed-rs)│ │ (scraper)│ │ (chrome) │ │ (reqwest)│ │ (plugin) │     │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘     │
│       └──────────┬──┴──────────┬─┴──────────┬──┘           │           │
│                  ▼             ▼             ▼              │           │
│  ┌─────────────────────────────────────────────────────────┐│           │
│  │              Encoding Detection & Conversion            ││           │
│  │              (encoding_rs + chardet)                     ││           │
│  └─────────────────────────┬───────────────────────────────┘│           │
└────────────────────────────┼────────────────────────────────┘           │
                             ▼                                            │
┌─────────────────────────────────────────────────────────────────────────┐
│                        Layer 2: 数据处理管线                            │
│                                                                         │
│  RawArticle                                                             │
│    │                                                                    │
│    ├─→ [1] HtmlCleaningStage        清洗HTML标签、修复编码               │
│    ├─→ [2] DeduplicationStage       标题+内容哈希去重                   │
│    ├─→ [3] ContentQualityStage      过滤广告/垃圾/无关内容              │
│    ├─→ [4] MetadataExtractionStage  正则提取: 发布机构/日期/文号        │
│    ├─→ [5] AiCategorizationStage    LLM分类: 八大领域+二级分类          │
│    ├─→ [6] AiSummaryStage           LLM生成: 结构化摘要                │
│    ├─→ [7] AiRiskScoringStage       LLM评估: 企业合规风险评分          │
│    ├─→ [8] ValidationStage          最终校验: 必填字段/格式/一致性      │
│    │                                                                    │
│    ▼                                                                    │
│  EnrichedArticle                                                        │
│                                                                         │
└─────────────────────────────┬───────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Layer 3: 调度与编排                              │
│                                                                         │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐      │
│  │   Scheduler      │  │   Task Queue     │  │   Rate Limiter   │      │
│  │   (cron-based    │  │   (Redis-backed  │  │   (per-domain    │      │
│  │    + priority)   │  │    with DLQ)     │  │    token bucket) │      │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘      │
│           │                     │                      │                │
│           └─────────────────────┼──────────────────────┘                │
│                                 ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    Worker Pool                                   │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │   │
│  │  │ Worker 1 │ │ Worker 2 │ │ Worker 3 │ │ Worker N │           │   │
│  │  │ (source  │ │ (source  │ │ (AI      │ │ (embed   │           │   │
│  │  │  sync)   │ │  sync)   │ │  enrich) │ │  backfil)│           │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────┬───────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Layer 4: 持久化与缓存                            │
│                                                                         │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐               │
│  │  PostgreSQL   │  │    Redis      │  │    MinIO      │               │
│  │  + pgvector   │  │  (缓存+队列) │  │  (快照存储)   │               │
│  │  (结构化数据) │  │               │  │               │               │
│  └───────────────┘  └───────────────┘  └───────────────┘               │
│                                                                         │
└─────────────────────────────┬───────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Layer 5: 可观测性                                │
│                                                                         │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐               │
│  │  Prometheus   │  │   Structured  │  │   Alerting    │               │
│  │  Metrics      │  │   Logging     │  │   Rules       │               │
│  │  (爬取指标)   │  │  (tracing)    │  │  (告警规则)   │               │
│  └───────────────┘  └───────────────┘  └───────────────┘               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 核心模块设计

### 2.1 数据源适配器架构 (Adapter Pattern)

**设计原则**：每个数据源类型一个适配器，统一输出 `RawArticle`。

```rust
/// 数据源适配器 trait — 所有适配器必须实现
#[async_trait]
pub trait SourceAdapter: Send + Sync {
    /// 适配器类型标识
    fn kind(&self) -> &'static str;

    /// 从数据源抓取文章列表
    async fn fetch(
        &self,
        source: &Source,
        last_synced_at: Option<DateTime<Utc>>,
    ) -> Result<Vec<RawArticle>>;

    /// 健康检查（可选）
    async fn health_check(&self, source: &Source) -> Result<HealthStatus> {
        Ok(HealthStatus::Unknown)
    }
}

/// 适配器注册表 — 运行时动态分发
pub struct AdapterRegistry {
    adapters: HashMap<String, Arc<dyn SourceAdapter>>,
}

impl AdapterRegistry {
    pub fn new() -> Self {
        let mut registry = Self { adapters: HashMap::new() };

        // 注册内置适配器
        registry.register(Arc::new(RssAdapter::new()));
        registry.register(Arc::new(StaticSpiderAdapter::new()));
        registry.register(Arc::new(DynamicSpiderAdapter::new()));
        registry.register(Arc::new(ApiAdapter::new()));

        // 注册法律专用适配器
        registry.register(Arc::new(NpcGovAdapter::new()));      // 国家法律法规数据库
        registry.register(Arc::new(CourtGovAdapter::new()));     // 最高人民法院
        registry.register(Arc::new(CsrcGovAdapter::new()));      // 证监会
        registry.register(Arc::new(CacGovAdapter::new()));       // 网信办

        registry
    }

    pub fn get(&self, kind: &str) -> Option<Arc<dyn SourceAdapter>> {
        self.adapters.get(kind).cloned()
    }
}
```

### 2.2 增强型数据模型

**数据库迁移设计**（新增字段到 `articles` 表 + 新建 `crawl_logs` 表）：

```sql
-- 迁移: 0013_crawler_enhancement.sql

-- 1. 增强 articles 表：新增法律领域字段
ALTER TABLE articles
    ADD COLUMN IF NOT EXISTS domain_root TEXT,
    ADD COLUMN IF NOT EXISTS domain_sub TEXT,
    ADD COLUMN IF NOT EXISTS authority_level INT,
    ADD COLUMN IF NOT EXISTS issuer TEXT,
    ADD COLUMN IF NOT EXISTS effective_date DATE,
    ADD COLUMN IF NOT EXISTS region_code TEXT,
    ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS risk_score INT,
    ADD COLUMN IF NOT EXISTS summary_struct JSONB,
    ADD COLUMN IF NOT EXISTS uuid_ref TEXT,
    ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- 2. 增强 sources 表：新增监控字段
ALTER TABLE sources
    ADD COLUMN IF NOT EXISTS priority INT NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS health_status TEXT NOT NULL DEFAULT 'unknown',
    ADD COLUMN IF NOT EXISTS last_error TEXT,
    ADD COLUMN IF NOT EXISTS consecutive_failures INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_articles_fetched BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS avg_fetch_duration_ms INT,
    ADD COLUMN IF NOT EXISTS render_mode TEXT NOT NULL DEFAULT 'static',
    ADD COLUMN IF NOT EXISTS encoding TEXT;

-- 3. 新建爬取日志表
CREATE TABLE crawl_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    source_id UUID NOT NULL REFERENCES sources(id),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running',
    articles_found INT NOT NULL DEFAULT 0,
    articles_new INT NOT NULL DEFAULT 0,
    articles_updated INT NOT NULL DEFAULT 0,
    articles_skipped INT NOT NULL DEFAULT 0,
    error_message TEXT,
    duration_ms INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_crawl_logs_source ON crawl_logs(tenant_id, source_id, started_at DESC);

-- 4. 内容去重索引
CREATE INDEX idx_articles_content_hash ON articles(tenant_id, content_hash)
    WHERE content_hash IS NOT NULL AND deleted_at IS NULL;

-- 5. 法律领域查询索引
CREATE INDEX idx_articles_domain ON articles(tenant_id, domain_root, domain_sub)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_articles_authority ON articles(tenant_id, authority_level)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_articles_region ON articles(tenant_id, region_code)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_articles_tags ON articles USING gin(tags)
    WHERE deleted_at IS NULL;
```

### 2.3 增强型 Pipeline 设计

```rust
/// 增强型文章结构（Pipeline 输出）
pub struct EnrichedArticle {
    // 基础字段（来自 RawArticle）
    pub title: String,
    pub link: String,
    pub content: Option<String>,
    pub author: Option<String>,
    pub published_at: Option<DateTime<Utc>>,

    // 法律元数据（Pipeline 提取）
    pub domain_root: Option<String>,
    pub domain_sub: Option<String>,
    pub authority_level: Option<i32>,
    pub issuer: Option<String>,
    pub effective_date: Option<NaiveDate>,
    pub region_code: Option<String>,
    pub tags: Vec<String>,
    pub risk_score: Option<i32>,
    pub summary_struct: Option<serde_json::Value>,
    pub uuid_ref: Option<String>,
    pub content_hash: Option<String>,
}

/// Pipeline 构建器
impl Pipeline {
    /// 构建标准法律文档处理管线
    pub fn legal_standard() -> Self {
        Self::new()
            .add_stage(HtmlCleaningStage)
            .add_stage(DeduplicationStage::new())
            .add_stage(ContentQualityStage::new())
            .add_stage(MetadataExtractionStage::new())
    }

    /// 构建 AI 增强管线（需要 LLM 客户端）
    pub fn legal_ai_enriched(ai_client: Arc<dyn AiClient>) -> Self {
        Self::legal_standard()
            .add_stage(AiCategorizationStage::new(ai_client.clone()))
            .add_stage(AiSummaryStage::new(ai_client.clone()))
            .add_stage(AiRiskScoringStage::new(ai_client))
            .add_stage(ValidationStage)
    }
}
```

### 2.4 编码检测模块

```rust
/// 多级编码检测与转换
pub struct EncodingDetector;

impl EncodingDetector {
    /// 三级检测策略
    pub fn detect_and_decode(
        bytes: &[u8],
        content_type_header: Option<&str>,
    ) -> Result<String> {
        // Level 1: HTTP Content-Type charset
        if let Some(charset) = Self::charset_from_header(content_type_header) {
            if let Ok(text) = Self::decode_with_charset(bytes, &charset) {
                return Ok(text);
            }
        }

        // Level 2: HTML meta charset
        let partial = String::from_utf8_lossy(&bytes[..bytes.len().min(2048)]);
        if let Some(charset) = Self::charset_from_html_meta(&partial) {
            if let Ok(text) = Self::decode_with_charset(bytes, &charset) {
                return Ok(text);
            }
        }

        // Level 3: 字节流编码嗅探 (encoding_rs)
        let (encoding, confidence) = Self::detect_encoding(bytes);
        if confidence > 0.5 {
            return Self::decode_with_encoding(bytes, encoding);
        }

        // Fallback: UTF-8 with replacement
        Ok(String::from_utf8_lossy(bytes).into_owned())
    }
}
```

### 2.5 反爬对抗模块

```rust
/// 请求配置增强
pub struct RequestConfig {
    /// User-Agent 轮换池
    pub user_agents: Vec<String>,
    /// 代理列表
    pub proxies: Vec<ProxyConfig>,
    /// 每域名请求间隔（毫秒）
    pub per_domain_delay_ms: u64,
    /// 每域名并发上限
    pub per_domain_concurrency: usize,
    /// 是否遵守 robots.txt
    pub respect_robots_txt: bool,
    /// Cookie Jar
    pub cookie_store: bool,
    /// 自定义 Headers
    pub custom_headers: HashMap<String, String>,
}

/// 域名级别速率限制器
pub struct DomainRateLimiter {
    limiters: DashMap<String, RateLimiter>,
    default_rate: Rate,
}

/// Robots.txt 缓存解析器
pub struct RobotsTxtCache {
    cache: DashMap<String, (RobotsTxt, Instant)>,
    ttl: Duration,
}
```

### 2.6 动态页面渲染集成

```rust
/// 渲染模式
pub enum RenderMode {
    /// 静态 HTML（reqwest 直接获取）
    Static,
    /// 动态渲染（通过 Browserless/Chrome DevTools Protocol）
    Dynamic {
        /// 等待的 CSS Selector（页面加载完成标志）
        wait_for_selector: Option<String>,
        /// 最大等待时间（毫秒）
        wait_timeout_ms: u64,
        /// 是否截图存档
        screenshot: bool,
        /// 额外的 JavaScript 执行脚本
        pre_scripts: Vec<String>,
    },
}

/// Browserless 客户端（通过 HTTP API 调用远程 Headless Chrome）
pub struct BrowserlessClient {
    endpoint: Url,
    api_token: Option<String>,
    http_client: Client,
}

impl BrowserlessClient {
    /// 渲染页面并返回最终 HTML
    pub async fn render_page(
        &self,
        url: &str,
        wait_for: Option<&str>,
        timeout_ms: u64,
    ) -> Result<RenderedPage> {
        // POST /content API
        // 返回渲染后的完整 HTML + 可选截图
    }
}
```

### 2.7 监控指标设计

```rust
/// Prometheus 爬虫指标
pub struct CrawlerMetrics {
    /// 爬取请求总数（按源、状态码分组）
    pub fetch_requests_total: IntCounterVec,
    /// 爬取请求延迟（按源分组）
    pub fetch_duration_seconds: HistogramVec,
    /// 新增文章数（按源分组）
    pub articles_ingested_total: IntCounterVec,
    /// 去重跳过数
    pub articles_deduplicated_total: IntCounter,
    /// Pipeline 处理延迟
    pub pipeline_duration_seconds: Histogram,
    /// AI 增强延迟
    pub ai_enrichment_duration_seconds: Histogram,
    /// 活跃爬取任务数
    pub active_crawl_tasks: IntGauge,
    /// 数据源健康状态
    pub source_health_status: IntGaugeVec,
    /// 连续失败计数
    pub source_consecutive_failures: IntGaugeVec,
}
```

---

## 3. 数据流转完整路径

```
1. Scheduler 根据 sources.sync_interval_secs 和 priority 触发爬取任务
    │
2. Worker 从 Redis 任务队列取出任务
    │
3. AdapterRegistry 根据 source.kind 分发到对应适配器
    │
    ├─→ RssAdapter: feed-rs 解析 RSS/Atom
    ├─→ StaticSpiderAdapter: reqwest + scraper 解析静态 HTML
    ├─→ DynamicSpiderAdapter: Browserless 渲染 + scraper 解析
    └─→ ApiAdapter: reqwest 调用 REST/GraphQL API
    │
4. EncodingDetector 检测并转换编码为 UTF-8
    │
5. Pipeline 多阶段处理:
    [1] HtmlCleaning → [2] Dedup → [3] Quality → [4] Metadata →
    [5] AiCategorize → [6] AiSummary → [7] AiRisk → [8] Validate
    │
6. 入库: INSERT INTO articles (去重: ON CONFLICT tenant_id,link)
    │
7. 后续处理:
    ├─→ 生成向量嵌入 (embedding backfill worker)
    ├─→ 知识图谱关联 (knowledge graph worker)
    ├─→ 触发 Webhook 通知
    └─→ 触发推送通知
    │
8. 记录 crawl_logs (爬取日志)
    │
9. 更新 sources 统计 (last_synced_at, health_status, total_articles_fetched)
    │
10. Prometheus 指标上报
```

---

## 4. 容错与恢复设计

### 4.1 三级错误处理

| 级别 | 场景 | 处理策略 |
|------|------|----------|
| **L1 - 请求级** | HTTP 超时/429/5xx | 指数退避重试（已有），最多3次 |
| **L2 - 源级** | 连续 N 次爬取失败 | 标记源为 `degraded`，延长间隔，告警 |
| **L3 - 系统级** | Worker 崩溃/DB 不可用 | 任务自动重入队列，Worker 自愈重启 |

### 4.2 死信队列 (DLQ)

```
正常队列: crawler:tasks
  │
  ├─→ 处理成功 → 标记完成
  ├─→ 暂时失败 → 退避重试（最多 5 次）
  └─→ 永久失败 → 移入 crawler:dlq
                     │
                     └─→ 人工审查 / 定期重试
```

### 4.3 断点续传

```rust
/// 爬取检查点（存储在 Redis）
pub struct CrawlCheckpoint {
    pub source_id: Uuid,
    pub page_number: i32,
    pub last_processed_url: String,
    pub articles_processed: i32,
    pub started_at: DateTime<Utc>,
}
```

---

## 5. 安全合规设计

### 5.1 SSRF 防护（已有，保持）
- `validate_outbound_url` 阻止内网地址访问
- 可配置 `ALLOW_INTERNAL_SOURCE_URLS` 用于开发环境

### 5.2 robots.txt 遵守（新增）
- 缓存解析 robots.txt（TTL 24h）
- 检查 User-Agent 和路径是否允许
- Crawl-Delay 遵守

### 5.3 请求频率合规
- 每域名 Token Bucket 限速
- 默认 1 req/sec，可按域名配置
- 尊重 HTTP 429 Retry-After 头

### 5.4 数据隐私
- 不采集非公开数据（需要登录的内容仅在授权后采集）
- 采集的个人信息遵守 GDPR/PIPL 规范
- 数据保留期限可配置

---

## 6. 扩展性设计

### 6.1 插件化适配器
- 新增数据源只需实现 `SourceAdapter` trait
- 通过 `AdapterRegistry` 动态注册
- 配置驱动：`sources.kind` 字段即为适配器标识

### 6.2 Pipeline 可组合
- 每个 Stage 独立实现 `PipelineStage` trait
- 支持按数据源类型组合不同的 Pipeline
- AI 阶段可选（降低成本时可跳过）

### 6.3 水平扩展
- Worker 支持多实例部署（通过 Redis 任务队列协调）
- `FOR UPDATE SKIP LOCKED` 保证任务不重复处理
- Worker ID 唯一标识，支持锁超时自动释放
