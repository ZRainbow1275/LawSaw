# QA-006：性能门禁收敛（标准负载 p95 < 200ms）+ 报告落盘（Spec）

## 1. 背景与问题陈述

当前仓库已具备 Monkey Tests（API/Web）并在 `scripts/no-dockerhub/e2e.sh` 中作为门禁执行，但：

- p95 阈值仍为 500ms（偏宽松，不满足“商业可用的默认性能门槛”）
- Monkey 的请求包含大量预期 4xx（未登录/校验失败），若直接统计“全量请求 p95”，可能 **低估真实业务路径的延迟**

本任务目标：将性能门禁收敛到 **标准负载 p95 < 200ms**，并使指标更可信（至少包含 2xx 延迟统计），同时保持报告持续落盘到 `prompts/logs/` 及每次 run 的 `tmp/no-dockerhub/<stack>/logs/`。

## 2. 范围（Scope）

**涉及**
- `scripts/monkey/api_monkey.py`
- `scripts/monkey/web_monkey.py`
- `scripts/no-dockerhub/e2e.sh`

**不涉及**
- 针对单个 endpoint 的深度性能优化（除非门禁失败必须修复）
- 引入 k6/wrk 等外部依赖（保持 stdlib-only/零安装负担）

## 3. 指标与门禁（Interface Contracts）

### 3.1 标准负载定义（默认门禁口径）

- **API Monkey**
  - `requests=300`
  - `concurrency=24`
  - `timeout_ms=3000`
  - `p95_threshold_ms=200`
  - `max_5xx=0`
  - `max_net_errors=0`
  - `max_timeouts=0`
- **Web Monkey**
  - `requests=200`
  - `concurrency=16`
  - `timeout_ms=3000`
  - `p95_threshold_ms=200`
  - `max_5xx=0`
  - `max_net_errors=0`
  - `max_timeouts=0`

### 3.2 统计口径（避免“4xx 过多导致指标失真”）

Monkey 报告必须同时输出：

- `latency_ms_all`: 全量请求 p50/p90/p95/p99（用于观测整体）
- `latency_ms_2xx`: 仅统计 2xx 请求的 p50/p90/p95/p99（用于门禁）

门禁阈值 `p95_threshold_ms` 以 `latency_ms_2xx.p95` 为准；若 `ok_2xx` 数量不足（例如 < 20），则报告应标记失败原因 `insufficient_2xx_samples`（避免“全 401 也能过性能门禁”）。

## 4. 报告落盘（Persistence）

- `scripts/no-dockerhub/e2e.sh` 仍需将最新报告复制到：
  - `prompts/logs/monkey_api_report.json`
  - `prompts/logs/monkey_web_report.json`
- 每次 run 的原始报告保留在：
  - `tmp/no-dockerhub/<stack>/logs/monkey_api_report.json`
  - `tmp/no-dockerhub/<stack>/logs/monkey_web_report.json`

## 5. 验收标准（Acceptance Criteria）

- `bash scripts/no-dockerhub/e2e.sh --name <new-run> --web-mode prod` ✅
  - E2E 全通过
  - Monkey 门禁以 **2xx p95 < 200ms** 通过
- 产物落盘存在且可追溯（见第 4 节）

