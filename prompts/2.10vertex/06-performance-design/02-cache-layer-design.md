# Redis 缓存层设计

## 1. 架构概述

采用 **Cache-Aside (旁路缓存)** 模式，在 API Handler 层实现缓存逻辑。

```
Client Request
    │
    ▼
┌───────────────────────┐
│   Statistics Handler   │
│                       │
│  1. build cache key   │
│  2. cache.get(key)    │──── HIT ──────▶ 返回缓存数据
│        │              │
│      MISS             │
│        ▼              │
│  3. query postgres    │
│  4. cache.set(key)    │
│  5. return data       │
└───────────────────────┘
```

## 2. 缓存键命名规范

格式: `cache:{tenant_id}:{resource}:{params_hash}`

| 字段 | 说明 | 示例 |
|------|------|------|
| prefix | 固定前缀 | `cache` |
| tenant_id | 租户隔离 | `550e8400-...` |
| resource | 资源标识 | `statistics:regional` |
| params_hash | 查询参数 SHA-256 前 16 位 | `a1b2c3d4e5f6g7h8` |

### 资源标识列表

| resource | 对应 API | TTL |
|----------|---------|-----|
| `statistics:regional` | GET /statistics/regional | 5min |
| `statistics:industry` | GET /statistics/industry | 5min |
| `statistics:importance` | GET /statistics/importance | 5min |
| `statistics:authority` | GET /statistics/authority | 5min |
| `statistics:issuer` | GET /statistics/issuer | 5min |
| `statistics:cross` | GET /statistics/cross | 5min |
| `statistics:timeline` | GET /statistics/timeline | 5min |
| `statistics:overview` | GET /statistics/overview | 2min |
| `articles:list` | GET /articles (future) | 30s |
| `knowledge:graph` | GET /knowledge (future) | 10min |

## 3. TTL 策略

| 数据类型 | TTL | 理由 |
|----------|-----|------|
| Statistics 聚合 | 5 分钟 | 数据变更频率低 (爬虫批量入库)，5 分钟延迟可接受 |
| Overview 概览 | 2 分钟 | 仪表盘首页，容忍短暂延迟 |
| Articles 列表 | 30 秒 | 变更相对频繁，用户期望近实时 |
| Knowledge Graph | 10 分钟 | 图数据计算量大，变更极低频 |
| Categories | 10 分钟 | 基本不变 |

## 4. 主动失效策略

当数据变更时，通过 `invalidate_resource` 清除相关缓存:

```rust
// 在 article 创建/更新/删除时:
cache.invalidate_resource(tenant_id, "statistics").await?;
cache.invalidate_resource(tenant_id, "articles").await?;

// 在 knowledge graph 更新时:
cache.invalidate_resource(tenant_id, "knowledge").await?;
```

使用 Redis SCAN + DEL 按前缀匹配，避免全量 KEYS 命令阻塞。

## 5. Fail-Open 策略

Redis 故障时 **不阻塞请求**:
- 连接池获取失败 → 跳过缓存，直接查 DB
- SET 失败 → 静默忽略
- GET 失败 → 视为 MISS
- 所有异常记录 `cache_errors_total` Prometheus 指标

## 6. 可观测性

### Prometheus 指标

| 指标名 | 类型 | 标签 | 说明 |
|--------|------|------|------|
| `cache_hits_total` | Counter | - | 缓存命中次数 |
| `cache_misses_total` | Counter | - | 缓存未命中次数 |
| `cache_errors_total` | Counter | op=get/set | 缓存操作错误次数 |

### 连接池指标

通过 `CacheService::pool_status()` 暴露:
- `cache_pool_size` — 当前连接总数
- `cache_pool_available` — 空闲连接数
- `cache_pool_waiting` — 等待获取连接的任务数

## 7. 实现位置

| 文件 | 职责 |
|------|------|
| `law-eye-common/src/cache.rs` | CacheService 核心实现 |
| `law-eye-api/src/state.rs` | AppState 注册 cache_service |
| `law-eye-api/src/main.rs` | 初始化 CacheService |
| `law-eye-api/src/routes/statistics/handlers.rs` | Statistics API 缓存集成 |
