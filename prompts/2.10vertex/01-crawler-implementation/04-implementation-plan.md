# 04 - 实施计划：分批次开发路线图

> 制定日期: 2026-02-10
> 原则: 每批次完成 → 回归测试通过 → 更新文档 → 进入下一批次

---

## 总体节奏

| 批次 | 名称 | 核心交付物 | 前置依赖 |
|------|------|-----------|----------|
| **Batch 0** | 基础设施升级 | 数据模型迁移 + 编码检测 | 无 |
| **Batch 1** | Pipeline 增强 | 去重/清洗/质量评估阶段 | Batch 0 |
| **Batch 2** | 动态渲染集成 | Browserless/CDP 集成 | Batch 0 |
| **Batch 3** | 核心数据源适配 | 前 10 个法律信息源适配器 | Batch 0-2 |
| **Batch 4** | AI 增强管线 | 分类/摘要/风险评分/元数据提取 | Batch 0-1 |
| **Batch 5** | 反爬对抗 | 代理池/指纹伪装/robots.txt | Batch 2 |
| **Batch 6** | 增量与并发 | 增量爬取 + 并发控制 + 分页 | Batch 3 |
| **Batch 7** | 可观测性 | 监控指标 + 告警 + 爬取日志 | Batch 1-6 |
| **Batch 8** | 扩展数据源 | 后 10+ 个扩展信息源 | Batch 3 |
| **Batch 9** | 全面测试 | E2E + 集成 + 性能 + 压力测试 | All |

---

## Batch 0: 基础设施升级

### 目标
为后续所有批次打下数据模型和编码处理的基础。

### 交付物

#### 0.1 数据库迁移 `0013_crawler_enhancement.sql`

**修改文件**：
- `crates/law-eye-db/migrations/0013_crawler_enhancement.sql` (新建)

**内容**：
- `articles` 表新增法律领域字段 (domain_root, domain_sub, authority_level, issuer, effective_date, region_code, tags, risk_score, summary_struct, uuid_ref, content_hash)
- `sources` 表新增监控字段 (priority, health_status, last_error, consecutive_failures, total_articles_fetched, avg_fetch_duration_ms, render_mode, encoding)
- 新建 `crawl_logs` 表（爬取日志）
- 新建索引

#### 0.2 编码检测模块

**修改文件**：
- `crates/law-eye-crawler/src/encoding.rs` (新建)
- `crates/law-eye-crawler/src/lib.rs` (添加 mod encoding)
- `crates/law-eye-crawler/src/spider.rs` (使用编码检测替代 .text())
- `crates/law-eye-crawler/Cargo.toml` (添加 encoding_rs 依赖)

**逻辑**：
1. `response.bytes()` 获取原始字节
2. 三级编码检测：HTTP Header charset → HTML meta charset → 字节嗅探
3. `encoding_rs` 转换为 UTF-8

#### 0.3 数据模型更新

**修改文件**：
- `crates/law-eye-db/src/` 中的相关查询文件（适配新字段）
- `crates/law-eye-core/src/article.rs` (添加新字段到业务模型)
- `crates/law-eye-api/src/routes/articles.rs` (API 响应包含新字段)
- `apps/web/src/lib/api/types.ts` (前端类型定义更新)

### 回归测试要点
- [ ] 数据库迁移成功执行，无数据丢失
- [ ] 现有 articles CRUD API 正常工作
- [ ] 现有 sources CRUD API 正常工作
- [ ] 编码检测模块单元测试通过（GBK/GB2312/UTF-8 三种编码）
- [ ] 现有 spider.rs 测试全部通过

---

## Batch 1: Pipeline 增强

### 目标
将数据处理管线从单一清洗阶段扩展为完整的多阶段处理链。

### 交付物

#### 1.1 增强型 HtmlCleaningStage

**修改文件**：
- `crates/law-eye-crawler/src/pipeline.rs` (增强现有 CleaningStage)

**增强内容**：
- 保留有意义的 HTML 结构（标题层级、列表、表格）
- 处理 HTML 实体编码（&amp; &lt; 等）
- 规范化空白字符
- 处理中文特殊标点

#### 1.2 DeduplicationStage

**新建文件**：
- `crates/law-eye-crawler/src/stages/dedup.rs`

**逻辑**：
- 基于标题 SimHash 相似度去重（阈值可配置）
- 基于内容 MD5 哈希去重
- 在 Pipeline 内存中维护已处理集合
- 与数据库 content_hash 联合去重

#### 1.3 ContentQualityStage

**新建文件**：
- `crates/law-eye-crawler/src/stages/quality.rs`

**逻辑**：
- 内容长度检查（过滤空内容或过短内容）
- 关键词黑名单过滤（广告词、垃圾词）
- 内容与标题相关性检查
- 输出质量评分

