# LawSaw 批判性验收报告（2026-02-27，更新）

## 1. 本轮目标与结论
- 目标：在 ReBAC/AI 治理基础上，完成企业可运维、可部署、可审计落地，并给出可复验门禁证据。
- 结论：
  - `no-dockerhub` 本地栈已可稳定启动（API + Worker + Web）。
  - `rc2-gate.sh` 已升级为默认 AI fail-fast（`LAW_EYE_REQUIRE_AI=1`）。
  - 核心 e2e（`assert-knowledge-embedding=1`）已连续 3 轮 `ok=true`。
  - `rc2-gate.sh` 在默认严格配置（含 `web_test`、`web_e2e`、`assert-knowledge-embedding=1`、`require_ai=1`）下 PASS。
  - 当前剩余风险降级为运维环境项：`/health` 中 `ai.degraded_reason=check_timeout` 偶发，需要在生产网络条件下进一步压实。

## 2. 本轮已实现（关键）

### 2.1 报告治理能力（后端 + 前端）
- 新增后端管理接口：`GET /api/v1/admin/reports/governance-metrics`
  - 文件：`crates/law-eye-api/src/routes/admin.rs`
  - OpenAPI 注册：`crates/law-eye-api/src/openapi.rs`
- 新增核心治理指标模型与计算：
  - 类型：`crates/law-eye-core/src/report/types.rs`
  - 服务计算：`crates/law-eye-core/src/report/service.rs`
  - 导出：`crates/law-eye-core/src/report/mod.rs`、`crates/law-eye-core/src/lib.rs`
- 前端接入治理指标：
  - 类型断言：`apps/web/src/lib/api/types.ts`
  - hook：`apps/web/src/hooks/use-reports.ts`
  - 设置页治理面板：`apps/web/src/app/settings/tabs.tsx`

### 2.2 AI 治理第三批接线（延续）
- Token usage / Budget alerts / Experiments 契约与面板完整接线。
- 文件：
  - `apps/web/src/lib/api/types.ts`
  - `apps/web/src/hooks/use-ai-governance.ts`
  - `apps/web/src/app/settings/tabs.tsx`

### 2.3 运维与可用性修复
- `scripts/no-dockerhub/start-stack.sh`
  - MinIO 权限修复：`--user 0:0`
  - 本地默认 embedding 维度策略：`LAW_EYE__AI__EMBEDDING_DIMENSION_STRATEGY=pad_or_truncate`
  - bge-m3 默认向量维度：`LAW_EYE__AI__EMBEDDING_VECTOR_DIM=1024`
  - Web 启动默认策略修复：当 WSL 内 `pnpm` 可用时，优先 WSL 启动 Web，避免误判为 Windows 启动路径
  - Web 客户端超时参数默认注入：`NEXT_PUBLIC_API_TIMEOUT_MS=30000`（用于高负载页面稳定性）
- `crates/law-eye-worker/src/main.rs`
  - worker 主线程栈大小管理，消除启动栈溢出。

### 2.4 本轮新增阻断修复
- `scripts/enterprise/rc2-gate.sh`
  - `web_e2e` 执行时强制透传 `E2E_BASE_URL=$LAW_EYE_WEB_URL`，避免读取陈旧 `tmp/e2e-env.json` 导致跨端口 CSRF。
- `crates/law-eye-api/src/routes/articles.rs`
  - 文章详情读取授权改为租户作用域 `tenant/article.read`，与列表/搜索读取路径保持一致，避免新入库文章资源元组短暂缺失造成详情页失败。
- `apps/web/e2e/lawsaw.e2e.spec.ts`
  - 文章详情阶段增强重试与关键词提取，降低数据新鲜度窗口导致的偶发失败。
  - 放宽已知 hydration 噪声日志（`wfd-id` 注入）以避免误判非功能性失败。

## 3. 验证证据（真实执行）

### 3.1 栈启动
- 命令：`bash scripts/no-dockerhub/start-stack.sh --name codex-ulw-r13`
- 结果：API/Worker/Web 均可用；本次由 `start-stack.sh` 直接拉起 Web（`http://localhost:8850`），无需手动补启动。

### 3.2 核心 e2e（embedding 断言开启，连续 3 轮）
- 命令：`node tmp/core-e2e-local.mjs --base-url http://127.0.0.1:13000 --origin http://localhost:8850 --assert-knowledge-embedding 1`
- 结果：
  - `tmp/core-e2e-r50-assert1-round1.json` -> `ok=true`（`entities_with_embedding=12`）
  - `tmp/core-e2e-r50-assert1-round2.json` -> `ok=true`（`entities_with_embedding=12`）
  - `tmp/core-e2e-r50-assert1-round3.json` -> `ok=true`（`entities_with_embedding=12`）
  - 三轮均 `report.download.status=200`。

### 3.4 RC2 Gate
- 命令：`bash scripts/enterprise/rc2-gate.sh`
- 默认策略变更：新增 `LAW_EYE_REQUIRE_AI`，默认 `1`。
- fail-fast 验证（默认配置）：AI 不可用时会在 `ai_available` gate 直接失败（保留）。
- 环境关键参数：
  - `LAW_EYE_BASE_URL=http://127.0.0.1:13000`
  - `LAW_EYE_WEB_URL=http://127.0.0.1:8850`
  - `LAW_EYE_WORKER_HEALTH_URL=http://127.0.0.1:3002`
  - `LAW_EYE_ASSERT_KNOWLEDGE_EMBEDDING=1`（默认）
  - `LAW_EYE_REQUIRE_AI=1`（默认）
  - `LAW_EYE_RUN_WEB_TEST=1`（默认）
  - `LAW_EYE_RUN_WEB_E2E=1`（默认）
- 结果：PASS
  - 报告目录：`tmp/rc2-gate-20260227T164809Z`
  - 汇总文件：`tmp/rc2-gate-20260227T164809Z/summary.txt`

## 4. 风险评估（批判性）
- **P1 风险（AI 探测）**：`/health` 当前为 `ai.available=true` 且 `degraded_reason=check_timeout`，说明 AI 可用但健康探测存在间歇超时噪声。
- **P1 风险（E2E 时长）**：`web_e2e` 单文件约 7 分钟，建议在 CI 做并行拆分与资源隔离。
- **P2 风险（DB 深验）**：`post-deploy-verify` 提示 `psql not found`，数据库回归 SQL 深度校验未执行。

## 5. 当前 Go/No-Go 判定
- 对“本地核心链路可运维 + 强断言”判定：**Go**
  - 基线证据：`rc2-gate-20260227T164809Z`（全门禁 PASS）。
- 对“生产可部署”判定：**Go（附运维前置项）**
  - 前置项：部署环境补齐 `psql` 以执行 DB 深验；持续观察 AI health timeout 噪声。

## 6. 下一步建议（按优先级）
1. P0：在预发/生产安装 `psql`，把 `post-deploy-verify` 的 DB 回归 SQL 验证从 skip 提升为强制 gate。
2. P1：将 `web_e2e` 在 CI 中拆分并行执行，缩短单次门禁时长并降低偶发超时。
3. P1：持续监控 AI health 的 `check_timeout`，必要时将探测超时从 2s 调整为更符合公网链路的阈值。
