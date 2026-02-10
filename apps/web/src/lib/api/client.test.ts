import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClient } from "./client";

type Deferred<T> = {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (reason?: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function jsonResponse(payload: unknown): Response {
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: { "content-type": "application/json" },
	});
}

const originalFetch = globalThis.fetch;

afterEach(() => {
	vi.restoreAllMocks();
	if (originalFetch) {
		globalThis.fetch = originalFetch;
	} else {
		Reflect.deleteProperty(globalThis, "fetch");
	}
});

describe("ApiClient request dedupe", () => {
	it("dedupes concurrent GET requests by default", async () => {
		const deferred = createDeferred<Response>();
		const fetchMock = vi.fn(() => deferred.promise);
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const client = new ApiClient("http://localhost:3000", null);
		const requestA = client.get<{ ok: boolean }>("/api/v1/articles");
		const requestB = client.get<{ ok: boolean }>("/api/v1/articles");

		expect(fetchMock).toHaveBeenCalledTimes(1);
		deferred.resolve(jsonResponse({ ok: true }));

		await expect(Promise.all([requestA, requestB])).resolves.toEqual([
			{ ok: true },
			{ ok: true },
		]);
	});

	it("allows opting out of dedupe per request", async () => {
		const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const client = new ApiClient("http://localhost:3000", null);
		await Promise.all([
			client.get<{ ok: boolean }>("/api/v1/articles", undefined, {
				dedupe: false,
			}),
			client.get<{ ok: boolean }>("/api/v1/articles", undefined, {
				dedupe: false,
			}),
		]);

		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("disables dedupe automatically when signal is provided", async () => {
		const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const client = new ApiClient("http://localhost:3000", null);
		const controllerA = new AbortController();
		const controllerB = new AbortController();

		await Promise.all([
			client.get<{ ok: boolean }>("/api/v1/articles", undefined, {
				signal: controllerA.signal,
			}),
			client.get<{ ok: boolean }>("/api/v1/articles", undefined, {
				signal: controllerB.signal,
			}),
		]);

		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
