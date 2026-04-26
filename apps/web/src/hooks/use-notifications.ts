"use client";

/**
 * User-facing notification feed hooks (Phase D.10).
 *
 * Backend surface (`crates/law-eye-api/src/routes/notifications.rs`):
 *   - GET  /api/v1/me/notifications?limit=&offset=
 *       → { items: NotificationEntry[], last_seen_seq, total, limit, offset }
 *   - POST /api/v1/me/notifications/seen { last_seen_seq }
 *       → { success }
 *
 * The backend exposes a tiny audit-log-derived feed, **not** the richer
 * push-notification model the original spec assumed. Read state is tracked
 * by a single high-water-mark `last_seen_seq` on the user row; there is no
 * per-row read column, no kind/title/body/link fields, no mark-by-id
 * endpoint, no push stream, and no dedicated unread-count route.
 *
 * The hooks below adapt to that reality:
 *   - `useNotifications()` — list query, polls every 30 s while the tab is
 *     visible (paused on hidden via `refetchIntervalInBackground: false`)
 *   - `useMarkAllSeen()` — pushes the latest known `seq` so subsequent
 *     fetches treat everything currently shown as read
 *   - `notificationHref(entry)` — `(resource, resource_id) → in-app path`
 *   - `notificationIcon(resource)` — `resource → lucide-react icon`
 *
 * Unread count is **not** a hook — it is derived inline at the call site
 * (`items.filter(i => i.seq > last_seen_seq).length`) so it stays trivially
 * in sync with the same cached snapshot the drawer renders.
 */

import { apiClient } from "@/lib/api";
import {
	assertMarkSeenResponse,
	assertNotificationsResponse,
	type MarkNotificationsSeenRequest,
	type MarkSeenResponse,
	type NotificationEntry,
	type NotificationsResponse,
} from "@/lib/api/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	BarChart3,
	Bell,
	Bookmark,
	FileText,
	FolderTree,
	Hash,
	type LucideIcon,
	Megaphone,
} from "lucide-react";
import { useCallback } from "react";

interface NotificationsParams {
	limit?: number;
	offset?: number;
	enabled?: boolean;
}

const NOTIFICATIONS_KEY = ["me-notifications"] as const;

function notificationsQueryKey(limit: number, offset: number) {
	return [...NOTIFICATIONS_KEY, { limit, offset }] as const;
}

/**
 * `GET /api/v1/me/notifications` — paginated audit-derived feed.
 *
 * - 30 s `refetchInterval` so the bell stays current while the tab is open
 * - `refetchIntervalInBackground: false` pauses the timer when the tab is
 *   hidden (TanStack Query gates the interval on `document.visibilityState`)
 * - `refetchOnWindowFocus: true` (default) gives an immediate refresh when
 *   the user returns
 */
export function useNotifications(params: NotificationsParams = {}) {
	const { limit = 30, offset = 0, enabled = true } = params;
	const searchParams = new URLSearchParams();
	searchParams.set("limit", String(limit));
	searchParams.set("offset", String(offset));

	return useQuery({
		queryKey: notificationsQueryKey(limit, offset),
		queryFn: () =>
			apiClient.get<NotificationsResponse>(
				`/api/v1/me/notifications?${searchParams.toString()}`,
				assertNotificationsResponse,
			),
		enabled,
		staleTime: 10_000,
		refetchInterval: 30_000,
		refetchIntervalInBackground: false,
	});
}

function useMarkSeenMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: MarkNotificationsSeenRequest) =>
			apiClient.post<MarkSeenResponse>(
				"/api/v1/me/notifications/seen",
				input,
				assertMarkSeenResponse,
			),
		onMutate: async (input) => {
			await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_KEY });
			const previous = queryClient.getQueriesData<NotificationsResponse>({
				queryKey: NOTIFICATIONS_KEY,
			});
			for (const [key, snapshot] of previous) {
				if (!snapshot) continue;
				if (snapshot.last_seen_seq >= input.last_seen_seq) continue;
				queryClient.setQueryData<NotificationsResponse>(key, {
					...snapshot,
					last_seen_seq: input.last_seen_seq,
				});
			}
			return { previous };
		},
		onError: (_err, _input, context) => {
			if (!context) return;
			for (const [key, snapshot] of context.previous) {
				queryClient.setQueryData(key, snapshot);
			}
		},
		onSettled: async () => {
			await queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
		},
	});
}

/**
 * Advance the high-water mark to the latest known `seq` so every currently
 * loaded entry counts as read. Items come back sorted by `seq` DESC, so
 * `items[0].seq` is the maximum we know about; we still cross-check the
 * cache in case multiple list pages are mounted concurrently.
 *
 * No per-row mark-as-read exists; this is the only "read" affordance the
 * UI offers.
 */
export function useMarkAllSeen() {
	const queryClient = useQueryClient();
	const mutation = useMarkSeenMutation();

	const markAllSeen = useCallback(async () => {
		const all = queryClient.getQueriesData<NotificationsResponse>({
			queryKey: NOTIFICATIONS_KEY,
		});
		let target = 0;
		for (const [, snapshot] of all) {
			if (!snapshot) continue;
			if (snapshot.last_seen_seq > target) target = snapshot.last_seen_seq;
			const head = snapshot.items[0]?.seq ?? 0;
			if (head > target) target = head;
		}
		if (target <= 0) return;
		await mutation.mutateAsync({ last_seen_seq: target });
	}, [mutation, queryClient]);

	return {
		markAllSeen,
		isPending: mutation.isPending,
	};
}

/**
 * Resource → in-app route mapper. The backend feed is built from audit-log
 * rows so each entry only knows `(resource, resource_id)`; we project that
 * pair onto user-facing routes. Returns `null` when no meaningful
 * destination exists (e.g. banner audit rows or rows missing `resource_id`).
 */
const NOTIFICATION_ROUTES: Record<string, (id: string) => string> = {
	article: (id) => `/articles/${id}`,
	report: (id) => `/me/reports/${id}`,
	banner: () => "/",
	channel: (id) => `/channels/${id}`,
	pin: () => "/me/pins",
	category: (id) => `/articles?category=${id}`,
};

export function notificationHref(entry: NotificationEntry): string | null {
	if (!entry.resource_id) return null;
	const builder = NOTIFICATION_ROUTES[entry.resource];
	return builder ? builder(entry.resource_id) : null;
}

const NOTIFICATION_ICONS: Record<string, LucideIcon> = {
	article: FileText,
	report: BarChart3,
	banner: Megaphone,
	channel: Hash,
	pin: Bookmark,
	category: FolderTree,
};

export function notificationIcon(resource: string): LucideIcon {
	return NOTIFICATION_ICONS[resource] ?? Bell;
}

export type { NotificationEntry, NotificationsResponse } from "@/lib/api/types";

/** Backwards-compatible alias for the legacy modal still on `useMarkNotificationsSeen`. */
export const useMarkNotificationsSeen = useMarkSeenMutation;
