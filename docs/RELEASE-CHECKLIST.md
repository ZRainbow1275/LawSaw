# LawSaw — Release Checklist

每次发布前/发布中/发布后对照此清单执行。所有 checkbox 必须明确状态（done / N/A / blocked），blocked 项需上报 release manager。

> 配套文档：`docs/DEPLOYMENT.md`（部署细节）、`docs/runbooks/`（应急预案）。

---

## Pre-Release（发布前 T-24h ~ T-1h）

### Code Quality

- [ ] **Rust API typecheck** —— `cargo check -p law-eye-api` **0 warning / 0 error**
- [ ] **Rust Worker typecheck** —— `cargo check -p law-eye-worker` **0 warning / 0 error**
- [ ] **Rust Core typecheck** —— `cargo check -p law-eye-core` **0 warning / 0 error**
- [ ] **Frontend typecheck** —— `cd apps/web && pnpm typecheck` **EXIT 0**
- [ ] **关键路径审计** —— `git grep -nE "TODO|FIXME|unimplemented!|todo!|panic!" -- 'crates/**' 'apps/web/src/**'` 在登陆/付费/导出等关键路径上零命中
- [ ] **Endpoint inventory audit** —— Phase G.2（Task #43）输出的 phantom calls / 未挂载的孤儿路由全部解决

### Database

- [ ] **Migration dry-run** —— `sqlx migrate info --source crates/law-eye-db/migrations --database-url "$STAGING_DB_URL"` 列出所有 pending 迁移，与本次 release 期望一致
- [ ] **Fresh-DB smoke** —— 在 staging 副本上从空库跑完 73 个 migrations 并可启动 API（参考 Phase F.8 实测路径，约 69s）
- [ ] **DB 备份验证** —— 最近一次 `pg_dump` 在沙盒可恢复 + 业务表 row count 与 prod 一致
- [ ] **RLS 验证** —— 用非租户 super_admin 角色直接 `SELECT * FROM articles` 应返 0 行（force RLS 生效）

### Infrastructure

- [ ] **`/health/full` 全 subsystem ok** —— staging 环境调用，5 个 check (database / redis / task_queue / object_store / ai_gateway) 全 `ok` 或合理 `skipped`
- [ ] **任务队列空载** —— 7 个 queue (`queue:ingest` / `queue:ingest:priority` / `queue:ai` / `queue:push` / `queue:report-export` / `queue:report` / `queue:tenant_export`) depth 为 0，DLQ 也清空（或至少没有未分类的 fatal）
- [ ] **Tier-aware UI 渲染** —— 5 个 tier (basic / verified / premium / tenant_admin / super_admin) 各自至少打开 3 个核心页（dashboard / articles / settings）截图比对
- [ ] **Object storage 可写可读** —— 用 `/api/v1/me/avatar` 上传 + 下载 1 个文件验证 S3 链路
- [ ] **AI gateway 可达** —— `/health/full` 的 `ai_gateway.status=ok`（或显式 `skipped` 配置已确认）

### Configuration

- [ ] **生产 env vars** —— 对照 `docs/DEPLOYMENT.md §2` 52 个 env vars，secrets 在 vault / K8s Secret，明文不落 repo
- [ ] **`PRODUCTION=true`** —— 启用 secure cookie
- [ ] **`LAW_EYE__METRICS__TOKEN`** —— 设值（未设值则 `/metrics` 返 404，监控系统会瞎）
- [ ] **`LAW_EYE__DATABASE__SESSION_ROLE=law_eye_app`** —— 应用角色生效，RLS 强制
- [ ] **Rate limit redis fail policy** —— 确认 `LAW_EYE__RATE_LIMIT__REDIS_FAIL_OPEN` 与运营预期一致

---

## Release（发布中 T-0 ~ T+30min）

执行顺序：DB → Worker → API → Web。每步必须等待前一步 health 通过。

### Step 1: Database Migration

- [ ] **公告进入维护模式**（如需要） —— 业务侧弹窗 + status page
- [ ] **应用 migrations** —— `sqlx migrate run --source crates/law-eye-db/migrations --database-url "$PROD_DB_URL"`
- [ ] **migration timing 与 staging 持平**（±20%）
- [ ] **DB 健康** —— `psql -c "SELECT 1"` ok；`pg_stat_activity` 无长事务卡死

### Step 2: Worker

- [ ] **滚动部署 worker** —— 旧 worker drain（处理完 reserved tasks 再退出），新 worker 启动
- [ ] **Worker health** —— `curl http://worker:3002/health` 返 200
- [ ] **队列消费率正常** —— 抽样观察 `queue:ai` 等队列在 5 min 内有进展（无积压猛增）

