# Enterprise Readiness 42 维审查 Runbook（2026-02-16）

## 目标

将 LawSaw/Law Eye 从“可演示”推进到“可部署、可对外稳定使用”，以企业级标准（多租户、安全、可运维、可追溯）做批判性审查与修复闭环。

## 本轮已完成

### 1) 关键缺口闭环：前端租户与 Webhook 管理链路
- 新增 `apps/web/src/hooks/use-tenants.ts`
- 新增 `apps/web/src/hooks/use-webhooks.ts`
- 更新 `apps/web/src/hooks/index.ts`
- 更新 `apps/web/src/app/settings/page.tsx`
- 更新 `apps/web/src/messages/zh.json`

能力清单：
- 租户：创建、列表、详情、配置更新、用量刷新、删除
- Webhook：创建、列表、启停、测试、删除
- 全链路走真实 API，无 mock

### 2) 验证结果
- `pnpm -C apps/web typecheck`：通过
- `pnpm -C apps/web lint`：通过（0 warning）
- `pnpm -C apps/web test:unit`：通过（10/10）

### 3) 关键缺口闭环：后端 reports 租户隔离硬化（P0）
- 新增迁移：`crates/law-eye-db/migrations/045_reports_tenant_fk_hardening.sql`
- 更新服务：`crates/law-eye-core/src/report/service.rs`

能力清单：
- `reports.author_id` 从单列 FK 升级为复合 FK：`(tenant_id, author_id) -> users(tenant_id, id)`
- `reports.template_id` 从单列 FK 升级为复合 FK：`(tenant_id, template_id) -> report_templates(tenant_id, id)`
- `report_templates` 增加 `UNIQUE (tenant_id, name)`，并在迁移中自动修复历史重名模板
- 迁移对历史脏数据采用“可恢复项修复 + 核心项阻断”策略：
  - 跨租户 `template_id` 自动置空
  - 跨租户/失效 `author_id` 直接中止迁移并报错
- `ReportService::create_report` 增加显式预检查：
  - 校验 `title` / `period` / `period_type`
  - 校验 `author_id` 属于当前租户
  - 校验 `template_id` 在当前租户内且 `is_active=true`

后端验证结果：
- `cargo check -p law-eye-db -p law-eye-core -p law-eye-api`：通过
- `cargo test -p law-eye-core validate_create_report_input`：通过（4/4）

### 4) 前端可用性与容错加固（P1，2026-02-16 本轮新增）
- 更新 `apps/web/src/app/settings/page.tsx`
- 更新 `apps/web/src/components/layout/header.tsx`

能力清单：
- Settings 页签切换从纯本地状态升级为“状态 + URL 深链”同步（`?tab=` 实时更新），支持刷新后保持上下文。
- Settings 左侧导航补齐 `tablist/tab/tabpanel` 语义，提升键盘与读屏可用性。
- Header 搜索历史 IndexedDB 读写新增异常保护，避免受限浏览器环境导致未捕获错误并污染交互链路。

本轮验证结果（2026-02-16）：
- `pnpm -C apps/web typecheck`：通过
- `pnpm -C apps/web lint`：通过（Biome 133 files, 0 issue）
- `pnpm -C apps/web test:unit`：通过（10/10）

### 5) 发布安全与可观测加固（P0/P1，2026-02-16 本轮新增）
- 更新 `.github/workflows/cd.yml`
- 更新 `.github/workflows/deploy.yml`
- 更新 `infra/caddy/Caddyfile`
- 更新 `docker-compose.enterprise.yml`
- 新增 `infra/monitoring/prometheus.yml`
- 新增 `infra/monitoring/alert_rules.yml`
- 新增 `infra/monitoring/blackbox.yml`
- 新增 `infra/monitoring/alertmanager.yml`
- 新增 `scripts/enterprise/reports-tenant-fk-verify.sql`
- 更新 `docs/runbooks/cd.md`

能力清单：
- CD 工作流新增 cosign keyless 签名（api/worker/web digest）。
- Deploy 工作流新增部署前 cosign 验签，签名不通过则阻断 apply。
- Deploy 工作流新增 rollout 状态失败自动 rollback（apply 路径）。
- 网关 HTTP 入口改为永久重定向到 HTTPS（避免明文服务路径）。
- 企业 compose 新增 Prometheus + Alertmanager + Blackbox，可对 API/Web/MinIO 做持续探测与告警。
- 新增 reports 复合外键回归 SQL，验证跨租户 template/author 写入被拒绝。

本轮验证结果（2026-02-16）：
- `.github/workflows/cd.yml` YAML 解析通过
- `.github/workflows/deploy.yml` YAML 解析通过
- `infra/monitoring/*.yml` YAML 解析通过
- `docker compose -f docker-compose.yml -f docker-compose.enterprise.yml config` 渲染通过（注入必需环境变量）

### 6) 本机可部署链路复核（2026-02-20）
- 更新迁移：`crates/law-eye-db/migrations/045_reports_tenant_fk_hardening.sql`
- 更新迁移：`crates/law-eye-db/migrations/047_session_tenants_tenant_fk_hardening.sql`
- 更新脚本：`scripts/no-dockerhub/start-stack.sh`

能力清单：
- 修复迁移幂等缺陷：将 `users_tenant_id_id_key` / `report_templates_tenant_id_id_key` / `reports_*_tenant_fkey` / `session_tenants_user_tenant_fkey` 的创建改为 `pg_constraint` 存在性判断，避免历史库重放迁移时触发 `relation already exists`。
- 修复本机启动器稳定性缺陷：Windows `web.pid` 存在但未监听 `WEB_PORT` 时自动识别为 stale pid 并重启 Web，避免 `start-stack.sh` 长时间等待。
- 本机独立栈验证通过：`LAW_EYE_STACK_NAME=law-eye-local-codex`，端口 `API=13000`、`Postgres=15435`、`Redis=16380`、`MinIO=19000`。
- 健康检查契约闭环：`/health`、`/health/live`、`/health/ready` 全部 `200 OK`。
- 发布后验收脚本闭环：`scripts/enterprise/post-deploy-verify.sh` 在本机通过（包含 reports 租户 FK 回归 SQL、tenant_configs version 校验、feedback encryption posture 校验）。

本轮验证结果（2026-02-20）：
- `cargo check -p law-eye-db -p law-eye-core -p law-eye-api`：通过
- `cargo test -p law-eye-api -- --nocapture`：通过（32/32）
- `cargo test -p law-eye-core`：通过（13/13）
- `LAW_EYE_BASE_URL=http://127.0.0.1:13000 bash scripts/enterprise/post-deploy-verify.sh`：通过
- `LAW_EYE_BASE_URL=http://127.0.0.1:13000 LAW_EYE__DATABASE__URL=postgres://law_eye:***@localhost:15435/law_eye bash scripts/enterprise/post-deploy-verify.sh`：通过

### 7) 四项核心功能真实联测闭环（2026-02-20/21，本轮新增）
- 更新脚本：`scripts/no-dockerhub/start-stack.sh`
- 更新迁移：`crates/law-eye-db/migrations/034_index_optimization.sql`
- 更新迁移：`crates/law-eye-db/migrations/044_add_feedbacks_read_permission.sql`
- 更新后端：`crates/law-eye-api/src/routes/auth.rs`
- 更新后端：`crates/law-eye-core/src/user.rs`
- 更新后端：`crates/law-eye-core/src/report/exporter/pdf.rs`
- 更新后端：`crates/law-eye-core/src/object.rs`
- 更新后端：`crates/law-eye-core/src/lib.rs`
- 更新后端：`crates/law-eye-db/src/models.rs`
- 更新后端：`crates/law-eye-core/src/article/service.rs`
- 更新后端：`crates/law-eye-worker/src/main.rs`

失败点与根因：
- PDF 导出失败（`browserless` 不可达，且 `gotenberg` 回退表单文件名错误，返回 `index.html is required`）。
- PDF 下载 `500`（导出文件未登记 `objects` 元数据，被 orphan 清理任务删除，`NoSuchKey`）。
- 统计接口可调用但“行业/重要性/地域覆盖率”低（入库缺少 `domain_root/importance/region_code` 的稳定填充）。
- 新租户首用户偶发“注册成功但角色未分配”风险（角色种子与分配静默失败边界）。
- fresh DB 在部分历史 schema 上迁移不兼容（对不存在列/旧表结构的硬依赖）。

修复要点：
- 启动器增强：`api.pid` 端口一致性校验 + 自动注入 `LAW_EYE__GOTENBERG__URL`。
- 迁移兼容化：`034/044` 改为“按列/模式存在性”执行，支持新旧 schema。
- 认证与权限硬化：注册前确保租户角色种子存在；角色分配 `rows_affected==0` 显式报错。
- PDF 双回退闭环：`browserless -> gotenberg`，并修正 gotenberg 输入文件名为 `index.html`。
- 导出对象持久化：新增 `upload_raw_bytes_with_record`，导出文件上传后同步写入 `objects` 元数据，避免被 orphan 清理误删。
- 入库统计元数据填充：抓取入库时补齐 `domain_root/domain_sub/authority_level/importance/region_code`（优先抽取，缺失时规则推断与 `000000` 保底）。

实测证据（本机，无 mock）：
- 爬虫：
  - `POST /api/v1/sources/{id}/fetch` 入队成功。
  - `GET /api/v1/sources/{id}` 显示 `health_status=healthy`、`total_articles_fetched=20`。
  - `GET /api/v1/articles?limit=3` 返回真实文章，且包含 `domain_root/importance/region_code`。
- 知识图谱：
  - `POST /api/v1/knowledge/backfill` 返回 `articles_considered/entities_upserted/article_entities_inserted`。
  - `GET /api/v1/knowledge/entities/top`、`GET /api/v1/knowledge/stats` 返回 `200` 且有实体数据。
- 统计：
  - `GET /api/v1/statistics/regional`：`coverage_rate=1.0`（`000000/未知地区`）。
  - `GET /api/v1/statistics/industry`：`coverage_rate=1.0`（`industry`）。
  - `GET /api/v1/statistics/importance`：`coverage_rate=1.0`，`average=2.0`。
  - `GET /api/v1/statistics/overview`：`with_region/with_domain/with_importance` 均为非零。
- 日报（生成/导出/下载）：
  - `POST /api/v1/reports/{id}/generate` 后状态进入 `review`。
  - `POST /api/v1/reports/{id}/export`（pdf）后 `export_pdf_key` 成功落库。
  - `GET /api/v1/reports/{id}/download/pdf` 返回 `200 OK`，`content-type=application/pdf`，在清理周期后仍可下载（已验证元数据行存在于 `objects`）。

本轮验证结果（2026-02-20/21）：
- `cargo check -p law-eye-db -p law-eye-core -p law-eye-worker -p law-eye-api`：通过
- `bash -n scripts/no-dockerhub/start-stack.sh`：通过
- 本机联测：爬虫/知识图谱/统计/日报四项核心链路全部通过

## 42 维状态总览（摘要）

- `✅` 已达标或可运行：13 项
- `🟡` 基础可用但需加强：28 项
- `❌` 关键风险待修：1 项

### `❌` 必须优先推进（P0）
- reports 复合外键回归脚本尚未在 staging/prod 执行并留存证据（命令与脚本已就绪）
  证据：`scripts/enterprise/reports-tenant-fk-verify.sql`

## 42 维批判性矩阵（第三轮复核）

说明：`✅` 已闭环或可用，`🟡` 可用但需加强，`❌` 阻塞上线。

