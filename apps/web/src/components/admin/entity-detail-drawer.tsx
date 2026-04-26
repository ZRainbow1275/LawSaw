"use client";

/**
 * Right-slide drawer surfacing the full record of a knowledge graph entity.
 *
 * Reads three live sources for the selected entity id:
 *   - `useKnowledgeEntity`         — canonical entity row
 *   - `useKnowledgeRelatedEntities` — graph neighbors (in/out)
 *   - `useKnowledgeEntityArticles`  — article provenance with relevance score
 *
 * Two write paths:
 *   - "合并到此实体" — pick a target entity (semantic search) and merge the
 *     current entity into it via `useKnowledgeMergeInto`.
 *   - "重新抽取" — enqueue LLM extraction backfill via
 *     `useKnowledgeRetriggerExtract` (tenant-scoped batch).
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	useKnowledgeEntity,
	useKnowledgeEntityArticles,
	useKnowledgeRelatedEntities,
	useKnowledgeSemanticSearch,
} from "@/hooks/use-knowledge";
import {
	useKnowledgeMergeInto,
	useKnowledgeRetriggerExtract,
} from "@/hooks/use-knowledge-mutations";
import { formatDateTime } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { overlayVariants } from "@/lib/motion";
import { useToast } from "@/stores/toast-store";
import { AnimatePresence, motion } from "framer-motion";
import {
	GitMerge,
	Loader2,
	RefreshCw,
	Sparkles,
	X,
} from "lucide-react";
import { useState } from "react";

const PANEL_VARIANTS = {
	hidden: { x: "100%", opacity: 0.6 },
	visible: {
		x: 0,
		opacity: 1,
		transition: { type: "spring", stiffness: 320, damping: 32 },
	},
	exit: {
		x: "100%",
		opacity: 0.6,
		transition: { duration: 0.2 },
	},
} as const;

interface EntityDetailDrawerProps {
	open: boolean;
	entityId: string | null;
	onClose: () => void;
}

export function EntityDetailDrawer({
	open,
	entityId,
	onClose,
}: EntityDetailDrawerProps) {
	const t = useT();
	const locale = useLocale();
	const { success, error } = useToast();
	const [mergeQuery, setMergeQuery] = useState("");

	const entityQuery = useKnowledgeEntity(entityId);
	const relatedQuery = useKnowledgeRelatedEntities(entityId, 12);
	const articlesQuery = useKnowledgeEntityArticles(entityId, 10);
	const mergeSearchQuery = useKnowledgeSemanticSearch(mergeQuery, 6);
	const merge = useKnowledgeMergeInto();
	const retrigger = useKnowledgeRetriggerExtract();

	const surfaceStyle = {
		backgroundColor: "var(--surface-muted-bg)",
		borderColor: "var(--surface-muted-border)",
	} as const;
	const fieldStyle = {
		backgroundColor: "var(--field-surface)",
		borderColor: "var(--field-border)",
		color: "var(--field-foreground)",
	} as const;
	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedStyle = { color: "var(--surface-muted-text)" } as const;

	const handleMergeInto = (targetId: string) => {
		if (!entityId) return;
		if (targetId === entityId) {
			error(t("Validation failed"), t("Cannot merge an entity into itself."));
			return;
		}
		merge.mutate(
			{ target_id: targetId, source_id: entityId },
			{
				onSuccess: () => {
					success(
						t("Entities merged"),
						t("Source entity has been merged into the target."),
					);
					onClose();
				},
				onError: (cause) => {
					error(
						t("Merge failed"),
						cause instanceof Error ? cause.message : t("Unknown error"),
					);
				},
			},
		);
	};

	const handleRetrigger = () => {
		retrigger.mutate(
			{ limit: 5 },
			{
				onSuccess: (data) => {
					success(
						t("Extraction enqueued"),
						`${data.articles_enqueued} ${t("articles re-queued for entity extraction.")}`,
					);
				},
				onError: (cause) => {
					error(
						t("Extraction failed"),
						cause instanceof Error ? cause.message : t("Unknown error"),
					);
				},
			},
		);
	};

	const entity = entityQuery.data;

	return (
		<AnimatePresence>
			{open ? (
				<div className="fixed inset-0 z-50 flex">
					<motion.div
						variants={overlayVariants}
						initial="hidden"
						animate="visible"
						exit="exit"
						className="absolute inset-0 bg-black/55 backdrop-blur-sm"
						onClick={onClose}
						aria-hidden="true"
					/>
					<motion.aside
						variants={PANEL_VARIANTS}
						initial="hidden"
						animate="visible"
						exit="exit"
						className="ml-auto flex h-full w-full max-w-2xl flex-col overflow-hidden border-l shadow-2xl"
						style={{
							backgroundColor: "var(--color-background)",
							borderColor: "var(--surface-muted-border)",
						}}
						role="dialog"
						aria-label={t("Entity detail")}
					>
						<header
							className="flex items-start justify-between gap-4 border-b px-6 py-4"
							style={{ borderColor: "var(--surface-muted-border)" }}
						>
							<div className="min-w-0">
								<p
									className="text-xs uppercase tracking-wide"
									style={mutedStyle}
								>
									{t("Knowledge entity")}
								</p>
								<h2
									className="mt-1 truncate text-lg font-semibold"
									style={headingStyle}
								>
									{entity?.name ?? t("Loading entity")}
								</h2>
								{entity ? (
									<div className="mt-2 flex flex-wrap gap-2">
										<Badge variant="outline">{entity.entity_type}</Badge>
										<Badge variant="secondary">
											{t("Mentions")}: {entity.mention_count}
										</Badge>
									</div>
								) : null}
							</div>
							<button
								type="button"
								onClick={onClose}
								className="flex h-9 w-9 items-center justify-center rounded-full border"
								style={fieldStyle}
								aria-label={t("Close")}
							>
								<X aria-hidden="true" className="h-4 w-4" />
							</button>
						</header>

						<div className="flex-1 overflow-y-auto px-6 py-4">
							{entityQuery.isLoading ? (
								<p className="text-sm" style={mutedStyle}>
									{t("Loading entity")}
								</p>
							) : entityQuery.isError ? (
								<p className="text-sm" style={mutedStyle}>
									{entityQuery.error instanceof Error
										? entityQuery.error.message
										: t("Unknown error")}
								</p>
							) : entity ? (
								<>
									{entity.aliases.length > 0 ? (
										<section className="space-y-2">
											<h3
												className="text-xs uppercase tracking-wide"
												style={mutedStyle}
											>
												{t("Aliases")}
											</h3>
											<div className="flex flex-wrap gap-2">
												{entity.aliases.map((alias) => (
													<Badge key={alias} variant="secondary">
														{alias}
													</Badge>
												))}
											</div>
										</section>
									) : null}

									<section className="mt-5 space-y-2">
										<h3
											className="text-xs uppercase tracking-wide"
											style={mutedStyle}
										>
											{t("Lifecycle")}
										</h3>
										<div className="grid gap-3 text-sm md:grid-cols-2" style={mutedStyle}>
											<div>
												<p
													className="text-xs uppercase tracking-wide"
													style={mutedStyle}
												>
													{t("First seen")}
												</p>
												<p className="mt-1" style={headingStyle}>
													{formatDateTime(locale, entity.first_seen, {
														year: "numeric",
														month: "2-digit",
														day: "2-digit",
													})}
												</p>
											</div>
											<div>
												<p
													className="text-xs uppercase tracking-wide"
													style={mutedStyle}
												>
													{t("Last seen")}
												</p>
												<p className="mt-1" style={headingStyle}>
													{formatDateTime(locale, entity.last_seen, {
														year: "numeric",
														month: "2-digit",
														day: "2-digit",
													})}
												</p>
											</div>
										</div>
									</section>

									<section className="mt-6 space-y-2">
										<h3
											className="text-sm font-semibold"
											style={headingStyle}
										>
											{t("Source articles")}
										</h3>
										{articlesQuery.isLoading ? (
											<p className="text-sm" style={mutedStyle}>
												{t("Loading articles")}
											</p>
										) : (articlesQuery.data?.length ?? 0) === 0 ? (
											<p className="text-sm" style={mutedStyle}>
												{t("No source articles linked yet.")}
											</p>
										) : (
											<ul className="space-y-2">
												{articlesQuery.data?.map((item) => (
													<li
														key={item.article_id}
														className="rounded-2xl border px-3 py-2"
														style={surfaceStyle}
													>
														<a
															href={`/articles/${item.article_id}`}
															className="block text-sm font-medium underline-offset-2 hover:underline"
															style={headingStyle}
														>
															{item.title}
														</a>
														<p className="mt-1 text-xs" style={mutedStyle}>
															{item.published_at
																? formatDateTime(locale, item.published_at, {
																		year: "numeric",
																		month: "2-digit",
																		day: "2-digit",
																	})
																: item.status}
															{item.relevance_score !== null
																? ` · ${t("Relevance")}: ${item.relevance_score.toFixed(3)}`
																: ""}
														</p>
													</li>
												))}
											</ul>
										)}
									</section>

									<section className="mt-6 space-y-2">
										<h3
											className="text-sm font-semibold"
											style={headingStyle}
										>
											{t("Related entities")}
										</h3>
										{relatedQuery.isLoading ? (
											<p className="text-sm" style={mutedStyle}>
												{t("Loading related entities")}
											</p>
										) : (relatedQuery.data?.length ?? 0) === 0 ? (
											<p className="text-sm" style={mutedStyle}>
												{t("No related entities found.")}
											</p>
										) : (
											<ul className="space-y-2">
												{relatedQuery.data?.map((rel) => (
													<li
														key={`${rel.entity.id}-${rel.relation_type}-${rel.direction}`}
														className="flex items-center justify-between gap-3 rounded-2xl border px-3 py-2"
														style={surfaceStyle}
													>
														<div className="min-w-0">
															<p
																className="truncate text-sm font-medium"
																style={headingStyle}
															>
																{rel.entity.name}
															</p>
															<p className="text-xs" style={mutedStyle}>
																{rel.relation_type} · {rel.direction}
															</p>
														</div>
														<Badge variant="outline">
															{t("Weight")}: {rel.weight.toFixed(2)}
														</Badge>
													</li>
												))}
											</ul>
										)}
									</section>

									<section
										className="mt-6 space-y-3 rounded-2xl border p-4"
										style={surfaceStyle}
									>
										<div className="flex items-center justify-between gap-3">
											<h3
												className="text-sm font-semibold"
												style={headingStyle}
											>
												{t("Merge into another entity")}
											</h3>
											<GitMerge
												aria-hidden="true"
												className="h-4 w-4"
												style={{ color: "var(--color-primary-500)" }}
											/>
										</div>
										<p className="text-xs" style={mutedStyle}>
											{t(
												"Search for the canonical entity, then merge this record into it.",
											)}
										</p>
										<Input
											value={mergeQuery}
											onChange={(event) => setMergeQuery(event.target.value)}
											placeholder={t("Search entities by name or alias")}
											style={fieldStyle}
										/>
										{mergeQuery.trim().length === 0 ? null : mergeSearchQuery.isLoading ? (
											<p className="text-sm" style={mutedStyle}>
												{t("Searching")}
											</p>
										) : (mergeSearchQuery.data?.length ?? 0) === 0 ? (
											<p className="text-sm" style={mutedStyle}>
												{t("No matches")}
											</p>
										) : (
											<ul className="space-y-2">
												{mergeSearchQuery.data
													?.filter((item) => item.id !== entityId)
													.map((item) => (
														<li
															key={item.id}
															className="flex items-center justify-between gap-3 rounded-2xl border px-3 py-2"
															style={{
																backgroundColor: "var(--field-surface)",
																borderColor: "var(--field-border)",
															}}
														>
															<div className="min-w-0">
																<p
																	className="truncate text-sm font-medium"
																	style={headingStyle}
																>
																	{item.name}
																</p>
																<p className="text-xs" style={mutedStyle}>
																	{item.entity_type} · {t("Similarity")}:{" "}
																	{(item.similarity * 100).toFixed(1)}%
																</p>
															</div>
															<Button
																type="button"
																size="sm"
																variant="outline"
																onClick={() => handleMergeInto(item.id)}
																disabled={merge.isPending}
															>
																{merge.isPending ? (
																	<Loader2
																		aria-hidden="true"
																		className="h-4 w-4 animate-spin"
																	/>
																) : (
																	<GitMerge aria-hidden="true" className="h-4 w-4" />
																)}
																{t("Merge")}
															</Button>
														</li>
													))}
											</ul>
										)}
									</section>

									<section
										className="mt-6 space-y-3 rounded-2xl border p-4"
										style={surfaceStyle}
									>
										<div className="flex items-center justify-between gap-3">
											<h3
												className="text-sm font-semibold"
												style={headingStyle}
											>
												{t("Re-extract entities")}
											</h3>
											<Sparkles
												aria-hidden="true"
												className="h-4 w-4"
												style={{ color: "var(--color-primary-500)" }}
											/>
										</div>
										<p className="text-xs" style={mutedStyle}>
											{t(
												"Re-runs the LLM entity extractor on the most recent unprocessed articles in this tenant.",
											)}
										</p>
										<div className="flex justify-end">
											<Button
												type="button"
												size="sm"
												onClick={handleRetrigger}
												disabled={retrigger.isPending}
											>
												{retrigger.isPending ? (
													<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
												) : (
													<RefreshCw aria-hidden="true" className="h-4 w-4" />
												)}
												{t("Re-extract")}
											</Button>
										</div>
									</section>
								</>
							) : null}
						</div>
					</motion.aside>
				</div>
			) : null}
		</AnimatePresence>
	);
}
