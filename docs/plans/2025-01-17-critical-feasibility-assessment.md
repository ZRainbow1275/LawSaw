# 法眼 (Law Eye) 项目批判性可行性审视报告

> **维护状态（2026-02-08）**
> - 本文档属于 2025-01 的历史规划归档，主要用于追溯早期决策背景。
> - 当前系统交付状态请以 `prompt/audit-report.md`（v2.6 修复清单）与 `prompts/audit/2.6audit.md`（审计基线）为准。
> - 研发规范请参考 `.trellis/spec/`（`backend/`、`frontend/`、`guides/`）。
> - 若本文内容与现行代码冲突，请以代码与上述“真相源”文档为准。


> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 全方位批判性审视 Law Eye 项目的可行性，识别风险并提出改进建议

**Architecture:** 本报告从技术栈、架构设计、实施风险、资源成本四个维度进行深度分析

**Tech Stack:** Rust (Axum, SQLx), PostgreSQL (pgvector), Redis, Next.js 15 (规划中), OpenAI API

---

## 执行摘要

| 维度 | 评级 | 核心发现 |
|------|------|----------|
| **技术栈选型** | ✅ 优秀 | Rust + Axum + SQLx 选型现代化、高性能 |
| **架构设计** | ⚠️ 过度设计 | 试图同时实现三阶段功能，缺乏 MVP 聚焦 |
| **工程完整性** | ❌ 严重不足 | 前端 0%、测试 ~2%、DB schema 不同步 |
| **成本预估** | ⚠️ 被低估 | LLM 成本可能达 $2000+/月 |
| **可行性结论** | 🟡 有条件可行 | 需大幅缩小范围才能落地 |

---

## 1. 项目现状概览

### 1.1 代码统计

| 模块 | 文件数 | 状态 | 完成度 |
|------|--------|------|--------|
| Rust 后端 (9 crates) | 47 | ✅ 编译通过 | ~65% |
| 数据库 Migration | 1 | ⚠️ 不完整 | ~40% |
| 前端 (Next.js) | 0 | ❌ 未开始 | 0% |
| 单元测试 | 2 | ❌ 极度缺失 | ~2% |
| Docker 配置 | 1 | ⚠️ 基础可用 | ~50% |
| 文档 | 4 | ✅ 设计完整 | ~80% |

### 1.2 Crates 结构

```
crates/
├── law-eye-common/     ✅ 错误处理、配置管理
├── law-eye-db/         ⚠️ 模型完整、migration 缺失
├── law-eye-core/       ✅ 业务服务层（Article, Source, Category, User, RAG）
├── law-eye-crawler/    ⚠️ RSS 完整、Spider 基础
├── law-eye-ai/         ✅ LLM Gateway, 分类/摘要/风险/标签/嵌入
├── law-eye-queue/      ✅ Redis 任务队列
├── law-eye-api/        ✅ Axum REST API (9 路由模块)
├── law-eye-worker/     ✅ 后台任务处理器
└── law-eye-mcp/        ✅ Model Context Protocol 集成
```

---

## 2. 技术栈审视

### 2.1 优势 ✅

| 技术 | 选型理由 | 评价 |
|------|----------|------|
| **Rust** | 高性能、内存安全、现代化 | 优秀，适合长期维护 |
| **Axum 0.7** | 最新 Rust Web 框架，Tower 生态 | 优秀，社区活跃 |
| **SQLx 0.8** | 编译时 SQL 检查 | 优秀，类型安全 |
| **pgvector** | PostgreSQL 原生向量搜索 | 优秀，适合 RAG |
| **async-openai** | OpenAI 兼容 API 封装 | 良好，支持多提供商 |
| **tokio** | 异步运行时标准 | 优秀，生态成熟 |

### 2.2 问题 ❌

#### 问题 1: `tower-sessions-redis-store` 兼容性警告

```
warning: the following packages contain code that will be rejected
by a future version of Rust: tower-sessions-redis-store v0.12.0
```

**风险等级**: 🟠 中等
**建议**: 监控该库的维护状态，准备备选方案（如 `fred` 原生实现）

#### 问题 2: 依赖版本锁定不够严格

部分 workspace dependencies 使用宽松版本（如 `tokio = "1.43"`），可能导致未来升级时的兼容性问题。

**建议**: 在生产前锁定到精确版本

---

## 3. 架构设计评估

### 3.1 设计愿景 vs 实现现状

| 阶段 | 设计目标 | 代码实现 | 差距分析 |
|------|----------|----------|----------|
| **Phase 1** | HTML 日报 + RSS 采集 | ✅ RSS 采集器完成 | ❌ 无邮件模板、无定时任务 |
| **Phase 2** | 多 Agent + 图表 | ⚠️ n8n 配置存在 | ❌ Agent 编排未实现 |
| **Phase 3** | SaaS + RAG | ✅ RAG 服务代码存在 | ❌ 无前端、无付费系统 |

### 3.2 过度设计风险 ⚠️

**问题**: 当前代码试图**同时实现三个阶段**的功能