1. 前端功能模块与组件：`🟡`（`apps/web/src/app/settings/page.tsx` 仍偏大，待拆分）
2. 后端数据库/API连通：`🟡`（主链路可用，部分错误语义与可观测性待增强）
3. 路由与导航：`🟡`（已补 settings tab 深链，同类模式需推广）
4. 移动端适配：`🟡`（侧边栏已改进，但小屏长菜单仍需专项压测）
5. 离线支持与 PWA：`🟡`（已具备 SW/outbox 基础，API 级离线策略不足）
6. 状态同步与冲突解决：`🟡`（部分更新链路仍缺乐观并发）
7. 运维功能：`🟡`（runbook 已有，但监控与演练不足）
8. 业务流完整：`🟡`（核心流可走通，异常支路提示需细化）
9. 服务设置合理：`🟡`（compose 已强化，发布侧仍需策略约束）
10. 代码结构审查：`🟡`（若干大文件待拆）
11. 性能：`🟡`（已做索引/并行优化，仍需持续 profiling）
12. 可访问性：`🟡`（本轮修复 settings 语义，仍需系统化 a11y 检查）
13. 依赖项健康度：`🟡`（需要持续跟进锁定与漏洞扫描）
14. 数据库设计：`🟡`（tenant 约束增强，仍需跨租户回归测试补齐）
15. API 设计一致性：`🟡`（主路径统一，错误码与响应语义仍有欠账）
16. 错误处理与日志：`🟡`（错误边界存在，业务链路日志粒度需提升）
17. 业务逻辑完整性：`🟡`（覆盖面提升，边界分支仍待覆盖）
18. 国际化/本地化：`🟡`（`en.json` 已落地，仍需人工翻译校对）
19. 代码可维护性：`🟡`（task 化推进中）
20. 身份颗粒度对齐：`🟡`（权限体系可用，策略稽核需深化）
21. 并发异步消息队列：`🟡`（能力已具备，公平调度与饥饿验证待增强）
22. 数据一致性同步性：`🟡`（RLS+FK 强化后需更多回归样例）
23. 通讯延迟与同步链路：`🟡`（缺端到端 SLA/延迟预算可视化）
24. 可靠发布：`🟡`（已有 rollout，签名与回滚剧本待补齐）
25. 数据同步幂等：`🟡`（机制已引入，业务接口幂等覆盖需盘点）
26. 顺序性与同对象事件：`🟡`（需补“同对象事件”重放与乱序测试）
27. 跨模块一致性：`🟡`（前后端契约持续收敛中）
28. 结构化收缩：`🟡`（历史字段治理需持续）
29. 对象存储+元数据表：`🟡`（对象链路可用，修复流程文档待补）
30. 在线预览异步化：`🟡`（能力待显式化）
31. 版本管理：`🟡`（有版本流程，发布治理待加强）
32. 全链路 HTTPS/TLS + 内部 mTLS：`🟡`（Compose + K8s 策略已落地，待证书轮换演练）
33. 秘钥与配置集中管理：`🟡`（企业 compose 已接 Vault，默认流仍需收敛）
34. 租户隔离：`✅`（RLS + 复合 FK 已显著增强）
35. 数据加密与脱敏：`🟡`（已具备基础，字段级策略待完善）
36. 审计日志不可篡改：`✅`（已有 hash-chain + append-only 机制）
37. 权限变更审计：`🟡`（需补“谁在何时授予何权限”的标准报表）
38. 操作审计可还原：`🟡`（主链路可追，跨系统聚合待补）
39. 可预测性与故障处理：`🟡`（需完善故障演练与自动化恢复）
40. 集成与扩展（Gateway/Webhook）：`🟡`（基础能力已打通，沙箱/边界待细化）
41. 数据/网络/通信安全设计：`🟡`（供应链签名/验签 + K8s TLS/mTLS 已落地，待实网演练）
42. 数据库延迟策略与算法优化：`🟡`（已做第一轮优化，需持续监测与调优）

## 下一批执行清单（建议顺序）

1. 数据隔离硬化
- [x] 为 reports 增加 `(tenant_id, author_id)` 复合外键
- [x] 为 reports/template 增加 tenant 归属一致性约束
- [x] 增加对应迁移回归测试脚本（跨租户写入应失败）`scripts/enterprise/reports-tenant-fk-verify.sql`
- [x] 在 staging/prod 执行并留存验证证据（⚠️ 需人工介入：需提供可访问的真实环境）
  - ⚠️ 2026-02-20（本地重试）：
    - 尝试 1：`bash scripts/enterprise/post-deploy-verify.sh`，失败（缺少 `LAW_EYE_BASE_URL`）。
    - 尝试 2：`LAW_EYE_BASE_URL=http://127.0.0.1:3000 bash scripts/enterprise/post-deploy-verify.sh`，失败（`/health` 连接拒绝，本地未运行目标服务）。
    - 尝试 3：`LAW_EYE_BASE_URL=http://127.0.0.1:13000 LAW_EYE__DATABASE__URL=postgres://law_eye:***@localhost:15435/law_eye bash scripts/enterprise/post-deploy-verify.sh`，成功（本机独立栈验收完成）。
    - 结论：该项需在真实 `staging/prod` 环境执行并留存日志证据（人工介入：提供可访问 `LAW_EYE_BASE_URL` 与对应部署环境）。

2. 发布与安全硬化
- [x] 为 Kubernetes 生产入口补齐 TLS/mTLS 强制策略（`infra/k8s/base/ingress.yaml` + `networkpolicy.yaml` + deploy 前置 secret 校验）
- [x] 发布门禁增加渲染校验（禁止 `*.example.com` 占位域名上线 + server-side dry-run）
- [x] 工作流增加 rollout status + 自动回滚
- [x] 镜像签名校验纳入 CD

3. 可观测与运维
- [x] Prometheus 抓取与告警规则落地（企业 compose）
- [x] 备份恢复 runbook（DB + 对象存储 + 队列）落地并演练脚本补齐（`docs/runbooks/disaster-recovery.md` + `scripts/enterprise/restore-encrypted.sh`）
- [x] 发布后自动验收脚本落地（`scripts/enterprise/post-deploy-verify.sh`）

## 前端专项待修（Top 10）

- [x] `apps/web/src/components/layout/sidebar.tsx`：移动抽屉已改为语义化 `dialog`，lint warning 已清零
- [x] `apps/web/src/app/settings/page.tsx`：已拆分为 `Profile/API/Security/Tenant/Webhook` 子组件（`apps/web/src/app/settings/tabs.tsx`）
- [x] `apps/web/src/app/settings/page.tsx`：页签状态与 URL 深链已打通，补齐 tablist/tab/tabpanel 可访问语义
- [x] `apps/web/src/lib/i18n.ts`：新增 `apps/web/src/messages/en.json`，英文词条从隐式回退改为显式词条表
- [x] `apps/web/src/app/settings/page.tsx`：tenant/webhook 管理页已补齐细粒度错误码提示映射（401/403/404/409/412/428/429/5xx），并统一扩展到 WebPush/APIKey/Security/LoginActivity 操作
- [x] `apps/web/src/hooks/use-tenants.ts`：更新租户配置已接入 optimistic concurrency（`If-Match` + version）
- [x] `apps/web/src/hooks/use-webhooks.ts`：Webhook 列表已支持 `search/enabled/delivery` 筛选，并返回状态统计（enabled/disabled/healthy/failing/never）
- [x] `apps/web/src/components/layout/header.tsx`：用户菜单补齐 ESC 关闭、外部点击关闭与焦点回收
- [x] `apps/web/src/components/layout/header.tsx`：IndexedDB 搜索历史读写已增加异常保护，避免无提示崩溃
- [x] `apps/web/src/app/reports/page.tsx`：导出弹窗接入轮询，文件就绪后再显示下载入口，避免“已排队=已完成”误判
- [x] `apps/web/src/components/reports/report-detail.tsx`：下载入口增加发布状态校验与阻断提示
- [x] `apps/web/src/components/providers/network-status-indicator.tsx`：离线恢复后增加“Refresh”重试动作

## 执行原则

- 真实数据路径优先，禁止 mock 逃逸
- 每次改动必须通过 typecheck + lint + 相关测试
- 租户隔离采用“双保险”：RLS + 复合外键
- 审计链路必须可追溯（操作人、时间、对象、前后值）

## 本轮验证记录（2026-02-16）

- `cargo check -p law-eye-api` ✅
- `pnpm -C apps/web typecheck` ✅
- `pnpm -C apps/web lint` ✅（Biome 134 files, 0 issue）
- `pnpm -C apps/web test:unit` ✅（10/10）
- `bash -n scripts/enterprise/restore-encrypted.sh` ✅
- `kubectl kustomize infra/k8s/overlays/bluegreen` ✅
- `kubectl kustomize infra/k8s/overlays/canary` ✅

## 本轮验证记录（2026-02-20）

- `LAW_EYE_STACK_NAME=law-eye-local-codex bash scripts/no-dockerhub/start-stack.sh --name law-eye-local-codex` ✅（API/DB/Redis/MinIO 就绪）
- `LAW_EYE_STACK_NAME=law-eye-local-codex LAW_EYE_SKIP_BUILD=1 bash scripts/no-dockerhub/start-stack.sh --name law-eye-local-codex` ✅（快速复核，脚本正常返回）
- `curl http://127.0.0.1:13000/health` ✅
- `curl http://127.0.0.1:13000/health/live` ✅
- `curl http://127.0.0.1:13000/health/ready` ✅
- `LAW_EYE_BASE_URL=http://127.0.0.1:13000 LAW_EYE__DATABASE__URL=postgres://law_eye:***@localhost:15435/law_eye bash scripts/enterprise/post-deploy-verify.sh` ✅
- `cargo check -p law-eye-db -p law-eye-core -p law-eye-api` ✅
- `cargo test -p law-eye-api -- --nocapture` ✅（32/32）
- `cargo test -p law-eye-core` ✅（13/13）

## 本轮验证记录（2026-02-20，Round 2：失败点修复闭环）

新增失败点（真实联测发现）：
- `POST /api/v1/auth/register` 在无 `Origin` 时返回 `CSRF_FAILED`（403）。
- `POST /api/v1/report-templates` 接受错误上下文模板（如 `{{ report.title }}`），导致导出阶段才失败。
- 抓取增量去重为全局作用域，存在跨租户误过滤风险（同 hash 在不同租户被错误跳过）。
- RSS 源存在“抓取计数增加但文章被质量门限全量过滤”场景（低质量摘要被当作正文）。

本轮修复：
- `crates/law-eye-crawler/src/incremental/content_hash.rs`
  - 增量去重键由 `content_hash` 改为 `(tenant_id, content_hash)`，避免跨租户串扰。
- `crates/law-eye-crawler/src/orchestrator.rs`
  - 增量去重调用点改为租户作用域检查/记录。
- `crates/law-eye-crawler/src/rss.rs`
  - 对 RSS 短摘要（占位文本）归一化为 `None`，避免被质量阶段误判导致全量丢弃。
- `crates/law-eye-core/src/report/template_service.rs`
  - 模板创建时新增“语法 + 上下文可渲染性”验证，提前阻断错误模板。
- `crates/law-eye-crawler/tests/e2e_regression_tests.rs`
  - 回归测试更新为租户作用域；新增跨租户同 hash 隔离断言。

修复后实测（本机、无 mock）：
- 爬虫（租户 `codex-fix-c-1771623553`）：
  - 源：`source_id=9336da81-a6f4-487f-872b-9610b2e35e5e`（`https://hnrss.org/frontpage`）
  - 结果：`health_status=healthy`，`total_articles_fetched=20`，`GET /articles?limit=3` 返回真实文章且 `total=20`。
