use axum::{
    body::Body,
    http::{header, HeaderValue, Method, Request, Response, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::Serialize;
use std::{
    collections::HashSet,
    future::Future,
    pin::Pin,
    sync::Arc,
    task::{Context, Poll},
};
use tower::{Layer, Service};
use url::{Host, Url};

#[derive(Debug, Serialize)]
struct CsrfError {
    error: String,
}

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
            if CsrfLayer::is_safe_method(req.method()) {
                return inner.call(req).await;
            }

            let path = req.uri().path();
            let is_auth_path = path.starts_with("/api/v1/auth/");
            let has_cookie = req.headers().contains_key(header::COOKIE);

            // Only enforce CSRF when:
            // - hitting auth endpoints (login/register/logout), OR
            // - cookies are present (cookie-session authenticated browser requests)
            if !is_auth_path && !has_cookie {
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
                Json(CsrfError {
                    error: "CSRF validation failed".to_string(),
                }),
            )
                .into_response())
        })
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
