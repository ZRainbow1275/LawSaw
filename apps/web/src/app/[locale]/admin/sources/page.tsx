"use client";

/**
 * /settings/admin/sources — tenant ingestion-source management.
 *
 * Reads `GET /api/v1/sources` for the roster and applies search +
 * status / source_type filters client-side because the backend list endpoint
 * does not yet expose those query params.
 *
 * Top KPI strip surfaces the four canonical numbers admins watch:
 *   - Active sources (from /sources/stats)
 *   - Sources with errors (from /sources/stats)
 *   - Total articles fetched (rolled up across rows)
 *   - Average fetch duration (rolled up across rows)
 *
 * Row click opens `<SourceDetailDrawer>` (4 tabs: overview / runs / articles
 * / actions). Top-right "New source" surfaces `<SourceFormModal>` for create.
 *
 * The backend has no PATCH update or per-source run history yet, so:
 *   - Editing flows are not exposed (only create + pause/resume/trigger).
 *   - Run history and per-source article preview tabs render placeholders.
 */

import { SourceDetailDrawer } from "@/components/admin/source-detail-drawer";
import { useAdminDeepLink } from "@/hooks/use-admin-deep-link";
import { SourceFormModal } from "@/components/admin/source-form-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
	useDeleteSource,
	useRestoreSource,
	useSource,
	useSourceStats,
	useSources,
	useTriggerFetch,
} from "@/hooks/use-sources";
import type { Source } from "@/lib/api/types";
import { formatDateTime, formatTimeAgo } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { useToast } from "@/stores/toast-store";
import { motion } from "framer-motion";
import {
	Activity,
	AlertCircle,
	CheckCircle2,
	Clock,
	Filter,
	Globe,
	Loader2,
	PauseCircle,
	PlayCircle,
	Plus,
	RefreshCw,
	Rss,
	Search,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 50;

type StatusFilter = "all" | "active" | "paused" | "error";
type TypeFilter = "all" | "rss" | "spider";

const STATUS_FILTERS: ReadonlyArray<{
	value: StatusFilter;
	labelKey: string;
}> = [
	{ value: "all", labelKey: "All status" },
	{ value: "active", labelKey: "Active" },
	{ value: "paused", labelKey: "Paused" },
	{ value: "error", labelKey: "Error" },
];

const TYPE_FILTERS: ReadonlyArray<{
	value: TypeFilter;
	labelKey: string;
}> = [
	{ value: "all", labelKey: "All types" },
	{ value: "rss", labelKey: "RSS feed" },
	{ value: "spider", labelKey: "Web crawler" },
];

const listVariants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: { staggerChildren: 0.04, delayChildren: 0.06 },
	},
} as const;

const rowVariants = {
	hidden: { opacity: 0, y: 6 },
	visible: { opacity: 1, y: 0, transition: { duration: 0.18 } },
} as const;

function statusOf(source: Source): "active" | "paused" | "error" {
	if (!source.is_active) return "paused";
	if (source.last_error) return "error";
	return "active";
}

