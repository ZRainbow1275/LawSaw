//! 通用 Redis 缓存层 — Cache-Aside 模式实现
//!
//! 缓存键命名规范: `cache:{tenant_id}:{resource}:{params_hash}`
//! TTL 策略:
//!   - articles 列表: 30s
//!   - statistics: 5min
//!   - knowledge graph: 10min
//!   - overview: 2min
//!
//! 主动失效: 通过 `invalidate` / `invalidate_pattern` 在数据变更时清除相关缓存。

use deadpool_redis::{Config as PoolConfig, Pool, Runtime};
use redis::AsyncCommands;
use serde::{de::DeserializeOwned, Serialize};
use sha2::{Digest, Sha256};
use std::time::Duration;
use tracing::{debug, warn};

use crate::{Error, Result};

// ── 连接池超时默认值 ────────────────────────────────────────────────

const DEFAULT_CACHE_POOL_WAIT_TIMEOUT_MS: u64 = 1_000;
const DEFAULT_CACHE_POOL_CREATE_TIMEOUT_MS: u64 = 1_000;
const DEFAULT_CACHE_POOL_RECYCLE_TIMEOUT_MS: u64 = 1_000;

/// 缓存键前缀
const CACHE_KEY_PREFIX: &str = "cache";

// ── 预定义 TTL ─────────────────────────────────────────────────────

/// 缓存 TTL 配置
#[derive(Debug, Clone, Copy)]
pub struct CacheTtl;

impl CacheTtl {
    /// Articles 列表缓存: 30 秒
    pub const ARTICLES_LIST: u64 = 30;
    /// Statistics 聚合查询缓存: 2 分钟
    /// 作为主动失效遗漏时的兜底，降低陈旧数据暴露窗口。
    pub const STATISTICS: u64 = 120;
    /// Knowledge Graph 缓存: 10 分钟
    pub const KNOWLEDGE_GRAPH: u64 = 600;
    /// Overview 概览缓存: 2 分钟
    pub const OVERVIEW: u64 = 120;
    /// Categories 缓存: 10 分钟 (基本不变)
    pub const CATEGORIES: u64 = 600;
}

// ── CacheService ────────────────────────────────────────────────────

/// 通用 Redis 缓存服务 — 实现 Cache-Aside 模式
///
/// 用法:
/// ```ignore
/// let key = CacheService::build_key(tenant_id, "statistics:regional", &query);
/// if let Some(cached) = cache.get::<RegionalDistribution>(&key).await? {
///     return Ok(cached);
/// }
/// let result = expensive_query().await?;
/// cache.set(&key, &result, CacheTtl::STATISTICS).await?;
/// ```
#[derive(Clone)]
pub struct CacheService {
    pool: Pool,
}

/// 缓存操作结果: 命中/未命中
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CacheHit {
    Hit,
    Miss,
}

impl CacheService {
    /// 从 Redis URL 创建缓存服务
    pub fn new(redis_url: &str) -> Result<Self> {
        Self::new_with_timeouts(
            redis_url,
            DEFAULT_CACHE_POOL_WAIT_TIMEOUT_MS,
            DEFAULT_CACHE_POOL_CREATE_TIMEOUT_MS,
            DEFAULT_CACHE_POOL_RECYCLE_TIMEOUT_MS,
        )
    }

    /// 带自定义超时的构造器
    pub fn new_with_timeouts(
        redis_url: &str,
        wait_timeout_ms: u64,
        create_timeout_ms: u64,
        recycle_timeout_ms: u64,
    ) -> Result<Self> {
        let mut config = PoolConfig::from_url(redis_url);

        let mut pool_config = config.pool.unwrap_or_default();
        pool_config.timeouts.wait = Some(Duration::from_millis(wait_timeout_ms));
        pool_config.timeouts.create = Some(Duration::from_millis(create_timeout_ms));
        pool_config.timeouts.recycle = Some(Duration::from_millis(recycle_timeout_ms));
        config.pool = Some(pool_config);

        let pool = config
            .create_pool(Some(Runtime::Tokio1))
            .map_err(|e| Error::Internal(format!("cache pool creation failed: {e}")))?;

        Ok(Self { pool })
    }

