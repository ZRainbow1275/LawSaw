/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.openai.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ") + ";",
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

function stripTrailingSlash(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function normalizeHost(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return "";
  const normalized = stripTrailingSlash(trimmed);

  // Accept both host strings and full URL env values.
  const parseCandidate =
    normalized.startsWith("http://") || normalized.startsWith("https://")
      ? normalized
      : `http://${normalized}`;
  try {
    const parsed = new URL(parseCandidate);
    return parsed.host;
  } catch {
    return normalized;
  }
}

const apiProxyTargetRaw = process.env.LAW_EYE_API_PROXY_TARGET;
const apiProxyTarget =
  apiProxyTargetRaw && apiProxyTargetRaw.trim().length > 0
    ? stripTrailingSlash(apiProxyTargetRaw.trim())
    : null;
const devPortRaw = process.env.WEB_PORT ?? process.env.PORT ?? "";
const devPort = /^\d+$/.test(devPortRaw) ? devPortRaw : "";
const devHosts = [
  "127.0.0.1",
  "localhost",
  process.env.LAW_EYE_WINDOWS_HOST_IP,
  process.env.WINDOWS_HOST_IP,
  process.env.LAW_EYE_WSL_HOST_IP,
]
  .map((value) => (typeof value === "string" ? value.trim() : ""))
  .filter((value) => value.length > 0);
const allowedDevOrigins = Array.from(
  new Set(
    devHosts
      .flatMap((hostValue) => {
        const host = normalizeHost(hostValue);
        if (!host) return [];

        const [hostname, maybePort] = host.split(":");
        const withHostOnly = hostname || host;
        const withConfiguredPort =
          devPort && withHostOnly ? `${withHostOnly}:${devPort}` : "";
        const withOriginalPort = maybePort ? `${withHostOnly}:${maybePort}` : "";
        return [withHostOnly, withOriginalPort, withConfiguredPort].filter(
          (origin) => origin.length > 0,
        );
      }),
  ),
);

const nextConfig = {
  reactStrictMode: true,
  // Next dev: allow accessing the dev server via 127.0.0.1 without cross-origin warnings.
  // https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins
  allowedDevOrigins,
  experimental: {
    isolatedDevBuild: false,
  },
  async rewrites() {
    if (!apiProxyTarget) return [];
    return [
      { source: "/api/v1/:path*", destination: `${apiProxyTarget}/api/v1/:path*` },
      { source: "/api-docs/:path*", destination: `${apiProxyTarget}/api-docs/:path*` },
      { source: "/health", destination: `${apiProxyTarget}/health` },
      { source: "/metrics", destination: `${apiProxyTarget}/metrics` },
    ];
  },
  async redirects() {
    return [
      {
        source: "/:locale(zh|en)/settings/admin/:path*",
        destination: "/:locale/admin/:path*",
        permanent: true,
      },
      {
        source: "/:locale(zh|en)/settings/admin",
        destination: "/:locale/admin",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        source: "/sw",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
