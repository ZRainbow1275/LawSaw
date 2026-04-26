"use client";

/**
 * Full-page reading history (Phase D.11).
 *
 * Same data source as the dashboard `ContinueReadingCard`, rendered as a
 * paginated table with 全部 / 已读完 / 进行中 filter chips.
 *
 * Backend pending: see comment block in `use-reading-history.ts`. Until the
 * GET endpoint ships the page renders an "等后端落地" placeholder rather than
 * faking rows.
 */

import { ProtectedRoute } from "@/components/auth/protected-route";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { Sidebar } from "@/components/layout/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
	useReadingHistory,
} from "@/hooks/use-reading-history";
import { formatDateTime, withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { motion } from "framer-motion";
import {
	ArrowRight,
	CheckCircle2,
	Clock3,
	Filter,
	History,
	Loader2,
	PlayCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties } from "react";

type StatusFilter = "all" | "finished" | "in_progress";

const PAGE_SIZE = 20;

const STATUS_OPTIONS: ReadonlyArray<{
	value: StatusFilter;
	labelKey: string;
}> = [
	{ value: "all", labelKey: "All" },
	{ value: "finished", labelKey: "Finished" },
	{ value: "in_progress", labelKey: "In progress" },
];

const listVariants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: { staggerChildren: 0.04, delayChildren: 0.05 },
	},
} as const;

const rowVariants = {
	hidden: { opacity: 0, y: 6 },
	visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
} as const;

function formatDwell(t: ReturnType<typeof useT>, ms: number): string {
	if (!Number.isFinite(ms) || ms <= 0) return "—";
	const minutes = Math.floor(ms / 60_000);
	if (minutes < 1) {
		return t("{count} seconds", { count: String(Math.floor(ms / 1000)) });
	}
	if (minutes < 60) {
		return t("{count} minutes", { count: String(minutes) });
	}
	const hours = Math.floor(minutes / 60);
	const remainder = minutes % 60;
	return t("{hours}h {minutes}m", {
		hours: String(hours),
		minutes: String(remainder),
	});
}

