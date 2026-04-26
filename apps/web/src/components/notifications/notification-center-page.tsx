"use client";

/**
 * Full-page notification center (Phase D.10).
 *
 * Same data + interactions as the slide-in drawer, rendered inline at
 * `/me/notifications` for users who want a persistent surface (e.g., after
 * digest emails).
 *
 * Dwell + scroll instrumentation belongs to the article reader, not here —
 * a full-page notification feed is a navigation hub, not consumed content.
 */

import { ProtectedRoute } from "@/components/auth/protected-route";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
	notificationHref,
	notificationIcon,
	useMarkAllSeen,
	useNotifications,
} from "@/hooks/use-notifications";
import type { NotificationEntry } from "@/lib/api/types";
import { withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { motion } from "framer-motion";
import { Bell, CheckCheck, Inbox, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, type CSSProperties } from "react";

const PAGE_SIZE = 20;

type Tab = "all" | "unread";
type Bucket = "today" | "yesterday" | "thisWeek" | "earlier";

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
	const diff = (day + 6) % 7;
	next.setDate(next.getDate() - diff);
	next.setHours(0, 0, 0, 0);
	return next.getTime();
}

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

function NotificationCenterContent() {
	const t = useT();
	const locale = useLocale();
	const router = useRouter();

	const [tab, setTab] = useState<Tab>("all");
	const [pageOffset, setPageOffset] = useState(0);
	const limit = PAGE_SIZE + pageOffset;

	const query = useNotifications({ limit, offset: 0 });
	const { markAllSeen, isPending: isMarkAllPending } = useMarkAllSeen();

	const items = query.data?.items ?? [];
	const lastSeen = query.data?.last_seen_seq ?? 0;
	const total = query.data?.total ?? 0;
	const unreadCount = useMemo(
		() => items.filter((entry) => entry.seq > lastSeen).length,
		[items, lastSeen],
	);
	const filtered = useMemo(() => {
		if (tab === "unread") return items.filter((entry) => entry.seq > lastSeen);
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
		for (const entry of filtered) {
			buckets[bucketOf(entry.created_at, now)].push(entry);
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

	const pageStyle: CSSProperties = {
		backgroundColor:
			"color-mix(in srgb, var(--surface-muted-bg) 55%, transparent)",
	};
	const headingStyle: CSSProperties = { color: "var(--color-foreground)" };
	const mutedStyle: CSSProperties = { color: "var(--surface-muted-text)" };
	const itemSurface: CSSProperties = {
		borderColor:
			"color-mix(in srgb, var(--color-border) 78%, transparent)",
		backgroundColor: "var(--color-background)",
	};
	const itemUnreadSurface: CSSProperties = {
		borderColor:
			"color-mix(in srgb, var(--color-primary-500) 35%, transparent)",
		backgroundColor:
			"color-mix(in srgb, var(--color-primary-50) 75%, transparent)",
	};

	const handleClick = (entry: NotificationEntry) => {
		const link = notificationHref(entry);
		if (link) {
			router.push(withLocalePath(locale, link));
		}
	};

	return (
		<div className="min-h-screen" style={pageStyle}>
			<Sidebar />
			<MainContent>
				<Header />
				<div className="space-y-6 p-4 md:p-6">
					<Card>
						<CardHeader>
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div>
									<CardTitle
										className="flex items-center gap-2 text-3xl font-bold tracking-tight"
										style={headingStyle}
									>
										<Bell aria-hidden="true" className="h-7 w-7" />
										{t("Notification center")}
									</CardTitle>
									<p className="mt-1 text-sm" style={mutedStyle}>
										{unreadCount > 0
											? t("{count} unread", {
													count: String(unreadCount),
												})
											: t("All caught up")}
									</p>
								</div>
								<Button
									type="button"
									variant="outline"
									onClick={() => {
										void markAllSeen();
									}}
									disabled={unreadCount === 0 || isMarkAllPending}
								>
									<CheckCheck aria-hidden="true" className="h-4 w-4" />
									{t("Mark all read")}
								</Button>
							</div>
						</CardHeader>
						<CardContent>
							<div
								className="flex items-center gap-1"
								role="tablist"
								aria-label={t("Notification center")}
							>
								{(
									[
										{ value: "all" as Tab, labelKey: "All" },
										{ value: "unread" as Tab, labelKey: "Unread" },
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
															backgroundColor:
																"var(--surface-accent-strong)",
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
						</CardContent>
					</Card>

					<Card>
						<CardContent className="space-y-5 py-6">
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
								<EmptyState
									variant="error"
									title={t("Failed to load notifications")}
									description={
										query.error instanceof Error
											? query.error.message
											: t("Unknown error")
									}
									action={{
										label: t("Retry"),
										onClick: () => query.refetch(),
									}}
								/>
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
									<p
										className="text-sm font-medium"
										style={headingStyle}
									>
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
									className="space-y-6"
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
															<motion.li
																key={entry.id}
																variants={itemVariants}
															>
																<button
																	type="button"
																	onClick={() => handleClick(entry)}
																	className="flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-colors hover:[border-color:color-mix(in_srgb,var(--color-primary-500)_45%,var(--color-border)_55%)]"
																	style={
																		unread ? itemUnreadSurface : itemSurface
																	}
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
							{!query.isLoading && hasMore ? (
								<div className="pt-2">
									<Button
										type="button"
										variant="outline"
										size="sm"
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
						</CardContent>
					</Card>
				</div>
			</MainContent>
		</div>
	);
}

export function NotificationCenterPage() {
	return (
		<ProtectedRoute>
			<NotificationCenterContent />
		</ProtectedRoute>
	);
}