export default function AdminSourcesPage() {
	const t = useT();
	const locale = useLocale();
	const { success, error } = useToast();
	const { searchParams, clearSearchParams } = useAdminDeepLink();
	// Server-side admin guard at [locale]/admin/layout.tsx — see users/page.tsx.
	const isAdmin = true;

	const [page, setPage] = useState(0);
	const [searchQuery, setSearchQuery] = useState("");
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
	const [drawerSource, setDrawerSource] = useState<Source | null>(null);
	const [formOpen, setFormOpen] = useState(false);
	const sourceIdParam = searchParams.get("sourceId");

	const sourcesQuery = useSources({
		limit: PAGE_SIZE,
		offset: page * PAGE_SIZE,
	});
	const deepLinkedSourceQuery = useSource(sourceIdParam ?? "");
	const statsQuery = useSourceStats({ enabled: isAdmin });
	const triggerFetch = useTriggerFetch();
	const deleteSource = useDeleteSource();
	const restoreSource = useRestoreSource();

	const allRows = sourcesQuery.data?.data ?? [];
	const total = sourcesQuery.data?.total ?? 0;

	const deepLinkedSource = useMemo(() => {
		if (!sourceIdParam) return null;
		return (
			allRows.find((row) => row.id === sourceIdParam) ??
			deepLinkedSourceQuery.data ??
			null
		);
	}, [allRows, deepLinkedSourceQuery.data, sourceIdParam]);

	useEffect(() => {
		if (!sourceIdParam || !deepLinkedSource) return;
		setSearchQuery("");
		setStatusFilter("all");
		setTypeFilter("all");
		setDrawerSource(deepLinkedSource);
	}, [deepLinkedSource, sourceIdParam]);

	const closeSourceDrawer = () => {
		setDrawerSource(null);
		clearSearchParams(["sourceId"]);
	};

	const filteredRows = useMemo(() => {
		const trimmed = searchQuery.trim().toLowerCase();
		return allRows.filter((row) => {
			if (trimmed.length > 0) {
				const haystack = `${row.name} ${row.url}`.toLowerCase();
				if (!haystack.includes(trimmed)) return false;
			}
			if (statusFilter !== "all" && statusOf(row) !== statusFilter) {
				return false;
			}
			if (typeFilter !== "all" && row.source_type !== typeFilter) {
				return false;
			}
			return true;
		});
	}, [allRows, searchQuery, statusFilter, typeFilter]);

	const totalArticlesRolled = useMemo(
		() =>
			allRows.reduce((acc, row) => acc + (row.total_articles_fetched ?? 0), 0),
		[allRows],
	);
	const avgDurationMs = useMemo(() => {
		const samples = allRows
			.map((row) => row.avg_fetch_duration_ms)
			.filter((value): value is number => typeof value === "number");
		if (samples.length === 0) return null;
		const sum = samples.reduce((acc, value) => acc + value, 0);
		return Math.round(sum / samples.length);
	}, [allRows]);

	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;
	const surfaceStyle = {
		borderColor: "color-mix(in srgb, var(--color-border) 78%, transparent)",
		backgroundColor: "var(--color-background)",
	} as const;

	const handleTriggerFetch = (source: Source) => {
		triggerFetch.mutate(source.id, {
			onSuccess: () => {
				success(
					t("Fetch triggered"),
					t("The worker has queued a fresh ingest run."),
				);
			},
			onError: (cause) => {
				error(
					t("Fetch failed"),
					cause instanceof Error ? cause.message : t("Unknown error"),
				);
			},
		});
	};

	const handleTogglePaused = (source: Source) => {
		const fn = source.is_active ? deleteSource : restoreSource;
		fn.mutate(source.id, {
			onSuccess: () => {
				success(
					t("Saved successfully"),
					source.is_active
						? t("Source paused. Worker will skip it on next tick.")
						: t("Source resumed. Worker will pick it up on next tick."),
				);
			},
			onError: (cause) => {
				error(
					t("Save failed"),
					cause instanceof Error ? cause.message : t("Unknown error"),
				);
			},
		});
	};

	return (
		<>
			<div className="space-y-6">
				<Card>
					<CardHeader>
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div>
								<CardTitle
									className="flex items-center gap-2 text-3xl font-bold tracking-tight"
									style={headingStyle}
								>
									<Globe
										aria-hidden="true"
										className="h-7 w-7"
										style={{ color: "var(--color-primary-500)" }}
									/>
									{t("Source management")}
								</CardTitle>
								<p className="mt-1 text-sm" style={mutedTextStyle}>
									{t(
										"Configure RSS and web-crawler sources, monitor health, and trigger manual ingest runs.",
									)}
								</p>
							</div>
							{isAdmin ? (
								<Button type="button" onClick={() => setFormOpen(true)}>
									<Plus aria-hidden="true" className="h-4 w-4" />
									{t("New source")}
								</Button>
							) : null}
						</div>
					</CardHeader>
				</Card>

				{!isAdmin ? (
					<EmptyState
						title={t("Access restricted")}
						description={t(
							"You need an administrative role to access this workspace.",
						)}
					/>
				) : (
					<>
						<KpiStrip
							activeCount={statsQuery.data?.active_count ?? 0}
							errorCount={statsQuery.data?.error_count ?? 0}
							totalArticles={totalArticlesRolled}
							avgDurationMs={avgDurationMs}
							pending={statsQuery.isLoading}
							t={t}
						/>

						<Card>
							<CardHeader>
								<div className="flex flex-wrap items-center justify-between gap-3">
									<CardTitle className="flex items-center gap-2">
										<Activity aria-hidden="true" className="h-5 w-5" />
										{t("Sources")}
										<Badge variant="secondary">{total}</Badge>
									</CardTitle>
									<div className="flex flex-wrap items-center gap-2">
										<div className="relative">
											<Search
												aria-hidden="true"
												className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
												style={mutedTextStyle}
											/>
											<Input
												value={searchQuery}
												onChange={(event) => setSearchQuery(event.target.value)}
												placeholder={t("Search name or URL")}
												className="pl-9"
												data-testid="admin-sources-search"
											/>
										</div>
										<div className="flex flex-wrap items-center gap-1">
											<Filter
												aria-hidden="true"
												className="h-4 w-4"
												style={mutedTextStyle}
											/>
											{STATUS_FILTERS.map((option) => (
												<button
													key={option.value}
													type="button"
													onClick={() => setStatusFilter(option.value)}
													className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
													style={
														statusFilter === option.value
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
													aria-pressed={statusFilter === option.value}
												>
													{t(option.labelKey)}
												</button>
											))}
										</div>
										<div className="flex flex-wrap items-center gap-1">
											{TYPE_FILTERS.map((option) => (
												<button
													key={option.value}
													type="button"
													onClick={() => setTypeFilter(option.value)}
													className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
													style={
														typeFilter === option.value
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
													aria-pressed={typeFilter === option.value}
												>
													{t(option.labelKey)}
												</button>
											))}
										</div>
									</div>
								</div>
							</CardHeader>
							<CardContent className="space-y-3">
								{sourcesQuery.isLoading ? (
									<div
										className="flex items-center gap-2 text-sm"
										style={mutedTextStyle}
									>
										<Loader2
											aria-hidden="true"
											className="h-4 w-4 animate-spin"
										/>
										{t("Loading sources")}
									</div>
								) : sourcesQuery.isError ? (
									<EmptyState
										variant="error"
										title={t("Failed to load sources")}
										description={
											sourcesQuery.error instanceof Error
												? sourcesQuery.error.message
												: t("Unknown error")
										}
										action={{
											label: t("Retry"),
											onClick: () => sourcesQuery.refetch(),
										}}
									/>
								) : filteredRows.length === 0 ? (
									<EmptyState
										variant="search"
										title={t("No sources match your filters")}
										description={t(
											"Try clearing the search box or selecting a different status / type.",
										)}
									/>
								) : (
									<motion.ul
										className="space-y-2"
										variants={listVariants}
										initial="hidden"
										animate="visible"
										data-testid="admin-sources-list"
									>
										{filteredRows.map((source) => (
											<motion.li key={source.id} variants={rowVariants}>
												<div
													className="rounded-2xl border px-4 py-3"
													style={surfaceStyle}
													data-testid="admin-sources-row"
												>
													<div className="flex flex-wrap items-start justify-between gap-3">
														<button
															type="button"
															onClick={() => setDrawerSource(source)}
															className="min-w-0 flex-1 text-left"
														>
															<div className="flex flex-wrap items-center gap-2">
																<p
																	className="truncate text-sm font-semibold"
																	style={headingStyle}
																>
																	{source.name}
																</p>
																<Badge variant="outline" className="gap-1">
																	{source.source_type === "rss" ? (
																		<Rss
																			aria-hidden="true"
																			className="h-3 w-3"
																		/>
																	) : (
																		<Globe
																			aria-hidden="true"
																			className="h-3 w-3"
																		/>
																	)}
																	{source.source_type}
																</Badge>
																{source.is_active ? (
																	<Badge variant="success">
																		<CheckCircle2
																			aria-hidden="true"
																			className="mr-1 h-3 w-3"
																		/>
																		{t("Active")}
																	</Badge>
																) : (
																	<Badge variant="secondary">
																		<PauseCircle
																			aria-hidden="true"
																			className="mr-1 h-3 w-3"
																		/>
																		{t("Paused")}
																	</Badge>
																)}
																{source.last_error ? (
																	<Badge variant="destructive">
																		<AlertCircle
																			aria-hidden="true"
																			className="mr-1 h-3 w-3"
																		/>
																		{t("Error")}
																	</Badge>
																) : null}
															</div>
															<p
																className="mt-1 truncate text-xs"
																style={mutedTextStyle}
															>
																{source.url}
															</p>
															<p
																className="mt-1 flex flex-wrap items-center gap-3 text-xs"
																style={mutedTextStyle}
															>
																<span className="flex items-center gap-1">
																	<Clock
																		aria-hidden="true"
																		className="h-3 w-3"
																	/>
																	{source.last_fetch
																		? `${t("Last fetch")}: ${formatTimeAgo(locale, source.last_fetch)}`
																		: t("Never fetched")}
																</span>
																{source.schedule ? (
																	<span>
																		{t("Schedule")}: {source.schedule}
																	</span>
																) : null}
																<span>
																	{t("Articles fetched")}:{" "}
																	{source.total_articles_fetched}
																</span>
															</p>
														</button>
														<div className="flex flex-wrap items-center gap-2">
															<Button
																type="button"
																size="sm"
																variant="outline"
																onClick={() => handleTriggerFetch(source)}
																disabled={
																	triggerFetch.isPending || !source.is_active
																}
															>
																<RefreshCw
																	aria-hidden="true"
																	className="h-4 w-4"
																/>
																{t("Fetch")}
															</Button>
															<Button
																type="button"
																size="sm"
																variant="outline"
																onClick={() => handleTogglePaused(source)}
																disabled={
																	deleteSource.isPending ||
																	restoreSource.isPending
																}
															>
																{source.is_active ? (
																	<PauseCircle
																		aria-hidden="true"
																		className="h-4 w-4"
																	/>
																) : (
																	<PlayCircle
																		aria-hidden="true"
																		className="h-4 w-4"
																	/>
																)}
																{source.is_active ? t("Pause") : t("Resume")}
															</Button>
														</div>
													</div>
													{source.last_error ? (
														<p
															className="mt-2 text-xs"
															style={{
																color: "var(--color-destructive, #b91c1c)",
															}}
														>
															{t("Error")}: {source.last_error}
														</p>
													) : null}
												</div>
											</motion.li>
										))}
									</motion.ul>
								)}

								{total > PAGE_SIZE ? (
									<div
										className="flex items-center justify-between pt-2 text-xs"
										style={mutedTextStyle}
									>
										<p>
											{t("Page")} {page + 1} / {totalPages}
										</p>
										<div className="flex gap-2">
											<Button
												type="button"
												size="sm"
												variant="outline"
												onClick={() =>
													setPage((value) => Math.max(0, value - 1))
												}
												disabled={page === 0 || sourcesQuery.isFetching}
											>
												{t("Previous")}
											</Button>
											<Button
												type="button"
												size="sm"
												variant="outline"
												onClick={() =>
													setPage((value) =>
														Math.min(totalPages - 1, value + 1),
													)
												}
												disabled={
													page >= totalPages - 1 || sourcesQuery.isFetching
												}
											>
												{t("Next")}
											</Button>
										</div>
									</div>
								) : null}
							</CardContent>
						</Card>
					</>
				)}

				<p className="text-xs" style={mutedTextStyle}>
					{t("Updated")}:{" "}
					{statsQuery.dataUpdatedAt
						? formatDateTime(
								locale,
								new Date(statsQuery.dataUpdatedAt).toISOString(),
								{
									hour: "2-digit",
									minute: "2-digit",
									second: "2-digit",
								},
							)
						: "—"}
				</p>
			</div>

			<SourceDetailDrawer
				open={drawerSource !== null}
				source={drawerSource}
				onClose={closeSourceDrawer}
			/>

			<SourceFormModal isOpen={formOpen} onClose={() => setFormOpen(false)} />
		</>
	);
}

interface KpiStripProps {
	activeCount: number;
	errorCount: number;
	totalArticles: number;
	avgDurationMs: number | null;
	pending: boolean;
	t: ReturnType<typeof useT>;
}

function KpiStrip({
	activeCount,
	errorCount,
	totalArticles,
	avgDurationMs,
	pending,
	t,
}: KpiStripProps) {
	const tiles: Array<{
		key: string;
		label: string;
		value: string;
		caption: string;
		icon: React.ReactNode;
		gradient: string;
	}> = [
		{
			key: "active",
			label: t("Active sources"),
			value: pending ? "—" : String(activeCount),
			caption: t("Polled by the worker on schedule."),
			icon: <CheckCircle2 aria-hidden="true" className="h-5 w-5" />,
			gradient: "var(--surface-hero-emerald-gradient)",
		},
		{
			key: "errors",
			label: t("Sources with errors"),
			value: pending ? "—" : String(errorCount),
			caption: t("Last fetch returned an error."),
			icon: <AlertCircle aria-hidden="true" className="h-5 w-5" />,
			gradient: "var(--surface-hero-rose-gradient)",
		},
		{
			key: "articles",
			label: t("Articles fetched"),
			value: pending ? "—" : String(totalArticles),
			caption: t("Cumulative across visible sources."),
			icon: <Activity aria-hidden="true" className="h-5 w-5" />,
			gradient: "var(--surface-hero-primary-gradient)",
		},
		{
			key: "duration",
			label: t("Avg fetch duration"),
			value: avgDurationMs == null ? "—" : `${avgDurationMs}ms`,
			caption: t("Average across visible sources."),
			icon: <Clock aria-hidden="true" className="h-5 w-5" />,
			gradient: "var(--surface-hero-amber-gradient)",
		},
	];
	return (
		<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
			{tiles.map((tile) => (
				<div
					key={tile.key}
					className="rounded-2xl border p-4"
					style={{
						background: tile.gradient,
						borderColor: "var(--surface-muted-border)",
					}}
				>
					<div className="flex items-center gap-3">
						<div
							className="flex h-10 w-10 items-center justify-center rounded-xl"
							style={{
								backgroundColor: "rgba(255,255,255,0.7)",
								color: "var(--color-primary-700, #1d4ed8)",
							}}
						>
							{tile.icon}
						</div>
						<div className="min-w-0">
							<p
								className="text-xs uppercase tracking-wide"
								style={{ color: "var(--surface-muted-text)" }}
							>
								{tile.label}
							</p>
							<p
								className="mt-1 text-2xl font-bold tabular-nums"
								style={{ color: "var(--color-foreground)" }}
							>
								{tile.value}
							</p>
							<p
								className="mt-1 text-xs"
								style={{ color: "var(--surface-muted-text)" }}
							>
								{tile.caption}
							</p>
						</div>
					</div>
				</div>
			))}
		</div>
	);
}
