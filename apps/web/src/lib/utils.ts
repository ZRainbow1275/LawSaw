import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function safeReturnTo(value: string | null): string | null {
	if (!value) return null;
	const trimmed = value.trim();
	if (!trimmed.startsWith("/")) return null;
	// Prevent protocol-relative URLs (open redirect).
	if (trimmed.startsWith("//")) return null;
	return trimmed;
}

export type ClientErrorContext = {
	source: string;
	extra?: Record<string, unknown>;
};

type NormalizedError = {
	name: string;
	message: string;
	stack?: string;
};

function normalizeUnknownError(error: unknown): NormalizedError {
	if (error instanceof Error) {
		return {
			name: error.name || "Error",
			message: error.message || String(error),
			stack: error.stack,
		};
	}

	if (typeof error === "string") {
		return { name: "Error", message: error };
	}

	try {
		return { name: "Error", message: JSON.stringify(error) };
	} catch {
		return { name: "Error", message: String(error) };
	}
}

function truncate(value: string, maxLength: number): string {
	if (value.length <= maxLength) return value;
	return `${value.slice(0, maxLength)}…`;
}

function sanitizeExtra(
	extra: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
	if (!extra) return undefined;
	const result: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(extra)) {
		if (typeof value === "string") {
			result[key] = truncate(value, 500);
			continue;
		}

		if (typeof value === "number" || typeof value === "boolean" || value === null) {
			result[key] = value;
			continue;
		}

		if (value instanceof Error) {
			result[key] = {
				name: value.name,
				message: value.message,
				stack: value.stack,
			};
			continue;
		}

		try {
			result[key] = JSON.parse(JSON.stringify(value)) as unknown;
		} catch {
			result[key] = String(value);
		}
	}

	return result;
}

const lastClientErrorReport: { key: string; at: number } = { key: "", at: 0 };

export function reportClientError(error: unknown, context: ClientErrorContext): void {
	const normalized = normalizeUnknownError(error);
	const pathname =
		typeof window !== "undefined" ? window.location.pathname : undefined;

	const payload = {
		...normalized,
		source: context.source,
		pathname,
		extra: sanitizeExtra(context.extra),
	};

	const key = `${payload.source}:${payload.name}:${payload.message}`;
	const now = Date.now();
	if (key === lastClientErrorReport.key && now - lastClientErrorReport.at < 3000) {
		return;
	}
	lastClientErrorReport.key = key;
	lastClientErrorReport.at = now;

	try {
		console.error("[client-error]", payload);
	} catch {
		// ignore
	}
}
