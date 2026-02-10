use axum::{
    body::Body,
    http::{header, HeaderValue, Method, Request, Response, StatusCode},
    response::IntoResponse,
    Json,
};
use std::{
    collections::HashSet,
    future::Future,
    pin::Pin,
    sync::Arc,
    task::{Context, Poll},
};
use tower::{Layer, Service};
use url::{Host, Url};

use crate::ApiError;

#[derive(Clone)]
pub struct CsrfLayer {
    allowed_origins: Arc<HashSet<String>>,
}

impl CsrfLayer {
    pub fn new(allowed_origins: Vec<HeaderValue>) -> Self {
        let origins = allowed_origins
            .into_iter()
            .filter_map(|value| value.to_str().ok().map(|s| s.to_string()))
            .collect::<HashSet<_>>();

        Self {
            allowed_origins: Arc::new(origins),
        }
    }

    fn is_safe_method(method: &Method) -> bool {
        matches!(method, &Method::GET | &Method::HEAD | &Method::OPTIONS)
    }

    fn is_auth_path(path: &str) -> bool {
        path == "/api/v1/auth" || path.starts_with("/api/v1/auth/")
    }

    fn should_enforce(req: &Request<Body>) -> bool {
        if Self::is_safe_method(req.method()) {
            return false;
        }

        let headers = req.headers();
        let is_auth_path = Self::is_auth_path(req.uri().path());
        let has_stateful_credentials = headers.contains_key(header::COOKIE);
        let has_browser_context =
            headers.contains_key(header::ORIGIN) || headers.contains_key(header::REFERER);

        // CSRF protection only applies to browser-stateful writes
        // (cookie + Origin/Referer) or any auth write path.
        is_auth_path || (has_stateful_credentials && has_browser_context)
    }
}

impl<S> Layer<S> for CsrfLayer {
    type Service = CsrfService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        CsrfService {
            inner,
            allowed_origins: self.allowed_origins.clone(),
        }
    }
}

#[derive(Clone)]
pub struct CsrfService<S> {
    inner: S,
    allowed_origins: Arc<HashSet<String>>,
}

impl<S> Service<Request<Body>> for CsrfService<S>
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

    fn call(&mut self, req: Request<Body>) -> Self::Future {
        let allowed_origins = self.allowed_origins.clone();
        let mut inner = self.inner.clone();

        Box::pin(async move {
            // Enforce CSRF for unsafe browser writes and all auth endpoints.
            // This keeps machine-to-machine requests (no Origin/Referer/Cookie) backward-compatible.
            if !CsrfLayer::should_enforce(&req) {
                return inner.call(req).await;
            }

            let origin_allowed = req
                .headers()
                .get(header::ORIGIN)
                .map(|v| is_allowed_origin(v, &allowed_origins))
                .or_else(|| {
                    req.headers()
                        .get(header::REFERER)
                        .map(|v| is_allowed_referer(v, &allowed_origins))
                })
                .unwrap_or(false);

            if origin_allowed {
                return inner.call(req).await;
            }

            Ok((
                StatusCode::FORBIDDEN,
                Json(ApiError::new("CSRF validation failed").with_code("CSRF_FAILED")),
            )
                .into_response())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::convert::Infallible;
    use tower::{service_fn, ServiceExt};

    fn make_layer() -> CsrfLayer {
        CsrfLayer::new(vec![HeaderValue::from_static("https://app.example.com")])
    }

    async fn call(req: Request<Body>) -> StatusCode {
        let service = service_fn(|_req: Request<Body>| async move {
            Ok::<_, Infallible>(
                Response::builder()
                    .status(StatusCode::OK)
                    .body(Body::empty())
                    .unwrap(),
            )
        });

        make_layer()
            .layer(service)
            .oneshot(req)
            .await
            .unwrap()
            .status()
    }

    #[tokio::test]
    async fn machine_write_without_browser_headers_skips_csrf() {
        let req = Request::builder()
            .method(Method::POST)
            .uri("/api/v1/audit")
            .body(Body::empty())
            .unwrap();

        assert_eq!(call(req).await, StatusCode::OK);
    }

    #[tokio::test]
    async fn non_auth_browser_write_with_allowed_origin_is_permitted() {
        let req = Request::builder()
            .method(Method::POST)
            .uri("/api/v1/audit")
            .header(header::ORIGIN, "https://app.example.com")
            .body(Body::empty())
            .unwrap();

        assert_eq!(call(req).await, StatusCode::OK);
    }

    #[tokio::test]
    async fn non_auth_browser_write_without_cookie_skips_csrf_even_with_untrusted_origin() {
        let req = Request::builder()
            .method(Method::POST)
            .uri("/api/v1/audit")
            .header(header::ORIGIN, "https://evil.example")
            .body(Body::empty())
            .unwrap();

        assert_eq!(call(req).await, StatusCode::OK);
    }

    #[tokio::test]
    async fn non_auth_stateful_browser_write_with_untrusted_origin_is_rejected() {
        let req = Request::builder()
            .method(Method::POST)
            .uri("/api/v1/audit")
            .header(header::COOKIE, "sid=abc")
            .header(header::ORIGIN, "https://evil.example")
            .body(Body::empty())
            .unwrap();

        assert_eq!(call(req).await, StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn auth_path_write_requires_origin_validation() {
        let req = Request::builder()
            .method(Method::POST)
            .uri("/api/v1/auth/login")
            .body(Body::empty())
            .unwrap();

        assert_eq!(call(req).await, StatusCode::FORBIDDEN);
    }
}

fn is_allowed_origin(origin: &HeaderValue, allowed_origins: &HashSet<String>) -> bool {
    let origin = match origin.to_str() {
        Ok(s) => s,
        Err(_) => return false,
    };

    if origin == "null" {
        return false;
    }

    allowed_origins.contains(origin)
}

fn is_allowed_referer(referer: &HeaderValue, allowed_origins: &HashSet<String>) -> bool {
    let referer = match referer.to_str() {
        Ok(s) => s,
        Err(_) => return false,
    };

    let url = match Url::parse(referer) {
        Ok(url) => url,
        Err(_) => return false,
    };

    let scheme = url.scheme();
    let host = match url.host() {
        Some(Host::Domain(host)) => host.to_string(),
        Some(Host::Ipv4(ip)) => ip.to_string(),
        Some(Host::Ipv6(ip)) => format!("[{ip}]"),
        None => return false,
    };

    let port = match url.port_or_known_default() {
        Some(p) => p,
        None => return false,
    };

    let default_port = match scheme {
        "http" => 80,
        "https" => 443,
        _ => port,
    };

    let origin = if port == default_port {
        format!("{scheme}://{host}")
    } else {
        format!("{scheme}://{host}:{port}")
    };

    allowed_origins.contains(&origin)
}
