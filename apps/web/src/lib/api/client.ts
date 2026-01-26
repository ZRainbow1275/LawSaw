const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export type ResponseValidator<T> = (value: unknown) => asserts value is T;

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

				const requestId = typeof data.request_id === "string" ? data.request_id : null;
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

	constructor(baseUrl: string = API_BASE_URL) {
		this.baseUrl = baseUrl;
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
		// Avoid unnecessary CORS preflight for GET by not setting a non-simple Content-Type.
		if (hasBody && !headers.has("Content-Type")) {
			headers.set("Content-Type", "application/json");
		}

		const config: RequestInit = {
			...options,
			headers,
			credentials: "include", // Include cookies for session auth
		};

		let response: Response;
		try {
			response = await fetch(url, config);
		} catch (cause) {
			throw new ApiClientError("Network request failed", {
				status: 0,
				endpoint,
				requestId: null,
				cause,
			});
		}

		const requestIdFromHeader = response.headers.get("x-request-id");

		if (!response.ok) {
			const { message, requestId: requestIdFromBody } = await readErrorInfo(response);
			const requestId = requestIdFromHeader ?? requestIdFromBody;
			throw new ApiClientError(
				requestId ? `${message} (request_id=${requestId})` : message,
				{
					status: response.status,
					endpoint,
					requestId,
				},
			);
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
		return this.request<T>(endpoint, {
			method: "POST",
			body: data ? JSON.stringify(data) : undefined,
		}, validate);
	}

	async patch<T>(
		endpoint: string,
		data: unknown,
		validate?: ResponseValidator<T>,
	): Promise<T> {
		return this.request<T>(endpoint, {
			method: "PATCH",
			body: JSON.stringify(data),
		}, validate);
	}

	async delete<T>(endpoint: string, validate?: ResponseValidator<T>): Promise<T> {
		return this.request<T>(endpoint, { method: "DELETE" }, validate);
	}
}

export const apiClient = new ApiClient();
