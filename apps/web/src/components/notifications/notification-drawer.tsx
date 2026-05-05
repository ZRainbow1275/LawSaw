"use client";

/**
 * Right-side notification drawer (Phase D.10).
 *
 * Reads from `useNotifications()` (audit-log derived), groups items by
 * relative date bucket (今天 / 昨天 / 本周早些 / 更早), and supports a
 * "全部 / 未读" tab filter. Read state is controlled by the user's
 * `last_seen_seq` watermark — items with `seq > last_seen_seq` get a blue
 * dot prefix and bolder title.
 *
 * Click behavior:
 *   - Resolves a destination via `notificationHref(item)`; if non-null,
 *     routes to it via the Next.js router and closes the drawer
 *   - Does NOT mark single rows as read — backend only supports a
 *     `last_seen_seq` watermark, so per-row reads are not modelled. The
 *     "全部已读" button is the only read affordance.
 *
 * Pagination uses limit/offset (the only thing the backend exposes); we
 * surface a "加载更多" button rather than building infinite scroll
 * scaffolding when the dataset doesn't actually support cursors.
 */

import { Button } from "@/components/ui/button";
import {
	notificationHref,
	notificationIcon,
	useMarkAllSeen,
	useNotifications,
} from "@/hooks/use-notifications";
import type { NotificationEntry } from "@/lib/api/types";
import { withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { overlayVariants } from "@/lib/motion";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, CheckCheck, Inbox, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type CSSProperties, useEffect, useMemo, useState } from "react";

type DrawerTab = "all" | "unread";

const PAGE_SIZE = 30;

const drawerVariants = {
	hidden: { x: "100%", opacity: 0 },
	visible: {
		x: 0,
		opacity: 1,
		transition: { type: "spring", stiffness: 320, damping: 32 } as const,
	},
	exit: {
		x: "100%",
		opacity: 0,
		transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] } as const,
	},
} as const;

const listVariants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: { staggerChildren: 0.03, delayChildren: 0.05 },
	},
} as const;

const itemVariants = {
	hidden: { opacity: 0, y: 6 },
	visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
} as const;

function startOfDay(value: Date): number {
	const next = new Date(value);
	next.setHours(0, 0, 0, 0);
	return next.getTime();
}

function startOfWeek(value: Date): number {
	const next = new Date(value);
	const day = next.getDay();
	const diff = (day + 6) % 7; // Monday-first week
	next.setDate(next.getDate() - diff);
	next.setHours(0, 0, 0, 0);
	return next.getTime();
}

type Bucket = "today" | "yesterday" | "thisWeek" | "earlier";

function bucketOf(timestamp: string, now: Date): Bucket {
	const created = new Date(timestamp).getTime();
	const todayMs = startOfDay(now);
	if (created >= todayMs) return "today";
	const yesterdayMs = todayMs - 24 * 60 * 60 * 1000;
	if (created >= yesterdayMs) return "yesterday";
	if (created >= startOfWeek(now)) return "thisWeek";
	return "earlier";
}

function relativeTime(t: ReturnType<typeof useT>, value: string): string {
	const created = new Date(value).getTime();
	const diff = Date.now() - created;
	if (diff < 0 || !Number.isFinite(diff)) return value;
	if (diff < 60_000) return t("Just now");
	if (diff < 3_600_000) {
		return t("{count} minutes ago", {
			count: String(Math.floor(diff / 60_000)),
		});
	}
	if (diff < 86_400_000) {
		return t("{count} hours ago", {
			count: String(Math.floor(diff / 3_600_000)),
		});
	}
	if (diff < 7 * 86_400_000) {
		return t("{count} days ago", {
			count: String(Math.floor(diff / 86_400_000)),
		});
	}
	return value.slice(0, 10);
}

interface NotificationDrawerProps {
	open: boolean;
	onClose: () => void;
}

