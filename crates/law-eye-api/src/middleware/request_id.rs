use axum::{
    body::{to_bytes, Body},
    http::{header, HeaderValue, Request, Response},
};
use serde_json::Value;
use std::{
    future::Future,
    pin::Pin,
    task::{Context, Poll},
};
use tower::{Layer, Service};
use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct RequestId(pub String);

#[derive(Clone)]
pub struct RequestIdLayer;

impl RequestIdLayer {
    pub fn new() -> Self {
        Self
    }
}

impl Default for RequestIdLayer {
    fn default() -> Self {
        Self::new()
    }
}

impl<S> Layer<S> for RequestIdLayer {
    type Service = RequestIdService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        RequestIdService { inner }
    }
}

#[derive(Clone)]
pub struct RequestIdService<S> {
    inner: S,
}

impl<S> Service<Request<Body>> for RequestIdService<S>
where
    S: Service<Request<Body>, Response = Response<Body>> + Send + Clone + 'static,
    S::Future: Send,
{
    type Response = Response<Body>;
    type Error = S::Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, mut req: Request<Body>) -> Self::Future {
        let (request_id, request_id_header) = parse_request_id(req.headers().get("x-request-id"));

        req.extensions_mut().insert(RequestId(request_id.clone()));

        let mut inner = self.inner.clone();

        Box::pin(async move {
            let mut response = inner.call(req).await?;

            response
                .headers_mut()
                .insert("x-request-id", request_id_header.clone());

            // Best-effort: inject `request_id` into JSON error responses to make debugging easier.
            let is_error =
                response.status().is_client_error() || response.status().is_server_error();
            let is_json = response
                .headers()
                .get(header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .is_some_and(|ct| ct.contains("application/json"));

            if is_error && is_json {
                let (parts, body) = response.into_parts();
                let bytes = match to_bytes(body, 1024 * 1024).await {
                    Ok(bytes) => bytes,
                    Err(_) => {
                        // If we can't read the body, fall back to the original response parts.
                        let mut response = Response::from_parts(parts, Body::empty());
                        response
                            .headers_mut()
                            .insert("x-request-id", request_id_header);
                        return Ok(response);
                    }
                };

                let mut value: Value = match serde_json::from_slice(&bytes) {
                    Ok(value) => value,
                    Err(_) => {
                        // Not valid JSON - keep original bytes.
                        let mut response = Response::from_parts(parts, Body::from(bytes));
                        response
                            .headers_mut()
                            .insert("x-request-id", request_id_header);
                        return Ok(response);
                    }
                };

                if let Value::Object(ref mut map) = value {
                    map.entry("request_id".to_string())
                        .or_insert_with(|| Value::String(request_id.clone()));

                    if std::env::var_os("PRODUCTION").is_some()
                        && parts.status.is_server_error()
                        && (map.contains_key("error")
                            || map.contains_key("message")
                            || map.contains_key("code")
                            || map.contains_key("details"))
                    {
                        map.insert(
                            "error".to_string(),
                            Value::String("Internal server error".to_string()),
                        );
                        map.entry("code".to_string())
                            .or_insert_with(|| Value::String("INTERNAL_ERROR".to_string()));
                        map.remove("details");
                    }
                }

                let body = serde_json::to_vec(&value).unwrap_or_else(|_| bytes.to_vec());
                let mut response = Response::from_parts(parts, Body::from(body));
                // Body changed, content length (if present) is stale.
                response.headers_mut().remove(header::CONTENT_LENGTH);
                response
                    .headers_mut()
                    .insert("x-request-id", request_id_header);
                return Ok(response);
            }

            Ok(response)
        })
    }
}

fn parse_request_id(value: Option<&HeaderValue>) -> (String, HeaderValue) {
    let request_id = value
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .filter(|s| !s.is_empty() && s.len() <= 128)
        .map(String::from)
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    match HeaderValue::from_str(&request_id) {
        Ok(header_value) => (request_id, header_value),
        Err(_) => {
            // Defensive fallback: should not happen because header values are already validated.
            let request_id = Uuid::new_v4().to_string();
            let header_value =
                HeaderValue::from_str(&request_id).expect("uuid should be a valid header value");
            (request_id, header_value)
        }
    }
}