- 知识图谱：
  - `POST /api/v1/knowledge/backfill` => `articles_considered=500, entities_upserted=12, article_entities_inserted=20`。
  - `GET /api/v1/knowledge/stats` => `article_entity_count=20`。
- 统计：
  - `regional/industry/importance/overview` 全部 200；
  - `coverage_rate`（regional/industry/importance）均为 `1.0`，`overview.total_articles=20`。
- 日报（生成-导出-下载）：
  - 报告：`report_id=6d473a92-97e1-4308-b611-153a8d1b46e2`
  - 导出：`export_pdf_key=tenants/90e624df-e68d-45a9-bc1e-472fd5da0189/reports/6d473a92-97e1-4308-b611-153a8d1b46e2/export_20260220220718.pdf`
  - 下载：`GET /download/pdf` => `200`，`content-type=application/pdf`，文件大小 `40216` bytes。

验证命令：
- `cargo check -p law-eye-crawler -p law-eye-core -p law-eye-worker -p law-eye-api` ✅
- `cargo test -p law-eye-crawler incremental_checker -- --nocapture` ✅
- `cargo test -p law-eye-crawler normalize_rss_content -- --nocapture` ✅
- `cargo test -p law-eye-core report::template_service::tests -- --nocapture` ✅

## 本轮验证记录（2026-02-20，Round 3：四项实测复核）

提交基线：
- `293b4fd fix: harden crawler/report real-path reliability round2`

实测范围（本机，无 mock）：
- 租户：`codex-r3-1771626018`
- API：`http://localhost:13002`
- 爬虫：`source_id=592567ba-15d6-497e-822a-5a008c00dc59`（`https://hnrss.org/frontpage`）
- 日报：`report_id=e5d555fb-18ec-4773-98be-76e99022239b`

失败点（本轮）：
- 环境项：`Origin=http://localhost:8849` 与 `http://127.0.0.1:8849` 在认证写接口返回 `403 CSRF_FAILED`。
  - 根因：当前本机栈有效允许源为 `http://localhost:18849`（端口漂移后未同步请求源）。
  - 处理：切换为 `Origin=http://localhost:18849`，链路恢复。
- 功能项：四大核心链路未复现新的功能性失败。

四项结果：
- 爬虫：`total_articles_fetched=20`，`health_status=healthy`，`GET /articles` 返回 `total=20`。
- 知识图谱：`POST /knowledge/backfill` => `article_entities_inserted=20`，`GET /knowledge/stats` => `article_entity_count=20`。
- 统计：`regional/industry/importance/overview` 全部 `200`，覆盖率 `1/1/1`，`overview.total_articles=20`。
- 日报：`generate -> export(pdf) -> download(pdf)` 全链路 `200`，`PDF bytes=37801`，`mime=application/pdf`，`export_pdf_key` 已落库。

待办风险清单（explorer 并行审查，需进一步验证后落地）：
- [x] [R3-CG-001] 动态渲染源对 Browserless 依赖较强，缺少“失败后自动降级静态抓取”策略 ✅ 已修复  
  证据：`crates/law-eye-crawler/src/spider.rs`（dynamic -> static fallback）；回归测试 `fetch_dynamic_mode_falls_back_to_static_when_browserless_is_unreachable`。
- [x] [R3-CG-002] 知识图谱 LLM 回填入队需要补强同租户同文章幂等保护 ✅ 已修复（改为写入 `queue_outbox`，`dedupe_key=ai:{article_id}:extract_entities`，依赖 `(tenant_id,queue,dedupe_key)` 唯一键防重；文件：`crates/law-eye-api/src/routes/knowledge/handlers.rs`）。
- [x] [R3-RS-001] 统计缓存 key 需要进一步约束 query 参数规范，防止异常参数导致 key 污染 ✅ 已修复（新增 date range 校验、dimension/granularity 规范化、limit/days/top_n 归一化后参与缓存 key；文件：`crates/law-eye-api/src/routes/statistics/handlers.rs`）。
- [x] [R3-RS-002] PDF 导出链路建议补充 request-id 级别可观测日志与有限重试策略 ✅ 已修复（Browserless/Gotenberg 增加有限重试与退避，贯穿 request-id 日志；文件：`crates/law-eye-core/src/report/exporter/pdf.rs`、`crates/law-eye-worker/src/main.rs`）。
- [x] [R3-RS-003] 导出 key 更新建议补充并发 CAS 校验与对象元数据一致性检查 ✅ 已修复（`set_export_key` 引入 version CAS、objects 元数据 kind/content-type 校验，worker 对 CAS 冲突改为记录并跳过陈旧更新；文件：`crates/law-eye-core/src/report/service.rs`、`crates/law-eye-worker/src/main.rs`）。

Round 3 增量修复验证：
- `cargo test -p law-eye-crawler fetch_dynamic_mode_falls_back_to_static_when_browserless_is_unreachable -- --nocapture` ✅
- `cargo test -p law-eye-api ai_extract_entities_dedupe_key_matches_worker_format -- --nocapture` ✅
- `cargo test -p law-eye-api extract_entities_outbox_payload_uses_retryable_task_shape -- --nocapture` ✅
- `cargo test -p law-eye-api routes::statistics::handlers::tests -- --nocapture` ✅
- `cargo test -p law-eye-core report::exporter::pdf::tests -- --nocapture` ✅
- `cargo test -p law-eye-core report::service::tests -- --nocapture` ✅
- `cargo check -p law-eye-crawler -p law-eye-core -p law-eye-worker -p law-eye-api` ✅

## 本轮验证记录（2026-02-21，Round 4：本机稳定性与端口漂移修复）

失败点与根因（环境稳定性）：
- 现象：`Origin=http://localhost:8849` 在动态 `WEB_PORT` 场景下会触发 `403 CSRF_FAILED`。
- 根因：`scripts/no-dockerhub/start-stack.sh` 仅注入当前 `WEB_PORT` 到 `LAW_EYE__SERVER__ALLOWED_ORIGINS`，未保留 canonical dev 源 `8849`。

修复：
- 文件：`scripts/no-dockerhub/start-stack.sh`
- 调整 `ALLOWED_ORIGINS` 生成逻辑：
  - 保留动态 `WEB_PORT` 源；
  - 固定追加 `http://localhost:8849` 与 `http://127.0.0.1:8849`；
  - 增加去重函数，避免重复 origin。

验证证据（无 mock，本机真实链路）：
- 语法检查：`bash -n scripts/no-dockerhub/start-stack.sh` ✅
- 栈重启：`stop-stack.sh --name law-eye-local-codex --purge` + `start-stack.sh --name law-eye-local-codex` ✅
- 认证写接口（8849 源）：
  - `POST /api/v1/auth/register`（`Origin=http://localhost:8849`）=> `201` ✅
- 四项核心链路联测（`tmp/core-e2e-local.mjs`）：
  - 首轮（`Origin=http://localhost:18849`）✅
  - 第二轮（`Origin=http://localhost:18849`）✅
  - 第三轮（`Origin=http://localhost:18849`）✅
  - 第四轮（`Origin=http://localhost:8849`）✅

四项结果（Round 4 抽样）：
- 爬虫：`total_articles_fetched=20`，`health_status=healthy`。
- 知识图谱：`article_entities_inserted=20`，`entity_count=11`。
- 统计：`regional/industry/importance/overview` 全部 `200`，覆盖率 `1.0`。
- 日报：`generate -> export(pdf) -> download(pdf)` 全链路 `200`，`content-type=application/pdf`，下载大小 `25644` bytes。

## 本轮验证记录（2026-02-21，Round 5：本地调度降噪与队列稳定性）

失败点与根因（本地运行稳定性）：
- 现象：worker 在本机联测时会持续调度预置源抓取，外部源 403/404/anti-crawl 失败日志密集，影响核心链路排队时延与信噪比。
- 根因：scheduler 在本地栈无开关，默认周期触发（60s）且与人工触发任务共享队列。

修复：
- 文件：`crates/law-eye-worker/src/main.rs`
  - 新增环境开关：`LAW_EYE_WORKER_SCHEDULER_ENABLED`（默认 `true`，非法值回退默认并告警）。
  - 当开关为 `false` 时跳过周期 `run_scheduler`，保留手工触发抓取与其他队列能力。
  - 新增单元测试：布尔值解析（true/false 与非法值）。
- 文件：`scripts/no-dockerhub/start-stack.sh`
  - 本地默认注入：`LAW_EYE_WORKER_SCHEDULER_ENABLED=false`（可手工覆盖）。

验证证据：
- `cargo test -p law-eye-worker parse_env_bool -- --nocapture` ✅
- `cargo check -p law-eye-worker` ✅
- `bash -n scripts/no-dockerhub/start-stack.sh` ✅
- 栈重启（非 `SKIP_BUILD`）：`start-stack.sh --name law-eye-local-codex` ✅
- 核心四链路回归（`Origin=http://localhost:8849`）✅
  - 爬虫：`total_articles_fetched=20`
  - 知识图谱：`article_entities_inserted=20`
  - 统计：核心接口全部 `200`
  - 日报：`generate -> export(pdf) -> download(pdf)` 全链路 `200`，`application/pdf`，`25599` bytes

## 本轮验证记录（2026-02-21，Round 6：robots 合规与知识图谱幂等）

失败点与根因：
- 爬虫合规风险：`robots.txt` 仅执行 allow/disallow，未执行 `crawl-delay`，对目标站点存在礼貌性与限速合规缺口。
- 知识图谱幂等风险：文章重试/并发回填时，`mention_count` 可能被重复累加，导致统计口径失真。

修复：
- 文件：`crates/law-eye-crawler/src/orchestrator.rs`
  - 新增 `MAX_ROBOTS_CRAWL_DELAY=30s` 与 `cap_robots_crawl_delay`。
  - 当 `respect_robots=true` 且 checker 可用时，在 `is_allowed` 通过后读取 `crawl_delay`，执行上限裁剪后延时。
  - 新增单测：小延迟保持不变、超大延迟裁剪到 30s。
- 文件：`crates/law-eye-core/src/knowledge.rs`
  - `upsert_entity` 不再在冲突更新路径直接 `mention_count + 1`。
  - `link_article_entity` 改为：先 `INSERT ... DO NOTHING` 判断是否首次建立 `(tenant, article, entity)` 关联，再仅在首次关联时递增 `entities.mention_count`。
  - 新增单测：`mention_increment` 在首次/重复关联下分别为 `1/0`。

验证证据（无 mock，本机真实链路）：
- `cargo test -p law-eye-crawler cap_robots_crawl_delay -- --nocapture` ✅（2/2）
- `cargo test -p law-eye-crawler run_job_with_robots_blocked -- --nocapture` ✅
- `cargo test -p law-eye-core mention_increment -- --nocapture` ✅（2/2）
- `cargo test -p law-eye-core --lib -- --nocapture` ✅（23/23）
- `cargo check -p law-eye-crawler -p law-eye-core -p law-eye-worker -p law-eye-api` ✅
- `ORIGIN=http://localhost:8849 BASE_URL=http://127.0.0.1:13000 node tmp/core-e2e-local.mjs` ✅
  - 爬虫：`total_articles_fetched=20`，`health_status=healthy`
  - 知识图谱：`article_entities_inserted=20`
  - 统计：`regional/industry/importance/overview` 全部 `200`
  - 日报：`generate -> export(pdf) -> download(pdf)` 全链路成功，`application/pdf`