    /// 构造标准化缓存键: `cache:{tenant_id}:{resource}:{params_hash}`
    ///
    /// `params` 会被序列化后 SHA-256 哈希，确保键长度可控。
    pub fn build_key<P: Serialize>(
        tenant_id: uuid::Uuid,
        resource: &str,
        params: &P,
    ) -> String {
        let params_json =
            serde_json::to_string(params).unwrap_or_else(|_| "{}".to_string());
        let mut hasher = Sha256::new();
        hasher.update(params_json.as_bytes());
        let digest = hasher.finalize();
        let hash = format!("{:x}", digest);
        // 取前 16 字符即可，碰撞概率极低
        let short_hash = &hash[..16];
        format!("{CACHE_KEY_PREFIX}:{tenant_id}:{resource}:{short_hash}")
    }

    /// 构造无参数的缓存键 (例如 overview)
    pub fn build_key_simple(tenant_id: uuid::Uuid, resource: &str) -> String {
        format!("{CACHE_KEY_PREFIX}:{tenant_id}:{resource}")
    }

    // ── GET ─────────────────────────────────────────────────────────

    /// 获取缓存值 (反序列化为 T)。Redis 连接失败时静默返回 None (fail-open)。
    pub async fn get<T: DeserializeOwned>(&self, key: &str) -> Result<Option<T>> {
        let mut conn = match self.pool.get().await {
            Ok(conn) => conn,
            Err(e) => {
                warn!(error = %e, key = %key, "cache: redis connection failed (fail-open)");
                metrics::counter!("cache_errors_total", "op" => "get").increment(1);
                return Ok(None);
            }
        };

        let raw: Option<String> = match conn.get(key).await {
            Ok(raw) => raw,
            Err(e) => {
                warn!(error = %e, key = %key, "cache: GET failed (fail-open)");
                metrics::counter!("cache_errors_total", "op" => "get").increment(1);
                return Ok(None);
            }
        };

        match raw {
            Some(data) => {
                let value: T = serde_json::from_str(&data).map_err(|e| {
                    Error::Internal(format!("cache deserialization failed: {e}"))
                })?;
                debug!(key = %key, "cache: HIT");
                metrics::counter!("cache_hits_total").increment(1);
                Ok(Some(value))
            }
            None => {
                debug!(key = %key, "cache: MISS");
                metrics::counter!("cache_misses_total").increment(1);
                Ok(None)
            }
        }
    }

    // ── SET ─────────────────────────────────────────────────────────

    /// 设置缓存值 (带 TTL)。Redis 连接失败时静默忽略 (fail-open)。
    pub async fn set<T: Serialize>(&self, key: &str, value: &T, ttl_seconds: u64) -> Result<()> {
        let data = serde_json::to_string(value)
            .map_err(|e| Error::Internal(format!("cache serialization failed: {e}")))?;

        let mut conn = match self.pool.get().await {
            Ok(conn) => conn,
            Err(e) => {
                warn!(error = %e, key = %key, "cache: redis connection failed on SET (fail-open)");
                metrics::counter!("cache_errors_total", "op" => "set").increment(1);
                return Ok(());
            }
        };

        if let Err(e) = conn.set_ex::<_, _, ()>(key, &data, ttl_seconds).await {
            warn!(error = %e, key = %key, "cache: SET failed (fail-open)");
            metrics::counter!("cache_errors_total", "op" => "set").increment(1);
        }

        Ok(())
    }

    // ── DELETE / INVALIDATE ─────────────────────────────────────────

    /// 删除单个缓存键
    pub async fn invalidate(&self, key: &str) -> Result<()> {
        let mut conn = match self.pool.get().await {
            Ok(conn) => conn,
            Err(e) => {
                warn!(error = %e, key = %key, "cache: redis connection failed on DEL (fail-open)");
                return Ok(());
            }
        };

        if let Err(e) = conn.del::<_, ()>(key).await {
            warn!(error = %e, key = %key, "cache: DEL failed (fail-open)");
        }

        Ok(())
    }

    /// 按前缀模式批量失效缓存键
    ///
    /// 使用 SCAN 避免阻塞 Redis 主线程。
    /// `pattern` 示例: `cache:{tenant_id}:statistics:*`
    pub async fn invalidate_pattern(&self, pattern: &str) -> Result<u64> {
        let mut conn = match self.pool.get().await {
            Ok(conn) => conn,
            Err(e) => {
                warn!(error = %e, pattern = %pattern, "cache: redis connection failed on SCAN (fail-open)");
                return Ok(0);
            }
        };

        let mut cursor: u64 = 0;
        let mut total_deleted: u64 = 0;

        loop {
            let (next_cursor, keys): (u64, Vec<String>) =
                redis::cmd("SCAN")
                    .arg(cursor)
                    .arg("MATCH")
                    .arg(pattern)
                    .arg("COUNT")
                    .arg(100)
                    .query_async(&mut conn)
                    .await
                    .map_err(|e| Error::Internal(format!("cache SCAN failed: {e}")))?;

            if !keys.is_empty() {
                let deleted: u64 = redis::cmd("DEL")
                    .arg(&keys)
                    .query_async(&mut conn)
                    .await
                    .unwrap_or(0);
                total_deleted += deleted;
            }

            cursor = next_cursor;
            if cursor == 0 {
                break;
            }
        }

        if total_deleted > 0 {
            debug!(
                pattern = %pattern,
                deleted = total_deleted,
                "cache: invalidated keys by pattern"
            );
        }

        Ok(total_deleted)
    }