- `law-eye-core/rag.rs`: RAG 服务（Phase 3）
- `law-eye-db/models.rs`: 知识图谱模型（Phase 3）
- `law-eye-api/routes/auth.rs`: 用户认证（Phase 3）
- `law-eye-api/routes/apikeys.rs`: API Key 管理（Phase 3）

**后果**:
1. 无法快速验证 MVP
2. 开发资源分散
3. 维护成本增加

**建议**: 砍掉 80% 的功能，专注 Phase 1 核心闭环

### 3.3 n8n vs Rust Worker 职责重叠

| 功能 | n8n 设计 | Rust Worker 实现 |
|------|----------|------------------|
| RSS 采集 | ✅ | ✅ |
| 定时调度 | ✅ | ❌ |
| AI 处理 | ✅ Multi-Agent | ✅ 单体 AiService |
| 推送通知 | ✅ | ✅ |

**问题**: 两套采集/处理逻辑并行存在

**建议**: 二选一
- 方案 A: n8n 主导编排，Rust 仅提供 API
- 方案 B: Rust 全栈，n8n 仅做可视化监控

---

## 4. 严重问题清单

### 4.1 ❌ 致命问题 (Must Fix)

#### 问题 A: 前端代码完全缺失

- **发现**: 项目中没有任何 TypeScript/JavaScript 文件
- **影响**: 无法验证用户价值，无法形成产品
- **工作量**: 40-90 人天（Web + Admin）

#### 问题 B: 数据库 Migration 不完整

**已实现的表** (001_initial.sql):
- sources ✅
- categories ✅
- articles ✅

**代码中存在但无 Migration**:
- article_chunks ❌ (RAG 依赖)
- entities ❌ (知识图谱)
- entity_relations ❌
- article_entities ❌
- users ❌ (认证依赖)
- roles ❌
- user_roles ❌
- api_keys ❌
- audit_logs ❌

**后果**: API 启动后，任何涉及这些表的操作都会崩溃

#### 问题 C: 测试覆盖率极低

**已有测试**:
```rust
// crates/law-eye-ai/src/gateway.rs
#[test]
fn test_extract_json_from_code_block() { ... }

#[test]
fn test_extract_json_plain() { ... }
```

**缺失测试**:
- RSS 采集逻辑
- AI 处理逻辑
- 数据库 CRUD
- API 端点
- Worker 任务处理
- 认证授权

### 4.2 ⚠️ 严重问题 (Should Fix)

#### 问题 D: LLM 成本估算不足

**当前设计每篇文章调用**:
| AI 能力 | 调用次数 |
|---------|---------|
| 分类 | 1 |
| 摘要 | 1 |
| 风险评估 | 1 |
| 标签提取 | 1 |
| 实体抽取 | 1 |
| 向量嵌入 | 1 |
| **合计** | **6 次/篇** |

**成本估算** (GPT-4o-mini, ~$0.15/1M input tokens):

| 日采集量 | 月 LLM 调用 | 月成本估算 |
|---------|------------|-----------|
| 100 篇 | 18,000 次 | $150-300 |
| 500 篇 | 90,000 次 | $750-1,500 |
| 1000 篇 | 180,000 次 | $1,500-3,000 |

**建议**:
1. 使用本地模型 (Ollama + Llama 3.2) 做初筛
2. 合并 AI 调用为单次处理
3. 仅对重要文章调用高质量模型

#### 问题 E: 爬虫能力不足

**政府网站反爬挑战**:
- 动态渲染 (JavaScript)
- IP 封禁
- Captcha 验证
- Rate limiting

**当前实现**: 基础 HTTP 请求 + 简单 HTML 解析

**缺失能力**:
- 无头浏览器支持
- 代理池
- 指纹伪装
- Captcha 解决

---

## 5. 资源与成本评估

### 5.1 开发资源需求

| 模块 | 当前完成度 | 剩余工作 | 预估人天 |
|------|-----------|----------|---------|
| 后端 API | 70% | 测试、文档、优化 | 15-20 |
| Worker | 60% | 完善采集器、错误处理 | 10-15 |
| 数据库 | 40% | 补全 migration、索引 | 8-12 |
| 前端 Web | 0% | 从零开始 | 40-60 |
| 前端 Admin | 0% | 从零开始 | 20-30 |
| 测试 | 2% | 单元/集成/E2E | 15-20 |
| 部署运维 | 30% | Docker/CI/CD/监控 | 10-15 |
| 文档 | 40% | API 文档、用户手册 | 5-10 |
| **总计** | - | - | **123-182** |

**预估时间**:
- 单人全职: 5-8 个月
- 双人全职: 3-4 个月

### 5.2 运营成本估算

| 项目 | 月成本 (低) | 月成本 (高) |
|------|------------|------------|
| 云服务器 (2核4G x 2) | $40 | $100 |
| PostgreSQL 托管 | $30 | $80 |
| Redis 托管 | $15 | $40 |
| LLM API 调用 | $300 | $2,000 |
| 域名 + SSL | $10 | $20 |
| CDN | $0 | $50 |
| 监控告警 | $0 | $30 |
| **月总计** | **$395** | **$2,320** |
| **年总计** | **$4,740** | **$27,840** |

