---
title: Local rate limit runbook
---

# 本地开发：Rate limit 排障与绕过（仅 dev）

本项目对 `/api/v1/auth/*` 等路径启用了基于 Redis 的 fixed-window 限流。

在 Docker/WSL 网络中，请求可能都会表现为来自同一个网关 IP（例如 `172.23.0.1`），从而导致“全员共享同一个限流桶”，出现长时间 `429 RATE_LIMITED`。

## 现象

- `POST /api/v1/auth/register` 返回 `429`，响应体包含：
  - `code = RATE_LIMITED`
  - `details.retry_after_seconds` 很大（默认 3600 秒）

## 解决方案（推荐）

### 1) Dev-only：对 auth 限流注入更细粒度的 key

当 `PRODUCTION=false` 且 client IP 判定为本地/私网时：

- `/auth/register`、`/auth/login`、`/auth/email-verification/*`、`/auth/password-reset/*` 的限流 key 会优先读取 header：
  - `x-rate-limit-id: <email or identifier>`

这样在本地迭代时，每个邮箱/账号会有独立的限流桶，避免 Docker 网关 IP 导致“一次注册/登录/验证/重置锁死 1 小时”。

> 生产环境不启用该行为，仍然按 IP 限流。

### 2) 直接清理 Redis key（紧急解除）

限流 key 形如：

```
law-eye:rate-limit:<scope>:<key>
```

例如：

```
law-eye:rate-limit:register:172.23.0.1
```

可在本地 Redis 里删除对应 key。

## 关联代码

- `crates/law-eye-api/src/middleware/rate_limit.rs`
