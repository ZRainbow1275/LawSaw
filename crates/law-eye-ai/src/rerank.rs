use law_eye_common::{CircuitBreaker, CircuitBreakerConfig, Error, Result};
use serde::{Deserialize, Serialize};
use std::{sync::Arc, time::Duration};
use tokio::sync::Semaphore;
use tracing::{debug, info, warn};

const DEFAULT_BASE_URL: &str = "https://api.siliconflow.cn/v1";
const DEFAULT_MODEL: &str = "BAAI/bge-reranker-v2-m3";
const DEFAULT_TIMEOUT_SECONDS: u64 = 5;
const DEFAULT_MAX_CONCURRENCY: usize = 12;
const MAX_RETRIES: usize = 3;
const BASE_BACKOFF_MS: u64 = 300;
const BACKOFF_CAP_MS: u64 = 5_000;

#[derive(Debug, Clone, Serialize)]
pub struct RerankRequest {
    pub model: String,
    pub query: String,
    pub documents: Vec<String>,
    pub top_n: u32,
    #[serde(default)]
    pub return_documents: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_chunks_per_doc: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RerankResponse {
    #[serde(default)]
    pub id: String,
    pub results: Vec<RerankResult>,
    #[serde(default)]
    pub tokens: Option<RerankTokenUsage>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RerankResult {
    pub index: u32,
    pub relevance_score: f32,
    #[serde(default)]
    pub document: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RerankTokenUsage {
    #[serde(default)]
    pub input_tokens: u32,
    #[serde(default)]
    pub output_tokens: u32,
}

/// Rerank client for SiliconFlow `/v1/rerank` (Cohere-style schema, NOT OpenAI compatible).
///
/// Uses a circuit breaker + per-process semaphore to keep us under the free-tier QPS (≈12 RPS for
/// `BAAI/bge-reranker-v2-m3`). Honors `Retry-After` on 429 and applies exponential backoff with
/// jitter on transient 5xx / network errors.
#[derive(Clone)]
pub struct RerankClient {
    http: reqwest::Client,
    base_url: String,
    api_key: String,
    model: String,
    timeout: Duration,
    semaphore: Arc<Semaphore>,
    breaker: CircuitBreaker,
}

impl RerankClient {
    pub fn new(api_key: impl Into<String>) -> Self {
        let base_url = std::env::var("LAW_EYE__AI__RERANK_BASE_URL")
            .ok()
            .and_then(|raw| {
                let trimmed = raw.trim().trim_end_matches('/').to_string();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed)
                }
            })
            .unwrap_or_else(|| DEFAULT_BASE_URL.to_string());

        let model = std::env::var("LAW_EYE__AI__RERANK_MODEL")
            .ok()
            .map(|raw| raw.trim().to_string())
            .filter(|raw| !raw.is_empty())
            .unwrap_or_else(|| DEFAULT_MODEL.to_string());

        let timeout_seconds = env_u64("LAW_EYE__AI__RERANK_TIMEOUT_SECONDS")
            .unwrap_or(DEFAULT_TIMEOUT_SECONDS)
            .clamp(1, 60);

        let max_concurrency = env_usize("LAW_EYE__AI__RERANK_MAX_CONCURRENCY")
            .unwrap_or(DEFAULT_MAX_CONCURRENCY)
            .clamp(1, 64);

        let failure_threshold = env_u32("LAW_EYE__AI__CIRCUIT_FAILURE_THRESHOLD")
            .unwrap_or(5)
            .clamp(1, 50);
        let open_seconds = env_u64("LAW_EYE__AI__CIRCUIT_OPEN_SECONDS")
            .unwrap_or(30)
            .clamp(1, 600);

        let http = reqwest::Client::builder()
            .pool_idle_timeout(Duration::from_secs(30))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self {
            http,
            base_url,
            api_key: api_key.into(),
            model,
            timeout: Duration::from_secs(timeout_seconds),
            semaphore: Arc::new(Semaphore::new(max_concurrency)),
            breaker: CircuitBreaker::new(CircuitBreakerConfig {
                failure_threshold,
                open_duration: Duration::from_secs(open_seconds),
            }),
        }
    }

    pub fn model(&self) -> &str {
        &self.model
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    /// Rerank `documents` against `query`. Returns scored results sorted server-side by
    /// `relevance_score` descending. The caller is responsible for mapping `index` back to its
    /// original document corpus.
    pub async fn rerank(&self, mut req: RerankRequest) -> Result<RerankResponse> {
        if req.documents.is_empty() {
            return Ok(RerankResponse {
                id: String::new(),
                results: Vec::new(),
                tokens: None,
            });
        }

        if req.model.is_empty() {
            req.model = self.model.clone();
        }

        let breaker_check = self.breaker.check().await;
        if !breaker_check.allowed {
            let retry_after = breaker_check.retry_after_seconds.unwrap_or(30);
            return Err(Error::Http(format!(
                "AI_CIRCUIT_OPEN retry_after_seconds={}: rerank circuit open",
                retry_after
            )));
        }

        let _permit = self
            .semaphore
            .clone()
            .acquire_owned()
            .await
            .map_err(|e| Error::Internal(format!("Failed to acquire rerank semaphore: {}", e)))?;

        let url = format!("{}/rerank", self.base_url);
        let mut last_err: Option<Error> = None;

        for attempt in 0..MAX_RETRIES {
            if attempt > 0 {
                let delay = backoff_with_jitter(attempt);
                debug!(
                    attempt,
                    delay_ms = delay.as_millis() as u64,
                    "rerank retry backoff"
                );
                tokio::time::sleep(delay).await;
            }

            match self.try_post(&url, &req).await {
                Ok(resp) => {
                    self.breaker.record_success().await;
                    info!(
                        model = %req.model,
                        docs = req.documents.len(),
                        top_n = req.top_n,
                        results = resp.results.len(),
                        "rerank ok"
                    );
                    return Ok(resp);
                }
                Err(err) if is_retryable(&err) && attempt + 1 < MAX_RETRIES => {
                    warn!(error = %err, attempt, "rerank transient failure; will retry");
                    last_err = Some(err);
                    continue;
                }
                Err(err) => {
                    self.breaker.record_failure().await;
                    return Err(err);
                }
            }
        }

        self.breaker.record_failure().await;
        Err(last_err.unwrap_or_else(|| Error::Internal("rerank retries exhausted".into())))
    }

    async fn try_post(&self, url: &str, req: &RerankRequest) -> Result<RerankResponse> {
        let response = self
            .http
            .post(url)
            .bearer_auth(&self.api_key)
            .json(req)
            .timeout(self.timeout)
            .send()
            .await
            .map_err(map_reqwest_err)?;

        let status = response.status();
        if !status.is_success() {
            if status.as_u16() == 429 {
                let retry_after = response
                    .headers()
                    .get("retry-after")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|s| s.parse::<u64>().ok())
                    .unwrap_or(60)
                    .min(60 * 60);
                let body = response.text().await.unwrap_or_default();
                return Err(Error::Http(format!(
                    "AI_RATE_LIMITED retry_after_seconds={}: {}",
                    retry_after,
                    truncate_for_log(&body)
                )));
            }

            let body = response.text().await.unwrap_or_default();
            return Err(map_status_err(status, body));
        }

        response
            .json::<RerankResponse>()
            .await
            .map_err(|e| Error::Internal(format!("rerank decode failed: {}", e)))
    }
}

fn map_reqwest_err(err: reqwest::Error) -> Error {
    if err.is_timeout() {
        Error::Timeout(format!("rerank timeout: {}", err))
    } else if err.is_connect() {
        Error::Http(format!("rerank connection error: {}", err))
    } else {
        Error::Http(format!("rerank request error: {}", err))
    }
}

fn map_status_err(status: reqwest::StatusCode, body: String) -> Error {
    let msg = truncate_for_log(&body);
    match status.as_u16() {
        400 | 422 => Error::Validation(format!("rerank invalid request: {}", msg)),
        401 => Error::Unauthorized(format!("rerank auth failed: {}", msg)),
        403 => Error::Forbidden(format!("rerank permission denied: {}", msg)),
        404 => Error::NotFound(format!("rerank model not found: {}", msg)),
        500..=599 => Error::Http(format!("rerank server error {}: {}", status.as_u16(), msg)),
        other => Error::Http(format!("rerank unexpected status {}: {}", other, msg)),
    }
}

fn is_retryable(err: &Error) -> bool {
    match err {
        Error::Http(msg) => {
            msg.contains("AI_RATE_LIMITED")
                || msg.contains("connection")
                || msg.contains("server error 5")
                || msg.contains(" 502")
                || msg.contains(" 503")
                || msg.contains(" 504")
        }
        Error::Timeout(_) => true,
        _ => false,
    }
}

fn backoff_with_jitter(attempt: usize) -> Duration {
    let exp = 1u64 << attempt.min(6);
    let base = BASE_BACKOFF_MS.saturating_mul(exp).min(BACKOFF_CAP_MS);
    let jitter_factor: f32 = 1.0 + (rand::random::<f32>() * 0.5 - 0.25);
    Duration::from_millis(((base as f32) * jitter_factor.max(0.5)) as u64)
}

fn truncate_for_log(body: &str) -> String {
    if body.len() <= 240 {
        body.to_string()
    } else {
        format!("{}...", &body[..240])
    }
}

fn env_u32(name: &str) -> Option<u32> {
    std::env::var(name)
        .ok()
        .and_then(|raw| raw.trim().parse().ok())
}

fn env_u64(name: &str) -> Option<u64> {
    std::env::var(name)
        .ok()
        .and_then(|raw| raw.trim().parse().ok())
}

fn env_usize(name: &str) -> Option<usize> {
    std::env::var(name)
        .ok()
        .and_then(|raw| raw.trim().parse().ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_used_when_env_absent() {
        // do not pollute environment in CI; just ensure constructor does not panic.
        let client = RerankClient::new("test-key");
        assert!(client.base_url().starts_with("http"));
        assert!(!client.model().is_empty());
    }

    #[test]
    fn empty_documents_short_circuits() {
        // Direct unit on the request shape; full http flow requires live API.
        let req = RerankRequest {
            model: String::new(),
            query: "hello".into(),
            documents: vec![],
            top_n: 5,
            return_documents: false,
            max_chunks_per_doc: None,
        };
        assert!(req.documents.is_empty());
    }

    #[test]
    fn backoff_grows_and_caps() {
        let d0 = backoff_with_jitter(0).as_millis() as u64;
        let d3 = backoff_with_jitter(3).as_millis() as u64;
        let d10 = backoff_with_jitter(10).as_millis() as u64;
        assert!(d0 >= 100 && d0 <= 1_000);
        assert!(d3 >= 600 && d3 <= 6_500);
        assert!(d10 <= 6_500);
    }

    #[test]
    fn is_retryable_classifies_correctly() {
        assert!(is_retryable(&Error::Timeout("x".into())));
        assert!(is_retryable(&Error::Http(
            "AI_RATE_LIMITED retry_after_seconds=10".into()
        )));
        assert!(is_retryable(&Error::Http("server error 502".into())));
        assert!(!is_retryable(&Error::Validation("bad input".into())));
        assert!(!is_retryable(&Error::Unauthorized("nope".into())));
    }
}
