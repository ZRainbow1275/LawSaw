use law_eye_ai::{AiService, LlmGateway};
use law_eye_common::config::ConfigRuntime;
use law_eye_common::vault::SensitiveStringCipher;
use law_eye_common::CacheService;
use law_eye_core::{
    ApiKeyService, ArticlePinService, ArticleReadService, ArticleService, AuditService,
    AuthzService, BannerService, CategoryService, ChannelService, EmailVerificationService,
    FeedbackService, KnowledgeService, MfaTotpService, OAuthIdentityService, ObjectService,
    PasswordResetService, RagService, ReportService, ReportSubscriptionService,
    ReportTemplateService, SourceService, StatisticsService, TenantService, UserService,
    WebPushSubscriptionService, WebhookService,
};
use law_eye_queue::TaskQueue;
use metrics_exporter_prometheus::PrometheusHandle;
use sqlx::PgPool;
use std::sync::Arc;

pub struct AppBootstrapDeps {
    pub pool: PgPool,
    pub task_queue: TaskQueue,
    pub cache_service: Option<CacheService>,
    pub ai_service: Option<AiService>,
    pub llm_gateway: Option<LlmGateway>,
    pub object_service: Option<ObjectService>,
    pub metrics_handle: PrometheusHandle,
    pub metrics_token: Option<String>,
    pub allow_internal_source_urls: bool,
    pub allow_internal_webhook_urls: bool,
    pub auth_oauth_state_ttl_seconds: u64,
    pub auth_oauth_enabled_providers: Vec<String>,
    pub auth_mfa_totp_issuer: String,
    pub auth_mfa_login_challenge_ttl_seconds: u64,
    pub feedback_cipher: Arc<dyn SensitiveStringCipher>,
    #[allow(dead_code)]
    pub config_runtime: Option<ConfigRuntime>,
}

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub article_service: Arc<ArticleService>,
    pub source_service: Arc<SourceService>,
    pub category_service: Arc<CategoryService>,
    pub feedback_service: Arc<FeedbackService>,
    pub user_service: Arc<UserService>,
    pub password_reset_service: Arc<PasswordResetService>,
    pub email_verification_service: Arc<EmailVerificationService>,
    pub tenant_service: Arc<TenantService>,
    pub audit_service: Arc<AuditService>,
    pub oauth_identity_service: Arc<OAuthIdentityService>,
    pub mfa_totp_service: Arc<MfaTotpService>,
    pub object_service: Option<Arc<ObjectService>>,
    pub task_queue: Arc<TaskQueue>,
    pub cache_service: Option<Arc<CacheService>>,
    pub ai_service: Option<Arc<AiService>>,
    pub rag_service: Arc<RagService>,
    pub knowledge_service: Arc<KnowledgeService>,
    pub apikey_service: Arc<ApiKeyService>,
    pub webhook_service: Arc<WebhookService>,
    pub web_push_subscription_service: Arc<WebPushSubscriptionService>,
    pub statistics_service: Arc<StatisticsService>,
    pub report_service: Arc<ReportService>,
    pub report_template_service: Arc<ReportTemplateService>,
    // B.5: orphan-route services wired in for SPEC-01/02 user/admin panels.
    pub channel_service: Arc<ChannelService>,
    pub article_pin_service: Arc<ArticlePinService>,
    pub article_read_service: Arc<ArticleReadService>,
    pub report_subscription_service: Arc<ReportSubscriptionService>,
    // B.6a: banners + authz services (migrations 066/067 add the underlying tables).
    pub banner_service: Arc<BannerService>,
    pub authz_service: Arc<AuthzService>,
    pub metrics_handle: PrometheusHandle,
    pub metrics_token: Option<String>,
    pub allow_internal_source_urls: bool,
    pub allow_internal_webhook_urls: bool,
    pub auth_oauth_state_ttl_seconds: u64,
    pub auth_oauth_enabled_providers: Vec<String>,
    pub auth_mfa_totp_issuer: String,
    pub auth_mfa_login_challenge_ttl_seconds: u64,
    pub config_runtime: Option<ConfigRuntime>,
}

