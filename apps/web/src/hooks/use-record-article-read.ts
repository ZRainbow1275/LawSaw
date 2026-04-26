"use client";

/**
 * Article-read telemetry hook (Task #34 / Phase D.9).
 *
 * Posts engagement signals to `POST /api/v1/me/articles/:id/read`:
 *   - `dwell_ms`   — accumulated time the article body was on-screen
 *   - `scroll_pct` — peak scroll percentage reached (0..100)
 *   - `finished`   — true once `scroll_pct >= 90`
 *   - `milestone`  — optional discrete marker ("enter" | "halfway" | "complete" | "exit")
 *
 * Uses `apiClient.post` for normal beats and `navigator.sendBeacon` (with a
 * Blob containing the same JSON shape) for the final unmount/visibilitychange
 * flush so the report survives even when the user closes the tab.
 *
 * The backend `/articles/:id/read` endpoint is being landed alongside this
 * task by e2-sentiment (Phase E.6 / Task #33). Until it ships, requests will
 * 404 — the hook swallows post-failures so reading is never disrupted by
 * telemetry.
 */

import { apiClient, getApiBaseUrl } from "@/lib/api";
import { useCallback, useRef } from "react";

export interface ArticleReadPayload {
	dwell_ms: number;
	scroll_pct: number;
	finished: boolean;
	milestone?: "enter" | "halfway" | "complete" | "exit";
}

export interface RecordArticleReadOptions {
	/**
	 * Throttle floor in milliseconds between consecutive non-final beats.
	 * Defaults to 5 seconds so steady scrolling produces at most ~12 RPS at
	 * the worst case across an entire reading session.
	 */
	debounceMs?: number;
}

interface PendingState {
	scheduledTimer: ReturnType<typeof setTimeout> | null;
	queued: ArticleReadPayload | null;
	lastSentAt: number;
}

const DEFAULT_DEBOUNCE_MS = 5_000;

function clampPct(value: number): number {
	if (!Number.isFinite(value)) return 0;
	if (value < 0) return 0;
	if (value > 100) return 100;
	return Math.round(value);
}

function clampDwell(value: number): number {
	if (!Number.isFinite(value) || value < 0) return 0;
	return Math.round(value);
}

function shapeBody(payload: ArticleReadPayload): ArticleReadPayload {
	return {
		dwell_ms: clampDwell(payload.dwell_ms),
		scroll_pct: clampPct(payload.scroll_pct),
		finished: Boolean(payload.finished) || payload.scroll_pct >= 90,
		milestone: payload.milestone,
	};
}

export function useRecordArticleRead(
	articleId: string | null,
	options: RecordArticleReadOptions = {},
) {
	const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
	const stateRef = useRef<PendingState>({
		scheduledTimer: null,
		queued: null,
		lastSentAt: 0,
	});

	const send = useCallback(
		async (payload: ArticleReadPayload) => {
			if (!articleId) return;
			const body = shapeBody(payload);
			try {
				await apiClient.post(
					`/api/v1/me/articles/${articleId}/read`,
					body,
					undefined,
					{ retry: false, skipGlobalErrorHandler: true },
				);
			} catch {
				// Swallow telemetry failures — the read endpoint is being landed
				// in a parallel task and may 404 transiently. Reader UX must not
				// regress on telemetry errors.
			}
		},
		[articleId],
	);

	/**
	 * Queue a beat. The hook guarantees at most one in-flight request and
	 * coalesces rapid scroll updates within `debounceMs` into the latest
	 * snapshot before flushing.
	 */
	const record = useCallback(
		(payload: ArticleReadPayload) => {
			if (!articleId) return;
			const state = stateRef.current;
			state.queued = payload;
			const now = Date.now();
			const sinceLast = now - state.lastSentAt;

			if (state.scheduledTimer) return;

			const flush = () => {
				const queued = stateRef.current.queued;
				stateRef.current.queued = null;
				stateRef.current.scheduledTimer = null;
				if (!queued) return;
				stateRef.current.lastSentAt = Date.now();
				void send(queued);
			};

			if (sinceLast >= debounceMs) {
				flush();
				return;
			}

			state.scheduledTimer = setTimeout(flush, debounceMs - sinceLast);
		},
		[articleId, debounceMs, send],
	);

	/**
	 * Final beat — bypasses debounce and uses `navigator.sendBeacon` so the
	 * payload survives a tab close. Falls back to `apiClient.post` when the
	 * Beacon API is unavailable (e.g. SSR rehydration during dev).
	 */
	const flushFinal = useCallback(
		(payload: ArticleReadPayload) => {
			if (!articleId) return;
			const state = stateRef.current;
			if (state.scheduledTimer) {
				clearTimeout(state.scheduledTimer);
				state.scheduledTimer = null;
			}
			state.queued = null;
			const body = shapeBody(payload);
			const url = `${getApiBaseUrl()}/api/v1/me/articles/${articleId}/read`;
			const beaconAvailable =
				typeof navigator !== "undefined" &&
				typeof navigator.sendBeacon === "function";
			if (beaconAvailable) {
				try {
					const blob = new Blob([JSON.stringify(body)], {
						type: "application/json",
					});
					const ok = navigator.sendBeacon(url, blob);
					if (ok) {
						state.lastSentAt = Date.now();
						return;
					}
				} catch {
					// Fall through to fetch-based send below.
				}
			}
			void send(body);
		},
		[articleId, send],
	);

	return { record, flushFinal };
}
