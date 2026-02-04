use axum::{
    extract::{FromRequest, FromRequestParts, Query, Request},
    http::request::Parts,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::de::DeserializeOwned;
use serde::Serialize;
use tracing::error;
use utoipa::ToSchema;

#[derive(Debug, Serialize, ToSchema)]
pub struct ApiError {
    pub error: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

impl ApiError {
    pub fn new(error: impl Into<String>) -> Self {
        Self {
            error: error.into(),
            code: None,
            request_id: None,
            details: None,
        }
    }

    pub fn with_code(mut self, code: impl Into<String>) -> Self {
        self.code = Some(code.into());
        self
    }

    pub fn with_details(mut self, details: serde_json::Value) -> Self {
        self.details = Some(details);
        self
    }
}

#[derive(Debug)]
pub struct AppError {
    pub status: StatusCode,
    pub body: ApiError,
}

impl AppError {
    pub fn bad_request(msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            body: ApiError::new(msg).with_code("BAD_REQUEST"),
        }
    }

    pub fn bad_request_with_code(code: impl Into<String>, msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            body: ApiError::new(msg).with_code(code),
        }
    }

    pub fn unauthorized(msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::UNAUTHORIZED,
            body: ApiError::new(msg).with_code("UNAUTHORIZED"),
        }
    }

    pub fn forbidden(msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::FORBIDDEN,
            body: ApiError::new(msg).with_code("FORBIDDEN"),
        }
    }

    pub fn not_found(msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            body: ApiError::new(msg).with_code("NOT_FOUND"),
        }
    }

    pub fn conflict(msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::CONFLICT,
            body: ApiError::new(msg).with_code("CONFLICT"),
        }
    }

    pub fn precondition_required(msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::PRECONDITION_REQUIRED,
            body: ApiError::new(msg).with_code("PRECONDITION_REQUIRED"),
        }
    }

    pub fn internal(msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            body: ApiError::new(msg).with_code("INTERNAL_ERROR"),
        }
    }

    pub fn internal_with_code(code: impl Into<String>, msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            body: ApiError::new(msg).with_code(code),
        }
    }

    pub fn rate_limited(msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::TOO_MANY_REQUESTS,
            body: ApiError::new(msg).with_code("RATE_LIMITED"),
        }
    }

    pub fn service_unavailable(msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::SERVICE_UNAVAILABLE,
            body: ApiError::new(msg).with_code("SERVICE_UNAVAILABLE"),
        }
    }

    pub fn validation(msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            body: ApiError::new(msg).with_code("VALIDATION_ERROR"),
        }
    }

    pub fn validation_with_code(code: impl Into<String>, msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            body: ApiError::new(msg).with_code(code),
        }
    }

    pub fn payload_too_large(msg: impl Into<String>) -> Self {
        Self {
            status: StatusCode::PAYLOAD_TOO_LARGE,
            body: ApiError::new(msg).with_code("PAYLOAD_TOO_LARGE"),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        (self.status, Json(self.body)).into_response()
    }
}

fn is_production() -> bool {
    std::env::var_os("PRODUCTION").is_some()
}

impl From<law_eye_common::Error> for AppError {
    fn from(err: law_eye_common::Error) -> Self {
        match err {
            law_eye_common::Error::NotFound(msg) => Self::not_found(msg),
            law_eye_common::Error::Validation(msg) => Self::validation(msg),
            law_eye_common::Error::Unauthorized(msg) => Self::unauthorized(msg),
            law_eye_common::Error::Forbidden(msg) => Self::forbidden(msg),
            law_eye_common::Error::Conflict(msg) => Self::conflict(msg),
            law_eye_common::Error::Parse(msg) => Self::bad_request(format!("Parse error: {}", msg)),
            law_eye_common::Error::Database(msg) => {
                error!(error = %msg, error_type = "database", "internal error");
                if is_production() {
                    Self::internal("Internal server error")
                } else {
                    Self::internal(format!("Database error: {}", msg))
                }
            }
            law_eye_common::Error::Config(msg) => {
                error!(error = %msg, error_type = "config", "internal error");
                if is_production() {
                    Self::internal("Internal server error")
                } else {
                    Self::internal(format!("Config error: {}", msg))
                }
            }
            law_eye_common::Error::Http(msg) => {
                error!(error = %msg, error_type = "http", "internal error");
                if is_production() {
                    Self::internal("Internal server error")
                } else {
                    Self::internal(format!("HTTP error: {}", msg))
                }
            }
            law_eye_common::Error::Internal(msg) => {
                error!(error = %msg, error_type = "internal", "internal error");
                if is_production() {
                    Self::internal("Internal server error")
                } else {
                    Self::internal(msg)
                }
            }
        }
    }
}

pub type ApiResult<T> = Result<T, AppError>;

pub struct ApiJson<T>(pub T);

impl<S, T> FromRequest<S> for ApiJson<T>
where
    S: Send + Sync,
    T: DeserializeOwned,
{
    type Rejection = AppError;

    async fn from_request(req: Request, state: &S) -> Result<Self, Self::Rejection> {
        let Json(value) = Json::<T>::from_request(req, state)
            .await
            .map_err(map_json_rejection)?;
        Ok(Self(value))
    }
}

pub struct ApiQuery<T>(pub T);

impl<S, T> FromRequestParts<S> for ApiQuery<T>
where
    S: Send + Sync,
    T: DeserializeOwned,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let Query(value) = Query::<T>::from_request_parts(parts, state)
            .await
            .map_err(map_query_rejection)?;
        Ok(Self(value))
    }
}

fn map_json_rejection(rejection: axum::extract::rejection::JsonRejection) -> AppError {
    bad_request_rejection("INVALID_JSON", "Invalid request body", rejection.body_text())
}

fn map_query_rejection(rejection: axum::extract::rejection::QueryRejection) -> AppError {
    bad_request_rejection("INVALID_QUERY", "Invalid query parameters", rejection.body_text())
}

fn bad_request_rejection(code: &str, message: &str, reason: String) -> AppError {
    let mut body = ApiError::new(message).with_code(code);
    if !is_production() {
        body.details = Some(serde_json::json!({ "reason": reason }));
    }

    AppError {
        status: StatusCode::BAD_REQUEST,
        body,
    }
}
