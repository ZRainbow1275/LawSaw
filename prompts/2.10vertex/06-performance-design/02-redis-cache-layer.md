# Redis 缓存层设计文档

## 1. 架构概述

### 设计模式: Cache-Aside (Lazy Loading)
```
Client -> API Handler -> [Cache Hit?] -> Yes -> Return cached
                                      -> No  -> DB Query -> Write Cache -> Return
```

### 核心组件
- **CacheService** (`law-eye-common::cache`): 通用 Redis 缓存服务
- **deadpool-redis**: 异步连接池
- **fail-open 策略**: Redis 不可用时降级为直接查询数据库

## 2. 缓存键规范

### 格式
```
cache:{tenant_id}:{resource}:{params_hash}
```

### 资源命名
| 资源 | 示例 | TTL |
|------|------|-----|
| `statistics:regional` | 地域分布 | 5min |
| `statistics:industry` | 行业分布 | 5min |
| `statistics:importance` | 重要性分布 | 5min |
| `statistics:authority` | 权威等级 | 5min |
| `statistics:issuer` | 发布机构 | 5min |
| `statistics:cross` | 交叉维度 | 5min |
| `statistics:timeline` | 时间线 | 5min |
| `statistics:overview` | 概览 | 2min |
| `articles:list` | 文章列表 | 30s |
| `knowledge:graph` | 知识图谱 | 10min |
| `categories:all` | 分类列表 | 10min |

### 参数哈希
使用 SHA-256 的前 16 字符，确保键长度可控且碰撞概率极低。

## 3. 缓存失效策略

### 主动失效
在数据变更时精准清除相关缓存：
```rust
// 删除单个键
cache.invalidate(&key).await;

// 删除某资源的所有缓存
cache.invalidate_resource(tenant_id, "statistics").await;

// 删除租户下所有缓存
cache.invalidate_tenant(tenant_id).await;
```

### 被动失效 (TTL)
| 场景 | TTL | 原因 |
|------|-----|------|
| 文章列表 | 30s | 频繁变更，允许短暂过期 |
| 统计聚合 | 5min | 计算成本高，可容忍延迟 |
| 概览 | 2min | 首页展示，平衡时效性 |
| 分类/图谱 | 10min | 变更频率低 |

### 失效触发点
| 操作 | 失效范围 |
|------|---------|
| 创建文章 | `statistics:*`, `articles:list:*` |
| 更新文章 | `statistics:*`, `articles:list:*` |
| 删除文章 | `statistics:*`, `articles:list:*` |
| 知识图谱变更 | `knowledge:*` |
| 分类变更 | `categories:*` |

## 4. 可观测性

### Prometheus 指标
| 指标 | 类型 | 标签 | 含义 |
|------|------|------|------|
| `cache_hits_total` | Counter | — | 缓存命中次数 |
| `cache_misses_total` | Counter | — | 缓存未命中次数 |
| `cache_errors_total` | Counter | `op` | 缓存操作错误次数 |

### 计算命中率
```promql
cache_hits_total / (cache_hits_total + cache_misses_total)
```
目标: > 85%

### 连接池监控
```rust
let status = cache.pool_status();
// status.size: 总连接数
// status.available: 空闲连接数
// status.waiting: 等待中的任务数
```

## 5. 连接池配置

### 默认超时
| 参数 | 默认值 | 说明 |
|------|--------|------|
| wait_timeout | 1000ms | 等待连接的超时 |
| create_timeout | 1000ms | 创建连接的超时 |
| recycle_timeout | 1000ms | 回收连接的超时 |

### 生产建议
```toml
# 环境变量
REDIS_URL=redis://redis:6380/1  # 使用独立 DB
REDIS_POOL_MAX=32               # 最大连接数
REDIS_POOL_MIN=4                # 最小空闲连接
```

## 6. 容错设计

### Fail-Open 原则
Redis 不可用时，所有缓存操作静默失败，请求正常到达数据库：
- GET: 返回 `None`（视为 cache miss）
- SET: 静默忽略
- DEL: 静默忽略

### 反序列化失败
如果缓存数据格式与当前 Rust 结构体不匹配（如版本升级后字段变更），返回错误。建议在部署新版本后执行 `FLUSHDB` 或使用版本化键前缀。

## 7. 已集成的 API Handler

已完成缓存集成的 Handler:
- [x] `statistics::get_regional`
- [x] `statistics::get_industry`
- [x] `statistics::get_importance`
- [x] `statistics::get_authority`
- [x] `statistics::get_issuer`
- [x] `statistics::get_cross_dimensional`
- [x] `statistics::get_timeline`
- [x] `statistics::get_overview`

待集成:
- [ ] `articles::list` (高频请求)
- [ ] `knowledge::graph_stats`
- [ ] `categories::list`
