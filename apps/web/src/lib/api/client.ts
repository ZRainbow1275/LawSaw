const ENV_API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;
const API_BASE_URL =
	ENV_API_BASE_URL && ENV_API_BASE_URL.trim().length > 0
		? ENV_API_BASE_URL
		: typeof window !== "undefined"
			? window.location.origin
			: "http://localhost:3000";
const DEFAULT_API_TIMEOUT_MS = 15_000;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);

function stripTrailingSlash(value: string): string {
	return value.endsWith("/") ? value.slice(0, -1) : value;
}

function normalizeLoopbackBaseUrl(baseUrl: string): string {
	const cleaned = stripTrailingSlash(baseUrl);
	if (typeof window === "undefined") return cleaned;
	const currentHost = window.location.hostname;
	if (!LOOPBACK_HOSTS.has(currentHost)) return cleaned;

	try {
		const parsed = new URL(cleaned);
		if (!LOOPBACK_HOSTS.has(parsed.hostname)) return cleaned;
		parsed.hostname = currentHost;
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

export type ResponseValidator<T> = (value: unknown) => asserts value is T;

export function getApiBaseUrl(): string {
	return normalizeLoopbackBaseUrl(API_BASE_URL);
}

export function resolveApiUrl(value: string): string {
	if (value.startsWith("http://") || value.startsWith("https://")) return value;
	const base = getApiBaseUrl();
	if (value.startsWith("/")) return `${base}${value}`;
	return `${base}/${value}`;
}

export class ApiClientError extends Error {
	readonly status: number;
	readonly endpoint: string;
	readonly requestId: string | null;

	constructor(
		message: string,
		options: {
			status: number;
			endpoint: string;
			requestId: string | null;
			cause?: unknown;
		},
	) {
		super(message, options.cause ? { cause: options.cause } : undefined);
		this.name = "ApiClientError";
		this.status = options.status;
		this.endpoint = options.endpoint;
		this.requestId = options.requestId;
	}
}

export type ApiClientErrorHandler = (error: ApiClientError) => void;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readErrorInfo(
	response: Response,
): Promise<{ message: string; requestId: string | null }> {
	const contentType = response.headers.get("content-type") || "";
	if (contentType.includes("application/json")) {
		try {
			const data: unknown = await response.json();
			if (typeof data === "string") return { message: data, requestId: null };
			if (isRecord(data)) {
				const message =
					typeof data.error === "string"
						? data.error
						: typeof data.message === "string"
							? data.message
							: JSON.stringify(data);

				const requestId =
					typeof data.request_id === "string" ? data.request_id : null;
				return { message, requestId };
			}
			return { message: JSON.stringify(data), requestId: null };
		} catch {
			// fallthrough
		}
	}

	const message = await response.text().catch(() => "Unknown error");
	return { message, requestId: null };
}

export class ApiClient {
	private baseUrl: string;
	private timeoutMs: number | null;
	private errorHandler: ApiClientErrorHandler | null = null;

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

	private async request<T>(
		endpoint: string,
		options: RequestInit = {},
		validate?: ResponseValidator<T>,
	): Promise<T> {
		const url = `${this.baseUrl}${endpoint}`;

		const headers = new Headers(options.headers);
		if (!headers.has("Accept")) {
			headers.set("Accept", "application/json");
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
				const error = new ApiClientError(
					didTimeout
						? `Request timed out after ${this.timeoutMs}ms`
						: "Request aborted",
					{
						status: 0,
						endpoint,
						requestId: null,
						cause,
					},
				);
				this.emitError(error);
				throw error;
			}

			const error = new ApiClientError("Network request failed", {
				status: 0,
				endpoint,
				requestId: null,
				cause,
			});
			this.emitError(error);
			throw error;
		} finally {
			if (timeoutId) clearTimeout(timeoutId);
			if (externalSignal && abortListener) {
				externalSignal.removeEventListener("abort", abortListener);
			}
		}

		const requestIdFromHeader = response.headers.get("x-request-id");

		if (!response.ok) {
			const { message, requestId: requestIdFromBody } =
				await readErrorInfo(response);
			const requestId = requestIdFromHeader ?? requestIdFromBody;
			const error = new ApiClientError(
				requestId ? `${message} (request_id=${requestId})` : message,
				{
					status: response.status,
					endpoint,
					requestId,
				},
			);
			this.emitError(error);
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
				endpoint,
				requestId,
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
				throw new ApiClientError(
					requestId
						? `API 契约校验失败：${detail} (request_id=${requestId})`
						: `API 契约校验失败：${detail}`,
					{
						status: response.status,
						endpoint,
						requestId,
						cause,
					},
				);
			}
		}

		return parsed as T;
	}

	async get<T>(endpoint: string, validate?: ResponseValidator<T>): Promise<T> {
		return this.request<T>(endpoint, { method: "GET" }, validate);
	}

	async post<T>(
		endpoint: string,
		data?: unknown,
		validate?: ResponseValidator<T>,
	): Promise<T> {
		return this.request<T>(
			endpoint,
			{
				method: "POST",
				body: data ? JSON.stringify(data) : undefined,
			},
			validate,
		);
	}

	async postForm<T>(
		endpoint: string,
		form: FormData,
		validate?: ResponseValidator<T>,
	): Promise<T> {
		return this.request<T>(endpoint, { method: "POST", body: form }, validate);
	}

	async patch<T>(
		endpoint: string,
		data: unknown,
		validate?: ResponseValidator<T>,
	): Promise<T> {
		return this.request<T>(
			endpoint,
			{
				method: "PATCH",
				body: JSON.stringify(data),
			},
			validate,
		);
	}

	async delete<T>(
		endpoint: string,
		validate?: ResponseValidator<T>,
	): Promise<T> {
		return this.request<T>(endpoint, { method: "DELETE" }, validate);
	}
}

export const apiClient = new ApiClient();
