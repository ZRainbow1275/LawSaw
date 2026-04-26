# SPEC-03 — AI 集成（SiliconFlow + 5 项能力）

**状态**: Draft v1.0  
**版本**: 1.0.0 / 2026-04-25  
**依赖**: `research/01-ai-integration.md`（完整 prompt 模板与 Rust 客户端骨架）, `crates/law-eye-ai/`, `crates/law-eye-core/src/{report,knowledge,ai_usage}.rs`

---

## 0. 关键发现（来自 research/03 §4）

> **AI 后端 100% 真实，无 mock**。`crates/law-eye-ai/` 已含 `EntityExtractor` / `Summarizer` / `Classifier` / `RiskAssessor` / `ImportanceAssessor` / `DomainClassifier` / `AuthorityDetector` / `TagExtractor`，全部走 OpenAI 兼容 LLM 真实调用 + 完整遥测。

**切换到 SiliconFlow 不需要改代码**，仅需环境变量：

```bash
LAW_EYE__AI__BASE_URL=https://api.siliconflow.cn/v1
LAW_EYE__AI__API_KEY=<from .env.local, never commit>
LAW_EYE__AI__MODEL=Qwen/Qwen3-8B
LAW_EYE__AI__EMBEDDING_MODEL=BAAI/bge-m3
LAW_EYE__AI__EMBEDDING_VECTOR_DIM=1024
LAW_EYE__AI__EMBEDDING_DIMENSION_STRATEGY=strict
LAW_EYE__AI__RERANK_MODEL=BAAI/bge-reranker-v2-m3
```

主要新增工作：

1. 新增 `/v1/rerank` 客户端方法（OpenAI 不兼容，需独立实现）
2. pgvector 列从 1536 → 1024 维迁移（migration 064）
3. 5 项能力的 prompt 模板版本化到 `crates/law-eye-prompts/`
4. UI 触点串联（详见 §3）

---

## 1. 五项 AI 能力（端到端契约）

### 1.1 报告生成（Report Generation）

**调用链**：

```
admin /admin/reports/new (UI)
  └─ POST /api/v1/admin/reports/generate { template_id, article_ids[], period }
      └─ outbox queue: report.generate
          └─ law-eye-worker
              ├─ ReportService::render_template (Handlebars)
              ├─ Summarizer::summarize_each (1-N article summaries)
              ├─ LlmGateway::chat_json::<ReportPayload> (master prompt — research/01 §2.1)
              └─ INSERT INTO reports (..., status='ready')
              └─ Webhook → /api/v1/admin/reports/{id}/notify
```

**Prompt**：见 `research/01-ai-integration.md` §2.1。落地为 `crates/law-eye-prompts/templates/report_v1.toml`，含 system + user + 1 个 few-shot + JSON Schema。

**输出契约**：

```typescript
interface ReportPayload {
  title: string;
  period: { start: string; end: string };
  sections: {
    core_dynamics: string;       // Markdown
    regulation_updates: string;  // Markdown
    industry_impact: string;     // Markdown
    risks: string;               // Markdown
    recommendations: string;     // Markdown
  };
  source_articles: string[];     // article ids referenced
  metadata: {
    generated_at: string;
    model: string;
    prompt_version: string;
    insufficient_input?: true;
  };
}
```

**UI**：
- `/admin/reports/new` — 选模板 + ≥ 5 篇文章 + 周期 → 提交 → spinner + 进度（30-60s）→ 跳 `/admin/reports/runs/{id}`
- `/reports/{id}` — 用户阅读，Markdown 渲染 + PDF 导出（premium+）

**降级**：LLM 超时 → 显示 partial 报告（含 `insufficient_input: true` flag）+ 重试按钮。

### 1.2 知识图谱抽取（KG Extraction）

**调用链**（已 LIVE，仅需 prompt 优化）：

```
crawler 入库 → outbox kg.extract
  └─ EntityExtractor::extract_entities
      └─ LlmGateway::chat_json::<EntityExtractionResult>
      └─ Embedder::embed_batch (实体名 → bge-m3 → dedup vs entities table)
      └─ INSERT entities + relations + article_entities
```

**Prompt**：research/01 §2.2，输出严格 JSON：

```json
{
  "entities": [
    {"type": "law|regulator|company|region|event", "name": "...", "aliases": ["..."], "confidence": 0.92}
  ],
  "relations": [
    {"from": "...", "to": "...", "type": "amends|enforces|targets|cites", "evidence": "原文片段"}
  ],
  "metadata": {"insufficient_input": false}
}
```

**Dedup 策略**：bge-m3 余弦相似度 ≥ 0.92 视为同一实体；admin 可在 `/admin/knowledge` 复审 / 合并。

**UI**：
- `/admin/knowledge` — 实体列表 + canvas（react-flow 或 echarts graph）
- `/knowledge`（user） — 只读查询 + 展开关系

### 1.3 情感分析（Sentiment）

**调用链**（部分实现，需补强）：

```
article 入库 → outbox sentiment.score
  └─ Sentiment::score (新增模块 crates/law-eye-ai/src/sentiment.rs)
      └─ chat_json::<SentimentResult>
      └─ UPDATE articles SET sentiment = $1, sentiment_score = $2, sentiment_rationale = $3
```

