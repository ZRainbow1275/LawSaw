# LegalMind / LawSaw 管理面板与 AI 执行 Spec（2026-02-27）

## 0. 目标与边界
- 本文是 `REBAC_AI_GOVERNANCE_SPEC_2026-02-25.md` 的执行细化，覆盖：
  - 管理员面板与用户面板 IA/API
  - 真实 AI 功能流水线（无 mock）
  - 阅读体验增强与分类分级策略
- 约束：
  - 所有能力必须运行在真实数据链路（抓取 -> 入库 -> 向量化 -> 召回/重排 -> LLM 输出 -> 审计）。
  - 不在代码库存储明文密钥，统一走运行时环境变量。

## 1. 面板 IA（信息架构）

### 1.1 管理员面板（`tenant_admin` / `super_admin`）
1. `Users & Roles`
   - 用户列表、角色分层、关系元组管理入口（ReBAC）。
2. `Channels & Sources`
   - 频道增设、频道访问策略、数据源启停与抓取策略。
3. `Content Ops`
   - Banner、置顶、文章状态流、反馈处理。
4. `AI Governance`
   - Policy/Prompt、Token Usage、Budget Alerts、Experiments。
5. `Reports & Knowledge`
   - 报告模板、报告审批导出、图谱回填与查询策略。
6. `Audit & Settings`
   - 审计日志、租户配置、Webhook、安全设置。

### 1.2 用户面板（`basic/verified/premium`）
1. `My Feed`
   - 权限过滤后的文章流 + Banner + 实验信息（只读）。
2. `Analytics`
   - 地域/行业/重要性/时间线统计（按权限裁剪）。
3. `Reports`
   - 报告创建、查看、订阅、导出下载。
4. `Knowledge`
   - 实体检索、关系查看、关联文章。
5. `Feedback`
   - 留言反馈创建与状态追踪。

## 2. 权限矩阵（执行版）

### 2.1 管理能力
- `super_admin`：跨租户平台治理、策略模板发布、全审计可见。
- `tenant_admin`：租户内用户/关系/频道/Banner/AI policy 管理。
- `premium_user`：可读全频道与高级分析，不允许治理写操作。
- `verified_user`：可读扩展频道与报告，不允许治理写操作。
- `basic_user`：仅基础频道文章读取。

### 2.2 关键 action
- `authz:relations:write`：`tenant_admin+`
- `banner:write` / `article:pin:write`：`tenant_admin+`
- `ai:policy:write` / `ai:experiment:write`：`tenant_admin+`
- `reports:approve`：`tenant_admin+`
- `articles:read`：所有用户层（结果受频道策略限制）

## 3. API 执行清单（本轮基线）

### 3.1 已对齐并前端接线
- `GET /api/v1/admin/ai/token-usage`
- `GET /api/v1/admin/ai/budget-alerts`
- `POST /api/v1/admin/ai/budget-alerts/recompute`
- `GET /api/v1/admin/ai/experiments`
- `PUT /api/v1/admin/ai/experiments/{experiment_key}`
- `GET /api/v1/me/feed`（含 `experiments` 字段）

### 3.2 下一批补齐（不得 mock）
1. 管理侧统计报告配置
   - 报表策略模板 CRUD、审批策略配置、订阅周期策略。
2. 用户侧阅读管理偏好
   - feed 行为反馈权重策略可观测化（仅管理员可调参）。
3. 分类分级运营接口
   - 分类词典版本、风险阈值版本、行业词库版本管理。

## 4. 真实 AI 流水线（生产约束）

### 4.1 模型与职责
- 生成模型：`Qwen/Qwen3-8B`（摘要、结构化提取、风险解释）。
- 向量模型：`BAAI/bge-m3`（embedding）。
- 重排模型：`BAAI/bge-reranker-v2-m3`（检索重排）。

### 4.2 处理链路
1. `ingest`: 抓取原文与元数据。
2. `normalize`: 清洗、正文归一、hash 去重。
3. `embed`: 写入向量索引。
4. `retrieve + rerank`: 检索和重排。
5. `llm tasks`: 摘要/情感/风险/行业/地域结构化输出。
6. `persist`: 写入 `content_flags` + 任务审计 + token usage。

### 4.3 运行时配置
- 必须通过环境变量注入（示例）：
  - `LAW_EYE__AI__API_KEY`
  - `LAW_EYE__AI__BASE_URL`
  - `LAW_EYE__AI__MODEL`
  - `LAW_EYE__AI__EMBEDDING_MODEL`
- 禁止把密钥写进仓库、日志、前端 bundle。

## 5. 阅读体验与运营策略

### 5.1 Banner/置顶
- 置顶排序优先级：`pin > priority > published_at`。
- 投放范围：`global/channel/role_tier`。
- 生效窗：`starts_at <= now < ends_at`。

### 5.2 用户可见性
- 无权限入口前置隐藏，不采用“先显示后 403”。
- 列表页必须覆盖 `loading/error/empty/ready` 四态。

## 6. 文章分类分级规范

### 6.1 分类（taxonomy）
- 一级：法律法规 / 司法判例 / 行业监管 / 企业合规 / 风险事件。
- 二级：按行业与地域细分（金融、医药、互联网；国家/省市）。

### 6.2 分级（severity）
- 风险：`low/medium/high/critical`。
- 重要性：`1..5`。
- 情感：`positive/neutral/negative/mixed`。

### 6.3 一致性要求
- 所有分级结果必须写入 `content_flags` 并附 `model_version/prompt_version/output_hash`。
- 风险阈值变更必须版本化并可审计回放。

## 7. 验收门禁（本轮与后续）
- 前端：
  - `pnpm -C apps/web typecheck`
  - `pnpm -C apps/web lint`
  - `pnpm -C apps/web test:unit`
  - `pnpm -C apps/web build`
- 后端：
  - `cargo check -p law-eye-api -p law-eye-core -p law-eye-worker`
- 核心链路：
  - `node tmp/core-e2e-local.mjs --base-url <api> --origin <web> --assert-knowledge-embedding 1`

## 8. 里程碑（可执行）
1. M1（已落地）：AI 治理接口与设置页接线（Token/Budget/Experiments）。
2. M2：管理面板 IA 全域补齐（Users/Channels/Audit/Reports 统一导航与权限裁剪）。
3. M3：AI 报告与图谱链路生产化（成本阈值、回滚策略、SLO 监控）。
4. M4：分类分级治理闭环（版本化词典 + 审计 + 回归基线）。
