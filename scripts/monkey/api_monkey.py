#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import random
import socket
import string
import sys
import threading
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from http.client import HTTPConnection, HTTPSConnection, HTTPResponse
from typing import Optional, Tuple


@dataclass(frozen=True)
class RequestSpec:
    method: str
    path: str
    headers: dict[str, str]
    body: Optional[bytes]


@dataclass
class Counters:
    total: int = 0
    ok_2xx: int = 0
    http_3xx: int = 0
    http_4xx: int = 0
    http_5xx: int = 0
    net_errors: int = 0
    timeouts: int = 0

    def as_dict(self) -> dict[str, int]:
        return {
            "total": self.total,
            "ok_2xx": self.ok_2xx,
            "http_3xx": self.http_3xx,
            "http_4xx": self.http_4xx,
            "http_5xx": self.http_5xx,
            "net_errors": self.net_errors,
            "timeouts": self.timeouts,
        }


def _random_ascii(rng: random.Random, n: int) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(rng.choice(alphabet) for _ in range(n))


def _random_bytes(rng: random.Random, n: int) -> bytes:
    return bytes(rng.getrandbits(8) for _ in range(n))


def _choose_path(rng: random.Random) -> str:
    known = [
        "/health",
        "/metrics",
        "/api/v1/auth/me",
        "/api/v1/auth/login",
        "/api/v1/auth/logout",
        "/api/v1/auth/register",
        "/api/v1/search",
        "/api/v1/articles",
        "/api/v1/sources",
        "/api/v1/categories",
        "/api/v1/feedbacks",
        "/api/v1/ai",
        "/api/v1/users",
        "/api/v1/objects",
        "/api/v1/apikeys",
        "/api/v1/knowledge",
    ]
    if rng.random() < 0.7:
        return rng.choice(known)
    # Random-ish paths (including invalid UTF-8 percent-escapes) to stress router/middleware.
    junk = _random_ascii(rng, rng.randint(1, 24))
    return f"/{junk}/{_random_ascii(rng, rng.randint(0, 16))}"


def _choose_method(rng: random.Random, path: str) -> str:
    if path == "/health":
        return "GET"
    return rng.choice(["GET", "POST", "PATCH", "DELETE", "OPTIONS"])


def _build_body(rng: random.Random, method: str, path: str, max_payload_kb: int) -> Tuple[dict[str, str], Optional[bytes]]:
    # Only attach bodies for methods likely to accept them.
    if method not in ("POST", "PATCH", "PUT"):
        return {}, None

    max_bytes = max(1, max_payload_kb) * 1024
    body_mode = rng.random()

    if path.endswith("/auth/login"):
        # Often invalid creds (expected 401/400), plus some malformed bodies.
        if body_mode < 0.6:
            payload = {"email": f"{_random_ascii(rng, 8)}@example.com", "password": _random_ascii(rng, rng.randint(0, 64))}
            return {"Content-Type": "application/json"}, json.dumps(payload).encode("utf-8")
    if path.endswith("/auth/register"):
        if body_mode < 0.6:
            payload = {
                "email": f"{_random_ascii(rng, 10)}@example.com",
                "password": _random_ascii(rng, rng.randint(0, 64)),
                "display_name": _random_ascii(rng, rng.randint(0, 32)),
                "tenant_slug": _random_ascii(rng, rng.randint(0, 12)).lower(),
            }
            return {"Content-Type": "application/json"}, json.dumps(payload).encode("utf-8")

    # Mixed content types and sizes.
    if body_mode < 0.33:
        size = rng.randint(0, max_bytes)
        return {"Content-Type": "application/octet-stream"}, _random_bytes(rng, size)
    if body_mode < 0.66:
        size = rng.randint(0, max_bytes)
        return {"Content-Type": "text/plain; charset=utf-8"}, _random_ascii(rng, size).encode("utf-8", errors="ignore")

    # Malformed JSON
    size = rng.randint(0, max_bytes)
    return {"Content-Type": "application/json"}, _random_ascii(rng, size).encode("utf-8", errors="ignore")


def _build_request(rng: random.Random, max_payload_kb: int) -> RequestSpec:
    path = _choose_path(rng)
    method = _choose_method(rng, path)
    extra_headers, body = _build_body(rng, method, path, max_payload_kb)
    headers = {
        "User-Agent": f"lawsaw-monkey/{_random_ascii(rng, 6)}",
        "Accept": "*/*",
        "Connection": "close",
        **extra_headers,
    }

    # Occasionally send garbage-ish headers.
    if rng.random() < 0.10:
        headers["X-Request-Id"] = _random_ascii(rng, 32)
    if rng.random() < 0.05:
        headers["X-Forwarded-For"] = ".".join(str(rng.randint(0, 255)) for _ in range(4))

    return RequestSpec(method=method, path=path, headers=headers, body=body)


def _make_connection(parsed: urllib.parse.SplitResult, timeout_s: float):
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    if parsed.scheme == "https":
        return HTTPSConnection(host, port, timeout=timeout_s)
    return HTTPConnection(host, port, timeout=timeout_s)