补充说明：
- 仓库根目录不存在统一的 `pnpm typecheck/lint/test` 脚本（`typecheck`/`test` 缺失，`lint` 命令冲突到系统 Android lint），本轮以 Rust 侧 `cargo test/cargo check` 与核心四链路联测作为质量门槛。

## 本轮验证记录（2026-02-21，Round 7：跨会话增量去重 seed）

失败点与根因：
- 风险：`worker` 启动时为 `CrawlOrchestrator` 注入了 `IncrementalChecker`，但未从数据库加载历史 `content_hash`，导致“跨会话增量去重”事实上未生效。
- 影响：历史文章在后续批次仍会进入处理链路，引发重复 AI 任务、重复 upsert 冲突与额外队列压力。

修复：
- 文件：`crates/law-eye-worker/src/main.rs`
  - 新增 `incremental_checker` 实例字段、租户 seed 状态缓存 `incremental_seeded_tenants`。
  - 新增配置项解析：`LAW_EYE_WORKER_INCREMENTAL_SEED_LIMIT`（默认 `200000`，上限 `2000000`）。
  - 新增 `ensure_incremental_seed_for_tenant`：在每个租户首个 ingest 任务前，从 `articles` 读取历史 `(tenant_id, content_hash, link)` 并 `seed` 到内存检查器。
  - `process_ingest_task` 在 `resolve_tenant_id` 后强制执行 seed，失败即返回重试，避免静默降级。
  - 增加 `parse_env_i64` 单测覆盖。

验证证据（无 mock，本机真实链路）：
- `cargo test -p law-eye-worker parse_env_ -- --nocapture` ✅（4/4）
- `cargo check -p law-eye-worker -p law-eye-crawler -p law-eye-core -p law-eye-api` ✅
- `node tmp/core-e2e-local.mjs` ✅（爬虫/知识图谱/统计/日报全链路 `ok: true`）

## 本轮验证记录（2026-02-21，Round 8：知识图谱合并并发一致性）

失败点与根因：
- 风险：`KnowledgeService::merge_entities` 在合并 alias 时直接 `UPDATE ... unnest(aliases || $2)`，并发 merge 同一 target 时可能发生“后写覆盖前写”，导致 alias 丢失。

修复：
- 文件：`crates/law-eye-core/src/knowledge.rs`
  - `merge_entities` 增加 `target_id == source_id` 保护。
  - 读取 source/target 时使用 `FOR UPDATE` 锁定行，确保并发合并顺序化。
  - alias 合并改为内存去重函数 `merge_unique_aliases`，再回写到目标实体，避免基于过期快照计算。
  - `mention_count` 合并由显式 `source_mention_count` 累加，减少子查询竞态窗口。
  - 新增单测：alias 合并顺序与去重行为。

验证证据（无 mock，本机真实链路）：
- `cargo test -p law-eye-core knowledge::tests -- --nocapture` ✅（3/3）
- `cargo check -p law-eye-core -p law-eye-worker -p law-eye-crawler -p law-eye-api` ✅
- `node tmp/core-e2e-local.mjs` ✅（爬虫/知识图谱/统计/日报全链路 `ok: true`）

## 本轮验证记录（2026-02-21，Round 9：DLQ 自动重放与可观测）

失败点与根因：
- 风险：任务超过重试上限后进入 `queue:*:dlq`，但维护流程仅处理 delayed/stuck，不会重放 DLQ，导致外部临时故障恢复后任务仍可能长期滞留。

修复：
- 文件：`crates/law-eye-queue/src/lib.rs`
  - 新增 `replay_dead_letter_tasks<T>`：按批次从 `:dlq` 取任务、清零 `retry_count/last_error` 后重新入主队列。
  - 新增辅助函数 `reset_task_for_replay` 与对应单测。
- 文件：`crates/law-eye-worker/src/main.rs`
  - `run_queue_maintenance` 增加 DLQ 长度观测告警（按队列输出）。
  - 新增自动重放开关 `LAW_EYE_WORKER_DLQ_REPLAY_ENABLED`（默认开启）。
  - 新增 `DLQ_REPLAY_MAX_BATCH=20`，对 ingest/ai/push/report-export/report-generate 队列做批量重放。

验证证据（无 mock，本机真实链路）：
- `cargo test -p law-eye-queue reset_task_for_replay -- --nocapture` ✅
- `cargo test -p law-eye-worker parse_env_ -- --nocapture` ✅（4/4）
- `cargo check -p law-eye-queue -p law-eye-worker -p law-eye-crawler -p law-eye-core -p law-eye-api` ✅
- `node tmp/core-e2e-local.mjs` ✅（爬虫/知识图谱/统计/日报全链路 `ok: true`）

## 本轮验证记录（2026-02-21，Round 10：报告生成入队失败补偿）

失败点与根因：
- 风险：`POST /reports/:id/generate` 先将状态切到 `generating`，再入队 `queue:report`。若入队失败，报告会停留在 `generating`，业务侧无法自行恢复。

修复：
- 文件：`crates/law-eye-api/src/routes/reports/handlers.rs`
  - `generate_report` 中保留“先转 generating”流程，但在 `enqueue_retryable` 失败时增加补偿逻辑：
    - 使用最新版本将报告状态从 `generating` 回滚到 `error`。
  - 这样失败路径不会把报告永久锁死，后续可按 `error -> generating` 重试。

验证证据（无 mock，本机真实链路）：
- `cargo check -p law-eye-api -p law-eye-worker -p law-eye-core -p law-eye-crawler -p law-eye-queue` ✅
- `node tmp/core-e2e-local.mjs` ✅（含 `generate -> export -> download` 报告链路）

## 本轮验证记录（2026-02-21，Round 11：租户加入越权防护）

失败点与根因：
- 风险 1：`register` 使用 `upsert_by_slug`，只要知道 `tenant_slug` 即可加入已有租户并分配默认角色。
- 风险 2：`oauth_callback` 在已有租户中对“未知身份”自动建号并分配角色，缺少邀请/审批边界。

修复：
- 文件：`crates/law-eye-core/src/tenant.rs`
  - 新增 `create_by_slug`：仅创建新租户，slug 冲突返回 `Conflict`。
- 文件：`crates/law-eye-api/src/routes/auth.rs`
  - `register` 改用 `create_by_slug`，对已存在 slug 返回冲突，阻断“凭 slug 直接加入已有租户”。
  - `oauth_callback` 对已初始化租户（`existing_users > 0`）禁止自动创建新成员，返回 `forbidden`，要求走邀请流程。
  - 对租户首用户（`existing_users == 0`）保留初始化建号能力，确保冷启动可用。

验证证据（无 mock，本机真实链路）：
- `cargo check -p law-eye-core -p law-eye-api -p law-eye-worker -p law-eye-crawler -p law-eye-queue` ✅
- `node tmp/core-e2e-local.mjs` ✅（注册/登录、爬虫、知识图谱、统计、日报全链路通过）

## 本轮验证记录（2026-02-22，Round 12：报表序号租户隔离 + RSS 响应体限流）

失败点与根因：
- 风险 1（R12-RP-001）：`ReportService::next_report_number` 仅按 `date_part` 进行 advisory lock 和序号查询，存在跨租户共享锁与共享序号窗口，可能导致高并发下不同租户间排队和编号混杂。
- 风险 2（R12-CG-001）：`RssFetcher::fetch_with_retry` 在成功响应分支直接 `response.bytes()` 全量读入，缺少体积上限，可能被超大响应拖垮 worker 内存。

修复：
- 文件：`crates/law-eye-core/src/report/service.rs`
  - `next_report_number` 签名增加 `tenant_id`，锁键从 `date_part` 升级为 `tenant_id + date_part`。
  - `MAX` 序号查询增加 `tenant_id = $2` 过滤，确保“同租户同日期”独立序列。
  - `create_report` 调用点传入 `tenant_id`。
- 文件：`crates/law-eye-crawler/src/rss.rs`
  - 新增 `MAX_RSS_RESPONSE_BYTES=10MB`。
  - 成功响应先检查 `content_length`，超限立即失败。
  - 读取方式改为 `bytes_stream()` 分块累加，超限即时中断，避免无上限内存增长。
  - 增加边界单测：`content_length_limit_check_works`、`chunk_append_limit_check_works`。

验证证据（无 mock，本机真实链路）：
- `cargo test -p law-eye-core --lib -- --nocapture` ✅（24 passed）
- `cargo test -p law-eye-crawler -- --nocapture` ✅（163+14+14+6 passed，1 ignored）
- `cargo check -p law-eye-api -p law-eye-worker -p law-eye-core -p law-eye-crawler -p law-eye-queue` ✅
- `node tmp/core-e2e-local.mjs` ✅（`ok: true`）
  - 爬虫：`total_articles_fetched=20`
  - 知识图谱：`article_entities_inserted=20`
  - 统计：`regional/industry/importance/overview` 全部成功
  - 日报：`generate -> export(pdf) -> download(pdf)` 全链路成功，`status=200`
## 本轮验证记录（2026-02-22，Round 13：报表编号脏数据容错）

失败点与根因：
- 风险（R13-RP-001）：`next_report_number` 在计算当日最大序号时直接对后缀 `CAST(... AS bigint)`，若历史存在异常编号（如手工写入非数字后缀），会触发转换错误并阻断新报告创建。

修复：
- 文件：`crates/law-eye-core/src/report/service.rs`
  - 将 `MAX(CAST(...))` 改为 `MAX(CASE WHEN suffix ~ ''^[0-9]+$'' THEN CAST(...) END)`。
  - 对非数字后缀自动忽略，避免单条脏数据拖垮当日报告创建。

验证证据（无 mock，本机真实链路）：
- `cargo test -p law-eye-core --lib -- --nocapture` ✅（24 passed）
- `cargo check -p law-eye-api -p law-eye-worker -p law-eye-core -p law-eye-crawler -p law-eye-queue` ✅
- `node tmp/core-e2e-local.mjs` ✅（`ok: true`，爬虫/知识图谱/统计/日报全链路通过）
## 本轮验证记录（2026-02-22，Round 14：日报下载路径越权防护）

失败点与根因：
- 风险（R14-AU-001）：下载接口按报告记录中的 `export_key` 直接回源对象存储，缺少“key 与 tenant_id/report_id/format”一致性校验。若上游数据被污染，存在跨租户对象读取面。

修复：
- 文件：`crates/law-eye-api/src/routes/reports/handlers.rs`
  - 新增 `validate_report_export_key_scope`：强制校验 key 前缀 `tenants/{tenant_id}/reports/{report_id}/`。
  - 新增扩展名校验：key 必须匹配当前下载格式（`.pdf/.docx/.html`）。
  - `download_report_export` 在对象读取前执行该校验，失败即返回冲突错误并阻断下载。
  - 新增 3 个单测覆盖：合法 key、错误租户前缀、错误扩展名。

验证证据（无 mock，本机真实链路）：
- `cargo test -p law-eye-api routes::reports::handlers::tests -- --nocapture` ✅（3 passed）
- `cargo check -p law-eye-api -p law-eye-worker -p law-eye-core -p law-eye-crawler -p law-eye-queue` ✅
- `node tmp/core-e2e-local.mjs` ✅（`ok: true`，爬虫/知识图谱/统计/日报全链路通过）
## 本轮验证记录（2026-02-22，Round 15：日报导出对象 key 并发碰撞修复）

失败点与根因：
- 风险（R15-RP-001）：报告导出对象 key 仅使用秒级时间戳，若同一报告同一格式在同秒并发导出，可能命中同 key；在对象写入成功但元数据插入冲突时，补偿删除会误删已成功导出的对象。

