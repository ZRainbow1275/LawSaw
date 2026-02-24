# LegalMind / LawSaw 企业级改造 Spec（2026-02-25）

## 0. 约束声明
- 本 spec 为本轮唯一权威版本，路径：`prompts/0225/REBAC_AI_GOVERNANCE_SPEC_2026-02-25.md`
- 不使用 mock 数据；验收必须走真实 API、真实 DB、真实异步任务。
- 不牺牲现有多租户隔离（`tenant_id + RLS + 复合约束`）。

## 1. 目标
在当前可演示可部署基础上，完成以下企业级能力：
1. ReBAC 细粒度授权与身份分层。
2. 管理员面板与用户面板双后台。
3. Banner 与置顶运营能力。
4. 内容结构化治理（分级/行业/风险/重要性）。
5. 真实 AI 驱动（总结、情感、风险标签）。
6. AI 集中治理台（模型、预算、策略、可观测）。
7. 用户观看体验提升（可见即所得、无白屏、低噪音）。

## 2. 非功能硬指标（必须达标）
- 可用性：核心链路月度可用性 >= 99.9%
- 安全性：默认拒绝（deny-by-default），跨租户越权 0 容忍
- 可观测性：所有关键写操作可审计回放（actor/target/action/time/version）
- 性能：
  - P95 API < 300ms（读接口）
  - P95 异步任务入队 < 100ms
  - 报告导出任务成功率（含重试）>= 99%
- 可维护性：新增域能力必须有 API 合同 + e2e 回归 + runbook

## 3. 身份与授权（ReBAC）

### 3.1 身份分层
- `super_admin`：跨租户平台治理
- `tenant_admin`：租户内治理
- `basic_user`：基础浏览用户
- `verified_user`：认证用户（扩展频道）
- `premium_user`：高级用户（全频道 + 高级分析）

### 3.2 资源模型
- `tenant`、`channel`、`article`、`source`、`report`、`banner`、`ai_policy`

### 3.3 关系元组（示例）
- `tenant:xx#owner@user:uu`
- `tenant:xx#admin@user:uu`
- `channel:cc#viewer@user:uu`
- `channel:cc#editor@user:uu`
- `report:rr#approver@user:uu`

### 3.4 判定算法（固定顺序）
1. 资源归属校验（`tenant_id`）
2. ReBAC 关系匹配（资源级）
3. 角色基线匹配（身份级）
4. 默认拒绝

### 3.5 权限矩阵（首版）
- `basic_user`
  - 允许：`article.read`（受限频道）
  - 禁止：`source.read_meta`、`banner.manage`、`report.approve`
- `verified_user`
  - 允许：`article.read`（指定频道）、`report.read`
  - 禁止：治理类写操作
- `premium_user`
  - 允许：租户内全频道读取、来源详情、高级分析读取
  - 禁止：管理员治理写操作
- `tenant_admin`
  - 允许：租户内用户分层、关系授权、Banner/置顶、AI 策略
- `super_admin`
  - 允许：跨租户治理、策略模板发布、平台告警处理

## 4. 数据模型（新增）

### 4.1 `auth_relations`
- 字段：
  - `id uuid pk`
  - `tenant_id uuid not null`
  - `resource_type text not null`
  - `resource_id uuid not null`
  - `relation text not null`
  - `subject_type text not null`
  - `subject_id uuid not null`
  - `created_by uuid not null`
  - `created_at timestamptz not null`
  - `expires_at timestamptz null`
- 约束：
  - `unique(tenant_id, resource_type, resource_id, relation, subject_type, subject_id)`
  - 索引：`(tenant_id, subject_type, subject_id)`、`(tenant_id, resource_type, resource_id)`

### 4.2 `channel_access_policies`
- 支持 role baseline + relation override
- 关键字段：`tenant_id/channel_id/min_role/allow_source_meta/allow_export`

### 4.3 `banners` + `banner_targets`
- `banners.status`：`draft/scheduled/active/expired/archived`
- `banner_targets`：投放范围（global/channel）

### 4.4 `content_flags`
- 每篇文章结构化结果：
  - `industry`
  - `importance`（1~5）
  - `risk_level`（low/medium/high/critical）
  - `sentiment`（pos/neu/neg）
  - `model_version/prompt_version`

### 4.5 `ai_policies` + `ai_prompt_versions`
- 模型路由、配额、阈值、prompt 版本的配置与发布记录

## 5. API 合同（新增）