impl AppState {
    pub fn from_deps(deps: AppBootstrapDeps) -> Self {
        let AppBootstrapDeps {
            pool,
            task_queue,
            cache_service,
            ai_service,
            llm_gateway,
            object_service,
            metrics_handle,
            metrics_token,
            allow_internal_source_urls,
            allow_internal_webhook_urls,
            auth_oauth_state_ttl_seconds,
            auth_oauth_enabled_providers,
            auth_mfa_totp_issuer,
            auth_mfa_login_challenge_ttl_seconds,
            feedback_cipher,
            config_runtime,
        } = deps;

        let gateway = Arc::new(llm_gateway.unwrap_or_else(|| {
            LlmGateway::new(
                std::env::var("OPENAI_API_KEY").unwrap_or_default().as_str(),
                std::env::var("OPENAI_BASE_URL").ok().as_deref(),
                None,
            )
        }));
        let mfa_cipher = feedback_cipher.clone();

        Self {
            pool: pool.clone(),
            article_service: Arc::new(ArticleService::new(pool.clone())),
            source_service: Arc::new(SourceService::new(pool.clone())),
            category_service: Arc::new(CategoryService::new(pool.clone())),
            feedback_service: Arc::new(FeedbackService::new(pool.clone(), feedback_cipher)),
            user_service: Arc::new(UserService::new(pool.clone())),
            password_reset_service: Arc::new(PasswordResetService::new(pool.clone())),
            email_verification_service: Arc::new(EmailVerificationService::new(pool.clone())),
            tenant_service: Arc::new(TenantService::new(pool.clone())),
            audit_service: Arc::new(AuditService::new(pool.clone())),
            oauth_identity_service: Arc::new(OAuthIdentityService::new(pool.clone())),
            mfa_totp_service: Arc::new(MfaTotpService::new(pool.clone(), mfa_cipher)),
            object_service: object_service.map(Arc::new),
            task_queue: Arc::new(task_queue),
            cache_service: cache_service.map(Arc::new),
            ai_service: ai_service.map(Arc::new),
            rag_service: Arc::new(RagService::new(pool.clone(), gateway.clone())),
            knowledge_service: Arc::new(KnowledgeService::new(pool.clone(), gateway)),
            apikey_service: Arc::new(ApiKeyService::new(pool.clone())),
            webhook_service: Arc::new(WebhookService::new(pool.clone())),
            web_push_subscription_service: Arc::new(WebPushSubscriptionService::new(pool.clone())),
            statistics_service: Arc::new(StatisticsService::new(pool.clone())),
            report_service: Arc::new(ReportService::new(pool.clone())),
            report_template_service: Arc::new(ReportTemplateService::new(pool.clone())),
            channel_service: Arc::new(ChannelService::new(pool.clone())),
            article_pin_service: Arc::new(ArticlePinService::new(pool.clone())),
            article_read_service: Arc::new(ArticleReadService::new(pool.clone())),
            report_subscription_service: Arc::new(ReportSubscriptionService::new(pool.clone())),
            banner_service: Arc::new(BannerService::new(pool.clone())),
            authz_service: Arc::new(AuthzService::new(pool.clone())),
            metrics_handle,
            metrics_token,
            allow_internal_source_urls,
            allow_internal_webhook_urls,
            auth_oauth_state_ttl_seconds,
            auth_oauth_enabled_providers,
            auth_mfa_totp_issuer,
            auth_mfa_login_challenge_ttl_seconds,
            config_runtime,
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn new(
        pool: PgPool,
        task_queue: TaskQueue,
        cache_service: Option<CacheService>,
        ai_service: Option<AiService>,
        llm_gateway: Option<LlmGateway>,
        object_service: Option<ObjectService>,
        metrics_handle: PrometheusHandle,
        metrics_token: Option<String>,
        allow_internal_source_urls: bool,
        allow_internal_webhook_urls: bool,
        auth_oauth_state_ttl_seconds: u64,
        auth_oauth_enabled_providers: Vec<String>,
        auth_mfa_totp_issuer: String,
        auth_mfa_login_challenge_ttl_seconds: u64,
        feedback_cipher: Arc<dyn SensitiveStringCipher>,
        config_runtime: Option<ConfigRuntime>,
    ) -> Self {
        Self::from_deps(AppBootstrapDeps {
            pool,
            task_queue,
            cache_service,
            ai_service,
            llm_gateway,
            object_service,
            metrics_handle,
            metrics_token,
            allow_internal_source_urls,
            allow_internal_webhook_urls,
            auth_oauth_state_ttl_seconds,
            auth_oauth_enabled_providers,
            auth_mfa_totp_issuer,
            auth_mfa_login_challenge_ttl_seconds,
            feedback_cipher,
            config_runtime,
        })
    }
}