**Prompt**：research/01 §2.3。

**输出**：

```json
{
  "label": "positive|negative|neutral|mixed",
  "score": 0.78,
  "rationale": "...",
  "aspect": "regulatory_impact|company_reputation|policy_direction|other"
}
```

**Schema 新增**（migration 065）：

```sql
ALTER TABLE articles
    ADD COLUMN IF NOT EXISTS sentiment_score DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS sentiment_rationale TEXT,
    ADD COLUMN IF NOT EXISTS sentiment_aspect TEXT;
```

**UI**：
- 文章详情页右侧 AI Insights 卡片（需 `verified_user+`）
- `/analytics` "情感倾向" tab — 时间序列 + 分类分布

### 1.4 地域行业分析（Region/Industry Analytics）

**调用链**：

```
worker 周期 job (cron 1h) → region-industry.aggregate
  └─ SELECT region_code, domain_root, COUNT(*) FROM articles GROUP BY ...
  └─ chat_json::<RegionIndustryInsights> (Qwen3-8B 解读趋势)
  └─ INSERT INTO region_industry_insights ...
```

**Prompt**：research/01 §2.4。

**UI**：
- `/analytics` 主图（已存在）— 改读 `region_industry_insights` 缓存表
- 中国地图 ECharts geo + 按月切换

### 1.5 新闻总结（Article Summary）

**调用链**（已 LIVE）：

```
article 入库 → outbox article.summarize
  └─ Summarizer::summarize_three_tiers
      ├─ short doc：直接 chat_json
      └─ long doc (>4K)：map-reduce
          ├─ map：每 3K-token 窗口生成短摘要
          └─ reduce：合成 3 层级输出
  └─ UPDATE articles SET summary_one_sentence, summary_three_sentences, summary_key_points
```

**Prompt**：research/01 §2.5。

**Schema 新增**：

```sql
ALTER TABLE articles
    ADD COLUMN IF NOT EXISTS summary_one_sentence TEXT,
    ADD COLUMN IF NOT EXISTS summary_three_sentences TEXT,
    ADD COLUMN IF NOT EXISTS summary_key_points JSONB DEFAULT '[]'::jsonb;
```

**UI**：
- 文章卡 hover 显示 1 句摘要
- 阅读器顶部 collapsible 显示 3 句 + 关键点列表

---

## 2. SiliconFlowClient（Rust）

### 2.1 OpenAI 兼容部分（已可用）

`crates/law-eye-ai/src/gateway.rs` 现有 `LlmGateway` 已基于 `async-openai`，OpenAI 兼容端点（chat / embeddings）**零代码改动**，仅 env 切。

### 2.2 Rerank（新增）

新增 `crates/law-eye-ai/src/rerank.rs`：

```rust
pub struct RerankClient {
    http: reqwest::Client,
    base_url: String,
    api_key: String,
    timeout: Duration,
    breaker: Arc<CircuitBreaker>,
    semaphore: Arc<Semaphore>,        // 12 RPS for free tier
}

#[derive(Debug, Serialize)]
pub struct RerankRequest {
    pub model: String,
    pub query: String,
    pub documents: Vec<String>,
    pub top_n: u32,
    #[serde(default)]
    pub return_documents: bool,
}

#[derive(Debug, Deserialize)]
pub struct RerankResponse {
    pub id: String,
    pub results: Vec<RerankResult>,
}

#[derive(Debug, Deserialize)]
pub struct RerankResult {
    pub index: u32,
    pub relevance_score: f32,
    #[serde(default)]
    pub document: Option<String>,
}

impl RerankClient {
    pub async fn rerank(&self, req: RerankRequest) -> Result<RerankResponse> {
        // bearer auth + retry (3x exp backoff) + timeout (5s)
        // POST /v1/rerank
    }
}
```

详细实现参考 research/01 §5。

### 2.3 Pipeline 整合

`crates/law-eye-rag/src/lib.rs` 现有混合检索，扩展为：

```rust
pub async fn search(query: &str) -> Result<Vec<ScoredDoc>> {
    // 1. embed query
    let q_vec = embedder.embed(query).await?;
    // 2. recall: vector top-50 + BM25 top-30 → RRF → top-60
    let candidates = pgvector_search_top_k(q_vec, 50).await?
        .merge_rrf(bm25_search_top_k(query, 30).await?, 60);
    // 3. rerank top-10
    let docs: Vec<&str> = candidates.iter().map(|c| c.text.as_str()).collect();
    let reranked = rerank_client.rerank(RerankRequest {
        model: "BAAI/bge-reranker-v2-m3".into(),
        query: query.into(),
        documents: docs.iter().map(|s| s.to_string()).collect(),
        top_n: 10,
        return_documents: false,
    }).await?;
    // 4. 输出最终排序
    Ok(reranked.results.into_iter().map(|r| candidates[r.index as usize].clone()).collect())
}
```

---

## 3. 前端 Hook（apps/web/src/hooks/use-ai-*.ts）

### 3.1 已有 hook（沿用 / 扩展）