### 5.1 授权域
- `GET /api/v1/authz/check`
  - 输入：`resource_type/resource_id/action`
  - 输出：`allow:boolean` + `decision_path`
- `POST /api/v1/authz/relations`
  - 创建关系元组（必须审计）
- `DELETE /api/v1/authz/relations/{id}`
  - 撤销关系元组（必须审计）

### 5.2 管理域
- `GET/POST /api/v1/admin/users`
- `PATCH /api/v1/admin/users/{id}/tier`
- `GET/POST /api/v1/admin/banners`
- `POST /api/v1/admin/articles/{id}/pin`
- `POST /api/v1/admin/articles/{id}/unpin`

### 5.3 AI 管理域
- `GET/POST /api/v1/admin/ai/policies`
- `POST /api/v1/admin/ai/prompts/publish`
- `GET /api/v1/admin/ai/metrics`

## 6. 业务状态机

### 6.1 Banner
- `draft -> scheduled -> active -> expired -> archived`
- 下线操作：`active -> archived`

### 6.2 置顶
- 作用域：`global`、`channel`
- 排序：`is_pinned desc, pin_priority desc, published_at desc`
- 生效窗：`effective_from <= now < effective_to`

## 7. 真实 AI 任务链路
- 任务：
  - `summarize_article`
  - `analyze_sentiment`
  - `tag_risk_labels`
- 幂等键：`tenant_id + article_id + task_type + model_version`
- 重试策略：指数退避 + DLQ
- 结果追踪：落库 `model_version/prompt_version/output_hash`

## 8. 前端信息架构

### 8.1 管理员面板
- `/settings/admin/users`
- `/settings/admin/relations`
- `/settings/admin/channels`
- `/settings/admin/banners`
- `/settings/admin/ai`
- `/settings/admin/audit`

### 8.2 用户面板
- `/me/feed`（按权限过滤）
- `/me/subscriptions`
- `/me/risk-focus`
- `/me/reports`

### 8.3 UX 强制要求
- 无权限资源不展示入口（非点击后报错）
- 关键空态必须有可操作恢复按钮
- 页面状态：`loading/error/empty/ready` 全覆盖

## 9. 审计与合规
- 所有授权变更必须落审计：
  - `actor`, `target`, `resource`, `before`, `after`, `request_id`, `ip`, `ua`
- 所有审批/置顶/Banner 发布必须可回放
- 审计表保持 append-only 语义，不允许 update/delete

## 10. 发布计划（分阶段）

### Phase A（P0，ReBAC + 分层身份）
- 交付：
  - `auth_relations` + `authz/check`
  - 分层用户可见策略
- DoD：
  - basic/verified/premium 权限矩阵自动化回归通过
  - 越权访问返回 403 且有审计记录

### Phase B（P1，管理面板 + Banner/置顶）
- 交付：
  - admin/user 双面板首版
  - Banner/置顶完整链路
- DoD：
  - 置顶排序与生效窗 e2e 通过
  - Banner 发布/下线全程可审计

### Phase C（P1，AI 治理）
- 交付：
  - 总结/情感/风险标签真实任务链路
  - AI 管理台（策略/预算/监控）
- DoD：
  - AI 任务成功率 >= 98%（含重试）
  - 每条 AI 结果可追溯模型与 prompt 版本

## 11. 测试与门禁
- 后端：`cargo check -p law-eye-api -p law-eye-core -p law-eye-worker`
- 前端：`pnpm -C apps/web test`、`pnpm -C apps/web e2e`
- 核心链路：
  - `node tmp/core-e2e-local.mjs --base-url http://172.19.107.21:13003 --origin http://localhost:8850 --assert-knowledge-embedding 1`
- 授权专项：
  - 三层用户访问矩阵
  - 关系增删改审计回放
  - 跨租户越权回归

## 12. 风险清单与缓解
- 风险：关系表膨胀导致鉴权慢
  - 缓解：预编译策略缓存 + 热点索引 + TTL 清理
- 风险：AI 成本不可控
  - 缓解：租户预算硬阈值 + 降级模型 + 任务限流
- 风险：复杂授权导致前端体验混乱
  - 缓解：权限前置裁剪 + 可见即所得 + 明确空态

## 13. 执行起点（立即）
1. 建模迁移：`auth_relations/channel_access_policies/content_flags`
2. 后端中间件：`authz/check + decision_path`
3. 前端最小改造：频道与来源可见性按新接口收敛
4. 管理页骨架：用户分层 + 关系管理首版

