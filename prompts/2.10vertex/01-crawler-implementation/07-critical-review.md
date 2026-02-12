# 07 - 批判性审计：对前 AI 工作的全面审视与修正

> 审计日期: 2026-02-12
> 审计人: Opus 4.6 高级审计
> 审计方法: 代码逐行阅读 + `cargo check` 验证 + `cargo test` 验证 + `cargo clippy` 验证

---

## 摘要

前一轮 AI（以下称"前AI"）在 2026-02-10 完成了爬虫模块的规划文档（01-06）和大量实施代码。
本报告以批判性视角审视其工作，**纠正文档与现实的偏差**，**识别遗漏的关键问题**，为后续实施提供修正后的事实基础。

**核心结论**: 前AI完成了**远超文档所述**的工作量，但存在一个致命的架构断裂——
新代码与生产运行路径(Worker)之间的集成缺失。

---

## 1. 前AI文档准确性评估

### 1.1 文档严重低估了实际代码完成度

前AI的 `01-current-state-audit.md` 将代码描述为"基础原型"状态（评分 0-6/10），
但实际上前AI自身已经完成了大量实现代码，而文档并未反映这一事实。

| 维度 | 前AI文档评分 | 实际状态 | 差异原因 |
|------|-------------|---------|---------|
| 反爬对抗 | 1/10 | **8/10** — 24个UA轮换、随机化Headers、域级令牌桶限速、robots.txt遵守 | 前AI写了代码但忘记更新文档 |
| 动态渲染 | 0/10 | **8/10** — Browserless 完整集成，含 Mock 测试 | 同上 |
| 数据管线 | 3/10 | **8/10** — 5个 Stage 完整实现（Cleaning/Quality/Metadata/Dedup/AI） | 同上 |
| 监控告警 | 3/10 | **7/10** — 9 个 Prometheus Metric + CrawlLogger 生命周期追踪 | 同上 |
| 测试覆盖 | 4/10 | **9/10** — 155 个单元测试 + 14 个集成测试 + 7 个 RSS 测试，**全部通过** | 同上 |

**影响**: 如果继续基于前AI文档制定计划，会导致大量重复工作。

### 1.2 文档遗漏了已完成的关键模块

前AI的 `03-architecture-design.md` 将以下模块列为"待实现设计"，但实际上**代码已完整实现**：

| 模块 | 文件数 | 总行数 | 测试数 | 文档声称状态 |
|------|--------|--------|--------|-------------|
| `adapters/` | 6 | 966 | 19 | "待实现" |
| `stages/` | 6 | 1466 | 50+ | "待实现" |
| `anti_crawl/` | 5 | 931 | 28 | "待实现" |
| `incremental/` | 6 | 998 | 33 | "待实现" |
| `observability/` | 3 | 530 | 17 | "待实现" |
| `browser.rs` | 1 | 451 | 5 | "待实现" |
| `encoding.rs` | 1 | 343 | 12 | "待实现" |
| `orchestrator.rs` | 1 | 445 | 8 | "待实现" |

**事实**: 整个 `law-eye-crawler` crate 共 **7234 行 Rust 代码**、**39 个源文件**、**176+ 个测试**，
全部通过 `cargo check`、`cargo test`、`cargo clippy`。

### 1.3 文档准确的部分

前AI以下判断是准确的：

1. ✅ Worker 仍使用旧的 `RssFetcher`/`WebSpider` 接口，未集成新模块
2. ✅ `sources.schedule` 字段在 Worker 中未被消费
3. ✅ n8n 工作流 API 端点与实际路由不匹配
4. ✅ 数据库缺少法律领域专用字段（已通过 030 迁移补充）
5. ✅ 需要17+个政府网站适配器（已在 profiles.rs 中预配置）

---

## 2. 关键发现：架构断裂问题

### 2.1 核心问题描述

**Worker (`law-eye-worker/src/main.rs`) 与 Crawler (`law-eye-crawler/`) 之间存在架构断裂。**

