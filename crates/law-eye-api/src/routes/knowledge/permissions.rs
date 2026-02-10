use uuid::Uuid;

use crate::state::AppState;
use crate::{ApiResult, AppError};

pub(super) async fn require_articles_read(
    state: &AppState,
    tenant_id: Uuid,
    user_id: Uuid,
) -> ApiResult<()> {
    let can_read = state
        .user_service
        .has_permission(tenant_id, user_id, "articles:read")
        .await
        .map_err(AppError::from)?;
    if !can_read {
        return Err(AppError::forbidden("Permission denied"));
    }
    Ok(())
}
