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


def _choose_path(rng: random.Random) -> str:
    common = [
        "/",
        "/login",
        "/logout",
        "/settings",
        "/cases",
        "/search",
        "/api/health",
    ]

    if rng.random() < 0.6:
        path = rng.choice(common)
    else:
        path = f"/{_random_ascii(rng, rng.randint(1, 32))}/{_random_ascii(rng, rng.randint(0, 16))}"

    # Add query string sometimes.
    if rng.random() < 0.4:
        qs = urllib.parse.urlencode(
            {
                _random_ascii(rng, rng.randint(1, 8)): _random_ascii(rng, rng.randint(0, 64))
                for _ in range(rng.randint(1, 4))
            }
        )
        return f"{path}?{qs}"

    return path


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
        path = parsed.path.rstrip("/") + path

    started_ns = time.monotonic_ns()
    try:
        conn.request(req.method, path, body=req.body, headers=req.headers)
        resp: HTTPResponse = conn.getresponse()
        _ = resp.read(512)
        return resp.status, int((time.monotonic_ns() - started_ns) / 1_000_000)
    finally:
        try:
            conn.close()
        except Exception:
            pass


def _baseline(base_url: str) -> bool:
    try:
        status, _ = _do_request(
            base_url=base_url,
            timeout_ms=2000,
            req=RequestSpec(method="GET", path="/", headers={"Connection": "close"}, body=None),
        )
        return 200 <= status < 500
    except Exception:
        return False


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="LawSaw Web monkey test (stdlib-only).")
    parser.add_argument("--base-url", default="http://127.0.0.1:8849")
    parser.add_argument("--requests", type=int, default=300)
    parser.add_argument("--concurrency", type=int, default=20)
    parser.add_argument("--timeout-ms", type=int, default=1500)
    parser.add_argument("--seed", type=int, default=None)
    args = parser.parse_args(argv)

    if args.requests <= 0 or args.concurrency <= 0 or args.timeout_ms <= 0:
        print("ERROR: invalid arguments", file=sys.stderr)
        return 2

    seed = args.seed if args.seed is not None else int(time.time() * 1000) ^ (os.getpid() << 16)
    rng = random.Random(seed)

    base_url = args.base_url.rstrip("/")
    parsed = urllib.parse.urlsplit(base_url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        print(f"ERROR: invalid --base-url: {args.base_url}", file=sys.stderr)
        return 2

    print("=== LawSaw Monkey Test (Web) ===")
    print(f"base_url={base_url}")
    print(f"requests={args.requests} concurrency={args.concurrency} timeout_ms={args.timeout_ms} seed={seed}")

    if not _baseline(base_url):
        print("ERROR: Web baseline request failed", file=sys.stderr)
        return 3

    lock = threading.Lock()
    counters = Counters()
    latencies_ms: list[int] = []
    sample_errors: list[str] = []

    start = time.monotonic()

    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        futures = []
        for _ in range(args.requests):
            path = _choose_path(rng)
            req = RequestSpec(
                method="GET",
                path=path,
                headers={
                    "User-Agent": f"lawsaw-web-monkey/{_random_ascii(rng, 6)}",
                    "Accept": "*/*",
                    "Connection": "close",
                },
                body=None,
            )
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
    qps = counters.total / duration_s
    latencies_ms_sorted = sorted(latencies_ms)

    def pct(p: float) -> int:
        if not latencies_ms_sorted:
            return 0
        idx = int(round((p / 100.0) * (len(latencies_ms_sorted) - 1)))
        return latencies_ms_sorted[max(0, min(len(latencies_ms_sorted) - 1, idx))]

    print("--- summary ---")
    print(json.dumps({**counters.as_dict(), "duration_s": round(duration_s, 3), "qps": round(qps, 2)}, ensure_ascii=False))
    if latencies_ms_sorted:
        print("--- latency_ms ---")
        print(json.dumps({"p50": pct(50), "p90": pct(90), "p95": pct(95), "p99": pct(99)}, ensure_ascii=False))
    if sample_errors:
        print("--- sample_errors ---")
        for err in sample_errors:
            print(err)

    if not _baseline(base_url):
        print("ERROR: Web baseline request failed after monkey run", file=sys.stderr)
        return 4

    if counters.net_errors > 0 or counters.timeouts > 0:
        print("ERROR: observed connectivity errors during monkey run", file=sys.stderr)
        return 5

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

