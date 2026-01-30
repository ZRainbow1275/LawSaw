use law_eye_ai::{AiService, LlmGateway};
use law_eye_common::vault::SensitiveStringCipher;
use law_eye_core::{
    ApiKeyService, ArticleService, AuditService, CategoryService, FeedbackService,
    KnowledgeService, ObjectService, RagService, SourceService, TenantService, UserService,
};
use law_eye_queue::TaskQueue;
use metrics_exporter_prometheus::PrometheusHandle;
use sqlx::PgPool;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    #[allow(dead_code)]
    pub pool: PgPool,
    pub article_service: Arc<ArticleService>,
    pub source_service: Arc<SourceService>,
    pub category_service: Arc<CategoryService>,
    pub feedback_service: Arc<FeedbackService>,
    pub user_service: Arc<UserService>,
    pub tenant_service: Arc<TenantService>,
    pub audit_service: Arc<AuditService>,
    pub object_service: Option<Arc<ObjectService>>,
    pub task_queue: Arc<TaskQueue>,
    #[allow(dead_code)] // Reserved for future synchronous AI operations
    pub ai_service: Option<Arc<AiService>>,
    pub rag_service: Arc<RagService>,
    #[allow(dead_code)] // Reserved for future knowledge base features
    pub knowledge_service: Arc<KnowledgeService>,
    pub apikey_service: Arc<ApiKeyService>,
    pub metrics_handle: PrometheusHandle,
    pub metrics_token: Option<String>,
}

impl AppState {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        pool: PgPool,
        task_queue: TaskQueue,
        ai_service: Option<AiService>,
        llm_gateway: Option<LlmGateway>,
        object_service: Option<ObjectService>,
        metrics_handle: PrometheusHandle,
        metrics_token: Option<String>,
        feedback_cipher: Arc<dyn SensitiveStringCipher>,
    ) -> Self {
        let gateway = Arc::new(llm_gateway.unwrap_or_else(|| {
            LlmGateway::new(
                std::env::var("OPENAI_API_KEY").unwrap_or_default().as_str(),
                std::env::var("OPENAI_BASE_URL").ok().as_deref(),
                None,
            )
        }));

        Self {
            pool: pool.clone(),
            article_service: Arc::new(ArticleService::new(pool.clone())),
            source_service: Arc::new(SourceService::new(pool.clone())),
            category_service: Arc::new(CategoryService::new(pool.clone())),
            feedback_service: Arc::new(FeedbackService::new(pool.clone(), feedback_cipher)),
            user_service: Arc::new(UserService::new(pool.clone())),
            tenant_service: Arc::new(TenantService::new(pool.clone())),
            audit_service: Arc::new(AuditService::new(pool.clone())),
            object_service: object_service.map(Arc::new),
            task_queue: Arc::new(task_queue),
            ai_service: ai_service.map(Arc::new),
            rag_service: Arc::new(RagService::new(pool.clone(), gateway.clone())),
            knowledge_service: Arc::new(KnowledgeService::new(pool.clone(), gateway)),
            apikey_service: Arc::new(ApiKeyService::new(pool)),
            metrics_handle,
            metrics_token,
        }
    }
}