    /// 失效某个租户下某个资源的所有缓存
    pub async fn invalidate_resource(
        &self,
        tenant_id: uuid::Uuid,
        resource: &str,
    ) -> Result<u64> {
        let pattern = format!("{CACHE_KEY_PREFIX}:{tenant_id}:{resource}:*");
        self.invalidate_pattern(&pattern).await
    }

    /// 失效某个租户下所有缓存
    pub async fn invalidate_tenant(&self, tenant_id: uuid::Uuid) -> Result<u64> {
        let pattern = format!("{CACHE_KEY_PREFIX}:{tenant_id}:*");
        self.invalidate_pattern(&pattern).await
    }

    // ── Cache-Aside 封装 ────────────────────────────────────────────

    /// Cache-Aside 模式的高层封装
    ///
    /// 先查缓存，命中则返回；未命中则调用 `fetch` 获取数据，写入缓存后返回。
    pub async fn get_or_fetch<T, F, Fut>(
        &self,
        key: &str,
        ttl_seconds: u64,
        fetch: F,
    ) -> Result<T>
    where
        T: Serialize + DeserializeOwned,
        F: FnOnce() -> Fut,
        Fut: std::future::Future<Output = Result<T>>,
    {
        // 1. 尝试从缓存读取
        if let Some(cached) = self.get::<T>(key).await? {
            return Ok(cached);
        }

        // 2. 缓存未命中，执行原始查询
        let value = fetch().await?;

        // 3. 写入缓存 (异步 fire-and-forget 不阻塞返回)
        self.set(key, &value, ttl_seconds).await?;

        Ok(value)
    }

    // ── 健康检查 ────────────────────────────────────────────────────

    /// PING Redis 验证连接
    pub async fn ping(&self) -> Result<()> {
        let mut conn = self
            .pool
            .get()
            .await
            .map_err(|e| Error::Internal(format!("cache ping: pool get failed: {e}")))?;

        let _: String = redis::cmd("PING")
            .query_async(&mut conn)
            .await
            .map_err(|e| Error::Internal(format!("cache ping failed: {e}")))?;

        Ok(())
    }

    /// 获取连接池状态 (用于 Prometheus 指标)
    pub fn pool_status(&self) -> CachePoolStatus {
        let status = self.pool.status();
        CachePoolStatus {
            size: status.size,
            available: status.available,
            waiting: status.waiting,
        }
    }
}

/// 连接池状态快照
#[derive(Debug, Clone, Copy)]
pub struct CachePoolStatus {
    /// 当前池中总连接数
    pub size: usize,
    /// 空闲连接数
    pub available: usize,
    /// 等待获取连接的任务数
    pub waiting: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_key_produces_consistent_output() {
        let tenant = uuid::Uuid::nil();
        let params = serde_json::json!({"date_from": "2026-01-01"});
        let key1 = CacheService::build_key(tenant, "statistics:regional", &params);
        let key2 = CacheService::build_key(tenant, "statistics:regional", &params);
        assert_eq!(key1, key2);
        assert!(key1.starts_with("cache:00000000-0000-0000-0000-000000000000:statistics:regional:"));
    }

    #[test]
    fn build_key_different_params_produce_different_keys() {
        let tenant = uuid::Uuid::nil();
        let params_a = serde_json::json!({"date_from": "2026-01-01"});
        let params_b = serde_json::json!({"date_from": "2026-02-01"});
        let key_a = CacheService::build_key(tenant, "statistics:regional", &params_a);
        let key_b = CacheService::build_key(tenant, "statistics:regional", &params_b);
        assert_ne!(key_a, key_b);
    }

    #[test]
    fn build_key_simple_is_predictable() {
        let tenant = uuid::Uuid::nil();
        let key = CacheService::build_key_simple(tenant, "statistics:overview");
        assert_eq!(
            key,
            "cache:00000000-0000-0000-0000-000000000000:statistics:overview"
        );
    }
}
