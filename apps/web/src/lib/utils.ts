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