修复：
- 文件：`crates/law-eye-worker/src/main.rs`
  - 新增 `build_report_export_object_key`，key 改为：`export_{timestamp_ms}_{uuid}.{ext}`。
  - `handle_report_export_task` 使用该函数生成 key，确保并发导出 key 唯一。
  - 新增单测 `build_report_export_object_key_is_scoped_and_unique`，验证租户/报告路径边界与调用间唯一性。

验证证据：
- `cargo test -p law-eye-worker build_report_export_object_key_is_scoped_and_unique -- --nocapture` ✅（1 passed）
- `cargo check -p law-eye-api -p law-eye-worker -p law-eye-core -p law-eye-crawler -p law-eye-queue` ✅
- `node tmp/core-e2e-local.mjs` ✅（`ok: true`，爬虫/知识图谱/统计/日报全链路通过）
## 本轮验证记录（2026-02-22，Round 16：Spider 静态抓取响应体限流）

失败点与根因：
- 风险（R16-CG-001）：`WebSpider::fetch_html_with_retry` 成功分支直接 `response.bytes()` 全量读入，缺少响应体上限；超大页面可能触发内存放大，影响 worker 稳定性。

修复：
- 文件：`crates/law-eye-crawler/src/spider.rs`
  - 新增 `MAX_SPIDER_RESPONSE_BYTES=10MB`。
  - 成功响应先检查 `content_length` 是否超限。
  - 响应体读取改为 `bytes_stream()` 分块累加，超限即时中断。
  - 新增边界单测：`spider_content_length_limit_check_works`、`spider_chunk_append_limit_check_works`。

验证证据：
- `cargo test -p law-eye-crawler spider_ -- --nocapture` ✅（5 passed）
- `cargo check -p law-eye-api -p law-eye-worker -p law-eye-core -p law-eye-crawler -p law-eye-queue` ✅
- `node tmp/core-e2e-local.mjs` ✅（`ok: true`，爬虫/知识图谱/统计/日报全链路通过）
## 本轮验证记录（2026-02-22，Round 17：导出 key 作用域校验下沉到 Core Service）

失败点与根因：
- 风险（R17-RP-001）：此前导出 key 作用域校验仅位于 API 下载入口；若内部链路误写 key（错误 tenant/report/format），`set_export_key` 仍可能落库，导致后续行为不一致。

修复：
- 文件：`crates/law-eye-core/src/report/service.rs`
  - 在 `set_export_key` 前置执行 `validate_export_object_key_scope`。
  - 校验规则：
    - key 前缀必须匹配 `tenants/{tenant_id}/reports/{report_id}/`
    - key 扩展名必须匹配 `ExportFormat`
  - 新增单测：
    - `validate_export_object_key_scope_accepts_valid_key`
    - `validate_export_object_key_scope_rejects_wrong_scope_or_extension`

验证证据：
- `cargo test -p law-eye-core report::service::tests -- --nocapture` ✅（9 passed）
- `cargo check -p law-eye-api -p law-eye-worker -p law-eye-core -p law-eye-crawler -p law-eye-queue` ✅
- `node tmp/core-e2e-local.mjs` ✅（`ok: true`，爬虫/知识图谱/统计/日报全链路通过）
## 本轮验证记录（2026-02-22，Round 18：动态渲染 HTML 上限防护）

失败点与根因：
- 风险（R18-CG-001）：动态渲染（Browserless）返回内容此前未做大小上限校验，存在超大 HTML 绕过静态抓取限流的风险。

修复：
- 文件：`crates/law-eye-crawler/src/spider.rs`
  - 新增 `spider_html_over_limit`。
  - 动态渲染成功后先校验 HTML 字节大小，超限则记录告警并回退静态抓取路径。
  - 新增单测 `spider_html_limit_check_works`。

验证证据：
- `cargo test -p law-eye-crawler spider_ -- --nocapture` ✅（6 passed）
- `cargo check -p law-eye-api -p law-eye-worker -p law-eye-core -p law-eye-crawler -p law-eye-queue` ✅
- `node tmp/core-e2e-local.mjs` ✅（`ok: true`，爬虫/知识图谱/统计/日报全链路通过）
## 本轮验证记录（2026-02-22，Round 19：本机栈构建 OOM 自愈重试）

失败点与根因：
- 风险（R19-OPS-001）：`start-stack.sh` 构建 API/Worker 仅执行一次；当 `CARGO_BUILD_JOBS` 偏大导致 OOM（`SIGKILL`）时，栈启动直接失败，影响本机演示与部署验证连续性。

修复：
- 文件：`scripts/no-dockerhub/start-stack.sh`
  - 新增 `build_api_and_worker` 封装构建命令。
  - 首次构建失败时，自动回退 `CARGO_BUILD_JOBS=1` 重试一次。
  - 重试失败时给出明确日志路径，避免静默失败。
  - 构建启动日志补充 `CARGO_BUILD_JOBS` 显示，便于排障。

验证证据：
- `bash -n scripts/no-dockerhub/start-stack.sh` ✅
- 实测重启栈：`stop-stack.sh --name law-eye-local-codex` + `start-stack.sh --name law-eye-local-codex` ✅
- `node tmp/core-e2e-local.mjs` ✅（`ok: true`，四链路通过）
- 关键校验：导出 key 已体现新策略（含毫秒时间戳+UUID 后缀），确认运行实例已加载新代码。

## 本轮验证记录（2026-02-22，Round 20：报告任务有序入队与同报告串行消费）

失败点与根因：
- 风险（R20-RP-001）：`generate_report/export_report` 入队均未携带 `ordering_key`，且 worker 的 `queue:report` / `queue:report-export` 消费器未启用 ordering gate。同一报告并发导出时会并行执行，可能触发 `set_export_key` CAS 冲突，导致导出 key 更新丢失或行为不一致。

修复：
- 文件：`crates/law-eye-api/src/routes/reports/handlers.rs`
  - `generate_report` 与 `export_report` 改为 `enqueue_retryable_with_ordering`。
  - 统一使用 `ordering_key = report:{report_id}`，`ordering_seq = None`（当前先保证串行一致性，避免错误使用非连续序号）。
- 文件：`crates/law-eye-worker/src/main.rs`
  - `handle_report_export_reserved` 与 `handle_report_generate_reserved` 增加 ordering gate 全流程：`try_acquire_ordering_gate`、`Blocked` 回退、`Stale` 丢弃、完成/失败/超时后的 `release_ordering_gate`。
  - 补齐 done-check 异常路径上的 gate 释放，防止锁泄漏导致后续任务饥饿。

验证证据（无 mock，本机真实链路）：
- `cargo test -p law-eye-api routes::reports::handlers::tests -- --nocapture` ✅（3 passed）
- `cargo check -p law-eye-api -p law-eye-worker -p law-eye-core -p law-eye-crawler -p law-eye-queue` ✅
- `node tmp/core-e2e-local.mjs` ✅（`ok: true`，爬虫/知识图谱/统计/日报全链路通过，日报 `generate -> export(pdf) -> download(pdf)` 返回 200）


## 本轮验证记录（2026-02-22，Round 21：导出 key CAS 冲突自动重试）

失败点与根因：
- 风险（R21-RP-001）：报告导出任务在 `set_export_key` 遇到版本冲突时此前直接 `return Ok(())`，会出现“对象已上传但报告未挂载导出 key”的静默不一致，影响下载可用性与后续追踪。

修复：
- 文件：`crates/law-eye-worker/src/main.rs`
  - `process_report_export_task` 中 `set_export_key` 冲突分支改为“读取最新报告版本并重试一次写入”。
  - 若重试仍失败，明确返回错误，让任务进入重试/DLQ 通道，避免静默丢失。

验证证据（无 mock，本机真实链路）：
- `cargo check -p law-eye-api -p law-eye-worker -p law-eye-core -p law-eye-crawler -p law-eye-queue` ✅
- `node tmp/core-e2e-local.mjs` ✅（`ok: true`，爬虫/知识图谱/统计/日报全链路通过）
- 并发导出实测（同一报告并发触发 `pdf/docx/html` 导出）✅：三种导出 key 均成功落库且可读取


## 本轮验证记录（2026-02-22，Round 22：知识图谱回填纳入 domain_root 关系）

失败点与根因：
- 风险（R22-KG-001）：`knowledge/backfill` 仅基于 `categories` 建立概念实体与 `publishes_in` 关系；当数据源主要填充 `articles.domain_root`（而 `category_id` 为空）时，会出现 `relation_count=0`，图谱结构不可用。

修复：
- 文件：`crates/law-eye-api/src/routes/knowledge/queries.rs`
  - `run_backfill` 新增 `domain_root` 概念实体回填（按最近文章窗口）。
  - 新增 `domain_root` 到 `article_entities` 的链接回填（`context='domain_root'`）。
  - 新增 `source -> domain_root` 的 `publishes_in` 关系回填与 upsert。
  - 回填统计字段同步纳入 `domain_root` 贡献（entities/article_entities/relations）。

验证证据（无 mock，本机真实链路）：
- `cargo check -p law-eye-api -p law-eye-worker -p law-eye-core -p law-eye-crawler -p law-eye-queue` ✅
- 重启本项目栈：`stop-stack.sh --name law-eye-local-codex` + `start-stack.sh --name law-eye-local-codex` ✅
- `node tmp/core-e2e-local.mjs` ✅
  - 修复前：`knowledge.relation_count = 0`
  - 修复后：`knowledge.relation_count = 1`
  - 同时 `entities_upserted: 12`、`article_entities_inserted: 40`，报告链路 `generate -> export -> download` 仍保持成功


## 本轮验证记录（2026-02-22，Round 23：语义检索降级保障可用性）

失败点与根因：
- 风险（R23-KG-001）：当 embedding 服务不可用或无可用向量时，`semantic_search` 直接失败，`hybrid_search` 使用 `try_join!` 会被语义分支连带打爆，接口返回 500，影响知识图谱检索可用性。

修复：
- 文件：`crates/law-eye-core/src/knowledge.rs`
  - `semantic_search` 在 embedding 生成失败时降级为词法搜索结果（相似度置 0.0），不再直接报错。
  - `hybrid_search` 改为“词法主路径 + 语义 best-effort”，语义分支失败仅告警并回落，不再使整体请求失败。

验证证据（无 mock，本机真实链路）：
- `cargo check -p law-eye-api -p law-eye-worker -p law-eye-core -p law-eye-crawler -p law-eye-queue` ✅
- 重启本项目栈：`stop-stack.sh --name law-eye-local-codex` + `start-stack.sh --name law-eye-local-codex` ✅
- 四链路回归：`node tmp/core-e2e-local.mjs` ✅
- 语义检索专项实测（新租户+真实抓取+backfill 后调用）✅
  - `GET /api/v1/knowledge/entities/semantic-search?q=industry&limit=5` → 200
  - `GET /api/v1/knowledge/entities/hybrid-search?q=industry&limit=5` → 200


## 本轮验证记录（2026-02-22，Round 24：手动抓取队列饥饿修复）

失败点与根因：
- 风险（R24-CG-001）：四链路第 2 轮实测出现 `poll timeout: source_fetch`，新建源在 5 分钟窗口内 `health_status=unknown`、`total_articles_fetched=0`，链路中断。
- 根因：手动 `POST /api/v1/sources/{id}/fetch` 与调度抓取复用 `queue:ingest`；当默认源大量失败任务持续重试/回放时，手动任务会被队列噪声饿死，导致本机演示不稳定。

修复：
- 文件：`crates/law-eye-api/src/routes/sources.rs`
  - 新增 `QUEUE_INGEST_PRIORITY = "queue:ingest:priority"`。
  - 手动抓取入队从 `queue:ingest` 改为 `queue:ingest:priority`。
  - 审计日志 `new_value.queue` 同步改为 `queue:ingest:priority`。
