"use client";

/**
 * EntityInspectorPanel — `prototype/app.html:1524-1543` right inspector.
 *
 * Renders entity facts and the related-entity quick navigation list. When
 * no entity is selected we show the prototype's empty-state with a
 * sparkle hint guiding the user back to the list/canvas.
 */

import {
	useKnowledgeEntity,
	useKnowledgeEntityArticles,
	useKnowledgeRelatedEntities,
} from "@/hooks/use-knowledge";
import type { RoleTier } from "@/lib/authz";
import { withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { ExternalLink, FileText, Info, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { getEntityTypeStyle } from "./entity-list-panel";

interface EntityInspectorPanelProps {
	selectedEntityId: string | null;
	onSelectEntity: (id: string) => void;
	canSeeArticles?: boolean;
	currentTier?: RoleTier;
}

export function EntityInspectorPanel({
	selectedEntityId,
	onSelectEntity,
	canSeeArticles = true,
}: EntityInspectorPanelProps) {
	const t = useT();
	const locale = useLocale();
	const entityQuery = useKnowledgeEntity(selectedEntityId);
	const relatedQuery = useKnowledgeRelatedEntities(selectedEntityId, 12);
	const articlesQuery = useKnowledgeEntityArticles(selectedEntityId, 6);

	const entity = entityQuery.data;
	const related = relatedQuery.data ?? [];
	const articles = articlesQuery.data ?? [];

	return (
		<aside
			className="flex h-full min-h-0 flex-col rounded-2xl border bg-white p-5 shadow-sm"
			style={{ borderColor: "var(--surface-card-border)" }}
			data-testid="kg-inspector-panel"
		>
			<div className="mb-3 flex items-center gap-2">
				<Info
					aria-hidden="true"
					className="h-4 w-4"
					style={{ color: "var(--color-primary-500)" }}
				/>
				<div
					className="text-[13px] font-bold"
					style={{ color: "var(--surface-card-foreground)" }}
				>
					{t("Entity details")}
				</div>
			</div>

			<div className="-mx-1 min-h-0 flex-1 overflow-auto px-1">
				{!selectedEntityId ? (
					<div
						className="rounded-xl border-dashed border p-5 text-center"
						style={{
							borderColor: "var(--surface-card-border-strong)",
							color: "var(--surface-card-faint-fg)",
						}}
					>
						<Sparkles
							aria-hidden="true"
							className="mx-auto mb-2 h-6 w-6"
							style={{ color: "var(--color-primary-500)" }}
						/>
						<div className="text-xs leading-5">
							{t(
								"Select an entity from the list or canvas to view its details.",
							)}
						</div>
					</div>
				) : entityQuery.isLoading ? (
					<div className="flex items-center justify-center py-8">
						<Loader2
							aria-hidden="true"
							className="h-5 w-5 animate-spin"
							style={{ color: "var(--surface-card-faint-fg)" }}
						/>
					</div>
				) : entityQuery.isError || !entity ? (
					<div
						className="rounded-xl border p-3 text-xs"
						style={{
							borderColor: "color-mix(in srgb, #c62828 30%, transparent)",
							backgroundColor: "color-mix(in srgb, #c62828 6%, transparent)",
							color: "#c62828",
						}}
					>
						{t("Failed to load entity. Please try again later.")}
					</div>
				) : (
					<div className="space-y-4">
						<InspectorRow
							label={t("Name")}
							value={
								<span
									className="text-sm font-semibold"
									style={{ color: "var(--surface-card-foreground)" }}
								>
									{entity.name}
								</span>
							}
						/>
						<InspectorRow
							label={t("Type")}
							value={(() => {
								const style = getEntityTypeStyle(entity.entity_type);
								return (
									<span
										className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold"
										style={{ backgroundColor: style.bg, color: style.fg }}
									>
										{t(style.labelKey)}
									</span>
								);
							})()}
						/>
						<InspectorRow
							label={t("Mentions")}
							value={
								<span
									className="text-sm font-semibold tabular-nums"
									style={{ color: "var(--surface-card-foreground)" }}
								>
									{entity.mention_count}
								</span>
							}
						/>
						{entity.aliases.length > 0 ? (
							<InspectorRow
								label={t("Aliases")}
								value={
									<div className="flex flex-wrap gap-1">
										{entity.aliases.map((alias) => (
											<span
												key={alias}
												className="rounded-md border px-1.5 py-0.5 text-[10px]"
												style={{
													borderColor: "var(--surface-card-border-strong)",
													color: "var(--surface-card-muted-fg)",
												}}
											>
												{alias}
											</span>
										))}
									</div>
								}
							/>
						) : null}

						<div>
							<div
								className="mb-2 text-[10px] font-semibold uppercase tracking-wider"
								style={{ color: "var(--surface-card-faint-fg)" }}
							>
								{t("Related entities")}
							</div>
							{relatedQuery.isLoading ? (
								<div className="flex items-center text-xs">
									<Loader2
										aria-hidden="true"
										className="mr-1.5 h-3 w-3 animate-spin"
										style={{ color: "var(--surface-card-faint-fg)" }}
									/>
									{t("Loading...")}
								</div>
							) : related.length === 0 ? (
								<div
									className="rounded-md border-dashed border px-2 py-3 text-center text-[11px]"
									style={{
										borderColor: "var(--surface-card-border-strong)",
										color: "var(--surface-card-faint-fg)",
									}}
								>
									{t("No related entities yet.")}
								</div>
							) : (
								<ul className="space-y-1">
									{related.map((rel) => {
										const style = getEntityTypeStyle(rel.entity.entity_type);
										return (
											<li
												key={`${rel.entity.id}-${rel.relation_type}-${rel.direction}`}
											>
												<button
													type="button"
													onClick={() => onSelectEntity(rel.entity.id)}
													className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-neutral-50"
												>
													<span
														className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold"
														style={{
															backgroundColor: style.bg,
															color: style.fg,
														}}
													>
														{t(style.labelKey)}
													</span>
													<span
														className="truncate text-xs"
														style={{ color: "var(--surface-card-foreground)" }}
													>
														{rel.entity.name}
													</span>
												</button>
											</li>
										);
									})}
								</ul>
							)}
						</div>

						{canSeeArticles ? (
							<div>
								<div
									className="mb-2 text-[10px] font-semibold uppercase tracking-wider"
									style={{ color: "var(--surface-card-faint-fg)" }}
								>
									{t("Related articles")}
								</div>
								{articlesQuery.isLoading ? (
									<div className="flex items-center text-xs">
										<Loader2
											aria-hidden="true"
											className="mr-1.5 h-3 w-3 animate-spin"
										/>
										{t("Loading...")}
									</div>
								) : articles.length === 0 ? (
									<div
										className="rounded-md border-dashed border px-2 py-3 text-center text-[11px]"
										style={{
											borderColor: "var(--surface-card-border-strong)",
											color: "var(--surface-card-faint-fg)",
										}}
									>
										{t("No related articles yet.")}
									</div>
								) : (
									<ul className="space-y-1">
										{articles.map((article) => (
											<li key={article.article_id}>
												<Link
													href={withLocalePath(
														locale,
														`/articles/${article.article_id}`,
													)}
													className="flex items-start gap-2 rounded-md px-2 py-1.5 text-xs transition hover:bg-neutral-50"
												>
													<FileText
														aria-hidden="true"
														className="mt-0.5 h-3 w-3 shrink-0"
														style={{ color: "var(--surface-card-faint-fg)" }}
													/>
													<span
														className="line-clamp-2 flex-1"
														style={{ color: "var(--surface-card-foreground)" }}
													>
														{article.title}
													</span>
													<ExternalLink
														aria-hidden="true"
														className="mt-0.5 h-3 w-3 shrink-0"
														style={{ color: "var(--surface-card-faint-fg)" }}
													/>
												</Link>
											</li>
										))}
									</ul>
								)}
							</div>
						) : null}
					</div>
				)}
			</div>
		</aside>
	);
}

function InspectorRow({
	label,
	value,
}: {
	label: string;
	value: React.ReactNode;
}) {
	return (
		<div>
			<div
				className="mb-1 text-[10px] font-semibold uppercase tracking-wider"
				style={{ color: "var(--surface-card-faint-fg)" }}
			>
				{label}
			</div>
			<div>{value}</div>
		</div>
	);
}