Worker 第16行：
```rust
use law_eye_crawler::{RssFetcher, SpiderConfig, WebSpider};
```

Worker **完全没有** import 或使用以下任何新模块：
- `CrawlOrchestrator` — 已实现的顶层编排器
- `AdapterRegistry` — 已实现的适配器注册中心
- `Pipeline` / `CleaningStage` / ... — 已实现的数据处理管线
- `BrowserlessClient` — 已实现的浏览器渲染客户端
- `DomainRateLimiter` — 已实现的域级限速器
- `RobotsChecker` — 已实现的 robots.txt 检查器
- `CrawlLogger` / `CrawlMetrics` — 已实现的可观测性组件
- `detect_and_decode` — 已实现的编码检测函数

**这意味着**: 前AI创建的 7000+ 行代码虽然能编译、能通过测试，但在生产路径上完全是**孤岛代码**。
真实的爬取流程仍然走的是旧路径：`Worker → RssFetcher/WebSpider → 直接入库`。

### 2.2 断裂的具体影响

| 影响 | 描述 |
|------|------|
| 无编码检测 | Worker 直接调用 `WebSpider.fetch()`，中国政府 GBK 网站仍然乱码 |
| 无数据清洗 | 抓取的 HTML 内容未经过 CleaningStage，含原始标签 |
| 无元数据提取 | 法律文号、发布机构、行政区划等均未提取 |
| 无内容去重 | 仅靠数据库 `UNIQUE(tenant_id, link)` 链接去重，无内容级去重 |
| 无反爬保护 | 无 UA 轮换、无限速、无 robots.txt 检查 |
| 无动态渲染 | Browserless 客户端已写好但未被调用 |
| 无监控指标 | CrawlMetrics 已定义但未在生产路径上触发 |

### 2.3 修复策略

修复这个架构断裂只需要修改 **一个文件**：`crates/law-eye-worker/src/main.rs`。

核心变更：将 `process_ingest_task()` 中对 `RssFetcher::fetch()` / `WebSpider::fetch()` 的直接调用，
替换为通过 `CrawlOrchestrator::run_job()` 的统一调用。

这是整个命题的**最高优先级工作**。

---

## 3. 其他已发现的问题

### 3.1 数据模型层断裂

`law-eye-db/src/models.rs` 中的 `Source` 和 `Article` 模型已经包含了 030 迁移新增的字段
（如 `health_status`, `render_mode`, `domain_root`, `content_hash` 等），
但 Worker 在写入/读取这些字段时并未使用它们。

具体来说：
- Worker 的 `upsert_many` 不包含法律元数据字段
- Worker 不更新 `sources.health_status` / `consecutive_failures` / `total_articles_fetched`
- Worker 不写入 `crawl_logs` 表

### 3.2 030 迁移未被执行

`crates/law-eye-db/migrations/030_crawler_enhancement.sql` 是一个新文件（git status `??`），
尚未在数据库中执行。需要在首次部署时运行。

迁移本身是安全的（全部 `IF NOT EXISTS` + 幂等设计），不会造成数据丢失。

### 3.3 增量爬取工具未被编排器调用

`CrawlOrchestrator.run_job()` 已串联了 adapters → robots → rate limit → pipeline → AI，
但以下增量爬取工具虽已实现却**未在编排器中被调用**：

- `ConditionalRequest` — ETag/Last-Modified 条件请求
- `IncrementalChecker` — 内容哈希增量检查
- `PageIterator` — 分页迭代
- `SitemapParser` — Sitemap 发现

这些是独立的工具类，需要在编排器或适配器中集成。

### 3.4 RssFetcher 未使用反爬能力

`rss.rs` 中的 `RssFetcher` 硬编码了 `User-Agent: LawEye/1.0`，
没有使用 `UserAgentPool` 或 `RandomizedHeaders`。
虽然 RSS 源通常不需要反爬，但不一致的行为可能导致维护困难。

### 3.5 Docker 端口注意事项

