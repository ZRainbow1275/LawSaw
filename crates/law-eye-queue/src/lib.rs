use deadpool_redis::{Config, Pool, Runtime};
use law_eye_common::{Error, Result};
use redis::AsyncCommands;
use serde::{de::DeserializeOwned, Serialize};
use tracing::{info, warn, error};

const MAX_RETRIES: u32 = 3;
const RETRY_DELAY_MS: u64 = 5000;

pub struct TaskQueue {
    pool: Pool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RetryableTask<T> {
    pub payload: T,
    pub retry_count: u32,
    pub max_retries: u32,
    pub created_at: i64,
    pub last_error: Option<String>,
}

impl<T> RetryableTask<T> {
    pub fn new(payload: T) -> Self {
        Self {
            payload,
            retry_count: 0,
            max_retries: MAX_RETRIES,
            created_at: chrono::Utc::now().timestamp(),
            last_error: None,
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

impl TaskQueue {
    pub fn new(redis_url: &str) -> Result<Self> {
        let config = Config::from_url(redis_url);
        let pool = config
            .create_pool(Some(Runtime::Tokio1))
            .map_err(|e| Error::Internal(e.to_string()))?;
        Ok(Self { pool })
    }

    pub async fn enqueue<T: Serialize>(&self, queue: &str, task: &T) -> Result<()> {
        let mut conn = self
            .pool
            .get()
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;

        let payload = serde_json::to_string(task).map_err(|e| Error::Internal(e.to_string()))?;

        conn.rpush::<_, _, ()>(queue, &payload)
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;

        info!("Enqueued task to {}", queue);
        Ok(())
    }

    pub async fn enqueue_retryable<T: Serialize>(&self, queue: &str, task: T) -> Result<()> {
        let retryable = RetryableTask::new(task);
        self.enqueue(queue, &retryable).await
    }

    pub async fn dequeue<T: DeserializeOwned>(&self, queue: &str, timeout: u64) -> Result<Option<T>> {
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

    pub async fn retry_or_dead_letter<T: Serialize + Clone>(
        &self,
        queue: &str,
        mut task: RetryableTask<T>,
        error_msg: String,
    ) -> Result<bool> {
        task.increment_retry(error_msg.clone());

        if task.can_retry() {
            warn!(
                "Task failed, scheduling retry {}/{} for queue {}: {}",
                task.retry_count, task.max_retries, queue, error_msg
            );
            
            // Add delay before retry using Redis ZADD for delayed queue
            let delayed_queue = format!("{}:delayed", queue);
            let retry_at = chrono::Utc::now().timestamp_millis() + (RETRY_DELAY_MS as i64 * task.retry_count as i64);
            
            let mut conn = self
                .pool
                .get()
                .await
                .map_err(|e| Error::Internal(e.to_string()))?;

            let payload = serde_json::to_string(&task).map_err(|e| Error::Internal(e.to_string()))?;
            
            conn.zadd::<_, _, _, ()>(&delayed_queue, &payload, retry_at)
                .await
                .map_err(|e| Error::Internal(e.to_string()))?;

            Ok(true)
        } else {
            error!(
                "Task exceeded max retries, moving to dead letter queue: {}",
                error_msg
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

        // Get tasks that are ready to be processed
        let ready_tasks: Vec<String> = conn
            .zrangebyscore(&delayed_queue, 0i64, now)
            .await
            .map_err(|e| Error::Internal(e.to_string()))?;

        let count = ready_tasks.len() as u32;

        for task_payload in ready_tasks {
            // Move from delayed queue to main queue
            conn.zrem::<_, _, ()>(&delayed_queue, &task_payload)
                .await
                .map_err(|e| Error::Internal(e.to_string()))?;
            
            conn.rpush::<_, _, ()>(queue, &task_payload)
                .await
                .map_err(|e| Error::Internal(e.to_string()))?;
        }

        if count > 0 {
            info!("Moved {} delayed tasks back to {}", count, queue);
        }

        Ok(count)
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

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct IngestTask {
    pub source_id: uuid::Uuid,
    pub source_type: String,
    pub url: String,
    pub config: serde_json::Value,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PushTask {
    pub article_ids: Vec<uuid::Uuid>,
    pub channel: String,
    pub webhook_url: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AiTask {
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
