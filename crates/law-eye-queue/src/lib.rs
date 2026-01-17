use deadpool_redis::{Config, Pool, Runtime};
use law_eye_common::{Error, Result};
use redis::AsyncCommands;
use serde::{de::DeserializeOwned, Serialize};
use tracing::info;

pub struct TaskQueue {
    pool: Pool,
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