```typescript
// 已存在
useAiAvailability()              // GET /api/v1/ai/available
useAiInsights(articleId)         // GET /api/v1/articles/{id}/ai-insights
useAiGovernance()                // GET /api/v1/ai-usage/...

// 新增 / 扩展
useArticleSummary(articleId)     // 三档摘要
useReportGenerate()              // POST /api/v1/admin/reports/generate
useKgExtract(articleId)          // 触发抽取或读结果
useSentiment(articleId)          // 读情感
useRegionIndustryInsights(period)// 读聚合表
useReranked(query, docs)         // 通用 rerank（搜索 / RAG）
```

### 3.2 React Query 配置

```typescript
// 长 TTL（AI 结果几乎不变）
staleTime: 5 * 60 * 1000,       // 5 min
gcTime: 30 * 60 * 1000,
refetchOnWindowFocus: false,
```

### 3.3 状态徽章

每个 AI 调用 UI 触点显示状态：

| 状态 | 文案 (zh) | 视觉 |
|---|---|---|
| `loading` | "AI 分析中..." | spinner + skeleton |
| `success` | "AI 分析完成" | checkmark + 结果 |
| `degraded` | "AI 暂时不可用，显示规则推断结果" | amber badge + 数据 |
| `quota_exceeded` | "今日 AI 配额已用尽" | red badge |
| `insufficient_input` | "输入不足以分析" | gray badge |

---

## 4. AI Usage 配额 / 治理

复用 migration 059 `ai_usage_events` + 现有 `AiUsageService`。

### 4.1 UI

`/admin/ai-governance` 已存在（原 `/settings/admin/ai-usage`），扩展：

- 模型选择 dropdown（Qwen/Qwen3-8B / 其他备选）
- 提示词版本管理（`crates/law-eye-prompts/templates/*.toml` 列出 + diff 预览）
- 配额面板（每租户每日 token 限额）
- 用量图（按 feature × time 折线 + 饼图）

### 4.2 配额配置（后端）

```toml
# config/ai_quota.toml（每 tenant 默认）
[default]
report_generate_per_day = 10
kg_extract_per_day = 100
sentiment_per_day = 1000
summarize_per_day = 1000
rerank_per_day = 5000
embedding_per_day = 50000
```

超额返回 429 + `quota_exceeded` 错误。

---

## 5. 失败模式

复用 research/01 §7 的 12 个失败模式 + 应对。关键：

| 模式 | 检测 | 应对 |
|---|---|---|
| JSON 解析失败 | serde error | 重试 1 次 + 提示 "AI 输出格式异常"，记录 raw output |
| 幻觉实体 | confidence < 0.6 | 标记 `needs_review`，admin 在 `/admin/knowledge` 审核 |
| Prompt 注入 | 内容含 "ignore previous" 等模式 | 拒绝 + audit 记录 |
| 超长输入 | tokens > model limit | map-reduce 切窗 |
| 非中文输入 | langid 检测 | 不支持，返回 `unsupported_language` |
| PII 泄露 | 输出含中国身份证 / 手机号 regex | 调用方脱敏 + 日志告警 |
| 503 服务降级 | HTTP 503 | 5 次熔断 + 退避 + 降级到规则 |
| Quota exceeded | HTTP 429 | 不重试 > 1h；UI 提示 |

---

## 6. Migration 064 — bge-m3 1024 维

```sql
-- crates/law-eye-db/migrations/064_bge_m3_native_dim.sql
ALTER TABLE article_chunks ADD COLUMN IF NOT EXISTS embedding_v2 VECTOR(1024);
CREATE INDEX IF NOT EXISTS article_chunks_embedding_v2_hnsw
    ON article_chunks USING hnsw (embedding_v2 vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

ALTER TABLE entities ADD COLUMN IF NOT EXISTS embedding_v2 VECTOR(1024);
CREATE INDEX IF NOT EXISTS entities_embedding_v2_hnsw
    ON entities USING hnsw (embedding_v2 vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- backfill via worker job
INSERT INTO outbox_events (event_type, payload, scheduled_at)
SELECT 'embeddings.backfill', '{}'::jsonb, NOW() WHERE NOT EXISTS (
    SELECT 1 FROM outbox_events WHERE event_type = 'embeddings.backfill' AND status='pending'
);
```

回滚：DROP COLUMN embedding_v2 + DROP INDEX。

---

## 7. 验收

- [ ] env 变量切到 SiliconFlow，`/api/v1/ai/available` 返回 chat/embedding/rerank 全 OK
- [ ] `Qwen/Qwen3-8B` 真实调用至少 1 次（看 `ai_usage_events`）
- [ ] migration 064 应用，新 embedding 列生效
- [ ] §1 五项能力的 UI 触点全部可触发并返回真实数据
- [ ] §3.3 状态徽章覆盖 5 类状态
- [ ] §4.1 `/admin/ai-governance` 显示真实用量
- [ ] failure modes §5 至少 3 项有 e2e（quota / json-parse / 503）
- [ ] 全程 0 mock（grep `mock_|stub` in crates/law-eye-ai 仍为 0）
