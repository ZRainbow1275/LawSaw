import { type Locale, t } from "@/lib/i18n";

const ENV_API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;
const API_BASE_URL =
	ENV_API_BASE_URL && ENV_API_BASE_URL.trim().length > 0
		? ENV_API_BASE_URL
		: typeof window !== "undefined"
			? window.location.origin
			: "http://localhost:3000";
const DEFAULT_API_TIMEOUT_MS = 15_000;
const DEFAULT_API_RETRIES = 2;
const DEFAULT_API_RETRY_BASE_DELAY_MS = 500;
const DEFAULT_API_RETRY_MAX_DELAY_MS = 8000;
const DEFAULT_API_RETRY_JITTER_MS = 200;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);
const PRIVATE_NETWORK_172_SEGMENT_MIN = 16;
const PRIVATE_NETWORK_172_SEGMENT_MAX = 31;

function defaultPortFromProtocol(protocol: string): string {
	return protocol === "https:" ? "443" : "80";
}

function normalizedPort(url: URL): string {
	return url.port || defaultPortFromProtocol(url.protocol);
}

function isPrivateHostname(hostname: string): boolean {
	if (LOOPBACK_HOSTS.has(hostname)) return true;
	if (hostname === "0.0.0.0") return true;

	const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (!ipv4Match) return false;

	const octets = ipv4Match.slice(1).map((value) => Number.parseInt(value, 10));
	if (octets.some((value) => !Number.isFinite(value) || value < 0 || value > 255)) {
		return false;
	}

	const [first, second] = octets;
	if (first === 10) return true;
	if (
		first === 172 &&
		second >= PRIVATE_NETWORK_172_SEGMENT_MIN &&
		second <= PRIVATE_NETWORK_172_SEGMENT_MAX
	) {
		return true;
	}
	if (first === 192 && second === 168) return true;
	if (first === 169 && second === 254) return true;
	return false;
}

function stripTrailingSlash(value: string): string {
	return value.endsWith("/") ? value.slice(0, -1) : value;
}

function normalizeLoopbackBaseUrl(baseUrl: string): string {
	const cleaned = stripTrailingSlash(baseUrl);
	if (typeof window === "undefined") return cleaned;
	const currentLocation = window.location;

	try {
		const parsed = new URL(cleaned);
		if (parsed.origin === currentLocation.origin) return cleaned;

		const currentHost = currentLocation.hostname;
		const currentPort =
			currentLocation.port || defaultPortFromProtocol(currentLocation.protocol);
		const sameProtocol = parsed.protocol === currentLocation.protocol;
		const samePort = normalizedPort(parsed) === currentPort;

		// In local/WSL/Windows hybrid dev, app may be visited via one private host/IP
		// while env points to another private host/IP. Keep API calls same-origin to
		// preserve cookie/session behavior and avoid CSP cross-origin blocks.
		const shouldPinToCurrentOrigin =
			sameProtocol &&
			samePort &&
			(LOOPBACK_HOSTS.has(parsed.hostname) ||
				(isPrivateHostname(parsed.hostname) && isPrivateHostname(currentHost)));

		if (!shouldPinToCurrentOrigin) return cleaned;
		parsed.hostname = currentHost;
		parsed.port = currentLocation.port;
		return stripTrailingSlash(parsed.toString());
	} catch {
		return cleaned;
	}
}

function parseTimeoutMs(value: string | undefined): number | null {
	if (!value) return DEFAULT_API_TIMEOUT_MS;
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed)) return DEFAULT_API_TIMEOUT_MS;
	if (parsed <= 0) return null;
	return parsed;
}

const API_TIMEOUT_MS = parseTimeoutMs(process.env.NEXT_PUBLIC_API_TIMEOUT_MS);

function localeFromDocument(): Locale {
	const lang =
		typeof document !== "undefined" ? document.documentElement.lang : "";
	return lang.toLowerCase().startsWith("en") ? "en" : "zh";
}

