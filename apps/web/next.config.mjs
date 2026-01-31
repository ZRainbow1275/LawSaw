/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none';" },
];

function stripTrailingSlash(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

const apiProxyTargetRaw = process.env.LAW_EYE_API_PROXY_TARGET;
const apiProxyTarget =
  apiProxyTargetRaw && apiProxyTargetRaw.trim().length > 0
    ? stripTrailingSlash(apiProxyTargetRaw.trim())
    : null;

const nextConfig = {
  reactStrictMode: true,
  // Next dev: allow accessing the dev server via 127.0.0.1 without cross-origin warnings.
  // https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async rewrites() {
    if (!apiProxyTarget) return [];
    return [
      { source: "/api/v1/:path*", destination: `${apiProxyTarget}/api/v1/:path*` },
      { source: "/api-docs/:path*", destination: `${apiProxyTarget}/api-docs/:path*` },
      { source: "/health", destination: `${apiProxyTarget}/health` },
      { source: "/metrics", destination: `${apiProxyTarget}/metrics` },
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