export function NotificationDrawer({ open, onClose }: NotificationDrawerProps) {
	const t = useT();
	const locale = useLocale();
	const router = useRouter();

	const [tab, setTab] = useState<DrawerTab>("all");
	const [pageOffset, setPageOffset] = useState(0);
	const limit = PAGE_SIZE + pageOffset;

	const query = useNotifications({ limit, offset: 0, enabled: open });
	const { markAllSeen, isPending: isMarkAllPending } = useMarkAllSeen();

	useEffect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		document.addEventListener("keydown", onKey);
		document.body.style.overflow = "hidden";
		return () => {
			document.removeEventListener("keydown", onKey);
			document.body.style.overflow = "";
		};
	}, [open, onClose]);

	useEffect(() => {
		if (!open) {
			setTab("all");
			setPageOffset(0);
		}
	}, [open]);

	const items = query.data?.items ?? [];
	const lastSeen = query.data?.last_seen_seq ?? 0;
	const total = query.data?.total ?? 0;
	const unreadCount = useMemo(
		() => items.filter((item) => item.seq > lastSeen).length,
		[items, lastSeen],
	);

	const filtered = useMemo(() => {
		if (tab === "unread") return items.filter((item) => item.seq > lastSeen);
		return items;
	}, [items, lastSeen, tab]);

	const grouped = useMemo(() => {
		const now = new Date();
		const buckets: Record<Bucket, NotificationEntry[]> = {
			today: [],
			yesterday: [],
			thisWeek: [],
			earlier: [],
		};
		for (const item of filtered) {
			buckets[bucketOf(item.created_at, now)].push(item);
		}
		return buckets;
	}, [filtered]);

	const orderedBuckets: Array<{ key: Bucket; titleKey: string }> = [
		{ key: "today", titleKey: "Today" },
		{ key: "yesterday", titleKey: "Yesterday" },
		{ key: "thisWeek", titleKey: "Earlier this week" },
		{ key: "earlier", titleKey: "Earlier" },
	];

	const hasMore = items.length < total;

	const drawerStyle: CSSProperties = {
		backgroundColor: "var(--color-background)",
		borderColor: "color-mix(in srgb, var(--color-border) 78%, transparent)",
	};
	const headingStyle: CSSProperties = { color: "var(--color-foreground)" };
	const mutedStyle: CSSProperties = { color: "var(--surface-muted-text)" };
	const itemSurface: CSSProperties = {
		borderColor: "color-mix(in srgb, var(--color-border) 78%, transparent)",
		backgroundColor: "var(--color-background)",
	};
	const itemUnreadSurface: CSSProperties = {
		borderColor:
			"color-mix(in srgb, var(--color-primary-500) 35%, transparent)",
		backgroundColor:
			"color-mix(in srgb, var(--color-primary-50) 75%, transparent)",
	};

	const handleItemClick = (entry: NotificationEntry) => {
		const link = notificationHref(entry);
		onClose();
		if (link) {
			router.push(withLocalePath(locale, link));
		}
	};

	return (
		<AnimatePresence>
			{open ? (
				<dialog
					open
					className="fixed inset-0 z-40 m-0 h-full w-full max-h-none max-w-none border-0 bg-transparent p-0"
					aria-modal="true"
					aria-label={t("Notification center")}
				>
					<motion.div
						variants={overlayVariants}
						initial="hidden"
						animate="visible"
						exit="exit"
						className="absolute inset-0 bg-black/50 backdrop-blur-sm"
						onClick={onClose}
					/>
					<motion.aside
						variants={drawerVariants}
						initial="hidden"
						animate="visible"
						exit="exit"
						className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l shadow-2xl"
						style={drawerStyle}
					>
						<header
							className="flex items-start justify-between gap-3 border-b px-5 py-4"
							style={{
								borderColor:
									"color-mix(in srgb, var(--color-border) 78%, transparent)",
							}}
						>
							<div className="min-w-0">
								<h2
									className="flex items-center gap-2 text-lg font-semibold tracking-tight"
									style={headingStyle}
								>
									<Bell aria-hidden="true" className="h-5 w-5" />
									{t("Notification center")}
								</h2>
								<p className="mt-1 text-xs" style={mutedStyle}>
									{unreadCount > 0
										? t("{count} unread", { count: String(unreadCount) })
										: t("All caught up")}
								</p>
							</div>
							<div className="flex items-center gap-1">
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => {
										void markAllSeen();
									}}
									disabled={unreadCount === 0 || isMarkAllPending}
								>
									<CheckCheck aria-hidden="true" className="h-4 w-4" />
									{t("Mark all read")}
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									aria-label={t("Close")}
									onClick={onClose}
								>
									<X aria-hidden="true" className="h-4 w-4" />
								</Button>
							</div>
						</header>

						<div
							className="flex items-center gap-1 border-b px-5 py-2"
							style={{
								borderColor:
									"color-mix(in srgb, var(--color-border) 78%, transparent)",
							}}
							role="tablist"
							aria-label={t("Notification center")}
						>
							{(
								[
									{ value: "all" as DrawerTab, labelKey: "All" },
									{ value: "unread" as DrawerTab, labelKey: "Unread" },
								] as const
							).map((option) => {
								const active = tab === option.value;
								return (
									<button
										key={option.value}
										type="button"
										role="tab"
										aria-selected={active}
										onClick={() => setTab(option.value)}
										className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
										style={
											active
												? {
														backgroundColor: "var(--surface-accent-strong)",
														borderColor: "var(--color-primary-500)",
														color: "var(--color-foreground)",
													}
												: {
														backgroundColor: "var(--field-surface)",
														borderColor: "var(--field-border)",
														color: "var(--surface-muted-text)",
													}
										}
									>
										{t(option.labelKey)}
									</button>
								);
							})}
						</div>

						<div className="flex-1 overflow-y-auto px-5 py-4">
							{query.isLoading ? (
								<div
									className="flex items-center gap-2 py-10 text-sm"
									style={mutedStyle}
								>
									<Loader2
										aria-hidden="true"
										className="h-4 w-4 animate-spin"
									/>
									{t("Loading notifications")}
								</div>
							) : query.isError ? (
								<div className="py-10 text-sm" style={mutedStyle}>
									{t("Failed to load notifications")}
								</div>
							) : filtered.length === 0 ? (
								<div
									className="flex flex-col items-center justify-center gap-3 py-16 text-center"
									style={mutedStyle}
								>
									<div
										className="flex h-12 w-12 items-center justify-center rounded-full"
										style={{
											backgroundColor:
												"color-mix(in srgb, var(--surface-muted-bg) 80%, transparent)",
										}}
									>
										<Inbox aria-hidden="true" className="h-6 w-6" />
									</div>
									<p className="text-sm font-medium" style={headingStyle}>
										{tab === "unread"
											? t("All caught up")
											: t("No notifications yet")}
									</p>
									<p className="text-xs" style={mutedStyle}>
										{t(
											"When new delivery events, report exports, or feedback updates arrive, they will be listed here.",
										)}
									</p>
								</div>
							) : (
								<motion.div
									variants={listVariants}
									initial="hidden"
									animate="visible"
									className="space-y-5"
								>
									{orderedBuckets.map((bucket) => {
										const rows = grouped[bucket.key];
										if (!rows || rows.length === 0) return null;
										return (
											<section key={bucket.key} className="space-y-2">
												<h3
													className="text-xs font-semibold uppercase tracking-wide"
													style={mutedStyle}
												>
													{t(bucket.titleKey)}
												</h3>
												<ul className="space-y-2">
													{rows.map((entry) => {
														const Icon = notificationIcon(entry.resource);
														const unread = entry.seq > lastSeen;
														return (
															<motion.li key={entry.id} variants={itemVariants}>
																<button
																	type="button"
																	onClick={() => handleItemClick(entry)}
																	className="flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-colors hover:[border-color:color-mix(in_srgb,var(--color-primary-500)_45%,var(--color-border)_55%)]"
																	style={
																		unread ? itemUnreadSurface : itemSurface
																	}
																	data-testid="notification-row"
																>
																	<div
																		className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
																		style={{
																			backgroundColor: unread
																				? "color-mix(in srgb, var(--color-primary-500) 18%, transparent)"
																				: "var(--surface-muted-bg)",
																			color: unread
																				? "var(--color-primary-700, #1d4ed8)"
																				: "var(--surface-muted-text)",
																		}}
																	>
																		<Icon
																			aria-hidden="true"
																			className="h-4 w-4"
																		/>
																	</div>
																	<div className="min-w-0 flex-1">
																		<div className="flex items-start justify-between gap-2">
																			<p
																				className={
																					unread
																						? "truncate text-sm font-semibold"
																						: "truncate text-sm font-medium"
																				}
																				style={headingStyle}
																			>
																				{entry.summary}
																			</p>
																			{unread ? (
																				<span
																					aria-hidden="true"
																					className="mt-1 h-2 w-2 shrink-0 rounded-full"
																					style={{
																						backgroundColor:
																							"var(--color-primary-500)",
																					}}
																				/>
																			) : null}
																		</div>
																		<p
																			className="mt-1 line-clamp-2 text-xs"
																			style={mutedStyle}
																		>
																			{entry.action} · {entry.resource}
																		</p>
																		<p
																			className="mt-1 text-xs"
																			style={mutedStyle}
																		>
																			{relativeTime(t, entry.created_at)}
																		</p>
																	</div>
																</button>
															</motion.li>
														);
													})}
												</ul>
											</section>
										);
									})}
								</motion.div>
							)}
						</div>

						{!query.isLoading && hasMore ? (
							<div
								className="border-t px-5 py-3"
								style={{
									borderColor:
										"color-mix(in srgb, var(--color-border) 78%, transparent)",
								}}
							>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="w-full"
									onClick={() => setPageOffset((prev) => prev + PAGE_SIZE)}
									disabled={query.isFetching}
								>
									{query.isFetching ? (
										<Loader2
											aria-hidden="true"
											className="h-4 w-4 animate-spin"
										/>
									) : null}
									{t("Load more")}
								</Button>
							</div>
						) : null}
					</motion.aside>
				</dialog>
			) : null}
		</AnimatePresence>
	);
}
