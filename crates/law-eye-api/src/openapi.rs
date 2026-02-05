use utoipa::{Modify, OpenApi};

use utoipa::openapi;
use utoipa::openapi::security::{ApiKey, ApiKeyValue, SecurityScheme};

pub struct SecurityAddon;

impl Modify for SecurityAddon {
    fn modify(&self, openapi: &mut openapi::OpenApi) {
        let components = openapi
            .components
            .get_or_insert_with(openapi::Components::new);
        components.add_security_scheme(
            "session",
            SecurityScheme::ApiKey(ApiKey::Cookie(ApiKeyValue::with_description(
                "id",
                "tower-sessions session id cookie",
            ))),
        );
    }
}

#[derive(OpenApi)]
#[openapi(
    modifiers(&SecurityAddon),
    info(
        title = "LawSaw API",
        version = "0.1.0",
        description = "LawSaw / Law-Eye HTTP API (Axum). Base path: /api/v1. Auth: session cookie 'id'."
    ),
    paths(
        crate::routes::health::health_check,
        crate::routes::auth::register,
        crate::routes::auth::login,
        crate::routes::auth::request_email_verification,
        crate::routes::auth::confirm_email_verification,
        crate::routes::auth::request_password_reset,
        crate::routes::auth::confirm_password_reset,
        crate::routes::auth::logout,
        crate::routes::auth::get_current_user,
        crate::routes::articles::query::list_articles,
        crate::routes::articles::query::get_stats,
        crate::routes::articles::query::get_analytics_summary,
        crate::routes::articles::query::get_category_counts,
        crate::routes::articles::query::get_trends,
        crate::routes::articles::query::list_recent,
        crate::routes::articles::query::get_article,
        crate::routes::articles::command::update_article,
        crate::routes::articles::command::delete_article,
        crate::routes::articles::command::publish_article,
        crate::routes::articles::command::archive_article,
        crate::routes::articles::command::batch_update_status,
        crate::routes::categories::list_categories,
        crate::routes::sources::list_sources,
        crate::routes::sources::get_source_stats,
        crate::routes::sources::get_source,
        crate::routes::sources::create_source,
        crate::routes::sources::delete_source,
        crate::routes::sources::restore_source,
        crate::routes::sources::trigger_fetch,
        crate::routes::search::search,
        crate::routes::search::semantic_search,
        crate::routes::search::ask_question,
        crate::routes::ai::process_article,
        crate::routes::ai::classify_article,
        crate::routes::ai::summarize_article,
        crate::routes::ai::assess_risk,
        crate::routes::ai::get_ai_availability,
        crate::routes::ai::get_ai_status,
        crate::routes::push::get_vapid_public_key,
        crate::routes::push::subscribe,
        crate::routes::push::unsubscribe,
        crate::routes::push::test_push,
        crate::routes::users::list_users,
        crate::routes::users::get_user,
        crate::routes::users::update_user,
        crate::routes::users::upload_user_avatar,
        crate::routes::users::update_user_roles,
        crate::routes::objects::get_object,
        crate::routes::apikeys::list_keys,
        crate::routes::apikeys::create_key,
        crate::routes::apikeys::revoke_key,
        crate::routes::apikeys::delete_key,
        crate::routes::feedbacks::list_feedbacks,
        crate::routes::feedbacks::list_my_feedbacks,
        crate::routes::feedbacks::create_feedback,
        crate::routes::feedbacks::get_feedback,
        crate::routes::feedbacks::update_feedback,
        crate::routes::knowledge::list_top_entities,
        crate::routes::knowledge::search_entities,
        crate::routes::knowledge::get_entity,
        crate::routes::knowledge::get_related_entities,
        crate::routes::knowledge::get_entity_articles,
        crate::routes::knowledge::backfill
    ),
    tags(
        (name = "health", description = "Health"),
        (name = "auth", description = "Authentication"),
        (name = "articles", description = "Articles"),
        (name = "categories", description = "Categories"),
        (name = "feedbacks", description = "Feedbacks"),
        (name = "sources", description = "Sources"),
        (name = "search", description = "Search"),
        (name = "ai", description = "AI"),
        (name = "push", description = "Web Push notifications"),
        (name = "users", description = "Users"),
        (name = "objects", description = "Object storage"),
        (name = "apikeys", description = "API keys"),
        (name = "knowledge", description = "Knowledge graph")
    )
)]
pub struct ApiDoc;

#[cfg(test)]
mod tests {
    use super::*;
    use utoipa::OpenApi;

    fn ptr_escape(segment: &str) -> String {
        segment.replace('~', "~0").replace('/', "~1")
    }

    #[test]
    fn openapi_contract_is_stable_and_complete() {
        let doc = ApiDoc::openapi();
        let value = serde_json::to_value(&doc).expect("OpenAPI must be JSON-serializable");

        let session_scheme = value.pointer("/components/securitySchemes/session");
        assert!(
            session_scheme.is_some(),
            "OpenAPI must declare components.securitySchemes.session"
        );

        for required_path in ["/api/v1/auth/login", "/api/v1/articles", "/api/v1/search"] {
            let pointer = format!("/paths/{}", ptr_escape(required_path));
            assert!(
                value.pointer(&pointer).is_some(),
                "OpenAPI missing required path: {required_path}"
            );
        }

        let articles_get_security = value.pointer("/paths/~1api~1v1~1articles/get/security");
        assert!(
            articles_get_security.is_some(),
            "OpenAPI should declare security for at least GET /api/v1/articles"
        );
    }
}