export type ResponseValidator<T> = (value: unknown) => asserts value is T;

export type ApiRetryOptions = {
	retries?: number;
	baseDelayMs?: number;
	maxDelayMs?: number;
	jitterMs?: number;
};

export type ApiRequestInit = Omit<RequestInit, "headers"> & {
	headers?: HeadersInit;
	retry?: ApiRetryOptions | false;
	// Skip global error hook for request-scoped flows (e.g. bootstrap auth probe).
	skipGlobalErrorHandler?: boolean;
	// Only applies to retryable methods (GET/HEAD/OPTIONS).
	// Defaults to true unless a custom signal is provided.
	dedupe?: boolean;
};

export function getApiBaseUrl(): string {
	return normalizeLoopbackBaseUrl(API_BASE_URL);
}

export function resolveApiUrl(value: string): string {
	if (value.startsWith("http://") || value.startsWith("https://")) return value;
	const base = getApiBaseUrl();
	if (value.startsWith("/")) return `${base}${value}`;
	return `${base}/${value}`;
}

export function ifMatchFromVersion(version: number): string {
	return `"v${version}"`;
}

export class ApiClientError extends Error {
	readonly status: number;
	readonly code: string | null;
	readonly endpoint: string;
	readonly requestId: string | null;
	readonly details: unknown | null;

	constructor(
		message: string,
		options: {
			status: number;
			code: string | null;
			endpoint: string;
			requestId: string | null;
			details: unknown | null;
			cause?: unknown;
		},
	) {
		super(message, options.cause ? { cause: options.cause } : undefined);
		this.name = "ApiClientError";
		this.status = options.status;
		this.code = options.code;
		this.endpoint = options.endpoint;
		this.requestId = options.requestId;
		this.details = options.details;
	}
}

