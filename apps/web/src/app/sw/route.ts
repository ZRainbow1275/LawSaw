export const dynamic = "force-dynamic";

const CACHE_VERSION = "law-eye-pwa-v1";
const STATIC_CACHE = `${CACHE_VERSION}:static`;
const RUNTIME_CACHE = `${CACHE_VERSION}:runtime`;

const SW_SOURCE = `
const CACHE_VERSION = ${JSON.stringify(CACHE_VERSION)};
const STATIC_CACHE = ${JSON.stringify(STATIC_CACHE)};
const RUNTIME_CACHE = ${JSON.stringify(RUNTIME_CACHE)};

const OFFLINE_HTML_ZH = \`<!doctype html>
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

const OFFLINE_HTML_EN = \`<!doctype html>
<html lang="en-US">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Offline - Law Eye</title>
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
      <h1>You are offline</h1>
      <p>Network connection is unavailable, so we can't refresh the latest updates.</p>
      <p>You can still browse cached static assets; APIs related to accounts/sensitive data are never cached.</p>
      <p>Once the network is back, please refresh this page.</p>
    </div>
  </body>
</html>\`;

function offlineHtmlForRequest(request) {
  try {
    const url = new URL(request.url);
    return url.pathname.startsWith("/en/") ? OFFLINE_HTML_EN : OFFLINE_HTML_ZH;
  } catch {
    return OFFLINE_HTML_ZH;
  }
}

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
    .catch((err) => {
      console.warn("[sw] runtime fetch failed", err);
      return undefined;
    });

  return cached || (await fetchPromise) || new Response("", { status: 504 });
}

const OUTBOX_DB_NAME = "law-eye-outbox";
const OUTBOX_STORE = "outbox";
const OUTBOX_SYNC_TAG = "law-eye-outbox-sync";
const OUTBOX_MAX_ATTEMPTS = 8;
const OUTBOX_MAX_BODY_BYTES = 200 * 1024;

let outboxDbPromise = null;
let outboxFlushInFlight = false;

function openOutboxDb() {
  if (outboxDbPromise) return outboxDbPromise;
  outboxDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(OUTBOX_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        db.createObjectStore(OUTBOX_STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return outboxDbPromise;
}

async function outboxAdd(entry) {
  const db = await openOutboxDb();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, "readwrite");
    const store = tx.objectStore(OUTBOX_STORE);
    const req = store.add(entry);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function outboxList() {
  const db = await openOutboxDb();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, "readonly");
    const store = tx.objectStore(OUTBOX_STORE);
    const req = store.openCursor();
    const items = [];
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve(items);
        return;
      }
      items.push(cursor.value);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

async function outboxDelete(id) {
  const db = await openOutboxDb();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, "readwrite");
    const store = tx.objectStore(OUTBOX_STORE);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function outboxPut(entry) {
  const db = await openOutboxDb();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, "readwrite");
    const store = tx.objectStore(OUTBOX_STORE);
    const req = store.put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function broadcastMessage(type, payload) {
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of clients) {
    try {
      client.postMessage({ type, payload });
    } catch (err) {
      console.warn("[sw] postMessage failed", err);
    }
  }
}

function isAllowedOutboxRequest(url, method) {
  if (method !== "POST") return false;
  // Only allow a small, explicit allowlist to avoid replaying sensitive operations.
  return url.pathname === "/api/v1/feedbacks";
}

function pickOutboxHeaders(headers) {
  const picked = {};
  if (headers && typeof headers === "object") {
    const ct = headers["Content-Type"] || headers["content-type"];
    const lang = headers["Accept-Language"] || headers["accept-language"];
    if (typeof ct === "string" && ct.trim()) picked["Content-Type"] = ct;
    if (typeof lang === "string" && lang.trim()) picked["Accept-Language"] = lang;
  }
  return picked;
}

function clampBody(body) {
  if (typeof body !== "string") return null;
  // Prevent unbounded growth in IndexedDB for accidental large payloads.
  if (body.length > OUTBOX_MAX_BODY_BYTES) return body.slice(0, OUTBOX_MAX_BODY_BYTES);
  return body;
}

async function enqueueOutboxRequest(request) {
  if (!request || typeof request !== "object") return;
  if (typeof request.url !== "string" || typeof request.method !== "string") return;

  let url;
  try {
    url = new URL(request.url, self.location.origin);
  } catch {
    return;
  }

  if (url.origin !== self.location.origin) return;
  const method = request.method.toUpperCase();
  if (!isAllowedOutboxRequest(url, method)) {
    await broadcastMessage("OUTBOX_REJECTED", { url: url.toString(), method });
    return;
  }

  const entry = {
    url: url.toString(),
    method,
    headers: pickOutboxHeaders(request.headers),
    body: clampBody(request.body),
    created_at: Date.now(),
    attempts: 0,
    next_attempt_at: 0,
    last_error: null,
  };

  const id = await outboxAdd(entry);
  await broadcastMessage("OUTBOX_ENQUEUED", { id, url: entry.url });

  try {
    if (self.registration.sync) {
      await self.registration.sync.register(OUTBOX_SYNC_TAG);
    }
  } catch (err) {
    console.warn("[sw] background sync register failed", err);
  }

  // Best effort: also try flush immediately (for browsers without sync).
  await flushOutbox();
}

function parseRetryAfterSeconds(response) {
  const value = response.headers.get("retry-after");
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function flushOutbox() {
  if (outboxFlushInFlight) return;
  outboxFlushInFlight = true;
  try {
    const now = Date.now();
    const items = await outboxList();
    // Keep deterministic ordering by id.
    items.sort((a, b) => (a.id || 0) - (b.id || 0));

    for (const item of items) {
      if (!item || typeof item !== "object" || typeof item.id !== "number") continue;
      if (item.next_attempt_at && item.next_attempt_at > now) continue;

      let url;
      try {
        url = new URL(item.url);
      } catch {
        await outboxDelete(item.id);
        continue;
      }
      if (url.origin !== self.location.origin) {
        await outboxDelete(item.id);
        continue;
      }

      try {
        const resp = await fetch(url.toString(), {
          method: item.method,
          headers: item.headers || {},
          body: item.body || undefined,
          credentials: "include",
        });

        if (resp.ok) {
          await outboxDelete(item.id);
          await broadcastMessage("OUTBOX_DELIVERED", { id: item.id, url: item.url });
          continue;
        }

        // Non-retryable client errors: drop to avoid infinite loops.
        if (resp.status >= 400 && resp.status < 500 && resp.status !== 429) {
          await outboxDelete(item.id);
          await broadcastMessage("OUTBOX_DROPPED", {
            id: item.id,
            url: item.url,
            status: resp.status,
          });
          continue;
        }

        item.attempts = (item.attempts || 0) + 1;
        item.last_error = "http_" + resp.status;
        const retryAfter = resp.status === 429 ? parseRetryAfterSeconds(resp) : null;
        item.next_attempt_at = retryAfter ? Date.now() + retryAfter * 1000 : 0;

        if (item.attempts >= OUTBOX_MAX_ATTEMPTS) {
          await outboxDelete(item.id);
          await broadcastMessage("OUTBOX_GAVE_UP", { id: item.id, url: item.url });
          continue;
        }

        await outboxPut(item);
        // If backend is unhealthy, stop early and wait for next sync/flush signal.
        if (resp.status >= 500 || resp.status === 429) break;
      } catch (err) {
        item.attempts = (item.attempts || 0) + 1;
        item.last_error = "network";
        if (item.attempts >= OUTBOX_MAX_ATTEMPTS) {
          await outboxDelete(item.id);
          await broadcastMessage("OUTBOX_GAVE_UP", { id: item.id, url: item.url });
          continue;
        }
        await outboxPut(item);
        break;
      }
    }
  } catch (err) {
    console.warn("[sw] flushOutbox failed", err);
  } finally {
    outboxFlushInFlight = false;
  }
}

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.type === "OUTBOX_ENQUEUE") {
    event.waitUntil(enqueueOutboxRequest(data.request));
    return;
  }
  if (data.type === "OUTBOX_FLUSH") {
    event.waitUntil(flushOutbox());
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag !== OUTBOX_SYNC_TAG) return;
  event.waitUntil(flushOutbox());
});

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
      try { await self.registration.navigationPreload.enable(); } catch (err) {
        console.warn("[sw] navigationPreload enable failed", err);
      }
    }
    self.clients.claim();
    await flushOutbox();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  // Navigation: network-first, offline fallback.
  if (request.mode === "navigate") {
    event.waitUntil(flushOutbox());
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload) return preload;
        return await fetch(request);
      } catch (err) {
        console.warn("[sw] navigation fetch failed", err);
        return new Response(offlineHtmlForRequest(request), {
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

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let data = {};
    try {
      data = event.data ? event.data.json() : {};
    } catch {
      data = {};
    }

    const title = typeof data.title === "string" ? data.title : "LawSaw";
    const body = typeof data.body === "string" ? data.body : "";
    const url = typeof data.url === "string" ? data.url : "/";

    await self.registration.showNotification(title, {
      body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const payload = event.notification.data || {};
  const url = payload && typeof payload.url === "string" ? payload.url : "/";

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });

    for (const client of clients) {
      if ("focus" in client) {
        await client.focus();
        if ("navigate" in client) {
          try {
            await client.navigate(url);
          } catch {
            // ignore
          }
        }
        return;
      }
    }

    await self.clients.openWindow(url);
  })());
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
