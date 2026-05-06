"use client";

/**
 * /[locale]/admin/knowledge/[id] — native entity detail page (P0 D1).
 *
 * Renders the entity profile, declared properties/aliases, related entities,
 * and the article references that mention it. Read-only view; edits are
 * still surfaced through the list-page entity drawer.
 */

import { AdminDetailErrorCard } from "@/components/admin/detail-error-card";
import { DetailLayout, MetaList } from "@/components/admin/detail-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	useKnowledgeEntity,
	useKnowledgeEntityArticles,
	useKnowledgeRelatedEntities,
} from "@/hooks/use-knowledge";
import { formatDateTime, withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import {
	ArrowLeft,
	BookOpen,
	Brain,
	Hash,
	Loader2,
	Network,
	Sparkles,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";

export default function AdminKnowledgeEntityDetailPage() {
	const t = useT();
	const locale = useLocale();
	const router = useRouter();
	const params = useParams<{ id: string }>();
	const entityId = typeof params?.id === "string" ? params.id : "";

	const entityQuery = useKnowledgeEntity(entityId || null);
	const relatedQuery = useKnowledgeRelatedEntities(entityId || null, 12);
	const articlesQuery = useKnowledgeEntityArticles(entityId || null, 20);

	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;
	const surfaceStyle = {
		borderColor: "color-mix(in srgb, var(--color-border) 78%, transparent)",
		backgroundColor: "var(--color-background)",
	} as const;

	const handleBack = () =>
		router.push(withLocalePath(locale, "/admin/knowledge"));

	if (!entityId) return null;

	const entity = entityQuery.data;
	const related = relatedQuery.data ?? [];
	const articles = articlesQuery.data ?? [];

	const dateOptions = {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	} as const;

	const header = (
		<Card>
			<CardHeader>
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<CardTitle
							className="flex items-center gap-2 text-3xl font-bold tracking-tight"
							style={headingStyle}
						>
							<Brain
								aria-hidden="true"
								className="h-7 w-7"
								style={{ color: "var(--color-primary-500)" }}
							/>
							{t("Knowledge entity")}
						</CardTitle>
						<p className="mt-1 text-sm" style={mutedTextStyle}>
							{t("Inspect entity properties, related entities, and article references.")}
						</p>
					</div>
					<Button type="button" variant="outline" onClick={handleBack}>
						<ArrowLeft aria-hidden="true" className="h-4 w-4" />
						{t("Back to knowledge")}
					</Button>
				</div>
			</CardHeader>
		</Card>
	);

	if (entityQuery.isLoading) {
		return (
			<DetailLayout
				header={header}
				main={
					<Card>
						<CardContent className="flex items-center gap-2 py-8 text-sm">
							<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
							{t("Loading entity detail")}
						</CardContent>
					</Card>
				}
			/>
		);
	}

	if (entityQuery.isError || !entity) {
		return (
			<DetailLayout
				header={header}
				main={
					<AdminDetailErrorCard
						resource="entity"
						error={entityQuery.error}
						onRetry={() => entityQuery.refetch()}
					/>
				}
			/>
		);
	}

	const main = (
		<>
			<Card>
				<CardHeader>
					<CardTitle className="text-base">{t("Profile")}</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					<div className="flex flex-wrap items-center gap-2">
						<p className="text-lg font-semibold" style={headingStyle}>
							{entity.name}
						</p>
						<Badge variant="outline">{entity.entity_type}</Badge>
						<Badge variant="secondary">
							<Sparkles aria-hidden="true" className="mr-1 h-3 w-3" />
							{t("Mentions")}: {entity.mention_count}
						</Badge>
					</div>
					{entity.aliases.length > 0 ? (
						<div>
							<p
								className="mb-2 text-xs uppercase tracking-wide"
								style={mutedTextStyle}
							>
								{t("Aliases")}
							</p>
							<div className="flex flex-wrap gap-2">
								{entity.aliases.map((alias) => (
									<Badge key={alias} variant="outline">
										{alias}
									</Badge>
								))}
							</div>
						</div>
					) : null}
				</CardContent>
			</Card>

			{Object.keys(entity.properties).length > 0 ? (
				<Card>
					<CardHeader>
						<CardTitle className="text-base">{t("Properties")}</CardTitle>
					</CardHeader>
					<CardContent>
						<pre
							className="overflow-x-auto rounded-xl border p-3 text-xs"
							style={{
								borderColor:
									"color-mix(in srgb, var(--color-border) 78%, transparent)",
								backgroundColor: "var(--field-surface)",
								color: "var(--field-foreground)",
							}}
						>
							{JSON.stringify(entity.properties, null, 2)}
						</pre>
					</CardContent>
				</Card>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<Network aria-hidden="true" className="h-4 w-4" />
						{t("Related entities")}
						<Badge variant="secondary">{related.length}</Badge>
					</CardTitle>
				</CardHeader>
				<CardContent>
					{relatedQuery.isLoading ? (
						<p
							className="flex items-center gap-2 text-sm"
							style={mutedTextStyle}
						>
							<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
							{t("Loading related entities")}
						</p>
					) : related.length === 0 ? (
						<p className="text-sm" style={mutedTextStyle}>
							{t("No related entities discovered yet.")}
						</p>
					) : (
						<div className="grid gap-2 sm:grid-cols-2">
							{related.map((item) => (
								<button
									key={`${item.entity.id}-${item.relation_type}-${item.direction}`}
									type="button"
									onClick={() =>
										router.push(
											withLocalePath(
												locale,
												`/admin/knowledge/${encodeURIComponent(item.entity.id)}`,
											),
										)
									}
									className="rounded-2xl border px-3 py-3 text-left text-sm transition-colors hover:border-current"
									style={surfaceStyle}
								>
									<div className="flex flex-wrap items-center gap-2">
										<span style={headingStyle}>{item.entity.name}</span>
										<Badge variant="outline">{item.entity.entity_type}</Badge>
									</div>
									<p className="mt-1 text-xs" style={mutedTextStyle}>
										{item.direction === "outgoing"
											? `→ ${item.relation_type}`
											: `← ${item.relation_type}`}
										{" · "}
										{t("Weight")}: {item.weight.toFixed(2)}
									</p>
								</button>
							))}
						</div>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<BookOpen aria-hidden="true" className="h-4 w-4" />
						{t("Article references")}
						<Badge variant="secondary">{articles.length}</Badge>
					</CardTitle>
				</CardHeader>
				<CardContent>
					{articlesQuery.isLoading ? (
						<p
							className="flex items-center gap-2 text-sm"
							style={mutedTextStyle}
						>
							<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
							{t("Loading articles")}
						</p>
					) : articles.length === 0 ? (
						<p className="text-sm" style={mutedTextStyle}>
							{t("This entity has not been mentioned in any article yet.")}
						</p>
					) : (
						<ul className="space-y-2">
							{articles.map((article) => (
								<li
									key={article.article_id}
									className="rounded-2xl border px-4 py-3 text-sm"
									style={surfaceStyle}
								>
									<button
										type="button"
										className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
										onClick={() =>
											router.push(
												withLocalePath(
													locale,
													`/articles/${encodeURIComponent(article.article_id)}`,
												),
											)
										}
									>
										<span style={headingStyle}>{article.title}</span>
										<span className="text-xs" style={mutedTextStyle}>
											{article.published_at
												? formatDateTime(locale, article.published_at, dateOptions)
												: t("Unpublished")}
										</span>
									</button>
								</li>
							))}
						</ul>
					)}
				</CardContent>
			</Card>
		</>
	);

	const meta = (
		<MetaList
			title={t("Entity metadata")}
			icon={<Hash aria-hidden="true" className="h-4 w-4" />}
			items={[
				{
					label: t("Entity ID"),
					value: (
						<code className="break-all font-mono text-xs">{entity.id}</code>
					),
				},
				{
					label: t("First seen"),
					value: formatDateTime(locale, entity.first_seen, dateOptions),
				},
				{
					label: t("Last seen"),
					value: formatDateTime(locale, entity.last_seen, dateOptions),
				},
			]}
		/>
	);

	return <DetailLayout header={header} main={main} meta={meta} />;
}
