use deadpool_redis::{Config, Pool, Runtime};
use law_eye_common::{Error, Result};
use redis::AsyncCommands;
use serde::{de::DeserializeOwned, Serialize};
use tokio::time::{sleep, Duration, Instant};
use tracing::{error, info, warn};

const DEFAULT_MAX_RETRIES: u32 = 3;
const RETRY_BASE_DELAY_MS: u64 = 5_000;
const RETRY_MAX_DELAY_MS: u64 = 60_000;
const RETRY_RATE_LIMIT_BASE_DELAY_MS: u64 = 60_000;
const RETRY_RATE_LIMIT_MAX_DELAY_MS: u64 = 10 * 60_000;
const DONE_TTL_SECS: u64 = 60 * 60 * 24 * 7;
const RESERVE_POLL_INTERVAL_MS: u64 = 200;
const PROCESS_DELAYED_MAX_BATCH: u32 = 500;

const DEFAULT_REDIS_POOL_WAIT_TIMEOUT_MS: u64 = 2_000;
const DEFAULT_REDIS_POOL_CREATE_TIMEOUT_MS: u64 = 2_000;
const DEFAULT_REDIS_POOL_RECYCLE_TIMEOUT_MS: u64 = 2_000;

fn redis_timeout_env_ms(name: &str, default: u64) -> u64 {
    std::env::var(name)
        .ok()
        .and_then(|raw| raw.trim().parse::<u64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(default)
}

// Atomic reserve: move from <queue> to <queue:processing> and track in <queue:inflight> with a timestamp.
// Uses FIFO semantics (LPOP from main queue).
const LUA_RESERVE_RETRYABLE_ATOMIC: &str = r#"
local src = KEYS[1]
local dst = KEYS[2]
local inflight = KEYS[3]
local now = ARGV[1]
local payload = redis.call('LPOP', src)
if payload then
  redis.call('RPUSH', dst, payload)
  redis.call('ZADD', inflight, now, payload)
end
return payload
"#;

// Atomic delayed processing: move due tasks from <queue:delayed> into <queue>.
const LUA_PROCESS_DELAYED_ATOMIC: &str = r#"
local delayed = KEYS[1]
local queue = KEYS[2]
local now = ARGV[1]
local max_batch = ARGV[2]
local tasks = redis.call('ZRANGEBYSCORE', delayed, 0, now, 'LIMIT', 0, max_batch)
for i,task in ipairs(tasks) do
  redis.call('ZREM', delayed, task)
  redis.call('RPUSH', queue, task)
end
return #tasks
"#;

// Ordered processing gate: allow exactly one in-flight task per ordering key and enforce
// monotonically increasing ordering_seq when provided.
const LUA_ORDERING_ACQUIRE: &str = r#"
local lock_key = KEYS[1]
local expected_key = KEYS[2]
local owner = ARGV[1]
local ttl_ms = tonumber(ARGV[2])
local seq = tonumber(ARGV[3])

local expected = tonumber(redis.call('GET', expected_key) or '1')

if seq and seq > 0 then
  if seq < expected then
    return -1
  end
  if seq > expected then
    return 0
  end
end

local acquired = redis.call('SET', lock_key, owner, 'NX', 'PX', ttl_ms)
if acquired then
  return 1
end

local current_owner = redis.call('GET', lock_key)
if current_owner == owner then
  redis.call('PEXPIRE', lock_key, ttl_ms)
  return 1
end

return 0
"#;

const LUA_ORDERING_RELEASE: &str = r#"
local lock_key = KEYS[1]
local expected_key = KEYS[2]
local owner = ARGV[1]
local advance = ARGV[2] == '1'
local seq = tonumber(ARGV[3])

if redis.call('GET', lock_key) == owner then
  redis.call('DEL', lock_key)
end

if advance and seq and seq > 0 then
  local expected = tonumber(redis.call('GET', expected_key) or '1')
  if seq >= expected then
    redis.call('SET', expected_key, seq + 1)
  end
end

return 1
"#;

#[derive(Clone)]
pub struct TaskQueue {
    pool: Pool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RetryableTask<T> {
    #[serde(default = "uuid::Uuid::new_v4")]
    pub id: uuid::Uuid,
    pub payload: T,
    pub retry_count: u32,
    pub max_retries: u32,
    pub created_at: i64,
    pub last_error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ordering_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ordering_seq: Option<i64>,
}

impl<T> RetryableTask<T> {
    pub fn new(payload: T) -> Self {
        Self {
            id: uuid::Uuid::new_v4(),
            payload,
            retry_count: 0,
            max_retries: DEFAULT_MAX_RETRIES,
            created_at: chrono::Utc::now().timestamp(),
            last_error: None,
            ordering_key: None,
            ordering_seq: None,
        }
    }

    pub fn can_retry(&self) -> bool {
        self.retry_count < self.max_retries
    }

    pub fn increment_retry(&mut self, error: String) {
        self.retry_count += 1;
        self.last_error = Some(error);
    }
}

pub struct ReservedTask<T> {
    pub raw_payload: String,
    pub task: RetryableTask<T>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OrderedTaskGate {
    Unordered,
    Acquired,
    Blocked,
    Stale,
}

impl TaskQueue {
    pub fn new(redis_url: &str) -> Result<Self> {
        Self::new_with_pool_timeouts(
            redis_url,
            redis_timeout_env_ms(
                "LAW_EYE__REDIS__POOL_WAIT_TIMEOUT_MS",
                DEFAULT_REDIS_POOL_WAIT_TIMEOUT_MS,
            ),
            redis_timeout_env_ms(
                "LAW_EYE__REDIS__POOL_CREATE_TIMEOUT_MS",
                DEFAULT_REDIS_POOL_CREATE_TIMEOUT_MS,
            ),
            redis_timeout_env_ms(
                "LAW_EYE__REDIS__POOL_RECYCLE_TIMEOUT_MS",
                DEFAULT_REDIS_POOL_RECYCLE_TIMEOUT_MS,
            ),
        )
    }

    pub fn new_with_pool_timeouts(
        redis_url: &str,
        pool_wait_timeout_ms: u64,
        pool_create_timeout_ms: u64,
        pool_recycle_timeout_ms: u64,
    ) -> Result<Self> {
        let mut config = Config::from_url(redis_url);

        let mut pool_config = config.pool.unwrap_or_default();
        pool_config.timeouts.wait = Some(Duration::from_millis(pool_wait_timeout_ms));
        pool_config.timeouts.create = Some(Duration::from_millis(pool_create_timeout_ms));
        pool_config.timeouts.recycle = Some(Duration::from_millis(pool_recycle_timeout_ms));
        config.pool = Some(pool_config);

        let pool = config
            .create_pool(Some(Runtime::Tokio1))
            .map_err(|e| Error::Internal(e.to_string()))?;
        Ok(Self { pool })
    }

    pub async fn ping(&self) -> Result<()> {
        let mut conn = self
            .pool
            .get()
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;

        let _: String = redis::cmd("PING")
            .query_async(&mut conn)
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;

        Ok(())
    }

    pub async fn enqueue<T: Serialize>(&self, queue: &str, task: &T) -> Result<()> {
        let mut conn = self
            .pool
            .get()
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;

        let payload = serde_json::to_string(task).map_err(|e| Error::Internal(e.to_string()))?;

        redis::pipe()
            .atomic()
            .rpush(queue, &payload)
            .query_async::<()>(&mut conn)
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;

        info!("Enqueued task to {}", queue);
        Ok(())
    }

    pub async fn enqueue_retryable<T: Serialize>(&self, queue: &str, task: T) -> Result<()> {
        let retryable = RetryableTask::new(task);
        self.enqueue(queue, &retryable).await
    }

    pub async fn enqueue_retryable_with_ordering<T: Serialize>(
        &self,
        queue: &str,
        task: T,
        ordering_key: Option<String>,
        ordering_seq: Option<i64>,
    ) -> Result<()> {
        let mut retryable = RetryableTask::new(task);
        retryable.ordering_key = ordering_key
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        retryable.ordering_seq = ordering_seq.filter(|value| *value > 0);
        self.enqueue(queue, &retryable).await
    }

    pub async fn dequeue<T: DeserializeOwned>(
        &self,
        queue: &str,
        timeout: u64,
    ) -> Result<Option<T>> {
        let mut conn = self
            .pool
            .get()
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;

        let result: Option<(String, String)> = conn
            .blpop(queue, timeout as f64)
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;

        match result {
            Some((_, payload)) => {
                let task =
                    serde_json::from_str(&payload).map_err(|e| Error::Internal(e.to_string()))?;
                Ok(Some(task))
            }
            None => Ok(None),
        }
    }

    pub async fn dequeue_retryable<T: DeserializeOwned>(
        &self,
        queue: &str,
        timeout: u64,
    ) -> Result<Option<RetryableTask<T>>> {
        self.dequeue(queue, timeout).await
    }

    pub async fn reserve_retryable<T: DeserializeOwned>(
        &self,
        queue: &str,
        timeout: u64,
    ) -> Result<Option<ReservedTask<T>>> {
        let processing_queue = format!("{}:processing", queue);
        let inflight_queue = format!("{}:inflight", queue);

        let mut conn = self
            .pool
            .get()
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;

        // NOTE: Redis blocking pop (BRPOPLPUSH) cannot be composed atomically with ZADD.
        // We implement an atomic reserve with RPOPLPUSH+ZADD in a Lua script, and emulate blocking
        // behavior via bounded polling.
        let script = redis::Script::new(LUA_RESERVE_RETRYABLE_ATOMIC);
        let deadline = if timeout == 0 {
            None
        } else {
            Some(Instant::now() + Duration::from_secs(timeout))
        };

        let raw_payload = loop {
            let now = chrono::Utc::now().timestamp_millis();
            let payload: Option<String> = script
                .key(queue)
                .key(&processing_queue)
                .key(&inflight_queue)
                .arg(now)
                .invoke_async(&mut conn)
                .await
                .map_err(|e| Error::Internal(e.to_string()))?;

            if let Some(payload) = payload {
                break payload;
            }

            match deadline {
                None => return Ok(None),
                Some(deadline) if Instant::now() >= deadline => return Ok(None),
                Some(_) => sleep(Duration::from_millis(RESERVE_POLL_INTERVAL_MS)).await,
            }
        };

        let task = match parse_retryable_or_wrap::<T>(&raw_payload) {
            Ok(task) => task,
            Err(e) => {
                let err_msg = e.to_string();
                error!(
                    "Failed to deserialize reserved task from {} (moving to DLQ): {}",
                    queue, err_msg
                );

                let dlq = format!("{}:dlq", queue);
                let poison = serde_json::json!({
                    "raw_payload": raw_payload.clone(),
                    "error": err_msg,
                    "failed_at": chrono::Utc::now().timestamp()
                });
                let poison_payload = serde_json::to_string(&poison)
                    .unwrap_or_else(|_| "{\"error\":\"dlq_poison_serialize_failed\"}".to_string());

                conn.zrem::<_, _, ()>(&inflight_queue, &raw_payload)
                    .await
                    .map_err(|e| Error::Internal(e.to_string()))?;
                conn.lrem::<_, _, ()>(&processing_queue, 1, &raw_payload)
                    .await
                    .map_err(|e| Error::Internal(e.to_string()))?;
                conn.rpush::<_, _, ()>(&dlq, &poison_payload)
                    .await
                    .map_err(|e| Error::Internal(e.to_string()))?;

                return Ok(None);
            }
        };

        Ok(Some(ReservedTask { raw_payload, task }))
    }

    pub async fn ack_reserved(&self, queue: &str, raw_payload: &str) -> Result<()> {
        let processing_queue = format!("{}:processing", queue);
        let inflight_queue = format!("{}:inflight", queue);

        let mut conn = self
            .pool
            .get()
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;

        conn.lrem::<_, _, ()>(&processing_queue, 1, raw_payload)
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;
        conn.zrem::<_, _, ()>(&inflight_queue, raw_payload)
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;
        Ok(())
    }

    pub async fn release_reserved_back_to_queue(&self, queue: &str, raw_payload: &str) -> Result<()> {
        let processing_queue = format!("{}:processing", queue);
        let inflight_queue = format!("{}:inflight", queue);

        let mut conn = self
            .pool
            .get()
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;

        conn.lrem::<_, _, ()>(&processing_queue, 1, raw_payload)
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;
        conn.zrem::<_, _, ()>(&inflight_queue, raw_payload)
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;
        conn.lpush::<_, _, ()>(queue, raw_payload)
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;
        Ok(())
    }

    pub async fn try_acquire_ordering_gate(
        &self,
        queue: &str,
        task_id: uuid::Uuid,
        ordering_key: Option<&str>,
        ordering_seq: Option<i64>,
        visibility_timeout_ms: i64,
    ) -> Result<OrderedTaskGate> {
        let ordering_key = ordering_key
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let Some(ordering_key) = ordering_key else {
            return Ok(OrderedTaskGate::Unordered);
        };

        let lock_key = format!("{}:ordering:{}:lock", queue, ordering_key);
        let expected_key = format!("{}:ordering:{}:expected", queue, ordering_key);
        let ttl_ms = visibility_timeout_ms.max(1_000);

        let mut conn = self
            .pool
            .get()
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;

        let script = redis::Script::new(LUA_ORDERING_ACQUIRE);
        let code: i64 = script
            .key(&lock_key)
            .key(&expected_key)
            .arg(task_id.to_string())
            .arg(ttl_ms)
            .arg(ordering_seq.unwrap_or(0))
            .invoke_async(&mut conn)
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;

        let status = match code {
            1 => OrderedTaskGate::Acquired,
            0 => OrderedTaskGate::Blocked,
            -1 => OrderedTaskGate::Stale,
            _ => OrderedTaskGate::Blocked,
        };
        Ok(status)
    }

    pub async fn release_ordering_gate(
        &self,
        queue: &str,
        task_id: uuid::Uuid,
        ordering_key: Option<&str>,
        ordering_seq: Option<i64>,
        advance_expected: bool,
    ) -> Result<()> {
        let ordering_key = ordering_key
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let Some(ordering_key) = ordering_key else {
            return Ok(());
        };

        let lock_key = format!("{}:ordering:{}:lock", queue, ordering_key);
        let expected_key = format!("{}:ordering:{}:expected", queue, ordering_key);

        let mut conn = self
            .pool
            .get()
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;

        let script = redis::Script::new(LUA_ORDERING_RELEASE);
        script
            .key(&lock_key)
            .key(&expected_key)
            .arg(task_id.to_string())
            .arg(if advance_expected { "1" } else { "0" })
            .arg(ordering_seq.unwrap_or(0))
            .invoke_async::<()>(&mut conn)
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;

        Ok(())
    }

    pub async fn requeue_stuck_tasks(
        &self,
        queue: &str,
        visibility_timeout_ms: i64,
        max_batch: usize,
    ) -> Result<u32> {
        let processing_queue = format!("{}:processing", queue);
        let inflight_queue = format!("{}:inflight", queue);
        let now = chrono::Utc::now().timestamp_millis();
        let cutoff = now.saturating_sub(visibility_timeout_ms);

        let mut conn = self
            .pool
            .get()
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;

        let stuck: Vec<String> = redis::cmd("ZRANGEBYSCORE")
            .arg(&inflight_queue)
            .arg(0i64)
            .arg(cutoff)
            .arg("LIMIT")
            .arg(0usize)
            .arg(max_batch)
            .query_async(&mut conn)
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;

        let mut count = 0u32;
        for raw_payload in stuck {
            conn.zrem::<_, _, ()>(&inflight_queue, &raw_payload)
                .await
                .map_err(|e| Error::Internal(e.to_string()))?;
            conn.lrem::<_, _, ()>(&processing_queue, 1, &raw_payload)
                .await
                .map_err(|e| Error::Internal(e.to_string()))?;
            conn.rpush::<_, _, ()>(queue, &raw_payload)
                .await
                .map_err(|e| Error::Internal(e.to_string()))?;
            count = count.saturating_add(1);
        }

        // Repair edge case: if BRPOPLPUSH succeeded but ZADD failed (or worker crashed),
        // items can be left in :processing without an :inflight entry and would never be re-queued.
        if max_batch > 0 {
            let end = max_batch.saturating_sub(1) as isize;
            let processing_head: Vec<String> = conn
                .lrange(&processing_queue, 0, end)
                .await
                .map_err(|e| Error::Internal(e.to_string()))?;

            for raw_payload in processing_head {
                let score: Option<f64> = redis::cmd("ZSCORE")
                    .arg(&inflight_queue)
                    .arg(&raw_payload)
                    .query_async(&mut conn)
                    .await
                    .map_err(|e| Error::Internal(e.to_string()))?;

                if score.is_none() {
                    conn.lrem::<_, _, ()>(&processing_queue, 1, &raw_payload)
                        .await
                        .map_err(|e| Error::Internal(e.to_string()))?;
                    conn.rpush::<_, _, ()>(queue, &raw_payload)
                        .await
                        .map_err(|e| Error::Internal(e.to_string()))?;
                    count = count.saturating_add(1);
                }
            }
        }

        if count > 0 {
            warn!(
                "Re-queued {} stuck tasks back to {} (visibility_timeout_ms={})",
                count, queue, visibility_timeout_ms
            );
        }

        Ok(count)
    }

    pub async fn is_done(&self, queue: &str, id: uuid::Uuid) -> Result<bool> {
        let key = format!("{}:done:{}", queue, id);
        let mut conn = self
            .pool
            .get()
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;

        let exists: bool = conn
            .exists(key)
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;
        Ok(exists)
    }

    pub async fn mark_done(&self, queue: &str, id: uuid::Uuid) -> Result<()> {
        let key = format!("{}:done:{}", queue, id);
        let mut conn = self
            .pool
            .get()
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;

        conn.set_ex::<_, _, ()>(key, 1u8, DONE_TTL_SECS)
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;
        Ok(())
    }

    pub async fn retry_or_dead_letter<T: Serialize + Clone>(
        &self,
        queue: &str,
        mut task: RetryableTask<T>,
        error_msg: String,
    ) -> Result<bool> {
        let error_msg = error_msg.chars().take(1000).collect::<String>();
        let rate_limited = is_rate_limited_error(&error_msg);

        // Rate limiting is an external dependency constraint, not a correctness failure.
        // Give rate-limited tasks a larger retry budget to avoid prematurely sending them to DLQ.
        if rate_limited {
            let max_retries = rate_limit_max_retries();
            if task.max_retries < max_retries {
                task.max_retries = max_retries;
            }
        }

        task.increment_retry(error_msg.clone());

        if task.can_retry() {
            warn!(
                "Task {} failed, scheduling retry {}/{} for queue {}: {}",
                task.id, task.retry_count, task.max_retries, queue, error_msg
            );

            // Add delay before retry using Redis ZADD for delayed queue
            let delayed_queue = format!("{}:delayed", queue);
            let mut delay_ms = if rate_limited {
                retry_backoff_ms_rate_limited(task.retry_count)
            } else {
                retry_backoff_ms(task.retry_count)
            };

            if rate_limited {
                if let Some(hint_seconds) = parse_retry_after_seconds_hint(&error_msg) {
                    let hint_ms = hint_seconds.saturating_mul(1000);
                    delay_ms = delay_ms.max(hint_ms).min(RETRY_RATE_LIMIT_MAX_DELAY_MS);
                }
            }
            let retry_at = chrono::Utc::now().timestamp_millis() + delay_ms as i64;

            let mut conn = self
                .pool
                .get()
                .await
                .map_err(|e| Error::Internal(e.to_string()))?;

            let payload =
                serde_json::to_string(&task).map_err(|e| Error::Internal(e.to_string()))?;

            conn.zadd::<_, _, _, ()>(&delayed_queue, &payload, retry_at)
                .await
                .map_err(|e| Error::Internal(e.to_string()))?;

            Ok(true)
        } else {
            error!(
                "Task {} exceeded max retries, moving to dead letter queue: {}",
                task.id, error_msg
            );

            let dlq = format!("{}:dlq", queue);
            self.enqueue(&dlq, &task).await?;
            Ok(false)
        }
    }

    pub async fn process_delayed_tasks(&self, queue: &str) -> Result<u32> {
        let delayed_queue = format!("{}:delayed", queue);
        let now = chrono::Utc::now().timestamp_millis();

        let mut conn = self
            .pool
            .get()
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;

        // Use a Lua script to atomically move due tasks back into the main queue.
        // This prevents the ZREM -> RPUSH split-brain that could permanently lose tasks on failure.
        let script = redis::Script::new(LUA_PROCESS_DELAYED_ATOMIC);
        let moved: i64 = script
            .key(&delayed_queue)
            .key(queue)
            .arg(now)
            .arg(PROCESS_DELAYED_MAX_BATCH)
            .invoke_async(&mut conn)
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;

        let moved_u32 = u32::try_from(moved).unwrap_or(0);
        if moved_u32 > 0 {
            info!("Moved {} delayed tasks back to {}", moved_u32, queue);
        }

        Ok(moved_u32)
    }

    pub async fn queue_length(&self, queue: &str) -> Result<usize> {
        let mut conn = self
            .pool
            .get()
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;

        let len: usize = conn
            .llen(queue)
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;

        Ok(len)
    }

    pub async fn dlq_length(&self, queue: &str) -> Result<usize> {
        self.queue_length(&format!("{}:dlq", queue)).await
    }

    pub async fn delayed_length(&self, queue: &str) -> Result<usize> {
        let delayed_queue = format!("{}:delayed", queue);

        let mut conn = self
            .pool
            .get()
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;

        let len: usize = conn
            .zcard(&delayed_queue)
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;

        Ok(len)
    }
}

fn parse_retryable_or_wrap<T: DeserializeOwned>(raw_payload: &str) -> Result<RetryableTask<T>> {
    let raw_payload = raw_payload
        .trim_start_matches(|c: char| c.is_whitespace() || c == '\u{feff}')
        .trim_end();

    match serde_json::from_str::<RetryableTask<T>>(raw_payload) {
        Ok(task) => Ok(task),
        Err(_) => {
            let payload = serde_json::from_str::<T>(raw_payload)
                .map_err(|e| Error::Internal(e.to_string()))?;
            Ok(RetryableTask::new(payload))
        }
    }
}

fn retry_backoff_ms(retry_count: u32) -> u64 {
    let exp = retry_count.saturating_sub(1);
    let mut delay = RETRY_BASE_DELAY_MS;
    for _ in 0..exp {
        delay = delay.saturating_mul(2);
    }
    delay.min(RETRY_MAX_DELAY_MS)
}

fn retry_backoff_ms_rate_limited(retry_count: u32) -> u64 {
    let exp = retry_count.saturating_sub(1);
    let mut delay = RETRY_RATE_LIMIT_BASE_DELAY_MS;
    for _ in 0..exp {
        delay = delay.saturating_mul(2);
    }
    delay.min(RETRY_RATE_LIMIT_MAX_DELAY_MS)
}

fn is_rate_limited_error(error_msg: &str) -> bool {
    let msg = error_msg.to_ascii_lowercase();
    // 429 may also represent "insufficient_quota" which is not recoverable by waiting.
    if msg.contains("insufficient_quota") {
        return false;
    }

    msg.contains("rate limit")
        || msg.contains("rate_limit")
        || msg.contains("too many requests")
        || msg.contains("status code: 429")
        || msg.contains("http 429")
        || msg.contains("ai_circuit_open")
        || msg.contains("circuit open")
        || msg.contains(" ai_rate_limited")
        || msg.starts_with("ai_rate_limited")
}

fn parse_retry_after_seconds_hint(error_msg: &str) -> Option<u64> {
    // Expected format (case-insensitive):
    // - "... retry_after_seconds=60 ..."
    let lower = error_msg.to_ascii_lowercase();
    let key = "retry_after_seconds=";
    let idx = lower.find(key)?;
    let rest = &lower[idx + key.len()..];
    let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        return None;
    }
    digits.parse::<u64>().ok()
}

fn rate_limit_max_retries() -> u32 {
    const DEFAULT: u32 = 20;
    const MAX: u32 = 200;

    std::env::var("LAW_EYE__QUEUE__RATE_LIMIT_MAX_RETRIES")
        .ok()
        .and_then(|raw| raw.trim().parse::<u32>().ok())
        .filter(|v| *v > 0)
        .unwrap_or(DEFAULT)
        .min(MAX)
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct IngestTask {
    #[serde(default)]
    pub tenant_id: uuid::Uuid,
    pub source_id: uuid::Uuid,
    pub source_type: String,
    pub url: String,
    pub config: serde_json::Value,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PushTask {
    #[serde(default)]
    pub tenant_id: uuid::Uuid,
    pub article_ids: Vec<uuid::Uuid>,
    pub channel: String,
    pub webhook_url: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WebhookDeliveryTask {
    #[serde(default)]
    pub tenant_id: uuid::Uuid,
    pub endpoint_id: uuid::Uuid,
    pub event_id: uuid::Uuid,
    pub event_type: String,
    pub occurred_at: i64,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AiTask {
    #[serde(default)]
    pub tenant_id: uuid::Uuid,
    pub article_id: uuid::Uuid,
    pub task_type: AiTaskType,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AiTaskType {
    Classify,
    Summarize,
    RiskAssess,
    ExtractTags,
    Embed,
    Full,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn retry_backoff_is_exponential_and_capped() {
        assert_eq!(retry_backoff_ms(1), 5_000);
        assert_eq!(retry_backoff_ms(2), 10_000);
        assert_eq!(retry_backoff_ms(3), 20_000);
        assert_eq!(retry_backoff_ms(4), 40_000);
        assert_eq!(retry_backoff_ms(5), 60_000);
        assert_eq!(retry_backoff_ms(20), 60_000);
    }

    #[test]
    fn parse_retryable_or_wrap_wraps_legacy_payload() {
        let source_id = uuid::Uuid::new_v4();
        let payload = IngestTask {
            tenant_id: uuid::Uuid::nil(),
            source_id,
            source_type: "rss".to_string(),
            url: "https://example.com/feed".to_string(),
            config: json!({"a": 1}),
        };

        let raw = serde_json::to_string(&payload).unwrap();
        let task = parse_retryable_or_wrap::<IngestTask>(&raw).unwrap();

        assert_eq!(task.payload.source_id, source_id);
        assert_eq!(task.payload.source_type, "rss");
        assert_eq!(task.retry_count, 0);
        assert_eq!(task.max_retries, DEFAULT_MAX_RETRIES);
        assert!(task.last_error.is_none());
        assert_ne!(task.id, uuid::Uuid::nil());
    }

    #[test]
    fn parse_retryable_or_wrap_tolerates_bom_and_trailing_newline() {
        let source_id = uuid::Uuid::new_v4();
        let payload = IngestTask {
            tenant_id: uuid::Uuid::nil(),
            source_id,
            source_type: "rss".to_string(),
            url: "https://example.com/feed".to_string(),
            config: json!({"a": 1}),
        };

        let raw = serde_json::to_string(&payload).unwrap();
        let wrapped = format!("\u{feff}  {}\r\n", raw);
        let task = parse_retryable_or_wrap::<IngestTask>(&wrapped).unwrap();

        assert_eq!(task.payload.source_id, source_id);
        assert_eq!(task.payload.source_type, "rss");
        assert_ne!(task.id, uuid::Uuid::nil());
    }

    #[test]
    fn retryable_task_missing_id_deserializes_with_default() {
        let payload = IngestTask {
            tenant_id: uuid::Uuid::nil(),
            source_id: uuid::Uuid::new_v4(),
            source_type: "rss".to_string(),
            url: "https://example.com/feed".to_string(),
            config: json!({"k": "v"}),
        };

        let raw = serde_json::to_string(&json!({
            "payload": payload,
            "retry_count": 0,
            "max_retries": 3,
            "created_at": 0,
            "last_error": null
        }))
        .unwrap();

        let task: RetryableTask<IngestTask> = serde_json::from_str(&raw).unwrap();
        assert_ne!(task.id, uuid::Uuid::nil());
    }
}