### Step 3: API

- [ ] **滚动部署 API** —— Blue-green 或滚动，确保至少 1 个 replica 在线
- [ ] **`/health/live` 立即 200** —— k8s liveness 探针通过
- [ ] **`/health/ready` 5s 内 200** —— DB + Redis ping ok
- [ ] **`/health/full` 5s 内 status=ok** —— 全 subsystem 健康
- [ ] **金丝雀流量验证** —— 1% 流量打到新版本 5 min，错误率 < 0.5%

### Step 4: Frontend

- [ ] **`pnpm build` 产物部署** —— Next.js standalone 或 CDN
- [ ] **首屏可达** —— 未登录访问 `/` 返 200 + 正确渲染
- [ ] **登录链路通** —— 测试账号登录 + 跳到 dashboard 看到正确 tier-aware UI
- [ ] **退出维护模式**（如启用了）

### Smoke Verification（T+15min）

- [ ] **`/health/full` 持续 5 min status=ok**
- [ ] **`/api/v1/admin/system/metrics`：error_rate_5min < 0.01**（< 1%）
- [ ] **关键 endpoint 抽样 200** —— `/api/v1/me/feed` / `/api/v1/articles` / `/api/v1/admin/dashboard/summary`
- [ ] **任务队列消费**：报告 export 任务投递 + 完成往返 < 2 min
- [ ] **错误日志无新增 panic** —— `grep panic` 在新版本日志里 0 命中

---

## Post-Release（发布后 T+1h ~ T+24h）

### 24h 监控

- [ ] **Prometheus 告警零触发** —— http_5xx_rate / queue_depth / health_full_status 三大类告警安静
- [ ] **`error_rate_5min` 24h 平均 < 1%**
- [ ] **AI tokens 消耗** —— `ai_tokens_consumed_24h` 与上一周期同比偏差 < 30%（异常激增可能意味着死循环）
- [ ] **Queue depths** —— 7 个队列均无持续积压（depth 趋势平稳，DLQ 增量可控）
- [ ] **Storage 增长** —— `storage_used_mb` 增量与日活内容生成量吻合，无异常突增

### 业务核对

- [ ] **Active users 趋势** —— `/api/v1/admin/system/metrics.active_users`（7d distinct）与上一周期偏差 < 20%
- [ ] **Release notes 对照** —— 列出本次 release 的 feature/fix/breaking change，逐项打开真实页面验证
- [ ] **租户级抽样** —— 至少 3 个不同 tier 的租户用户反馈无回归
- [ ] **导出 / 报告生成** —— 触发一次 `super/tenants/:id/export` + 一次 `reports:write` 报告生成，端到端 ok

### 文档与回顾

- [ ] **CHANGELOG.md 更新** —— 本次 release 的版本号 + 摘要
- [ ] **runbook 同步** —— 本次发现的新风险点写入 `docs/runbooks/`
- [ ] **Post-mortem（如有 incident）** —— 任何 P0/P1 故障 24h 内出复盘
- [ ] **Migration 编号 sync** —— 下次 release 起始迁移编号已分配（避免与并行分支冲突）

---

## 回滚（Rollback）触发条件

任一条件成立则**立即回滚**至上一个稳定版本：

- `/health/full.status=down` 持续 > 5 min（数据库不可用且非维护窗口）
- `error_rate_5min > 0.10`（> 10%）持续 > 10 min
- 任一关键功能（登录 / 文章列表 / 报告导出）端到端不可用 > 5 min
- 数据完整性事件（跨租户数据泄漏、PII 暴露）—— 立即回滚 + 通知合规

回滚步骤：

1. **API + Worker** 回滚到前一个 docker image tag（K8s `kubectl rollout undo` 或同等）
2. **Frontend** 同上
3. **DB migration**：仅当本次有破坏性 schema 变更时才回滚 schema（且仅在已备份的前提下），否则保持新 schema + 旧代码兼容（**新代码必须向后兼容旧 schema 至少一个 release**）
4. 通知：`@oncall` + `#release` channel
5. 复盘 task 入排期

---

## 维护者

- Release manager：`team-lead`
- Backend on-call：见内部排班
- Frontend on-call：见内部排班
- DB DBA：见内部排班

> 本清单与代码现状强绑定。每次有重大架构变化（新增队列 / 新增 health subsystem / 新增 RLS 表）时必须同步更新本文件。
