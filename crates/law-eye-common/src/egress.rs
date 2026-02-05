use std::net::IpAddr;
use std::time::Duration;

use tokio::net::lookup_host;
use tokio::time::timeout;
use url::{Host, Url};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UrlPolicyScheme {
    HttpAndHttps,
    HttpsOnly,
    /// Allow https for all hosts; allow http only for internal hosts (when allow_internal=true).
    HttpsOrHttpInternal,
}

#[derive(Debug, Clone)]
pub struct OutboundUrlPolicy {
    pub scheme: UrlPolicyScheme,
    pub allow_internal: bool,
    pub max_len: usize,
    pub dns_lookup_timeout: Duration,
}

impl OutboundUrlPolicy {
    pub fn http_and_https(allow_internal: bool) -> Self {
        Self {
            scheme: UrlPolicyScheme::HttpAndHttps,
            allow_internal,
            max_len: 2048,
            dns_lookup_timeout: Duration::from_secs(2),
        }
    }

    pub fn https_only(allow_internal: bool) -> Self {
        Self {
            scheme: UrlPolicyScheme::HttpsOnly,
            allow_internal,
            max_len: 2048,
            dns_lookup_timeout: Duration::from_secs(2),
        }
    }

    pub fn https_or_http_internal(allow_internal: bool) -> Self {
        Self {
            scheme: UrlPolicyScheme::HttpsOrHttpInternal,
            allow_internal,
            max_len: 2048,
            dns_lookup_timeout: Duration::from_secs(2),
        }
    }

    pub fn with_max_len(mut self, max_len: usize) -> Self {
        self.max_len = max_len;
        self
    }

    pub fn with_dns_lookup_timeout(mut self, dns_lookup_timeout: Duration) -> Self {
        self.dns_lookup_timeout = dns_lookup_timeout;
        self
    }
}

#[derive(Debug, thiserror::Error)]
pub enum UrlPolicyError {
    #[error("{message}")]
    InvalidUrl { message: String },
    #[error("{message}")]
    SsrfBlocked { message: String },
}

impl UrlPolicyError {
    pub fn code(&self) -> &'static str {
        match self {
            UrlPolicyError::InvalidUrl { .. } => "INVALID_URL",
            UrlPolicyError::SsrfBlocked { .. } => "SSRF_BLOCKED",
        }
    }
}

fn is_internal_ipv4(ip: std::net::Ipv4Addr) -> bool {
    let value = u32::from_be_bytes(ip.octets());

    // 0.0.0.0/8
    if (value & 0xFF00_0000) == 0x0000_0000 {
        return true;
    }
    // 10.0.0.0/8
    if (value & 0xFF00_0000) == 0x0A00_0000 {
        return true;
    }
    // 100.64.0.0/10 (Carrier-grade NAT)
    if (value & 0xFFC0_0000) == 0x6440_0000 {
        return true;
    }
    // 127.0.0.0/8
    if (value & 0xFF00_0000) == 0x7F00_0000 {
        return true;
    }
    // 169.254.0.0/16 (Link-local)
    if (value & 0xFFFF_0000) == 0xA9FE_0000 {
        return true;
    }
    // 172.16.0.0/12
    if (value & 0xFFF0_0000) == 0xAC10_0000 {
        return true;
    }
    // 192.0.0.0/24
    if (value & 0xFFFF_FF00) == 0xC000_0000 {
        return true;
    }
    // 192.0.2.0/24 (TEST-NET-1)
    if (value & 0xFFFF_FF00) == 0xC000_0200 {
        return true;
    }
    // 192.168.0.0/16
    if (value & 0xFFFF_0000) == 0xC0A8_0000 {
        return true;
    }
    // 198.18.0.0/15 (Benchmarking)
    if (value & 0xFFFE_0000) == 0xC612_0000 {
        return true;
    }
    // 198.51.100.0/24 (TEST-NET-2)
    if (value & 0xFFFF_FF00) == 0xC633_6400 {
        return true;
    }
    // 203.0.113.0/24 (TEST-NET-3)
    if (value & 0xFFFF_FF00) == 0xCB00_7100 {
        return true;
    }
    // 224.0.0.0/4 (Multicast) and 240.0.0.0/4 (Reserved)
    if (value & 0xF000_0000) == 0xE000_0000 || (value & 0xF000_0000) == 0xF000_0000 {
        return true;
    }

    ip.is_private()
        || ip.is_loopback()
        || ip.is_link_local()
        || ip.is_multicast()
        || ip.is_broadcast()
        || ip.is_unspecified()
}

fn is_internal_ipv6(ip: std::net::Ipv6Addr) -> bool {
    if ip.is_loopback()
        || ip.is_unique_local()
        || ip.is_unicast_link_local()
        || ip.is_multicast()
        || ip.is_unspecified()
    {
        return true;
    }

    // 2001:db8::/32 (Documentation)
    let segments = ip.segments();
    if segments[0] == 0x2001 && segments[1] == 0x0db8 {
        return true;
    }

    if let Some(v4) = ip.to_ipv4_mapped() {
        return is_internal_ipv4(v4);
    }

    false
}

fn is_internal_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_internal_ipv4(v4),
        IpAddr::V6(v6) => is_internal_ipv6(v6),
    }
}

