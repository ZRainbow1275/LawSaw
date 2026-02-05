use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use serde::{de::DeserializeOwned, Serialize};

use crate::{ApiResult, AppError};

pub fn encode_cursor<T: Serialize>(cursor: &T) -> ApiResult<String> {
    let bytes =
        serde_json::to_vec(cursor).map_err(|_| AppError::internal("Failed to encode cursor"))?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

pub fn decode_cursor<T: DeserializeOwned>(raw: &str) -> ApiResult<T> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(AppError::validation("Invalid cursor"));
    }

    let bytes = URL_SAFE_NO_PAD
        .decode(trimmed)
        .map_err(|_| AppError::validation("Invalid cursor"))?;

    serde_json::from_slice(&bytes).map_err(|_| AppError::validation("Invalid cursor"))
}
