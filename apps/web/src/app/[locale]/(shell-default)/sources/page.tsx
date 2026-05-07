"use client";

import { ReactionToggle } from "@/components/reactions/reaction-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { useReactionSummariesBatch } from "@/hooks/use-reaction";
import {
	useCreateSource,
	useSourceStats,
	useSources,
	useTriggerFetch,
} from "@/hooks/use-sources";
import type { Source } from "@/lib/api/types";
import { type Locale, formatTimeAgo, t as translate } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { useAuthStore } from "@/stores/auth-store";
import { useToast } from "@/stores/toast-store";
import {
	AlertCircle,
	CheckCircle2,
	Clock,
	Database,
	Globe,
	Plus,
	RefreshCw,
	Rss,
	X,
} from "lucide-react";
import { useState } from "react";

const sourceTypeIcons: Record<Source["source_type"], React.ReactNode> = {
	rss: <Rss aria-hidden="true" className="h-4 w-4" />,
	spider: <Globe aria-hidden="true" className="h-4 w-4" />,
	api: <Database aria-hidden="true" className="h-4 w-4" />,
};

const sourceTypeLabels: Record<Source["source_type"], string> = {
	rss: "RSS feed",
	spider: "Web crawler",
	api: "API endpoint",
};

function formatTime(locale: Locale, dateStr: string | null): string {
	if (!dateStr) return translate(locale, "Never");
	return formatTimeAgo(locale, dateStr);
}

