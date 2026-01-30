export const dynamic = "force-dynamic";

const CACHE_VERSION = "law-eye-pwa-v1";
const STATIC_CACHE = `${CACHE_VERSION}:static`;
const RUNTIME_CACHE = `${CACHE_VERSION}:runtime`;

const SW_SOURCE = `
const CACHE_VERSION = ${JSON.stringify(CACHE_VERSION)};
const STATIC_CACHE = ${JSON.stringify(STATIC_CACHE)};
const RUNTIME_CACHE = ${JSON.stringify(RUNTIME_CACHE)};

const OFFLINE_HTML = \`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>离线模式 - 法眼</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", "PingFang SC", "Microsoft YaHei", sans-serif; margin: 0; padding: 24px; background: #0b0f1a; color: #e5e7eb; }
      .card { max-width: 720px; margin: 0 auto; padding: 20px 18px; border: 1px solid rgba(255,255,255,.12); border-radius: 12px; background: rgba(255,255,255,.06); }
      h1 { margin: 0 0 10px; font-size: 18px; }
      p { margin: 0 0 8px; line-height: 1.6; opacity: .92; }
      code { background: rgba(255,255,255,.08); padding: 2px 6px; border-radius: 6px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>当前处于离线模式</h1>
      <p>网络连接不可用，无法刷新最新资讯。</p>
      <p>你仍可浏览已缓存的静态资源；与账户/敏感数据相关的接口不会被缓存。</p>
      <p>恢复网络后，请刷新页面。</p>
    </div>
  </body>
</html>\`;

function isCacheableAsset(request) {
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (request.method !== "GET") return false;
  if (url.pathname.startsWith("/api/")) return false;
  if (url.pathname.startsWith("/api-docs/")) return true;

  const dest = request.destination;
  if (dest === "style" || dest === "script" || dest === "image" || dest === "font") return true;
  if (url.pathname.startsWith("/_next/static/")) return true;
  if (url.pathname === "/icon.svg") return true;
  return false;
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const resp = await fetch(request);
  if (resp.ok) cache.put(request, resp.clone());
  return resp;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((resp) => {
      if (resp.ok) cache.put(request, resp.clone());
      return resp;
    })
    .catch(() => undefined);

  return cached || (await fetchPromise) || new Response("", { status: 504 });
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(["/icon.svg"]);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  // Navigation: network-first, offline fallback.
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload) return preload;
        return await fetch(request);
      } catch {
        return new Response(OFFLINE_HTML, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
          status: 200
        });
      }
    })());
    return;
  }

  if (isCacheableAsset(request)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  const url = new URL(request.url);
  if (url.origin === self.location.origin && !url.pathname.startsWith("/api/")) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
`;

export async function GET(): Promise<Response> {
	return new Response(SW_SOURCE, {
		headers: {
			"content-type": "application/javascript; charset=utf-8",
			"cache-control": "no-store, max-age=0",
		},
	});
}