#### 1.4 MetadataExtractionStage

**新建文件**：
- `crates/law-eye-crawler/src/stages/metadata.rs`

**逻辑**：
- 正则提取发布机构（如：`国务院`、`最高人民法院`）
- 正则提取法律文号（如：`国发〔2026〕1号`）
- 正则提取生效日期
- 规则引擎匹配行政区划码

#### 1.5 模块重构

**修改文件**：
- `crates/law-eye-crawler/src/stages/mod.rs` (新建，统一导出)
- `crates/law-eye-crawler/src/pipeline.rs` (重构为使用 stages 模块)
- `crates/law-eye-crawler/src/lib.rs` (更新导出)

### 回归测试要点
- [ ] Pipeline 单元测试全部通过
- [ ] 每个 Stage 独立测试通过
- [ ] Pipeline 组合测试通过（标准管线 + AI 管线）
- [ ] 现有 Worker source_sync 流程正常工作
- [ ] 中文内容清洗测试通过
- [ ] 去重逻辑测试通过（相似标题、相同内容哈希）

---

## Batch 2: 动态渲染集成

### 目标
使爬虫能够处理 JavaScript 渲染的页面。

### 交付物

#### 2.1 Browserless 客户端

**新建文件**：
- `crates/law-eye-crawler/src/browser.rs`

**逻辑**：
- 通过 HTTP API 调用 Browserless 服务
- 支持 `/content` API（获取渲染后 HTML）
- 支持 `/screenshot` API（截图存档）
- 支持 `waitForSelector` 等待条件
- 超时控制和错误处理

#### 2.2 DynamicSpiderAdapter

**新建文件**：
- `crates/law-eye-crawler/src/adapters/dynamic_spider.rs`

**逻辑**：
- 使用 BrowserlessClient 渲染页面
- 渲染后的 HTML 交给 scraper 解析（复用 CSS Selector 逻辑）
- 支持配置等待条件和超时

#### 2.3 Docker 集成

**修改文件**：
- `docker-compose.yml` (添加 browserless 服务)
- `.env.example` (添加 BROWSERLESS 相关环境变量)

```yaml
browserless:
  image: browserless/chrome:latest
  restart: unless-stopped
  ports:
    - "3002:3000"
  environment:
    - MAX_CONCURRENT_SESSIONS=5
    - CONNECTION_TIMEOUT=60000
    - PREBOOT_CHROME=true
  profiles: ["crawler"]
```

#### 2.4 SpiderConfig 扩展

**修改文件**：
- `crates/law-eye-crawler/src/spider.rs` (扩展 SpiderConfig)

```rust
pub struct SpiderConfig {
    // 现有字段保持不变
    pub list_selector: String,
    pub title_selector: String,
    pub link_selector: String,
    pub content_selector: Option<String>,
    pub date_selector: Option<String>,
    pub delay_ms: Option<u64>,
    // 新增字段
    pub render_mode: Option<String>,        // "static" | "dynamic"
    pub wait_for_selector: Option<String>,  // 动态渲染等待条件
    pub wait_timeout_ms: Option<u64>,       // 等待超时
    pub pagination: Option<PaginationConfig>, // 分页配置
}
```

### 回归测试要点
- [ ] Browserless 服务启动正常
- [ ] 动态渲染获取 JavaScript 渲染后的完整 HTML
- [ ] 静态爬取（render_mode=static）行为不变
- [ ] 截图功能正常（保存到 MinIO）
- [ ] 超时处理正常
- [ ] Docker Compose 启动无冲突

---

## Batch 3: 核心数据源适配

### 目标
为前 10 个核心法律信息源创建专用适配器。

### 交付物

#### 3.1 适配器框架

**新建文件**：
- `crates/law-eye-crawler/src/adapters/mod.rs`
- `crates/law-eye-crawler/src/adapters/registry.rs`
- `crates/law-eye-crawler/src/adapters/rss.rs` (从 rss.rs 迁移)
- `crates/law-eye-crawler/src/adapters/static_spider.rs` (从 spider.rs 重构)
- `crates/law-eye-crawler/src/adapters/api_client.rs`

#### 3.2 法律专用适配器

**每个适配器一个文件**：
- `adapters/npc_gov.rs` — 全国人大网 (npc.gov.cn)
- `adapters/flk_npc.rs` — 国家法律法规数据库 (flk.npc.gov.cn) [需动态渲染]
- `adapters/court_gov.rs` — 最高人民法院 (court.gov.cn)
- `adapters/csrc_gov.rs` — 证监会 (csrc.gov.cn)
- `adapters/cbirc_gov.rs` — 银保监会
- `adapters/cac_gov.rs` — 网信办 (cac.gov.cn)
- `adapters/moj_gov.rs` — 司法部 (moj.gov.cn)
- `adapters/samr_gov.rs` — 市场监管总局 (samr.gov.cn)
- `adapters/miit_gov.rs` — 工信部 (miit.gov.cn)
- `adapters/pbc_gov.rs` — 中国人民银行 (pbc.gov.cn)