fn is_internal_host<S: AsRef<str>>(host: &Host<S>) -> bool {
    match host {
        Host::Domain(domain) => {
            let lower = domain.as_ref().trim().to_ascii_lowercase();
            lower == "localhost" || lower.ends_with(".localhost")
        }
        Host::Ipv4(ip) => is_internal_ip(IpAddr::V4(*ip)),
        Host::Ipv6(ip) => is_internal_ip(IpAddr::V6(*ip)),
    }
}

pub async fn validate_outbound_url(
    raw: &str,
    policy: &OutboundUrlPolicy,
) -> Result<Url, UrlPolicyError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(UrlPolicyError::InvalidUrl {
            message: "URL cannot be empty".to_string(),
        });
    }
    if trimmed.len() > policy.max_len {
        return Err(UrlPolicyError::InvalidUrl {
            message: format!("URL too long (max {})", policy.max_len),
        });
    }

    let url = Url::parse(trimmed).map_err(|_| UrlPolicyError::InvalidUrl {
        message: "URL must be a valid http/https URL".to_string(),
    })?;

    match policy.scheme {
        UrlPolicyScheme::HttpAndHttps | UrlPolicyScheme::HttpsOrHttpInternal => {
            match url.scheme() {
                "http" | "https" => {}
                _ => {
                    return Err(UrlPolicyError::InvalidUrl {
                        message: "URL scheme must be http or https".to_string(),
                    })
                }
            }
        }
        UrlPolicyScheme::HttpsOnly => {
            if url.scheme() != "https" {
                return Err(UrlPolicyError::InvalidUrl {
                    message: "URL scheme must be https".to_string(),
                });
            }
        }
    }

    if !url.username().is_empty() || url.password().is_some() {
        return Err(UrlPolicyError::InvalidUrl {
            message: "URL must not contain embedded credentials".to_string(),
        });
    }

    let host = url.host().ok_or_else(|| UrlPolicyError::InvalidUrl {
        message: "URL must include a host".to_string(),
    })?;

    if policy.scheme == UrlPolicyScheme::HttpsOrHttpInternal
        && url.scheme() == "http"
        && !(policy.allow_internal && is_internal_host(&host))
    {
        return Err(UrlPolicyError::InvalidUrl {
            message: "URL scheme must be https".to_string(),
        });
    }

    if policy.allow_internal {
        return Ok(url);
    }

    if is_internal_host(&host) {
        return Err(UrlPolicyError::SsrfBlocked {
            message: "Internal/loopback URLs are not allowed".to_string(),
        });
    }

    if let Host::Domain(domain) = &host {
        let port = url.port_or_known_default().unwrap_or_else(|| {
            if url.scheme() == "https" {
                443
            } else {
                80
            }
        });

        let lookup = timeout(policy.dns_lookup_timeout, lookup_host((*domain, port)))
            .await
            .map_err(|_| UrlPolicyError::InvalidUrl {
                message: "URL host DNS resolution timed out".to_string(),
            })?
            .map_err(|_| UrlPolicyError::InvalidUrl {
                message: "URL host DNS resolution failed".to_string(),
            })?;

        for addr in lookup {
            if is_internal_ip(addr.ip()) {
                return Err(UrlPolicyError::SsrfBlocked {
                    message: "URL resolves to an internal IP and is not allowed".to_string(),
                });
            }
        }
    }

    Ok(url)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn validate_outbound_url_rejects_empty() {
        let policy = OutboundUrlPolicy::http_and_https(false);
        let err = validate_outbound_url("", &policy).await.unwrap_err();
        assert_eq!(err.code(), "INVALID_URL");
    }

    #[tokio::test]
    async fn validate_outbound_url_rejects_non_http_scheme() {
        let policy = OutboundUrlPolicy::http_and_https(false);
        let err = validate_outbound_url("file:///etc/passwd", &policy)
            .await
            .unwrap_err();
        assert_eq!(err.code(), "INVALID_URL");
    }

    #[tokio::test]
    async fn validate_outbound_url_blocks_localhost_by_default() {
        let policy = OutboundUrlPolicy::http_and_https(false);
        let err = validate_outbound_url("http://localhost:1234/x", &policy)
            .await
            .unwrap_err();
        assert_eq!(err.code(), "SSRF_BLOCKED");
    }

    #[tokio::test]
    async fn validate_outbound_url_allows_localhost_when_configured() {
        let policy = OutboundUrlPolicy::http_and_https(true);
        let ok = validate_outbound_url("http://127.0.0.1:1234/x", &policy).await;
        assert!(ok.is_ok());
    }

    #[tokio::test]
    async fn validate_outbound_url_rejects_userinfo_credentials() {
        let policy = OutboundUrlPolicy::http_and_https(false);
        let err = validate_outbound_url("https://user:pass@example.com/x", &policy)
            .await
            .unwrap_err();
        assert_eq!(err.code(), "INVALID_URL");
    }

    #[tokio::test]
    async fn validate_outbound_url_requires_https_for_external_when_configured() {
        let policy = OutboundUrlPolicy::https_or_http_internal(true);
        let err = validate_outbound_url("http://example.com/hook", &policy)
            .await
            .unwrap_err();
        assert_eq!(err.code(), "INVALID_URL");
    }
}