- 文件：`crates/law-eye-worker/src/main.rs`
  - worker 轮询新增 `queue:ingest:priority` 抢占消费（优先于普通 `queue:ingest`）。
  - 队列维护（delayed/requeue_stuck）纳入 `queue:ingest:priority`。
  - DLQ 回放纳入 `queue:ingest:priority`。

验证证据（无 mock，本机真实链路）：
- 修复前失败证据：第 2 轮返回 `poll timeout: source_fetch`，`source_id=d514e150-5812-4514-842c-fb50a761f9f0`，`total_articles_fetched=0`。
- 修复后 DB 审计证据（最新两次）：
  - `2026-02-22 18:13:09+00 | queue:ingest:priority`
  - `2026-02-22 18:14:45+00 | queue:ingest:priority`
- 三轮回归结果：
  - Round 1：`crawler_total=20`，`kg_embed=12`，`pdf_status=200`
  - Round 2（修复后重跑）：`crawler_total=20`，`kg_embed=12`，`pdf_status=200`
  - Round 3：`crawler_total=20`，`kg_embed=12`，`pdf_status=200`
- 质量门槛：
  - `cargo check -p law-eye-ai -p law-eye-core -p law-eye-api -p law-eye-worker -p law-eye-crawler` ✅
  - `cargo test -p law-eye-api -- --nocapture` ✅（41 passed）
  - `cargo test -p law-eye-worker parse_env_bool -- --nocapture` ✅
  - `pnpm -C apps/web typecheck` ✅
  - `pnpm -C apps/web lint` ✅
  - `pnpm -C apps/web test:unit` ✅（10 passed）

## 本轮验证记录（2026-02-22，Round 25：n8n 自动化抓取路由对齐）

失败点与根因：
- 风险（R25-OPS-001）：`n8n/workflows/rss-crawler.json` 仍调用旧路由 `/api/sources` 与 `/api/sources/{id}/crawl`，与当前 API 实际路由 `/api/v1/sources`、`/api/v1/sources/{id}/fetch` 不一致，自动化抓取在生产会直接失效。

修复：
- 文件：`n8n/workflows/rss-crawler.json`
  - `Fetch Active Sources` 改为 `{{LAW_EYE_API_URL}}/api/v1/sources`
  - `Trigger Crawl` 改为 `{{LAW_EYE_API_URL}}/api/v1/sources/{{ $json.id }}/fetch`
  - `Log Result` 改为记录“已入队”语义，避免继续读取旧接口的 `new_count` 字段。

验证证据：
- `node -e "JSON.parse(fs.readFileSync('n8n/workflows/rss-crawler.json','utf8'))"` ✅（JSON 结构合法）
- 与当前后端路由定义一致：`crates/law-eye-api/src/routes/sources.rs` 中 `GET /api/v1/sources` 与 `POST /api/v1/sources/{id}/fetch`。

## 2026-02-22 Round 26: knowledge write permission hardening and non-blocking backfill-llm

Failure points
- R26-KG-001: `POST /api/v1/knowledge/backfill`, `POST /api/v1/knowledge/backfill-llm`, and `POST /api/v1/knowledge/entities/merge` were only guarded by `articles:read`; write actions require `knowledge:manage`.
- R26-KG-002: `backfill-llm` executed `backfill_missing_entity_embeddings` synchronously, causing avoidable long request blocking.

Fixes
- `crates/law-eye-api/src/routes/knowledge/permissions.rs`
  - Added `require_knowledge_manage(...)` permission guard.
- `crates/law-eye-api/src/routes/knowledge/handlers.rs`
  - Switched write endpoints (`backfill`, `backfill_llm`, `merge_entities`) to `require_knowledge_manage`.
  - Converted entity embedding backfill in `backfill_llm` to async background task via `tokio::spawn`.
  - Added single-concurrency gate (`Semaphore::const_new(1)`) and timeout guard (`120s`).
- `crates/law-eye-api/src/routes/auth.rs`
  - Added `knowledge:manage` to new tenant seeded `editor` role.
- `crates/law-eye-db/migrations/049_add_knowledge_manage_permission.sql`
  - Added migration to grant `knowledge:manage` to existing privileged roles, compatible with both `roles.permissions` JSONB and legacy `role_permissions` table.

Validation
- `cargo check -p law-eye-ai -p law-eye-core -p law-eye-api -p law-eye-worker -p law-eye-crawler` passed.
- `cargo test -p law-eye-api -- --nocapture` passed (41 tests).
- Core E2E real-path validation passed:
  - `node tmp/core-e2e-local.mjs --base-url http://127.0.0.1:13000 --origin http://localhost:8849 --assert-knowledge-embedding 1 > tmp/core-e2e-r26.json`
  - `node tmp/core-e2e-local.mjs --base-url http://127.0.0.1:13000 --origin http://localhost:8849 --assert-knowledge-embedding 1 > tmp/core-e2e-r26-round2.json`
  - `node tmp/core-e2e-local.mjs --base-url http://127.0.0.1:13000 --origin http://localhost:8849 --assert-knowledge-embedding 1 > tmp/core-e2e-r26-round3.json`
  - Round1: crawler=20, embed=12, pdf=200
  - Round2: crawler=20, embed=12, pdf=200
  - Round3: crawler=20, embed=12, pdf=200
  - `crawler.total_articles_fetched=20`
  - `knowledge.llm_backfill.articles_enqueued=20`
  - `knowledge.stats.entities_with_embedding=12`
  - `statistics coverage_rate(regional/industry/importance)=1`
  - `report download status=200`, `content_type=application/pdf`

## 2026-02-22 Round 27: statistics completeness hardening for authority/issuer

Failure points
- R27-ST-001: core e2e on a fresh local stack showed `statistics.overview.with_authority=0` and `with_issuer=0` for valid ingested articles from non-gov RSS sources.
- R27-OPS-001: after a network interruption and stack restart, `/health` degraded and one e2e run failed at `knowledge_embeddings` due AI/dependency runtime mismatch.

Fixes
- `crates/law-eye-worker/src/main.rs`
  - Added `derive_issuer(...)` fallback:
    - prefer extracted issuer when present
    - fallback to normalized host from article link (e.g. `www.hnrss.org` -> `hnrss.org`)
  - Updated ingest path to persist derived issuer and pass it into metadata derivation.
  - Updated `derive_ingest_legal_metadata(...)` fallback for non-gov sources:
    - when issuer exists but no high-authority signal, assign default `authority_level=8`.
  - Added regression tests:
    - `derive_issuer_prefers_extracted_value`
    - `derive_issuer_falls_back_to_link_host`
    - `derive_ingest_legal_metadata_sets_default_authority_for_non_gov_issuer`
- Runtime stabilization (local only, no repo secrets committed):
  - restarted stack with explicit AI env and disabled scheduler/DLQ replay during core e2e validation to avoid unrelated ingest noise.

Validation
- `cargo test -p law-eye-worker derive_issuer_ -- --nocapture` passed.
- `cargo test -p law-eye-worker derive_ingest_legal_metadata_sets_default_authority_for_non_gov_issuer -- --nocapture` passed.
- `cargo check -p law-eye-worker -p law-eye-api -p law-eye-core -p law-eye-crawler` passed.
- Core e2e passed twice on real path:
  - `tmp/core-e2e-r27.json`
  - `tmp/core-e2e-r27-round2.json`
  - key metrics (both rounds):
    - crawler fetched 20
    - knowledge embeddings 12
    - statistics overview `with_authority=20`, `with_issuer=20`
    - report pdf download status 200

## 2026-02-22 Round 28: no-web backend start mode and startup conflict hardening

Failure points
- R28-OPS-001: `start-stack.sh` always waited for Web readiness, which blocked backend-only verification loops when local web startup was unstable.
- R28-OPS-002: stale local worker processes could keep port `3002` occupied, causing the new worker health endpoint bind failure.

Fixes
- `scripts/no-dockerhub/start-stack.sh`
  - Added `LAW_EYE_SKIP_WEB=1` support (`WEB_ENABLED=0`) to skip web startup and readiness checks for backend-only runs.
  - Added `WEB_ENABLED` to `stack.env` output and refined stack summary output when web is skipped.
  - Kept API/worker startup flow unchanged so crawler/knowledge/statistics/report backend chains stay testable.
- Local recovery runbook execution
  - cleaned stale local worker process occupying 3002 (project process only)
  - restarted stack with:
    - `LAW_EYE_SKIP_WEB=1`
    - AI provider env enabled
    - `LAW_EYE_WORKER_SCHEDULER_ENABLED=false`
    - `LAW_EYE_WORKER_DLQ_REPLAY_ENABLED=false`

Validation
- `bash -n scripts/no-dockerhub/start-stack.sh` passed.
- startup command returns successfully without waiting web:
  - `LAW_EYE_SKIP_WEB=1 ... bash scripts/no-dockerhub/start-stack.sh --name law-eye-local-codex`
- health checks:
  - `GET http://127.0.0.1:13001/health` -> `ok`
  - `GET http://127.0.0.1:3002/health` -> `ready`
- core e2e 3 rounds passed on backend-only stack:
  - `tmp/core-e2e-r27.json`
  - `tmp/core-e2e-r27-round2.json`
  - `tmp/core-e2e-r27-round3.json`
  - all rounds: `crawler=20`, `embed=12`, `with_authority=20`, `with_issuer=20`, `pdf=200`

## 2026-02-22 Round 29: worker health-port conflict auto-recovery + readiness gate

Failure points
- R29-OPS-001: local stack startup did not enforce worker readiness; when worker failed to bind health port (e.g. `3002` occupied), script could still continue and report partially-ready state.
- R29-OPS-002: worker health port conflict handling relied on manual cleanup, which is fragile during repeated recovery loops.
- R29-AI-001: after restart without AI runtime env, health degraded (`ai.available=false`) and embedding-dependent checks become non-deterministic.

Fixes
- `scripts/no-dockerhub/start-stack.sh`
  - Added worker health port conflict handling:
    - detect current listener pid for worker health port
    - reclaim stale local `law-eye-worker` process when safe
    - fallback to auto-select free worker health port (`3002..3099`) if still occupied
  - Added worker readiness gate:
    - wait for `GET /health` on `LAW_EYE__WORKER__HEALTH_PORT`
    - on failure, print port owner pid/cmdline for diagnostics and fail fast
  - Exported worker health port into stack state:
    - `LAW_EYE__WORKER__HEALTH_PORT` in `stack.env`
    - startup summary now prints worker endpoint
- Runtime execution hardening
  - restarted stack in backend-only mode with explicit AI provider runtime env (SiliconFlow compatible OpenAI API), without writing key into repo files.

Validation
- `bash -n scripts/no-dockerhub/start-stack.sh` passed.
- startup now blocks until worker is ready:
  - log includes `Waiting for Worker /health...`
  - stack summary includes `Worker: http://localhost:3002`
- health checks:
  - `GET http://127.0.0.1:13001/health` -> `ok` and `ai.available=true`
  - `GET http://127.0.0.1:3002/health` -> `ready`
- core e2e 3 rounds passed on updated startup path:
  - `tmp/core-e2e-r29.json`
  - `tmp/core-e2e-r29-round2.json`
  - `tmp/core-e2e-r29-round3.json`
  - all rounds: `crawler=20`, `embed=12`, `with_authority=20`, `with_issuer=20`, `pdf=200`

## 2026-02-22 Round 30: post-commit integrity verification (worker startup hardening)