export default function SourcesPage() {
	const locale = useLocale();
	const t = useT();
	const [page, setPage] = useState(0);
	const limit = 50;
	const offset = page * limit;

	const sourcesQuery = useSources({ limit, offset });
	const sourceStatsQuery = useSourceStats();
	const triggerFetch = useTriggerFetch();
	const createSource = useCreateSource();
	const { permissions } = useAuthStore();
	const isAdmin = permissions.includes("*");
	const { success: toastSuccess, error: toastError } = useToast();
	const [showAddForm, setShowAddForm] = useState(false);
	const [newSource, setNewSource] = useState({
		name: "",
		url: "",
		source_type: "rss" as "rss" | "spider",
	});
	const [spiderConfig, setSpiderConfig] = useState({
		list_selector: "",
		title_selector: "",
		link_selector: "",
		content_selector: "",
		date_selector: "",
		delay_ms: "",
	});

	const sources = sourcesQuery.data?.data ?? [];
	const total = sourcesQuery.data?.total ?? 0;

	useReactionSummariesBatch(
		"source",
		sources.map((s) => s.id),
		{ enabled: sources.length > 0 },
	);
	const canPrev = page > 0;
	const canNext = offset + limit < total;

	const handleTriggerFetch = (id: string) => {
		if (!isAdmin) return;
		triggerFetch.mutate(id, {
			onSuccess: () => {
				toastSuccess(t("Fetch triggered"), t("Ingestion job queued"));
			},
			onError: (cause) => {
				const message =
					cause instanceof Error ? cause.message : t("Failed to trigger fetch");
				toastError(t("Failed to trigger fetch"), message);
			},
		});
	};

	const handleAddSource = (e: React.FormEvent) => {
		e.preventDefault();
		if (!isAdmin) {
			toastError(t("Permission denied"), t("Only admins can add sources"));
			return;
		}
		if (!newSource.name || !newSource.url) return;

		const name = newSource.name.trim();
		const url = newSource.url.trim();
		if (!name || !url) return;

		let config: Record<string, unknown> = {};
		if (newSource.source_type === "spider") {
			const list_selector = spiderConfig.list_selector.trim();
			const title_selector = spiderConfig.title_selector.trim();
			const link_selector = spiderConfig.link_selector.trim();

			if (!list_selector || !title_selector || !link_selector) {
				toastError(
					t("Crawler config is incomplete"),
					t("Please fill list_selector, title_selector, and link_selector"),
				);
				return;
			}

			let delay_ms: number | undefined;
			if (spiderConfig.delay_ms.trim()) {
				const parsed = Number(spiderConfig.delay_ms);
				if (!Number.isFinite(parsed) || parsed < 0) {
					toastError(
						t("Crawler config is invalid"),
						t("delay_ms must be a non-negative number"),
					);
					return;
				}
				delay_ms = parsed;
			}

			config = {
				list_selector,
				title_selector,
				link_selector,
				content_selector: spiderConfig.content_selector.trim() || undefined,
				date_selector: spiderConfig.date_selector.trim() || undefined,
				delay_ms,
			};
		}

		createSource.mutate(
			{ name, url, source_type: newSource.source_type, config },
			{
				onSuccess: () => {
					setShowAddForm(false);
					setNewSource({ name: "", url: "", source_type: "rss" });
					setSpiderConfig({
						list_selector: "",
						title_selector: "",
						link_selector: "",
						content_selector: "",
						date_selector: "",
						delay_ms: "",
					});
					toastSuccess(t("Created"), t("Source created"));
				},
				onError: (cause) => {
					const message =
						cause instanceof Error
							? cause.message
							: t("Failed to create source");
					toastError(t("Failed to create source"), message);
				},
			},
		);
	};

	const activeCount = sourceStatsQuery.data?.active_count ?? 0;
	const errorCount = sourceStatsQuery.data?.error_count ?? 0;

	return (
		<div className="p-6">
						{/* Page Title */}
						<div className="mb-6 flex items-center justify-between">
							<div>
								<h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
									{t("Sources")}
								</h1>
								<p className="text-sm text-neutral-500 dark:text-neutral-400">
									{t("Manage and monitor ingestion sources")}
								</p>
							</div>
							<Button
								onClick={() => setShowAddForm(true)}
								disabled={!isAdmin}
								title={!isAdmin ? t("Admin permission required") : undefined}
							>
								<Plus aria-hidden="true" className="mr-2 h-4 w-4" />
								{t("Add source")}
							</Button>
						</div>

						{/* Stats */}
						<div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
							<Card>
								<CardContent className="p-4">
									<div className="flex items-center gap-3">
										<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-500/20">
											<Rss
												aria-hidden="true"
												className="h-5 w-5 text-primary-600"
											/>
										</div>
										<div>
											<p className="text-2xl font-bold">
												{sources?.length ?? 0}
											</p>
											<p className="text-sm text-neutral-500 dark:text-neutral-400">
												{t("Total sources")}
											</p>
										</div>
									</div>
								</CardContent>
							</Card>
							<Card>
								<CardContent className="p-4">
									<div className="flex items-center gap-3">
										<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-light">
											<CheckCircle2
												aria-hidden="true"
												className="h-5 w-5 text-success"
											/>
										</div>
										<div>
											<p className="text-2xl font-bold">{activeCount}</p>
											<p className="text-sm text-neutral-500 dark:text-neutral-400">
												{t("Active sources")}
											</p>
										</div>
									</div>
								</CardContent>
							</Card>
							<Card>
								<CardContent className="p-4">
									<div className="flex items-center gap-3">
										<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
											<AlertCircle
												aria-hidden="true"
												className="h-5 w-5 text-destructive"
											/>
										</div>
										<div>
											<p className="text-2xl font-bold">{errorCount}</p>
											<p className="text-sm text-neutral-500 dark:text-neutral-400">
												{t("Sources with errors")}
											</p>
										</div>
									</div>
								</CardContent>
							</Card>
						</div>

						{/* Add Source Form */}
						{showAddForm && (
							<Card className="mb-6">
								<CardHeader>
									<CardTitle className="flex items-center justify-between">
										<span>{t("Add a new source")}</span>
										<Button
											variant="ghost"
											size="icon"
											onClick={() => setShowAddForm(false)}
										>
											<X aria-hidden="true" className="h-4 w-4" />
										</Button>
									</CardTitle>
								</CardHeader>
								<CardContent>
									<form onSubmit={handleAddSource} className="space-y-4">
										<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
											<div>
												<label
													htmlFor="new-source-name"
													className="mb-1 block text-sm font-medium"
												>
													{t("Name")}
												</label>
												<Input
													id="new-source-name"
													placeholder={t("e.g., Example News")}
													value={newSource.name}
													onChange={(e) =>
														setNewSource({ ...newSource, name: e.target.value })
													}
												/>
											</div>
											<div>
												<label
													htmlFor="new-source-type"
													className="mb-1 block text-sm font-medium"
												>
													{t("Type")}
												</label>
												<select
													id="new-source-type"
													className="h-10 w-full rounded-md border border-neutral-200 px-3 dark:border-white/10 dark:bg-white/5 dark:text-neutral-100"
													value={newSource.source_type}
													onChange={(e) =>
														setNewSource({
															...newSource,
															source_type: e.target.value as "rss" | "spider",
														})
													}
												>
													<option value="rss">{t(sourceTypeLabels.rss)}</option>
													<option value="spider">
														{t(sourceTypeLabels.spider)}
													</option>
												</select>
											</div>
										</div>
										<div>
											<label
												htmlFor="new-source-url"
												className="mb-1 block text-sm font-medium"
											>
												URL
											</label>
											<Input
												id="new-source-url"
												placeholder="https://www.theguardian.com/law/rss"
												value={newSource.url}
												onChange={(e) =>
													setNewSource({ ...newSource, url: e.target.value })
												}
											/>
										</div>

										{newSource.source_type === "spider" && (
											<div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 space-y-4 dark:border-white/10 dark:bg-white/5">
												<div>
													<p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
														{t("Crawler config")}
													</p>
													<p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
														{t(
															"Required: list/title/link selectors. Optional: content/date selectors and delay (ms).",
														)}
													</p>
												</div>
												<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
													<div>
														<label
															htmlFor="spider-list-selector"
															className="mb-1 block text-sm font-medium"
														>
															list_selector{" "}
															<span className="text-red-500">*</span>
														</label>
														<Input
															id="spider-list-selector"
															placeholder="e.g., .article-list a"
															value={spiderConfig.list_selector}
															onChange={(e) =>
																setSpiderConfig({
																	...spiderConfig,
																	list_selector: e.target.value,
																})
															}
															required
														/>
													</div>
													<div>
														<label
															htmlFor="spider-title-selector"
															className="mb-1 block text-sm font-medium"
														>
															title_selector{" "}
															<span className="text-red-500">*</span>
														</label>
														<Input
															id="spider-title-selector"
															placeholder="e.g., .title"
															value={spiderConfig.title_selector}
															onChange={(e) =>
																setSpiderConfig({
																	...spiderConfig,
																	title_selector: e.target.value,
																})
															}
															required
														/>
													</div>
													<div>
														<label
															htmlFor="spider-link-selector"
															className="mb-1 block text-sm font-medium"
														>
															link_selector{" "}
															<span className="text-red-500">*</span>
														</label>
														<Input
															id="spider-link-selector"
															placeholder="e.g., a"
															value={spiderConfig.link_selector}
															onChange={(e) =>
																setSpiderConfig({
																	...spiderConfig,
																	link_selector: e.target.value,
																})
															}
															required
														/>
													</div>
												</div>
												<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
													<div>
														<label
															htmlFor="spider-content-selector"
															className="mb-1 block text-sm font-medium"
														>
															content_selector (optional)
														</label>
														<Input
															id="spider-content-selector"
															placeholder="e.g., article"
															value={spiderConfig.content_selector}
															onChange={(e) =>
																setSpiderConfig({
																	...spiderConfig,
																	content_selector: e.target.value,
																})
															}
														/>
													</div>
													<div>
														<label
															htmlFor="spider-date-selector"
															className="mb-1 block text-sm font-medium"
														>
															date_selector (optional)
														</label>
														<Input
															id="spider-date-selector"
															placeholder="e.g., time"
															value={spiderConfig.date_selector}
															onChange={(e) =>
																setSpiderConfig({
																	...spiderConfig,
																	date_selector: e.target.value,
																})
															}
														/>
													</div>
													<div>
														<label
															htmlFor="spider-delay-ms"
															className="mb-1 block text-sm font-medium"
														>
															delay_ms (optional)
														</label>
														<Input
															id="spider-delay-ms"
															type="number"
															min={0}
															placeholder="e.g., 500"
															value={spiderConfig.delay_ms}
															onChange={(e) =>
																setSpiderConfig({
																	...spiderConfig,
																	delay_ms: e.target.value,
																})
															}
														/>
													</div>
												</div>
											</div>
										)}

										<div className="flex justify-end gap-2">
											<Button
												type="button"
												variant="outline"
												onClick={() => setShowAddForm(false)}
											>
												{t("Cancel")}
											</Button>
											<Button type="submit" disabled={createSource.isPending}>
												{createSource.isPending ? t("Adding...") : t("Add")}
											</Button>
										</div>
									</form>
								</CardContent>
							</Card>
						)}

						{/* Sources List */}
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<Rss
										aria-hidden="true"
										className="h-5 w-5 text-primary-500"
									/>
									{t("Sources list")}
								</CardTitle>
							</CardHeader>
							<CardContent>
								{sourcesQuery.isLoading ? (
									<div className="animate-pulse space-y-4">
										{Array.from(
											{ length: 5 },
											(_, idx) => `source-skel-${idx}`,
										).map((key) => (
											<div
												key={key}
												className="h-20 rounded-lg bg-neutral-100 dark:bg-white/10"
											/>
										))}
									</div>
								) : sourcesQuery.isError ? (
									<ErrorState
										action={{
											label: t("Retry"),
											onClick: () => {
												void sourcesQuery.refetch();
												void sourceStatsQuery.refetch();
											},
										}}
									/>
								) : sources.length === 0 ? (
									<p className="py-12 text-center text-neutral-500 dark:text-neutral-400">
										{t("No sources yet. Click the button above to add one.")}
									</p>
								) : (
									<div className="space-y-4">
										{sources.map((source) => (
											<div
												key={source.id}
												className="group flex items-start justify-between rounded-lg border border-neutral-100 p-4 transition-all hover:border-primary-200 hover:bg-primary-50/50 dark:border-white/10 dark:hover:border-primary-400/40 dark:hover:bg-primary-500/10"
											>
												<div className="flex-1">
													<div className="mb-2 flex items-center gap-2">
														<Badge variant="outline" className="gap-1">
															{sourceTypeIcons[source.source_type]}
															{t(sourceTypeLabels[source.source_type])}
														</Badge>
														{source.is_active ? (
															<Badge variant="success">{t("Enabled")}</Badge>
														) : (
															<Badge variant="outline">{t("Disabled")}</Badge>
														)}
														{source.last_error && (
															<Badge variant="destructive">{t("Error")}</Badge>
														)}
													</div>
													<h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
														{source.name}
													</h4>
													<p className="mt-1 text-xs text-neutral-500 truncate max-w-md dark:text-neutral-400">
														{source.url}
													</p>
													<div className="mt-2 flex items-center gap-4 text-xs text-neutral-500 dark:text-neutral-400">
														<span className="flex items-center gap-1">
															<Clock aria-hidden="true" className="h-3 w-3" />
															{t("Last fetch: ")}
															{formatTime(locale, source.last_fetch)}
														</span>
														{source.schedule && (
															<span>
																{t("Schedule: {value}", {
																	value: source.schedule,
																})}
															</span>
														)}
													</div>
													{source.last_error && (
														<p className="mt-2 text-xs text-destructive">
															{t("Error: {message}", {
																message: source.last_error,
															})}
														</p>
													)}
												</div>
												<div className="flex items-center gap-2">
													<ReactionToggle
														targetType="source"
														targetId={source.id}
														initialSummary={source.reaction_summary ?? null}
														variant="inline"
														lazy
													/>
													<Button
														variant="outline"
														size="sm"
														onClick={() => handleTriggerFetch(source.id)}
														disabled={!isAdmin || triggerFetch.isPending}
														title={
															!isAdmin
																? t("Admin permission required")
																: undefined
														}
													>
														<RefreshCw
															className={`mr-1 h-3 w-3 ${
																triggerFetch.isPending ? "animate-spin" : ""
															}`}
															aria-hidden="true"
															focusable="false"
														/>
														{t("Fetch")}
													</Button>
												</div>
											</div>
										))}

										<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
											<p className="text-xs text-neutral-500 dark:text-neutral-400">
												{t("Showing {from}-{to} / {total}", {
													from: offset + 1,
													to: Math.min(offset + sources.length, total),
													total,
												})}
											</p>
											<div className="flex items-center gap-2">
												<Button
													variant="outline"
													size="sm"
													onClick={() => setPage((p) => Math.max(0, p - 1))}
													disabled={!canPrev || sourcesQuery.isLoading}
												>
													{t("Previous")}
												</Button>
												<Button
													variant="outline"
													size="sm"
													onClick={() => setPage((p) => p + 1)}
													disabled={!canNext || sourcesQuery.isLoading}
												>
													{t("Next")}
												</Button>
											</div>
										</div>
									</div>
								)}
							</CardContent>
						</Card>
		</div>
	);
}
