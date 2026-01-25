use axum::Router;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

use crate::openapi::ApiDoc;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().merge(
        SwaggerUi::new("/api-docs/swagger-ui").url("/api-docs/openapi.json", ApiDoc::openapi()),
    )
}