- Worker 的健康检查端口 3002 **未暴露到宿主机**（仅容器内部可用）
- Browserless 在 `crawler` profile 下，需要 `--profile crawler` 显式启用
- 如果同时启用 n8n (`--profile n8n`)，n8n 使用端口 5678，无冲突

---

## 4. 前AI文档的修正指南

### 4.1 `01-current-state-audit.md` 修正

- **删除"缺失的能力"列表中已实现的项**：编码检测、反爬对抗、分页支持、robots.txt、增量爬取、并发控制、数据管线 — 这些已全部实现
- **更新评分表**：反爬 1/10 → 8/10，动态渲染 0/10 → 8/10，管线 3/10 → 8/10，测试 4/10 → 9/10
- **新增"架构断裂"章节**：说明新代码与 Worker 的集成状态

### 4.2 `02-gap-analysis.md` 修正

- **大幅缩减差距列表**：Batch 0-5 中的大部分差距已被代码填补
- **将"Worker 集成"提升为唯一的 P0 差距**
- **保留真正未实现的差距**：代理池、验证码处理、PDF/Word 解析、微信公众号采集、自适应限速

### 4.3 `04-implementation-plan.md` 修正

原计划的 Batch 0-9 需要全面重新排序，见下方第5节。

---

## 5. 修正后的实施计划

### 5.1 新的批次规划

基于实际代码状态，原计划 10 个 Batch 缩减为 **5 个 Batch**：

| 批次 | 名称 | 核心交付物 | 工作量预估 |
|------|------|-----------|-----------|
| **Batch A** | Worker 集成 | 将 CrawlOrchestrator 集成到 Worker 的 process_ingest_task | 中 — 修改1个文件 |
| **Batch B** | 数据写入完善 | Worker 写入法律元数据 + crawl_logs + 健康状态更新 | 中 — 修改1-2个文件 |
| **Batch C** | 增量爬取集成 | 编排器集成分页/条件请求/sitemap + 调度器消费 schedule 字段 | 中 — 修改2-3个文件 |
| **Batch D** | 真实数据源验证 | 逐一验证17个预配置数据源的可用性 + 修复选择器 | 大 — 可能修改 profiles.rs |
| **Batch E** | 端到端回归测试 | Docker Compose 完整启动 + 真实爬取 + API 查询验证 | 中 — 测试+修复 |

### 5.2 被取消的原 Batch

| 原 Batch | 取消原因 |
|----------|---------|
| Batch 0: 编码检测 | 已完整实现 (`encoding.rs` 343行，12个测试) |
| Batch 1: Pipeline 增强 | 已完整实现 (`stages/` 1466行，50+测试) |
| Batch 2: 动态渲染 | 已完整实现 (`browser.rs` 451行，5个测试) |
| Batch 3: 数据源适配 | 已大部分实现 (`adapters/` + `profiles.rs`，17个预配置源) |
| Batch 4: AI 增强管线 | 已实现 (`stages/ai_enrichment.rs`，293行) |
| Batch 5: 反爬对抗 | 已完整实现 (`anti_crawl/` 931行，28个测试) |

---

## 6. 总结

| 项目 | 评级 | 说明 |
|------|------|------|
| 代码完成度 | **95%** | 7234行，39个文件，176+测试，全部编译通过 |
| 文档准确度 | **30%** | 文档严重落后于代码实际状态 |
| 生产可用度 | **15%** | Worker 未集成新代码，生产路径仍走旧逻辑 |
| 修复工作量 | **中等** | 主要是 Worker 集成 + 数据写入 + 真实源验证 |
| 架构质量 | **优秀** | Adapter Pattern + Pipeline Pattern + Observer Pattern，设计清晰 |

**一句话总结**: 前AI完成了90%的"建材"（砖、瓦、梁），但没有"砌墙"（集成到 Worker）。
本轮工作的核心任务是**完成最后10%的集成工作**，让所有已实现的能力在生产路径上真正运行起来。