def _do_request(base_url: str, timeout_ms: int, req: RequestSpec) -> Tuple[int, int]:
    parsed = urllib.parse.urlsplit(base_url)
    timeout_s = max(0.1, timeout_ms / 1000.0)
    conn = _make_connection(parsed, timeout_s=timeout_s)

    path = req.path
    if parsed.path and parsed.path != "/":
        # Support base URLs like http://host:port/prefix
        path = parsed.path.rstrip("/") + path

    started_ns = time.monotonic_ns()
    try:
        conn.request(req.method, path, body=req.body, headers=req.headers)
        resp: HTTPResponse = conn.getresponse()
        # Ensure the response body is drained to avoid resource leakage.
        _ = resp.read(512)
        return resp.status, int((time.monotonic_ns() - started_ns) / 1_000_000)
    finally:
        try:
            conn.close()
        except Exception:
            pass


def _healthcheck(base_url: str) -> bool:
    try:
        status, _ = _do_request(
            base_url=base_url,
            timeout_ms=2000,
            req=RequestSpec(method="GET", path="/health", headers={"Connection": "close"}, body=None),
        )
        return status == 200
    except Exception:
        return False


def _wait_for_health(base_url: str, attempts: int, sleep_s: float) -> bool:
    for _ in range(attempts):
        if _healthcheck(base_url):
            return True
        time.sleep(sleep_s)
    return False


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="LawSaw API monkey test (stdlib-only).")
    parser.add_argument("--base-url", default="http://127.0.0.1:3001")
    parser.add_argument("--requests", type=int, default=500)
    parser.add_argument("--concurrency", type=int, default=20)
    parser.add_argument("--timeout-ms", type=int, default=1500)
    parser.add_argument("--max-payload-kb", type=int, default=256)
    parser.add_argument("--seed", type=int, default=None)
    args = parser.parse_args(argv)

    if args.requests <= 0:
        print("ERROR: --requests must be > 0", file=sys.stderr)
        return 2
    if args.concurrency <= 0:
        print("ERROR: --concurrency must be > 0", file=sys.stderr)
        return 2
    if args.timeout_ms <= 0:
        print("ERROR: --timeout-ms must be > 0", file=sys.stderr)
        return 2
    if args.max_payload_kb <= 0:
        print("ERROR: --max-payload-kb must be > 0", file=sys.stderr)
        return 2

    seed = args.seed if args.seed is not None else int(time.time() * 1000) ^ (os.getpid() << 16)
    rng = random.Random(seed)

    base_url = args.base_url.rstrip("/")
    parsed = urllib.parse.urlsplit(base_url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        print(f"ERROR: invalid --base-url: {args.base_url}", file=sys.stderr)
        return 2

    print("=== LawSaw Monkey Test (API) ===")
    print(f"base_url={base_url}")
    print(f"requests={args.requests} concurrency={args.concurrency} timeout_ms={args.timeout_ms} max_payload_kb={args.max_payload_kb} seed={seed}")

    if not _wait_for_health(base_url, attempts=10, sleep_s=0.5):
        print("ERROR: API not healthy before monkey run", file=sys.stderr)
        return 3

    lock = threading.Lock()
    counters = Counters()
    latencies_ms: list[int] = []
    sample_errors: list[str] = []

    start = time.monotonic()

    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        futures = []
        for _ in range(args.requests):
            req = _build_request(rng, args.max_payload_kb)
            futures.append(pool.submit(_do_request, base_url, args.timeout_ms, req))

        for fut in as_completed(futures):
            try:
                status, latency_ms = fut.result()
                with lock:
                    counters.total += 1
                    latencies_ms.append(latency_ms)
                    if 200 <= status < 300:
                        counters.ok_2xx += 1
                    elif 300 <= status < 400:
                        counters.http_3xx += 1
                    elif 400 <= status < 500:
                        counters.http_4xx += 1
                    elif 500 <= status < 600:
                        counters.http_5xx += 1
            except socket.timeout:
                with lock:
                    counters.total += 1
                    counters.timeouts += 1
                    if len(sample_errors) < 10:
                        sample_errors.append("timeout")
            except Exception as e:
                with lock:
                    counters.total += 1
                    counters.net_errors += 1
                    if len(sample_errors) < 10:
                        sample_errors.append(repr(e))

    duration_s = max(0.001, time.monotonic() - start)
    latencies_ms_sorted = sorted(latencies_ms)

    def pct(p: float) -> int:
        if not latencies_ms_sorted:
            return 0
        idx = int(round((p / 100.0) * (len(latencies_ms_sorted) - 1)))
        return latencies_ms_sorted[max(0, min(len(latencies_ms_sorted) - 1, idx))]

    qps = counters.total / duration_s
    print("--- summary ---")
    print(json.dumps({**counters.as_dict(), "duration_s": round(duration_s, 3), "qps": round(qps, 2)}, ensure_ascii=False))
    if latencies_ms_sorted:
        print("--- latency_ms ---")
        print(json.dumps({"p50": pct(50), "p90": pct(90), "p95": pct(95), "p99": pct(99)}, ensure_ascii=False))
    if sample_errors:
        print("--- sample_errors ---")
        for err in sample_errors:
            print(err)

    if not _wait_for_health(base_url, attempts=10, sleep_s=0.5):
        print("ERROR: API not healthy after monkey run", file=sys.stderr)
        return 4

    # Fail fast on connectivity-level errors; 4xx/5xx are acceptable in monkey mode.
    if counters.net_errors > 0 or counters.timeouts > 0:
        print("ERROR: observed connectivity errors during monkey run", file=sys.stderr)
        return 5

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
