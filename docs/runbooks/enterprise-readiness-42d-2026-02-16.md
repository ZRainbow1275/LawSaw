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
- [ ] [R3-RS-002] PDF 导出链路建议补充 request-id 级别可观测日志与有限重试策略（候选文件：`crates/law-eye-core/src/report/exporter/pdf.rs`）。
- [ ] [R3-RS-003] 导出 key 更新建议补充并发 CAS 校验与对象元数据一致性检查（候选文件：`crates/law-eye-core/src/report/service.rs`）。

Round 3 增量修复验证：
- `cargo test -p law-eye-crawler fetch_dynamic_mode_falls_back_to_static_when_browserless_is_unreachable -- --nocapture` ✅
- `cargo test -p law-eye-api ai_extract_entities_dedupe_key_matches_worker_format -- --nocapture` ✅
- `cargo test -p law-eye-api extract_entities_outbox_payload_uses_retryable_task_shape -- --nocapture` ✅
- `cargo test -p law-eye-api routes::statistics::handlers::tests -- --nocapture` ✅
- `cargo check -p law-eye-crawler -p law-eye-core -p law-eye-worker -p law-eye-api` ✅