function ReadingHistoryContent() {
	const t = useT();
	const locale = useLocale();
	const router = useRouter();

	const [status, setStatus] = useState<StatusFilter>("all");
	const [pageOffset, setPageOffset] = useState(0);
	const limit = PAGE_SIZE + pageOffset;

	const query = useReadingHistory({
		limit,
		offset: 0,
		finishedOnly: status === "finished",
	});

	const items = query.data?.items ?? [];
	const filteredItems =
		status === "in_progress" ? items.filter((row) => !row.finished) : items;
	const total = query.data?.total ?? 0;
	const hasMore = items.length < total;

	const pageStyle: CSSProperties = {
		backgroundColor:
			"color-mix(in srgb, var(--surface-muted-bg) 55%, transparent)",
	};
	const headingStyle: CSSProperties = { color: "var(--color-foreground)" };
	const mutedStyle: CSSProperties = { color: "var(--surface-muted-text)" };
	const surfaceStyle: CSSProperties = {
		borderColor:
			"color-mix(in srgb, var(--color-border) 78%, transparent)",
		backgroundColor: "var(--color-background)",
	};
	const progressTrackStyle: CSSProperties = {
		backgroundColor: "var(--surface-muted-bg)",
	};
	const progressFillStyle: CSSProperties = {
		backgroundColor: "var(--color-primary-500)",
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
										<History aria-hidden="true" className="h-7 w-7" />
										{t("Reading history")}
									</CardTitle>
									<p className="mt-1 text-sm" style={mutedStyle}>
										{t(
											"Articles you have opened, sorted by most recently read.",
										)}
									</p>
								</div>
							</div>
						</CardHeader>
						<CardContent>
							<div className="flex flex-wrap items-center gap-2">
								<Filter
									aria-hidden="true"
									className="h-4 w-4"
									style={mutedStyle}
								/>
								{STATUS_OPTIONS.map((option) => {
									const active = status === option.value;
									return (
										<button
											key={option.value}
											type="button"
											onClick={() => {
												setStatus(option.value);
												setPageOffset(0);
											}}
											aria-pressed={active}
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
						<CardContent className="space-y-3 py-6">
							{query.isLoading ? (
								<div
									className="flex items-center gap-2 py-10 text-sm"
									style={mutedStyle}
								>
									<Loader2
										aria-hidden="true"
										className="h-4 w-4 animate-spin"
									/>
									{t("Loading reading history")}
								</div>
							) : query.isError ? (
								<EmptyState
									variant="error"
									title={t("Failed to load reading history")}
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
							) : filteredItems.length === 0 ? (
								<EmptyState
									title={t("You haven't started reading yet")}
									description={t(
										"Open any article — your reading progress will appear here for quick access.",
									)}
								/>
							) : (
								<motion.ul
									variants={listVariants}
									initial="hidden"
									animate="visible"
									className="space-y-2"
								>
									<li
										className="grid grid-cols-12 gap-2 px-3 text-xs uppercase tracking-wide"
										style={mutedStyle}
										aria-hidden="true"
									>
										<span className="col-span-5">{t("Title")}</span>
										<span className="col-span-2">{t("Category")}</span>
										<span className="col-span-2">
											{t("Reading progress")}
										</span>
										<span className="col-span-1">{t("Time spent")}</span>
										<span className="col-span-2 text-right">
											{t("Last read")}
										</span>
									</li>
									{filteredItems.map((item) => {
										const pct = Math.max(
											0,
											Math.min(100, item.scroll_pct_peak),
										);
										return (
											<motion.li key={item.article_id} variants={rowVariants}>
												<button
													type="button"
													onClick={() =>
														router.push(
															withLocalePath(
																locale,
																`/articles/${item.article_id}`,
															),
														)
													}
													className="grid w-full grid-cols-12 items-center gap-2 rounded-2xl border px-3 py-3 text-left transition-colors hover:[border-color:color-mix(in_srgb,var(--color-primary-500)_35%,var(--color-border)_65%)]"
													style={surfaceStyle}
												>
													<div className="col-span-5 flex min-w-0 items-center gap-2">
														{item.finished ? (
															<CheckCircle2
																aria-hidden="true"
																className="h-4 w-4 shrink-0"
																style={{ color: "var(--color-success)" }}
															/>
														) : (
															<PlayCircle
																aria-hidden="true"
																className="h-4 w-4 shrink-0"
																style={{
																	color: "var(--color-primary-500)",
																}}
															/>
														)}
														<p
															className="truncate text-sm font-medium"
															style={headingStyle}
														>
															{item.title}
														</p>
													</div>
													<div className="col-span-2 min-w-0">
														{item.category_slug ? (
															<Badge variant="secondary">
																{item.category_slug}
															</Badge>
														) : (
															<span
																className="text-xs"
																style={mutedStyle}
															>
																—
															</span>
														)}
													</div>
													<div className="col-span-2 flex items-center gap-2">
														<div
															className="h-1.5 flex-1 overflow-hidden rounded-full"
															style={progressTrackStyle}
														>
															<div
																className="h-full rounded-full"
																style={{
																	...progressFillStyle,
																	width: `${pct}%`,
																}}
															/>
														</div>
														<span
															className="w-9 text-right text-xs tabular-nums"
															style={mutedStyle}
														>
															{pct}%
														</span>
													</div>
													<div
														className="col-span-1 flex items-center gap-1 text-xs tabular-nums"
														style={mutedStyle}
													>
														<Clock3
															aria-hidden="true"
															className="h-3 w-3"
														/>
														{formatDwell(t, item.dwell_ms_total)}
													</div>
													<div
														className="col-span-2 text-right text-xs"
														style={mutedStyle}
													>
														{formatDateTime(locale, item.last_read_at, {
															year: "numeric",
															month: "2-digit",
															day: "2-digit",
															hour: "2-digit",
															minute: "2-digit",
														})}
													</div>
												</button>
											</motion.li>
										);
									})}
								</motion.ul>
							)}
							{!query.isLoading && hasMore ? (
								<div className="pt-2">
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() =>
											setPageOffset((prev) => prev + PAGE_SIZE)
										}
										disabled={query.isFetching}
									>
										{query.isFetching ? (
											<Loader2
												aria-hidden="true"
												className="h-4 w-4 animate-spin"
											/>
										) : null}
										{t("Load more")}
										<ArrowRight aria-hidden="true" className="h-4 w-4" />
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

export function ReadingHistoryPage() {
	return (
		<ProtectedRoute>
			<ReadingHistoryContent />
		</ProtectedRoute>
	);
}