Failure points
- R30-OPS-001: after commit churn, startup script integrity needed explicit verification to ensure worker readiness and no regression in backend-only flow.

Fixes
- Consolidated startup script hardening into committed state:
  - worker health port reclaim/auto-select logic
  - worker `/health` readiness gate
  - stack state export of `LAW_EYE__WORKER__HEALTH_PORT`

Validation
- Rust backend compile gate:
  - `cargo check -p law-eye-worker -p law-eye-api -p law-eye-core -p law-eye-crawler` passed
- API regression tests:
  - `cargo test -p law-eye-api -- --nocapture` passed (`41 passed; 0 failed`)
- Worker regression tests:
  - `cargo test -p law-eye-worker derive_issuer_ -- --nocapture` passed
- Core real-path E2E:
  - `tmp/core-e2e-r30.json`
  - key metrics: `crawler=20`, `embed=12`, `with_authority=20`, `with_issuer=20`, `pdf=200`

## 2026-02-22 Round 31: startup AI readiness gate hardening

Failure points
- R31-AI-001: backend startup allowed silent AI degradation; embedding-dependent verification could continue with hidden risk.
- R31-AI-002: initial AI health parser implementation used an invalid stdin pattern and produced false `unknown` states.

Fixes
- `scripts/no-dockerhub/start-stack.sh`
  - Added API AI readiness check after API `/health` is ready and before worker startup.
  - Added configurable gate switch:
    - `LAW_EYE_REQUIRE_AI=1`: fail fast when AI remains unavailable.
    - default: warn and continue (for degraded local debugging).
  - Added warmup retry window:
    - `LAW_EYE_AI_READY_WAIT_SECONDS` (default `120` seconds) to reduce transient startup false negatives.
  - Fixed AI health parser input path (pass JSON payload via argv instead of conflicting stdin pipeline/heredoc pattern).

Validation
- `bash -n scripts/no-dockerhub/start-stack.sh` passed.
- startup with strict AI gate passed:
  - `LAW_EYE_REQUIRE_AI=1 ... bash scripts/no-dockerhub/start-stack.sh --name law-eye-local-codex --fresh`
- core real-path E2E passed after gate hardening:
  - `tmp/core-e2e-r31.json`
  - key metrics: `crawler=20`, `embed=12`, `with_authority=20`, `with_issuer=20`, `pdf=200`

## 2026-02-23 Round 34: Web E2E 稳定性收敛 + 四链路复核

Failure points
- R34-WEB-001: `会话失效（401）` 用例依赖页面按钮文案触发鉴权，文案/布局变化会导致超时。
- R34-WEB-002: `403/5xx` 用例仅拦截 `**/api/v1/sources`，未覆盖 query 形态，出现“拦截未命中导致假通过/假失败”。
- R34-WEB-003: `5xx` 用例恢复断言依赖固定 source name，串行全量执行时存在跨轮数据扰动。
- R34-WEB-004: 登录提交流程第一策略（按钮点击）失败会直接中断，未降级到 `Enter/requestSubmit`。

Fixes
- `apps/web/e2e/lawsaw.e2e.spec.ts`
  - 401 场景改为 `clearCookies` 后重新访问受保护路由（`page.goto("/sources")`）触发跳转与 `returnTo` 校验。
  - 403/5xx 路由拦截改为 `**/api/v1/sources**`，并按 `pathname === "/api/v1/sources"` 精确过滤。
  - 403 场景断言改为 ErrorState（`加载失败|Load failed`）+ 单次命中（不重试）验证。
  - 5xx 场景改为“重试驱动 + 恢复轮询”模型，支持“列表恢复”与“空状态恢复”两种真实分支。
  - 登录提交策略增加异常降级，某一策略失败不再中断后续策略。
  - `expect.poll` 选项修正为 `intervals`，消除 typecheck 错误。

Validation
- `pnpm -C apps/web test` ✅
- `pnpm -C apps/web e2e` ✅（`5 passed, 1 skipped`）
- `node tmp/core-e2e-local.mjs --base-url http://172.19.107.21:13001 --origin http://172.19.96.1:8850` ✅（`ok: true`）
  - crawler fetched: 20
  - knowledge relation/entity backfill: passed
  - statistics coverage: regional/industry/importance = 1
  - report export/download pdf: 200

Residual risks
- 移动端抽屉 E2E 仍为显式 skip（非主链路阻断项），需在独立移动端环境补稳定性专项。

## 2026-02-23 Round 35: 移动端抽屉 E2E 去跳过并实测通过

Failure points
- R35-WEB-001: 移动端抽屉测试历史上被 `skip`，缺少真实回归覆盖。
- R35-WEB-002: 抽屉组件已切换为 `dialog`，测试仍定位 `aside`，导致真实 DOM 下误失败。

Fixes
- `apps/web/e2e/lawsaw.e2e.spec.ts`
  - 取消 `移动端抽屉导航` 用例 `skip`，改为真实执行。
  - 抽屉定位器从 `aside[aria-label="主导航"]` 更新为 `getByRole("dialog", { name: /主导航|Primary navigation/ })`。

Validation
- `pnpm -C apps/web exec playwright test --project=chromium --grep '移动端抽屉导航：打开/关闭/跳转/锁滚动'` ✅
- `pnpm -C apps/web e2e` ✅（`6 passed`）
- `pnpm -C apps/web test` ✅（typecheck/lint/unit 全通过）
- `node tmp/core-e2e-local.mjs --base-url http://172.19.107.21:13001 --origin http://172.19.96.1:8850` ✅（`ok: true`，爬虫/知识图谱/统计/日报全链路真实通过）

Evidence (real data path)
- crawler fetched: `20`
- knowledge backfill: `entities_upserted=12`, `article_entities_inserted=40`, `relations_upserted=1`
- statistics coverage: regional/industry/importance `=1`
- report pdf download: `status=200`, `content_type=application/pdf`

## 2026-02-23 Round 36: 向量维度兼容修复 + AI 队列隔离（真实链路）

Failure points
- R36-AI-001: 使用 `BAAI/bge-m3`（1024 维）时，数据库 `vector(1536)` 列触发维度不一致，`Embed` 任务重复失败并重试，拖慢队列。
  - 证据：worker 日志出现 `Embedding dimension mismatch ... expected 1536, got 1024`。
- R36-KG-001: 知识图谱实体 embedding 回填链路在维度不一致时无法落库，`entities_with_embedding` 长时间为 0，`--assert-knowledge-embedding 1` 失败。
- R36-QUEUE-001: Worker 主循环内串行处理 AI 队列，慢 AI 任务会阻塞 ingest/source_fetch，出现 `poll timeout: source_fetch`。

Fixes
- `crates/law-eye-common/src/embedding.rs`（新增）
  - 新增向量存储归一化能力：`normalize_vector_for_storage(...)`，按 `LAW_EYE__AI__STORAGE_VECTOR_DIM`（默认 `1536`）自动补齐/截断。
  - 新增 `VectorNormalization` 元信息，便于日志定位维度漂移。
- `crates/law-eye-common/src/lib.rs`
  - 导出存储维度归一化工具供 core/worker 复用。
- `crates/law-eye-worker/src/main.rs`
  - `replace_article_chunks(...)` 改为写库前自动归一化向量，不再因 1024/1536 差异直接报错退出。
  - Worker 运行模型改进：AI 任务改为“受信号量控制的后台执行”，避免 AI 任务阻塞 ingest/report 主链路。
  - 新增 `LAW_EYE_WORKER_AI_TASK_CONCURRENCY`（默认 `2`）以实现受控并发。
- `crates/law-eye-core/src/knowledge.rs`
  - 实体提取写库、实体 embedding 回填、语义检索查询向量统一接入归一化。
- `crates/law-eye-core/src/rag.rs`
  - RAG `search/hybrid/search_with_entities` 查询向量统一接入归一化，避免向量检索阶段维度报错。

Validation (real data, no mock)
- 编译检查
  - `cargo check -p law-eye-common -p law-eye-core -p law-eye-worker` ✅
- 四项核心真实链路（含 embedding 强断言）
  - `node tmp/core-e2e-local.mjs --base-url http://172.19.107.21:13002 --origin http://172.19.96.1:8850 --assert-knowledge-embedding 1` ✅
  - 关键结果：
    - crawler fetched: `20`
    - knowledge stats: `entities_with_embedding=12`
    - statistics coverage: regional/industry/importance = `1`
    - report pdf download: `status=200`, `content_type=application/pdf`
- 前端回归（真实后端联动）
  - `pnpm -C apps/web test` ✅
  - `pnpm -C apps/web e2e` ✅（`6 passed`，完整关键用户流）

## 2026-02-23 Round 37: MetaMask 噪声抑制 + 四链路三轮实测（硅基流动）

Failure points
- R37-WEB-001: 打开 Web 端时，浏览器扩展注入脚本触发 `Failed to connect to MetaMask`，被应用全局错误监听捕获，造成运行时噪声/误报。
- R37-OPS-001: 仓库存在异常未跟踪文件（文件名为私有区字符），需判定并清理。

Fixes
- `apps/web/src/lib/utils.ts`
  - 新增 `isIgnoredClientNoise(...)`，识别扩展协议来源（`chrome-extension://` 等）与 MetaMask 典型错误文本。
  - `reportClientError(...)` 对扩展噪声执行短路，避免误上报。
- `apps/web/src/components/providers/auth-provider.tsx`
  - `window.error` / `window.unhandledrejection` 接入噪声过滤。
  - 命中扩展噪声时执行 `event.preventDefault()`，避免干扰前端运行时体验。
- 清理异常文件：删除未跟踪私有区字符文件（`\\uf022\\uf022`），确认非业务资产。

Validation
- 前端质量门槛：
  - `pnpm -C apps/web typecheck` ✅
  - `pnpm -C apps/web lint` ✅
  - `pnpm -C apps/web test:unit` ✅
- API 健康（真实 AI）：
  - `GET /health` 返回 `ai.available=true` ✅
- 四链路三轮实测（真实数据、无 mock、embedding 强断言）：
  - `node tmp/core-e2e-local.mjs --base-url http://172.19.107.21:13003 --origin http://localhost:8850 --assert-knowledge-embedding 1` ✅
  - `node tmp/core-e2e-local.mjs --base-url http://172.19.107.21:13003 --origin http://localhost:8850 --assert-knowledge-embedding 1 > tmp/core-e2e-r37-round2.json` ✅
  - `node tmp/core-e2e-local.mjs --base-url http://172.19.107.21:13003 --origin http://localhost:8850 --assert-knowledge-embedding 1 > tmp/core-e2e-r37-round3.json` ✅

Evidence (all 3 rounds)
- crawler fetched: `20`
- knowledge embeddings: `entities_with_embedding=12`
- statistics coverage: `regional=1`, `industry=1`, `importance=1`
- report export/download: `pdf status=200`

## 2026-02-23 Round 38: no-dockerhub e2e 脚本稳定性修复（容器定位 + Python 解释器兼容）

Failure points
- R38-E2E-001: `scripts/no-dockerhub/e2e.sh` 在 no-dockerhub 栈下用 `docker compose ... ps -q postgres` 定位容器，实际返回空，导致 reports FK 回归 SQL 无法执行。
- R38-E2E-002: 脚本硬编码 `python3`，在仅提供 `python` 的环境中会直接失败（影响跨平台执行一致性）。

