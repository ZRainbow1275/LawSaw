use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::hash::Hash;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiError, ApiJson, ApiQuery, ApiResult, AppError};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(search))
        .route("/semantic", post(semantic_search))
        .route("/ask", post(ask_question))
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SearchQuery {
    pub q: String,
    #[serde(default = "default_limit")]
    pub limit: i64,
    #[serde(default)]
    pub offset: i64,
    /// Cursor for keyset pagination (base64url-encoded JSON).
    pub cursor: Option<String>,
}

fn default_limit() -> i64 {
    10
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct SearchResultItem {
    pub article_id: Uuid,
    pub title: String,
    pub excerpt: String,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct SearchResponse {
    pub results: Vec<SearchResultItem>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SemanticSearchRequest {
    pub query: String,
    #[serde(default = "default_limit")]
    pub limit: i64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct SemanticSearchResult {
    pub chunk_id: Uuid,
    pub article_id: Uuid,
    pub content: String,
    pub similarity: f64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct SemanticSearchResponse {
    pub results: Vec<SemanticSearchResult>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct AskRequest {
    pub question: String,
    #[serde(default = "default_top_k")]
    pub top_k: i64,
}

fn default_top_k() -> i64 {
    5
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AnswerSource {
    pub article_id: Uuid,
    pub title: String,
    pub excerpt: String,
    pub relevance: f64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AskResponse {
    pub answer: String,
    pub sources: Vec<AnswerSource>,
    pub confidence: f32,
}

const KEYWORD_SEARCH_MAX_LIMIT: i64 = 50;
const SEMANTIC_SEARCH_MAX_LIMIT: i64 = 20;
const ASK_MAX_TOP_K: i64 = 20;
const KEYWORD_QUERY_MAX_CHARS: usize = 1024;
const SEMANTIC_QUERY_MAX_CHARS: usize = 2048;
const ASK_QUESTION_MAX_CHARS: usize = 4096;
const KEYWORD_SEARCH_CACHE_CAPACITY: usize = 512;
const SEMANTIC_SEARCH_CACHE_CAPACITY: usize = 256;
const KEYWORD_SEARCH_CACHE_TTL: Duration = Duration::from_secs(30);
const SEMANTIC_SEARCH_CACHE_TTL: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct KeywordSearchCacheKey {
    tenant_id: Uuid,
    query: String,
    limit: i64,
    offset: i64,
    cursor: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct SemanticSearchCacheKey {
    tenant_id: Uuid,
    query: String,
    limit: i64,
}

#[derive(Debug)]
struct CacheEntry<V> {
    value: V,
    expires_at: Instant,
    last_accessed: Instant,
}

#[derive(Debug)]
struct TtlLruCache<K, V> {
    entries: HashMap<K, CacheEntry<V>>,
    capacity: usize,
    ttl: Duration,
}

impl<K, V> TtlLruCache<K, V>
where
    K: Eq + Hash + Clone,
    V: Clone,
{
    fn new(capacity: usize, ttl: Duration) -> Self {
        Self {
            entries: HashMap::with_capacity(capacity),
            capacity,
            ttl,
        }
    }

    fn get(&mut self, key: &K) -> Option<V> {
        let now = Instant::now();

        let mut remove_expired = false;
        let result = if let Some(entry) = self.entries.get_mut(key) {
            if entry.expires_at > now {
                entry.last_accessed = now;
                Some(entry.value.clone())
            } else {
                remove_expired = true;
                None
            }
        } else {
            None
        };

        if remove_expired {
            self.entries.remove(key);
        }

        result
    }

    fn insert(&mut self, key: K, value: V) {
        if self.capacity == 0 {
            return;
        }

        let now = Instant::now();
        self.prune_expired(now);

        if !self.entries.contains_key(&key) && self.entries.len() >= self.capacity {
            self.evict_least_recently_used();
        }

        self.entries.insert(
            key,
            CacheEntry {
                value,
                expires_at: now + self.ttl,
                last_accessed: now,
            },
        );
    }

    fn prune_expired(&mut self, now: Instant) {
        self.entries.retain(|_, entry| entry.expires_at > now);
    }

    fn evict_least_recently_used(&mut self) {
        if let Some(key) = self
            .entries
            .iter()
            .min_by_key(|(_, entry)| entry.last_accessed)
            .map(|(key, _)| key.clone())
        {
            self.entries.remove(&key);
        }
    }
}

static KEYWORD_SEARCH_CACHE: Lazy<Mutex<TtlLruCache<KeywordSearchCacheKey, SearchResponse>>> =
    Lazy::new(|| {
        Mutex::new(TtlLruCache::new(
            KEYWORD_SEARCH_CACHE_CAPACITY,
            KEYWORD_SEARCH_CACHE_TTL,
        ))
    });

static SEMANTIC_SEARCH_CACHE: Lazy<
    Mutex<TtlLruCache<SemanticSearchCacheKey, SemanticSearchResponse>>,
> = Lazy::new(|| {
    Mutex::new(TtlLruCache::new(
        SEMANTIC_SEARCH_CACHE_CAPACITY,
        SEMANTIC_SEARCH_CACHE_TTL,
    ))
});

fn build_keyword_search_cache_key(
    tenant_id: Uuid,
    query: &str,
    limit: i64,
    offset: i64,
    cursor: Option<&str>,
) -> KeywordSearchCacheKey {
    KeywordSearchCacheKey {
        tenant_id,
        query: query.to_owned(),
        limit,
        offset: if cursor.is_some() { 0 } else { offset },
        cursor: cursor.map(str::to_owned),
    }
}

fn build_semantic_search_cache_key(
    tenant_id: Uuid,
    query: &str,
    limit: i64,
) -> SemanticSearchCacheKey {
    SemanticSearchCacheKey {
        tenant_id,
        query: query.to_owned(),
        limit,
    }
}

fn keyword_search_cache_get(key: &KeywordSearchCacheKey) -> Option<SearchResponse> {
    KEYWORD_SEARCH_CACHE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .get(key)
}

fn keyword_search_cache_insert(key: KeywordSearchCacheKey, response: SearchResponse) {
    KEYWORD_SEARCH_CACHE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .insert(key, response);
}

fn semantic_search_cache_get(key: &SemanticSearchCacheKey) -> Option<SemanticSearchResponse> {
    SEMANTIC_SEARCH_CACHE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .get(key)
}

fn semantic_search_cache_insert(key: SemanticSearchCacheKey, response: SemanticSearchResponse) {
    SEMANTIC_SEARCH_CACHE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .insert(key, response);
}

/// Full-text search
#[utoipa::path(
    get,
    path = "/api/v1/search",
    params(
        ("q" = String, Query, description = "Search query"),
        ("limit" = Option<i64>, Query, description = "Max results (default 10, max 50)"),
        ("offset" = Option<i64>, Query, description = "Offset (default 0)"),
        ("cursor" = Option<String>, Query, description = "Cursor for keyset pagination (base64url JSON). When set, offset is ignored.")
    ),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Search results", body = SearchResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn search(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiQuery(query): ApiQuery<SearchQuery>,
) -> ApiResult<Json<SearchResponse>> {
    #[derive(Debug, Clone, Serialize, Deserialize)]
    struct SearchCursor {
        score: f64,
        created_at: DateTime<Utc>,
        id: Uuid,
    }

    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let can_read = state
        .user_service
        .has_permission(user.tenant_id, user.id, "articles:read")
        .await
        .map_err(AppError::from)?;
    if !can_read {
        return Err(AppError::forbidden("Permission denied"));
    }

    let q = query.q.trim();
    if q.is_empty() {
        return Err(AppError::validation("Query cannot be empty"));
    }
    if q.len() > KEYWORD_QUERY_MAX_CHARS {
        return Err(AppError::validation(format!(
            "Query too long (max {KEYWORD_QUERY_MAX_CHARS} chars)"
        )));
    }

    let limit = query.limit.clamp(1, KEYWORD_SEARCH_MAX_LIMIT);
    let offset = query.offset;
    if offset < 0 {
        return Err(AppError::validation("offset must be >= 0"));
    }

    let cursor = query
        .cursor
        .as_deref()
        .map(crate::pagination::decode_cursor::<SearchCursor>)
        .transpose()?;

    let cache_key =
        build_keyword_search_cache_key(user.tenant_id, q, limit, offset, query.cursor.as_deref());

    if let Some(cached_response) = keyword_search_cache_get(&cache_key) {
        return Ok(Json(cached_response));
    }

    let mut next_cursor: Option<String> = None;

    let (mut hits, total) = if let Some(cursor) = cursor {
        let fetch_limit = limit.saturating_add(1);
        let (items, total) = state
            .article_service
            .search_ranked_cursor(
                user.tenant_id,
                q,
                fetch_limit,
                cursor.score,
                cursor.created_at,
                cursor.id,
            )
            .await
            .map_err(AppError::from)?;

        (items, total)
    } else {
        state
            .article_service
            .search_ranked(user.tenant_id, q, limit, offset)
            .await
            .map_err(AppError::from)?
    };

    if query.cursor.is_some() && hits.len() as i64 > limit {
        hits.truncate(limit as usize);
        if let Some(last) = hits.last() {
            next_cursor = Some(crate::pagination::encode_cursor(&SearchCursor {
                score: last.score,
                created_at: last.created_at,
                id: last.article_id,
            })?);
        }
    }

    let results: Vec<SearchResultItem> = hits
        .into_iter()
        .map(|h| SearchResultItem {
            article_id: h.article_id,
            title: h.title,
            excerpt: h.excerpt,
            score: h.score,
        })
        .collect();

    let response = SearchResponse {
        results,
        total,
        limit,
        offset: if query.cursor.is_some() { 0 } else { offset },
        next_cursor,
    };

    keyword_search_cache_insert(cache_key, response.clone());

    Ok(Json(response))
}

/// Semantic vector search
#[utoipa::path(
    post,
    path = "/api/v1/search/semantic",
    request_body = SemanticSearchRequest,
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Semantic search results", body = SemanticSearchResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 503, description = "AI service unavailable", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn semantic_search(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiJson(req): ApiJson<SemanticSearchRequest>,
) -> ApiResult<Json<SemanticSearchResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let can_read = state
        .user_service
        .has_permission(user.tenant_id, user.id, "articles:read")
        .await
        .map_err(AppError::from)?;
    if !can_read {
        return Err(AppError::forbidden("Permission denied"));
    }

    if state.ai_service.is_none() {
        return Err(AppError::service_unavailable("AI service not available"));
    }

    let query = req.query.trim();
    if query.is_empty() {
        return Err(AppError::validation("Query cannot be empty"));
    }
    if query.len() > SEMANTIC_QUERY_MAX_CHARS {
        return Err(AppError::validation(format!(
            "Query too long (max {SEMANTIC_QUERY_MAX_CHARS} chars)"
        )));
    }

    let limit = req.limit.clamp(1, SEMANTIC_SEARCH_MAX_LIMIT);

    let cache_key = build_semantic_search_cache_key(user.tenant_id, query, limit);
    if let Some(cached_response) = semantic_search_cache_get(&cache_key) {
        return Ok(Json(cached_response));
    }

    let results = state
        .rag_service
        .search(user.tenant_id, query, limit)
        .await
        .map_err(AppError::from)?;

    let response = SemanticSearchResponse {
        results: results
            .into_iter()
            .map(|r| SemanticSearchResult {
                chunk_id: r.chunk_id,
                article_id: r.article_id,
                content: r.content,
                similarity: r.similarity,
            })
            .collect(),
    };

    semantic_search_cache_insert(cache_key, response.clone());

    Ok(Json(response))
}

/// RAG Q&A endpoint
#[utoipa::path(
    post,
    path = "/api/v1/search/ask",
    request_body = AskRequest,
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "AI-generated answer", body = AskResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 503, description = "AI service unavailable", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn ask_question(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiJson(req): ApiJson<AskRequest>,
) -> ApiResult<Json<AskResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let can_read = state
        .user_service
        .has_permission(user.tenant_id, user.id, "articles:read")
        .await
        .map_err(AppError::from)?;
    if !can_read {
        return Err(AppError::forbidden("Permission denied"));
    }

    if state.ai_service.is_none() {
        return Err(AppError::service_unavailable("AI service not available"));
    }

    let question = req.question.trim();
    if question.is_empty() {
        return Err(AppError::validation("Question cannot be empty"));
    }
    if question.len() > ASK_QUESTION_MAX_CHARS {
        return Err(AppError::validation(format!(
            "Question too long (max {ASK_QUESTION_MAX_CHARS} chars)"
        )));
    }

    let top_k = req.top_k.clamp(1, ASK_MAX_TOP_K);

    let answer = state
        .rag_service
        .answer(user.tenant_id, question, top_k)
        .await
        .map_err(AppError::from)?;

    Ok(Json(AskResponse {
        answer: answer.answer,
        sources: answer
            .sources
            .into_iter()
            .map(|s| AnswerSource {
                article_id: s.article_id,
                title: s.title,
                excerpt: s.excerpt,
                relevance: s.relevance,
            })
            .collect(),
        confidence: answer.confidence,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    #[test]
    fn keyword_search_cache_key_includes_tenant() {
        let query = "jurisdiction";
        let key_a =
            build_keyword_search_cache_key(Uuid::new_v4(), query, 10, 0, Some("cursor-token"));
        let key_b =
            build_keyword_search_cache_key(Uuid::new_v4(), query, 10, 999, Some("cursor-token"));

        assert_ne!(key_a, key_b);
    }

    #[test]
    fn ttl_cache_hits_then_expires() {
        let mut cache = TtlLruCache::new(2, Duration::from_millis(100));
        let key = "search-key".to_string();

        cache.insert(key.clone(), 42_i32);
        assert_eq!(cache.get(&key), Some(42));

        thread::sleep(Duration::from_millis(150));
        assert_eq!(cache.get(&key), None);
    }

    #[test]
    fn cache_respects_capacity_limit() {
        let mut cache = TtlLruCache::new(1, Duration::from_secs(1));
        let key_a = "a".to_string();
        let key_b = "b".to_string();

        cache.insert(key_a.clone(), 1_i32);
        cache.insert(key_b.clone(), 2_i32);

        assert_eq!(cache.get(&key_a), None);
        assert_eq!(cache.get(&key_b), Some(2));
    }
}