#### 3.3 数据源配置种子数据

**新建文件**：
- `crates/law-eye-db/seeds/sources.sql` (默认数据源配置)

### 回归测试要点
- [ ] 每个适配器能从真实数据源抓取至少 5 篇文章
- [ ] 抓取的文章标题、链接、内容非空
- [ ] 日期解析正确（包含中文日期格式）
- [ ] 不同编码的网站正确解码
- [ ] 动态渲染适配器能获取 JS 渲染后的内容
- [ ] 适配器注册表正确分发
- [ ] 现有 RSS 适配器行为不变

---

## Batch 4: AI 增强管线

### 目标
集成 LLM 实现自动分类、摘要、风险评分和结构化元数据提取。

### 交付物

#### 4.1 AiCategorizationStage

**新建文件**：
- `crates/law-eye-crawler/src/stages/ai_categorize.rs`

**逻辑**：
- 调用 LLM（通过 law-eye-ai crate）
- Prompt 模板：输入文章标题+摘要，输出 domain_root + domain_sub
- 八大领域分类：立法、监管、执法、行业、合规、技术、学术、国际
- 结果缓存（相似标题复用分类结果）

#### 4.2 AiSummaryStage

**新建文件**：
- `crates/law-eye-crawler/src/stages/ai_summary.rs`

**逻辑**：
- 调用 LLM 生成结构化摘要
- 输出 JSON: `{ "fact": "...", "core": "...", "impact": "..." }`
- 遵守 Token 限制（使用 tiktoken-rs 预估）

#### 4.3 AiRiskScoringStage

**新建文件**：
- `crates/law-eye-crawler/src/stages/ai_risk.rs`

**逻辑**：
- 调用 LLM 评估企业合规风险
- 输出 risk_score (1-10) + 理由
- 参考因素：法律层级、适用范围、处罚力度、生效时间

#### 4.4 AI Prompt 模板管理

**新建文件**：
- `crates/law-eye-crawler/src/prompts/mod.rs`
- `crates/law-eye-crawler/src/prompts/categorize.rs`
- `crates/law-eye-crawler/src/prompts/summarize.rs`
- `crates/law-eye-crawler/src/prompts/risk_score.rs`

### 回归测试要点
- [ ] AI 分类结果属于预定义的八大领域
- [ ] AI 摘要结构符合 JSON Schema
- [ ] AI 风险评分在 1-10 范围内
- [ ] AI 调用失败时优雅降级（不阻塞 Pipeline）
- [ ] Token 用量在预算范围内
- [ ] 批量处理性能可接受（含 LLM 延迟）

---

## Batch 5: 反爬对抗

### 交付物
- User-Agent 轮换池（20+ 真实浏览器 UA）
- 可选代理池集成（支持 HTTP/SOCKS5 代理配置）
- 域名级 Token Bucket 限速器
- robots.txt 遵守与缓存
- Cookie/Session 管理
- 请求头随机化

---

## Batch 6: 增量与并发

### 交付物
- ETag/Last-Modified 条件请求
- 内容哈希增量检测
- Sitemap.xml 解析支持
- 自动分页爬取（翻页/无限滚动）
- 并发控制（tokio::Semaphore per-domain）
- 爬取检查点（Redis 持久化）

---

## Batch 7: 可观测性

### 交付物
- Prometheus 爬虫指标（请求总数、延迟、成功率、文章数等）
- 爬取日志持久化（crawl_logs 表）
- Grafana Dashboard 模板
- 告警规则（连续失败、延迟异常、抓取量骤降）
- 前端爬取监控面板

---

## Batch 8: 扩展数据源

### 交付物
- 36氪 RSS 适配器
- 虎嗅 RSS 适配器
- CNVD 漏洞信息适配器
- EUR-Lex 国际法律适配器
- 更多地方性法规来源适配器
- 行业协会信息源适配器

---

## Batch 9: 全面测试

### 交付物
- 全链路 E2E 测试（数据源 → 爬取 → Pipeline → 入库 → API → 前端）
- 集成测试（每个适配器 + Pipeline 组合）
- 性能测试（100+ 并发数据源、10000+ 文章处理）
- 压力测试（Worker 恢复能力、死信队列处理）
- 编码测试（覆盖 GBK/GB2312/UTF-8/Big5）
- 安全测试（SSRF防护、注入攻击、XSS 清洗）
