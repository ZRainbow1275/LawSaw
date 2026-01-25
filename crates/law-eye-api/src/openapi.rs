use utoipa::{Modify, OpenApi};

use utoipa::openapi;
use utoipa::openapi::security::{ApiKey, ApiKeyValue, SecurityScheme};

pub struct SecurityAddon;

impl Modify for SecurityAddon {
    fn modify(&self, openapi: &mut openapi::OpenApi) {
        let components = openapi.components.get_or_insert_with(openapi::Components::new);
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
    paths(
        crate::routes::health::health_check,
        crate::routes::auth::register,
        crate::routes::auth::login,
        crate::routes::auth::logout,
        crate::routes::auth::get_current_user,
        crate::routes::articles::list_articles,
        crate::routes::articles::get_stats,
        crate::routes::articles::list_recent,
        crate::routes::articles::get_article,
        crate::routes::articles::delete_article,
        crate::routes::articles::publish_article,
        crate::routes::articles::archive_article,
        crate::routes::articles::batch_update_status,
        crate::routes::categories::list_categories,
        crate::routes::sources::list_sources,
        crate::routes::sources::get_source,
        crate::routes::sources::create_source,
        crate::routes::sources::trigger_fetch,
        crate::routes::search::search,
        crate::routes::search::semantic_search,
        crate::routes::search::ask_question,
        crate::routes::ai::process_article,
        crate::routes::ai::classify_article,
        crate::routes::ai::summarize_article,
        crate::routes::ai::assess_risk,
        crate::routes::ai::get_ai_status,
        crate::routes::users::list_users,
        crate::routes::users::get_user,
        crate::routes::users::update_user,
        crate::routes::users::update_user_roles,
        crate::routes::apikeys::list_keys,
        crate::routes::apikeys::create_key,
        crate::routes::apikeys::revoke_key,
        crate::routes::apikeys::delete_key
    ),
    tags(
        (name = "health", description = "Health"),
        (name = "auth", description = "Authentication"),
        (name = "articles", description = "Articles"),
        (name = "categories", description = "Categories"),
        (name = "sources", description = "Sources"),
        (name = "search", description = "Search"),
        (name = "ai", description = "AI"),
        (name = "users", description = "Users"),
        (name = "apikeys", description = "API keys")
    )
)]
pub struct ApiDoc;