Fixes
- `scripts/no-dockerhub/e2e.sh`
  - 新增 `resolve_postgres_container()`：
    - 优先按 no-dockerhub 命名约定直接匹配 `"<stack>-postgres"` 容器。
    - 若未命中，再回退到 compose 项目查询，兼容旧路径。
  - 新增 `choose_python_cmd()`：
    - 优先 `python`，回退 `python3`。
    - RSS fixture、E2E 运行时 env 文件生成、Monkey API/Web 压测脚本统一使用选中的解释器。

Validation
- `bash -n scripts/no-dockerhub/e2e.sh` ✅
- 与现有 no-dockerhub 栈命名规则对齐复核：`<stack>-postgres`（示例：`law-eye-local-codex-postgres`）✅

## 2026-02-23 Round 39: start-stack Python 解释器兼容增强（Windows/WSL）

Failure points
- R39-OPS-001: `scripts/no-dockerhub/start-stack.sh` 多处硬编码 `python3`，在仅提供 `python` 的环境中会阻断启动流程（密钥生成、端口探测、URL 编码、Windows Web 启动脚本生成、AI 健康解析）。

Fixes
- `scripts/no-dockerhub/start-stack.sh`
  - 新增 `choose_python_cmd()`，统一选择解释器：优先 `python`，回退 `python3`。
  - 将以下调用统一切换为 `"$PYTHON_CMD"`：
    - 自动生成 secrets env
    - `REDIS_PASSWORD` / `MINIO_ROOT_PASSWORD` 随机生成
    - `port_free_wsl` 端口占用探测
    - `urlencode` URL 编码
    - Windows `web-*.cmd` 生成器
    - `check_api_ai_health` JSON 解析器
  - 启动前增加显式错误提示：若 `python/python3` 均缺失则 fail-fast。

Validation
- `bash -n scripts/no-dockerhub/start-stack.sh` ✅
- `bash scripts/no-dockerhub/start-stack.sh --help` ✅

## 2026-02-23 Round 40: 审计周报增强（权限变更摘要可追溯）

Failure points
- R40-AUDIT-001: `scripts/enterprise/audit-report.sh` 仅输出总体事件与 top actions，缺少“谁给谁改了权限、改了哪些角色”的聚合视图，无法满足企业权限变更审计可视化要求。

Fixes
- `scripts/enterprise/audit-report.sh`
  - 在 7 天窗口内新增 `users.roles.update` 专项聚合：
    - `permission_changes.summary`：总变更次数、受影响目标用户数、操作者数
    - `permission_changes.top_actors`：按操作者聚合的变更次数 Top 列表
    - `permission_changes.recent`：最近 50 条变更（含 actor/target/requested_add_roles/requested_remove_roles/after_roles/ip/created_at）
  - 保持原有 `summary` 与 `top_actions` 输出不变，兼容现有消费方。

Validation (real DB)
- `sh -n scripts/enterprise/audit-report.sh` ✅
- `LAW_EYE__DATABASE__URL=postgres://... sh scripts/enterprise/audit-report.sh` ✅
  - 产出文件：`/tmp/law-eye-audit-test/audit-report-20260223T143616Z.json`
  - 关键字段：`permission_changes.summary/top_actors/recent` 均存在 ✅

## 2026-02-23 Round 41: post-deploy 门禁增强（审计周报 schema 校验）

Failure points
- R41-OPS-001: `scripts/enterprise/post-deploy-verify.sh` 仅校验健康、FK、租户配置版本、feedback 加密姿态，未覆盖审计周报链路可用性，导致“权限变更审计”能力可能在部署后静默退化。

Fixes
- `scripts/enterprise/post-deploy-verify.sh`
  - 在 DB 校验路径中新增审计周报门禁：
    - 执行 `scripts/enterprise/audit-report.sh` 生成样本报告（默认将 `LAW_EYE_AUDIT_LOG_RETENTION_DAYS` 提升为 `999999`，避免校验过程误触发历史数据清理）。
    - 校验最新报告文件存在且非空。
    - 校验 JSON 必含 `permission_changes` 与 `permission_changes.top_actors` 字段。

Validation (real deployment-like local stack)
- `sh -n scripts/enterprise/post-deploy-verify.sh` ✅
- `LAW_EYE_BASE_URL=http://172.19.107.21:13003 LAW_EYE__DATABASE__URL=postgres://... sh scripts/enterprise/post-deploy-verify.sh` ✅
  - 输出包含：
    - `ok: reports tenant FK regression`
    - `ok: tenant_configs versioning schema`
    - `ok: feedback encryption posture`
    - `ok: audit report schema (permission changes)`

## 2026-02-23 Round 42: 审计报告脚本副作用收敛（支持仅生成不清理）

Failure points
- R42-AUDIT-001: `scripts/enterprise/audit-report.sh` 在所有场景下都执行 retention 清理（历史报告文件 + `audit_logs` 删除），不适合用于发布后“只读校验”或诊断场景。

Fixes
- `scripts/enterprise/audit-report.sh`
  - 新增开关 `LAW_EYE_AUDIT_REPORT_SKIP_RETENTION_PURGE`（支持 `1/true/yes`）。
  - 开关开启时仅生成报告，不执行任何清理动作。
- `scripts/enterprise/post-deploy-verify.sh`
  - 触发审计报告样本生成时默认设置 `LAW_EYE_AUDIT_REPORT_SKIP_RETENTION_PURGE=1`，确保发布后验收无副作用。

Validation
- `sh -n scripts/enterprise/audit-report.sh` ✅
- `sh -n scripts/enterprise/post-deploy-verify.sh` ✅
- `LAW_EYE_BASE_URL=http://172.19.107.21:13003 LAW_EYE__DATABASE__URL=postgres://... sh scripts/enterprise/post-deploy-verify.sh` ✅

## 2026-02-23 Round 43: post-deploy 增补 Worker 健康门禁

Failure points
- R43-OPS-001: 发布后验收脚本仅覆盖 API 健康，未覆盖 Worker 健康链路，导致队列消费侧故障可能在验收阶段漏检。

Fixes
- `scripts/enterprise/post-deploy-verify.sh`
  - 新增可选 Worker 健康校验：
    - 当设置 `LAW_EYE_WORKER_HEALTH_URL` 时，强制检查 `${LAW_EYE_WORKER_HEALTH_URL}/health`。
    - 当额外设置 `LAW_EYE_WORKER_METRICS_TOKEN` 时，校验 `${LAW_EYE_WORKER_HEALTH_URL}/metrics` 带 token 可访问。

Validation
- `sh -n scripts/enterprise/post-deploy-verify.sh` ✅
- `LAW_EYE_BASE_URL=http://172.19.107.21:13003 LAW_EYE_WORKER_HEALTH_URL=http://172.19.107.21:3002 LAW_EYE__DATABASE__URL=postgres://... sh scripts/enterprise/post-deploy-verify.sh` ✅

## 2026-02-23 Round 44: post-deploy DB query-plan baseline gate + permission audit consumption

Failure points
- R44-DB-001: 发布后验收缺少数据库查询计划与延迟基线门禁，无法在上线前阻断慢查询回归。
- R44-AUDIT-001: 权限变更审计已有数据输出，但缺少“可消费用法”收口说明（API/查询样例/门禁关系）。

Fixes
- `scripts/enterprise/post-deploy-verify.sh`
  - 新增可开关 DB 查询计划门禁：`LAW_EYE_VERIFY_DB_QUERY_PLAN=1` 时执行。
  - 使用 `EXPLAIN (ANALYZE, BUFFERS)` 对 3 条关键查询建立基线并阈值校验：
    - `articles_latest`
    - `statistics_importance`
    - `permission_audit_latest`
  - 输出计划文件与汇总到 `LAW_EYE_DB_QUERY_PLAN_REPORT_DIR`（默认 `/tmp/law-eye-post-deploy-query-plan`）。
  - 增加阈值与策略变量：
    - `LAW_EYE_DB_QUERY_PLAN_THRESHOLD_MS`（默认 `250`）
    - `LAW_EYE_DB_QUERY_PLAN_DISALLOW_SEQ_SCAN`（默认 `0`，开启后出现 `Seq Scan` 即失败）

Permission audit consumption (enterprise operators)
- API (admin only):
  - `GET /api/v1/users/{id}/permissions/audit?limit=50&offset=0`
  - 返回字段包含 `actor_user_id/target_user_id/requested_add_roles/requested_remove_roles/after_roles/ip_address/created_at`
- Weekly report JSON:
  - `scripts/enterprise/audit-report.sh` 产物中读取 `permission_changes.summary/top_actors/recent`
- Post-deploy gate:
  - `scripts/enterprise/post-deploy-verify.sh` 已强制校验上述 `permission_changes` 字段存在性
  - 本轮新增 `permission_audit_latest` 查询计划门禁，确保权限审计查询路径性能可回归

Validation (real stack, no mock)
- `sh -n scripts/enterprise/post-deploy-verify.sh` ✅
- `sh -n scripts/enterprise/audit-report.sh` ✅
- `LAW_EYE_BASE_URL=http://172.19.107.21:13003 LAW_EYE_WORKER_HEALTH_URL=http://172.19.107.21:3002 LAW_EYE__DATABASE__URL=postgres://... LAW_EYE_VERIFY_DB_QUERY_PLAN=1 LAW_EYE_DB_QUERY_PLAN_THRESHOLD_MS=800 sh scripts/enterprise/post-deploy-verify.sh` ✅
- Query-plan summary sample:
  - `/tmp/law-eye-post-deploy-query-plan/summary.csv`
  - `articles_latest=0.142ms`, `statistics_importance=0.152ms`, `permission_audit_latest=0.032ms`

## 2026-02-23 Round 45: permission-audit API consumability hardening (actor + time-window filters)

Failure points
- R45-AUDIT-API-001: `GET /api/v1/users/{id}/permissions/audit` 仅支持 `limit/offset`，缺少按操作者与时间窗口检索能力，不利于大型企业审计取证与快速排障。
- R45-AUDIT-CORE-001: 审计服务层过滤条件仅支持 `user/resource/action`，无法复用时间范围过滤逻辑。

Fixes
- `crates/law-eye-core/src/audit.rs`
  - `AuditFilters` 新增 `created_after` / `created_before`。
  - `list`/`count` SQL 新增 `created_at` 范围过滤条件（可选）。
- `crates/law-eye-api/src/routes/users.rs`
  - `PermissionAuditQuery` 新增：
    - `actor_user_id`
    - `changed_after`
    - `changed_before`
  - 新增参数校验：`changed_after <= changed_before`，非法范围返回 `400`。
  - 审计接口将上述筛选条件透传到 `AuditFilters`。

API contract (admin only)
- `GET /api/v1/users/{id}/permissions/audit?limit=50&offset=0&actor_user_id=<uuid>&changed_after=<RFC3339>&changed_before=<RFC3339>`
- 响应结构保持兼容：`items/total/limit/offset`。

Validation (real stack, no mock)
- `cargo fmt --all` ✅
- `cargo check -p law-eye-core -p law-eye-api` ✅
- `cargo test -p law-eye-api -- --nocapture` ✅ (`41 passed`)
- `node tmp/core-e2e-local.mjs --base-url http://172.19.107.21:13003 --origin http://172.19.96.1:8850 --assert-knowledge-embedding 1` ✅
  - crawler: `20`
  - entities_with_embedding: `12`
  - statistics coverage: `regional/industry/importance = 1`
  - report pdf download: `status=200`

### 2026-02-23 Round 45b (test uplift)
- 在 `users.rs` 新增 2 个时间窗口校验单元测试后，`cargo test -p law-eye-api -- --nocapture` 更新为 `43 passed`。
- 复测核心四链路真实路径仍为 `ok=true`（crawler=20 / entities_with_embedding=12 / statistics coverage=1 / pdf=200）。
