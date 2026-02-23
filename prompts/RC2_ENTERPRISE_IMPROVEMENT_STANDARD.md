# RC2 企业级改进标准（可收口版）

版本：RC2  
生效日期：2026-02-23  
适用范围：LawSaw / LegalMind 资讯平台（本机演示、云端部署前最后一轮改进）

---

## 1. 目标与边界

本标准用于解决“改进没有尽头”的问题，强制把改进收敛为可量化、可复验、可停止的门禁。

达到 RC2 的定义：
- 核心业务链路真实跑通（无 mock）
- 前后端可持续运行（含异步 worker）
- 发布后验收门禁全通过
- 允许将非阻断优化移入下一版本 backlog

---

## 2. 一票否决项（任一失败即不达标）

1. Web 无法登录访问（`/login` 不可用）  
2. API 健康检查失败（`/health` / `/health/live` / `/health/ready` 任一失败）  
3. Worker 不健康（`/health` 不可达）  
4. 核心四链路任一失败：
   - 爬虫抓取入库
   - 知识图谱/embedding 回填
   - 统计（地域/行业/重要性）覆盖
   - 报告生成与 PDF 下载
5. 关键门禁脚本失败：`scripts/enterprise/post-deploy-verify.sh`

---

## 3. RC2 量化门禁（必须全部通过）

### 3.1 运行态门禁

- Web:
  - `GET /login` 状态码 ∈ `{200,302,303,307,308}`
  - `GET /api/v1/auth/me`（未登录）状态码 ∈ `{401,200}`
- API:
  - `GET /health` = 200
  - `GET /health/live` = 200
  - `GET /health/ready` = 200
- Worker:
  - `GET /health` = 200

### 3.2 代码与前端门禁

- `cargo check -p law-eye-api -p law-eye-worker`
- `pnpm -C apps/web test`（typecheck + lint + unit）
- `pnpm -C apps/web e2e`

### 3.3 业务链路门禁（真实数据）

- `node tmp/core-e2e-local.mjs --base-url <API> --origin <WEB_ORIGIN> --assert-knowledge-embedding 1`
- 连续运行 `>= 3` 轮，均 `ok: true`

### 3.4 发布后门禁

- `sh scripts/enterprise/post-deploy-verify.sh` 通过
- 启用 query-plan gate：
  - `LAW_EYE_VERIFY_DB_QUERY_PLAN=1`
  - `LAW_EYE_DB_QUERY_PLAN_THRESHOLD_MS <= 800`（当前 RC2 基线）

---

## 4. 停止条件（防止无限改进）

当以下条件同时满足，必须停止继续“扩展式改进”，进入发布阶段：

1. 一票否决项全部通过  
2. RC2 量化门禁全部通过  
3. 连续 3 轮核心链路回归通过  
4. 未解决事项均已标注为“非阻断 backlog”并给出风险等级

---

## 5. 非阻断项处理规则（允许延期）

以下类型可进入 backlog，不阻断 RC2 发布：

1. 视觉增强、动画细节、非关键页面体验优化  
2. 极端流量下的进一步性能优化（在既有 SLO 已达标前提下）  
3. 可选集成（Webhook 扩展、第三方生态连接器）  
4. 长期治理项（代码风格统一、文档润色）

要求：
- 必须记录风险级别（low/medium/high）
- 必须给出下一版本处理窗口

---

## 6. 执行命令（统一入口）

使用统一门禁脚本（本轮新增）：

```bash
LAW_EYE_BASE_URL=http://172.19.107.21:13003 \
LAW_EYE_WEB_URL=http://172.19.96.1:8850 \
LAW_EYE_ORIGIN=http://172.19.96.1:8850 \
LAW_EYE_WORKER_HEALTH_URL=http://172.19.107.21:3002 \
LAW_EYE__DATABASE__URL="postgres://..." \
bash scripts/enterprise/rc2-gate.sh
```

默认行为：
- 执行前后端门禁
- 执行 Web E2E
- 执行核心链路 3 轮回归
- 执行 post-deploy verify（含 query-plan gate）
- 生成报告目录：`tmp/rc2-gate-<timestamp>/`

---

## 7. 当前决策

当前项目改进策略切换为：
- “标准驱动”而非“无限问题驱动”
- 先过 RC2，再进入 RC3 优化项