---

## 6. 可行性结论

### 6.1 总体评价

```
┌─────────────────────────────────────────────────────────┐
│                  项目可行性评估                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   技术可行性:  ████████░░  80%  (技术栈现代化)          │
│   工程完整性:  ██░░░░░░░░  20%  (前端/测试缺失)          │
│   成本可控性:  ████░░░░░░  40%  (LLM成本风险)            │
│   上市时间:    ███░░░░░░░  30%  (5-8个月)               │
│                                                         │
│   综合可行性:  ████░░░░░░  42%  ⚠️ 有条件可行           │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 6.2 可行的前提条件

1. **大幅缩小 MVP 范围**
   - 砍掉 Phase 2、Phase 3 的所有代码
   - 专注于：RSS 采集 → 基础 AI 分类 → HTML 邮件日报
   - 邮件就是产品，不需要 Dashboard

2. **解决 LLM 成本问题**
   - 使用本地模型做初筛
   - 合并 AI 调用减少次数
   - 建立成本监控机制

3. **明确数据源策略**
   - 优先使用有 RSS 的合法数据源
   - 放弃微信公众号采集
   - 与数据提供商建立合作

4. **补齐工程基础**
   - 完成所有数据库 migration
   - 添加核心功能测试
   - 建立 CI/CD 流程

---

## 7. 改进建议

### 7.1 推荐的精简路线图

#### Phase 1-Lite: MVP 日报系统 (4-6 周)

**目标**: 可运行的法律资讯日报

**交付物**:
- [x] 10 个稳定 RSS 源配置
- [ ] 基础 AI 分类 (本地模型)
- [ ] HTML 邮件模板
- [ ] 定时发送机制 (n8n)
- [ ] 简单 Web 页面 (查看历史)

**不做**:
- ~~完整 Dashboard~~
- ~~RAG 对话~~
- ~~知识图谱~~
- ~~多 Agent 系统~~
- ~~用户认证~~

#### Phase 2-Lite: 验证市场 (2-4 周)

**目标**: 验证用户需求

**方法**:
- 邀请 20 个目标用户测试
- 收集反馈：内容质量、分类准确性、推送频率
- 分析打开率、点击率

**决策点**:
- 打开率 > 40% → 进入 Phase 3
- 打开率 < 20% → 调整方向或放弃

### 7.2 技术债务清理优先级

| 优先级 | 任务 | 预估工时 |
|--------|------|---------|
| P0 | 补全数据库 migration | 8h |
| P0 | 添加核心采集测试 | 4h |
| P0 | 添加 AI 处理测试 | 4h |
| P1 | 实现邮件模板 | 8h |
| P1 | n8n 定时任务配置 | 4h |
| P1 | 部署 Docker 配置 | 8h |
| P2 | 简单历史页面 | 16h |
| P2 | 监控告警配置 | 8h |

### 7.3 成本控制策略

1. **LLM 分层调用**
   ```
   所有文章 → 本地模型初筛 (Llama 3.2)
              ↓ (重要度 > 7)
   重要文章 → GPT-4o-mini 深度处理
              ↓ (风险度 > 8)
   高风险   → GPT-4o 专家分析
   ```

2. **批量处理优化**
   - 累积 10 篇文章后批量调用 AI
   - 使用 JSON mode 减少 token 消耗
   - 缓存相似内容的处理结果

3. **成本监控告警**
   - 设置每日 LLM 调用上限
   - 超过 80% 时告警
   - 超过 100% 时暂停新任务

---

## 8. 附录

### 附录 A: 当前编译状态

```bash
$ cargo check
    Checking law-eye-common v0.1.0
    Checking law-eye-db v0.1.0
    Checking law-eye-ai v0.1.0
    Checking law-eye-queue v0.1.0
    Checking law-eye-crawler v0.1.0
    Checking law-eye-core v0.1.0
    Checking law-eye-mcp v0.1.0
    Checking law-eye-api v0.1.0
    Checking law-eye-worker v0.1.0
warning: field `knowledge_service` is never read
  --> crates\law-eye-api\src\state.rs:22:9
   |
11 | pub struct AppState {
   |            -------- field in this struct
...
22 |     pub knowledge_service: Arc<KnowledgeService>,
   |         ^^^^^^^^^^^^^^^^^

warning: `law-eye-api` generated 1 warning
    Finished `dev` profile in 8.51s
warning: the following packages contain code that will be rejected
by a future version of Rust: tower-sessions-redis-store v0.12.0
```

### 附录 B: 建议的精简 MVP Cargo.toml

```toml
# 建议在 MVP 阶段移除的 crates
# - law-eye-mcp (MCP 集成可以后期再做)
# - 大部分 law-eye-ai 功能 (仅保留基础分类)

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
    # "crates/law-eye-ai",  # 简化版可合并到 core
    # "crates/law-eye-mcp", # MVP 不需要
]
```

---

> **文档版本**: 1.0.0
> **审视日期**: 2025-01-17
> **审视者**: Claude Code + User
> **状态**: 完成