export type ApiClientErrorHandler = (error: ApiClientError) => void;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRetryableMethod(method: string): boolean {
	return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

function resolvedRetryOptions(value: ApiRetryOptions | false | undefined): {
	retries: number;
	baseDelayMs: number;
	maxDelayMs: number;
	jitterMs: number;
} | null {
	if (value === false) return null;
	const retries =
		value?.retries === undefined ? DEFAULT_API_RETRIES : value.retries;
	if (!Number.isFinite(retries) || retries <= 0) return null;

	const baseDelayMs =
		value?.baseDelayMs === undefined
			? DEFAULT_API_RETRY_BASE_DELAY_MS
			: value.baseDelayMs;
	const maxDelayMs =
		value?.maxDelayMs === undefined
			? DEFAULT_API_RETRY_MAX_DELAY_MS
			: value.maxDelayMs;
	const jitterMs =
		value?.jitterMs === undefined
			? DEFAULT_API_RETRY_JITTER_MS
			: value.jitterMs;

	return {
		retries,
		baseDelayMs: Math.max(0, baseDelayMs),
		maxDelayMs: Math.max(0, maxDelayMs),
		jitterMs: Math.max(0, jitterMs),
	};
}

function computeRetryDelayMs(
	attemptIndex: number,
	options: {
		baseDelayMs: number;
		maxDelayMs: number;
		jitterMs: number;
	},
): number {
	const base = options.baseDelayMs * 2 ** attemptIndex;
	const capped = Math.min(base, options.maxDelayMs);
	const jitter =
		options.jitterMs > 0 ? Math.floor(Math.random() * options.jitterMs) : 0;
	return capped + jitter;
}

function retryAfterSeconds(details: unknown): number | null {
	if (!isRecord(details)) return null;
	const raw = details.retry_after_seconds;
	if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
	if (typeof raw === "string") {
		const parsed = Number.parseInt(raw, 10);
		if (Number.isFinite(parsed) && parsed > 0) return parsed;
	}
	return null;
}

function isRetryableError(error: ApiClientError): boolean {
	if (error.code === "CLIENT_ABORTED") return false;
	if (error.status === 0) return true;
	if (error.status === 408) return true;
	if (error.status === 429) return true;
	return error.status >= 500 && error.status < 600;
}

async function readErrorInfo(response: Response): Promise<{
	message: string;
	requestId: string | null;
	code: string | null;
	details: unknown | null;
}> {
	const contentType = response.headers.get("content-type") || "";
	if (contentType.includes("application/json")) {
		try {
			const data: unknown = await response.json();
			if (typeof data === "string") {
				return { message: data, requestId: null, code: null, details: null };
			}
			if (isRecord(data)) {
				const message =
					typeof data.error === "string"
						? data.error
						: typeof data.message === "string"
							? data.message
							: JSON.stringify(data);

				const requestId =
					typeof data.request_id === "string" ? data.request_id : null;
				const code = typeof data.code === "string" ? data.code : null;
				const details = "details" in data ? (data.details as unknown) : null;
				return { message, requestId, code, details };
			}
			return {
				message: JSON.stringify(data),
				requestId: null,
				code: null,
				details: null,
			};
		} catch {
			// fallthrough
		}
	}

	const message = await response.text().catch(() => "Unknown error");
	return { message, requestId: null, code: null, details: null };
}

export class ApiClient {
	private baseUrl: string;
	private timeoutMs: number | null;
	private errorHandler: ApiClientErrorHandler | null = null;
	private inflightRequests = new Map<string, Promise<unknown>>();

	constructor(
		baseUrl: string = API_BASE_URL,
		timeoutMs: number | null = API_TIMEOUT_MS,
	) {
		this.baseUrl = normalizeLoopbackBaseUrl(baseUrl);
		this.timeoutMs = timeoutMs;
	}

	setErrorHandler(handler: ApiClientErrorHandler | null): void {
		this.errorHandler = handler;
	}

	private emitError(error: ApiClientError): void {
		try {
			this.errorHandler?.(error);
		} catch (err) {
			console.warn("[api] error handler threw", err);
			// Never let a global hook break request error semantics.
		}
	}

	private buildDedupeKey(method: string, endpoint: string): string {
		return `${method}:${endpoint}`;
	}

	private shouldDedupeRequest(
		method: string,
		options: ApiRequestInit,
	): boolean {
		if (!isRetryableMethod(method)) return false;
		if (options.dedupe === false) return false;
		if (options.signal) return false;
		return true;
	}

	private async requestOnce<T>(
		endpoint: string,
		options: RequestInit = {},
		validate?: ResponseValidator<T>,
	): Promise<T> {
		const url = `${this.baseUrl}${endpoint}`;

		const headers = new Headers(options.headers);
		if (!headers.has("Accept")) {
			headers.set("Accept", "application/json");
		}
		if (!headers.has("Accept-Language")) {
			const lang =
				typeof document !== "undefined"
					? document.documentElement.lang
					: undefined;
			if (lang && lang.trim().length > 0) {
				headers.set("Accept-Language", lang);
			}
		}

		const hasBody = options.body !== undefined && options.body !== null;
		const isFormData =
			typeof FormData !== "undefined" && options.body instanceof FormData;
		// Avoid unnecessary CORS preflight for GET by not setting a non-simple Content-Type.
		if (hasBody && !isFormData && !headers.has("Content-Type")) {
			headers.set("Content-Type", "application/json");
		}

		const config: RequestInit = {
			...options,
			headers,
			credentials: "include", // Include cookies for session auth
		};

		const controller = new AbortController();
		let timeoutId: ReturnType<typeof setTimeout> | null = null;
		let didTimeout = false;
		let abortListener: (() => void) | null = null;
		let externalSignal: AbortSignal | null = null;

		if (options.signal) {
			if (options.signal.aborted) {
				controller.abort(options.signal.reason);
			} else {
				externalSignal = options.signal;
				abortListener = () => controller.abort(externalSignal?.reason);
				externalSignal.addEventListener("abort", abortListener, { once: true });
			}
		}

		if (this.timeoutMs !== null) {
			timeoutId = setTimeout(() => {
				didTimeout = true;
				controller.abort();
			}, this.timeoutMs);
		}

		let response: Response;
		try {
			response = await fetch(url, { ...config, signal: controller.signal });
		} catch (cause) {
			if (cause instanceof Error && cause.name === "AbortError") {
				if (externalSignal?.aborted) {
					throw new ApiClientError("Request aborted", {
						status: 0,
						code: "CLIENT_ABORTED",
						endpoint,
						requestId: null,
						details: null,
						cause,
					});
				}

				const error = new ApiClientError(
					didTimeout
						? `Request timed out after ${this.timeoutMs}ms`
						: "Request aborted",
					{
						status: 0,
						code: didTimeout ? "CLIENT_TIMEOUT" : null,
						endpoint,
						requestId: null,
						details: null,
						cause,
					},
				);
				throw error;
			}

			const error = new ApiClientError("Network request failed", {
				status: 0,
				code: "CLIENT_NETWORK",
				endpoint,
				requestId: null,
				details: null,
				cause,
			});
			throw error;
		} finally {
			if (timeoutId) clearTimeout(timeoutId);
			if (externalSignal && abortListener) {
				externalSignal.removeEventListener("abort", abortListener);
			}
		}

		const requestIdFromHeader = response.headers.get("x-request-id");

		if (!response.ok) {
			const retryAfterHeader = response.headers.get("retry-after");
			const retryAfterSecondsFromHeader = retryAfterHeader
				? Number.parseInt(retryAfterHeader, 10)
				: Number.NaN;
			const {
				message,
				requestId: requestIdFromBody,
				code,
				details,
			} = await readErrorInfo(response);
			const requestId = requestIdFromHeader ?? requestIdFromBody;
			const hydratedDetails =
				Number.isFinite(retryAfterSecondsFromHeader) &&
				retryAfterSecondsFromHeader > 0
					? isRecord(details)
						? { ...details, retry_after_seconds: retryAfterSecondsFromHeader }
						: { retry_after_seconds: retryAfterSecondsFromHeader, details }
					: details;
			const error = new ApiClientError(
				requestId ? `${message} (request_id=${requestId})` : message,
				{
					status: response.status,
					code,
					endpoint,
					requestId,
					details: hydratedDetails,
				},
			);
			throw error;
		}

		const requestId = requestIdFromHeader;

		// Handle empty responses
		const text = await response.text();
		if (!text) {
			return undefined as unknown as T;
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(text) as unknown;
		} catch (cause) {
			throw new ApiClientError("Invalid JSON response", {
				status: response.status,
				code: null,
				endpoint,
				requestId,
				details: null,
				cause,
			});
		}

		if (validate) {
			try {
				const runValidate: ResponseValidator<T> = validate;
				runValidate(parsed);
			} catch (cause) {
				const detail =
					cause instanceof Error ? cause.message : "Unknown schema error";
				const locale = localeFromDocument();
				throw new ApiClientError(
					requestId
						? `${t(locale, "API contract validation failed: {detail}", { detail })} (request_id=${requestId})`
						: t(locale, "API contract validation failed: {detail}", { detail }),
					{
						status: response.status,
						code: null,
						endpoint,
						requestId,
						details: null,
						cause,
					},
				);
			}
		}

		return parsed as T;
	}

	private async request<T>(
		endpoint: string,
		options: ApiRequestInit = {},
		validate?: ResponseValidator<T>,
	): Promise<T> {
		const {
			retry,
			dedupe: _dedupe,
			skipGlobalErrorHandler = false,
			...fetchOptions
		} = options;
		const method = (fetchOptions.method ?? "GET").toUpperCase();
		const resolvedRetry = isRetryableMethod(method)
			? resolvedRetryOptions(retry)
			: null;
		const shouldDedupe = this.shouldDedupeRequest(method, options);
		const dedupeKey = this.buildDedupeKey(method, endpoint);

		if (shouldDedupe) {
			const inflight = this.inflightRequests.get(dedupeKey);
			if (inflight) {
				return inflight as Promise<T>;
			}
		}

		const requestPromise = (async (): Promise<T> => {
			let attempt = 0;

			while (true) {
				try {
					return await this.requestOnce<T>(endpoint, fetchOptions, validate);
				} catch (cause) {
					if (!(cause instanceof ApiClientError)) throw cause;

					// Explicit abort from caller should not emit global error hooks or retry.
					if (cause.code === "CLIENT_ABORTED") {
						throw cause;
					}

					if (!resolvedRetry || attempt >= resolvedRetry.retries) {
						if (!skipGlobalErrorHandler) {
							this.emitError(cause);
						}
						throw cause;
					}

					if (!isRetryableError(cause)) {
						if (!skipGlobalErrorHandler) {
							this.emitError(cause);
						}
						throw cause;
					}

					if (fetchOptions.signal?.aborted) {
						throw new ApiClientError("Request aborted", {
							status: 0,
							code: "CLIENT_ABORTED",
							endpoint,
							requestId: null,
							details: null,
							cause: fetchOptions.signal.reason,
						});
					}

					const retryAfter = retryAfterSeconds(cause.details);
					const delayMs = retryAfter
						? Math.min(retryAfter * 1000, resolvedRetry.maxDelayMs)
						: computeRetryDelayMs(attempt, resolvedRetry);

					attempt += 1;
					if (delayMs > 0) {
						await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
					}
				}
			}
		})();

		if (!shouldDedupe) {
			return requestPromise;
		}

		const trackedPromise = requestPromise.finally(() => {
			this.inflightRequests.delete(dedupeKey);
		});
		this.inflightRequests.set(dedupeKey, trackedPromise as Promise<unknown>);
		return trackedPromise;
	}

	async get<T>(
		endpoint: string,
		validate?: ResponseValidator<T>,
		options: ApiRequestInit = {},
	): Promise<T> {
		return this.request<T>(endpoint, { ...options, method: "GET" }, validate);
	}

	async post<T>(
		endpoint: string,
		data?: unknown,
		validate?: ResponseValidator<T>,
		options: ApiRequestInit = {},
	): Promise<T> {
		return this.request<T>(
			endpoint,
			{
				...options,
				method: "POST",
				body: data ? JSON.stringify(data) : undefined,
				retry: false,
			},
			validate,
		);
	}

	async postForm<T>(
		endpoint: string,
		form: FormData,
		validate?: ResponseValidator<T>,
		options: ApiRequestInit = {},
	): Promise<T> {
		return this.request<T>(
			endpoint,
			{ ...options, method: "POST", body: form },
			validate,
		);
	}

	async patch<T>(
		endpoint: string,
		data: unknown,
		validate?: ResponseValidator<T>,
		options: ApiRequestInit = {},
	): Promise<T> {
		return this.request<T>(
			endpoint,
			{
				...options,
				method: "PATCH",
				body: JSON.stringify(data),
				retry: false,
			},
			validate,
		);
	}

	async put<T>(
		endpoint: string,
		data: unknown,
		validate?: ResponseValidator<T>,
		options: ApiRequestInit = {},
	): Promise<T> {
		return this.request<T>(
			endpoint,
			{
				...options,
				method: "PUT",
				body: JSON.stringify(data),
				retry: false,
			},
			validate,
		);
	}

	async delete<T>(
		endpoint: string,
		validate?: ResponseValidator<T>,
		options: ApiRequestInit = {},
	): Promise<T> {
		return this.request<T>(
			endpoint,
			{ ...options, method: "DELETE", retry: false },
			validate,
		);
	}
}

export const apiClient = new ApiClient();
