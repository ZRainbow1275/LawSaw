# 实施计划

## 阶段一: 已完成

### 1. CacheService 核心实现
- [x] `law-eye-common/src/cache.rs` — 通用 Redis 缓存服务
  - Cache-Aside 模式封装 (`get_or_fetch`)
  - 标准化缓存键构造 (`build_key` / `build_key_simple`)
  - Fail-Open 策略 (Redis 故障不阻塞请求)
  - Prometheus 指标 (`cache_hits_total`, `cache_misses_total`, `cache_errors_total`)
  - 连接池状态暴露 (`pool_status`)

### 2. AppState 集成
- [x] `law-eye-api/src/state.rs` — 注册 `cache_service: Option<Arc<CacheService>>`
- [x] `law-eye-api/src/main.rs` — 初始化 CacheService (fail-open: 创建失败不影响启动)

### 3. Statistics API 缓存
- [x] `law-eye-api/src/routes/statistics/handlers.rs` — 8 个端点全部接入缓存
  - regional: TTL 5min
  - industry: TTL 5min
  - importance: TTL 5min
  - authority: TTL 5min
  - issuer: TTL 5min
  - cross: TTL 5min
  - timeline: TTL 5min
  - overview: TTL 2min

### 4. 数据库索引
- [x] `034_statistics_indexes.sql` — 8 个复合条件索引 (CONCURRENTLY)

---

## 阶段二: 后续优化 (可选)

### 5. 扩展缓存覆盖面
- [ ] Articles 列表缓存 (TTL 30s)
- [ ] Knowledge Graph 缓存 (TTL 10min)
- [ ] Categories 缓存 (TTL 10min)

### 6. 主动失效集成
- [ ] Article 创建/更新/删除时清除 statistics 缓存
- [ ] 在 Worker 完成 AI 任务后清除相关缓存

### 7. 连接池合并
- [ ] 统一 RateLimitLayer Redis 池
- [ ] 共享 Redis 连接池抽象

### 8. PgPool 生产调优
- [ ] 根据 CPU 核数配置 max_connections
- [ ] 添加 idle_timeout 配置
- [ ] PgPool 指标暴露到 Prometheus

---

## 文件清单

### 新增文件
| 文件路径 | 说明 |
|---------|------|
| `crates/law-eye-common/src/cache.rs` | CacheService 核心实现 |
| `crates/law-eye-db/migrations/034_statistics_indexes.sql` | 统计索引迁移 |
| `prompts/2.10vertex/06-performance-design/01-performance-audit.md` | 现状审计报告 |
| `prompts/2.10vertex/06-performance-design/02-cache-layer-design.md` | 缓存层设计文档 |
| `prompts/2.10vertex/06-performance-design/03-database-optimization.md` | 数据库优化方案 |
| `prompts/2.10vertex/06-performance-design/04-implementation-plan.md` | 本文档 |

### 修改文件
| 文件路径 | 变更说明 |
|---------|---------|
| `crates/law-eye-common/src/lib.rs` | 注册 cache 模块 |
| `crates/law-eye-common/Cargo.toml` | 添加 deadpool-redis, redis, uuid, sha2, metrics 依赖 |
| `crates/law-eye-api/src/state.rs` | AppState 添加 cache_service 字段 |
| `crates/law-eye-api/src/main.rs` | 初始化 CacheService |
| `crates/law-eye-api/src/routes/mod.rs` | 测试辅助更新 |
| `crates/law-eye-api/src/routes/statistics/handlers.rs` | 全部 8 个端点接入缓存 |
| `crates/law-eye-api/src/routes/statistics/dto.rs` | DTO 添加 Deserialize |
| `crates/law-eye-core/src/statistics.rs` | Query 类型添加 Serialize |
