"use client";

import { EntityDetailDrawer } from "@/components/admin/entity-detail-drawer";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { Sidebar } from "@/components/layout/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
	useKnowledgeCooccurrenceNetwork,
	useKnowledgeDegreeCentrality,
	useKnowledgeDuplicateCandidates,
	useKnowledgeGraphStats,
	useKnowledgeHybridSearch,
	useKnowledgeMergeEntities,
	useKnowledgeSemanticSearch,
} from "@/hooks/use-knowledge";
import { useT } from "@/lib/i18n-client";
import { useAuthStore } from "@/stores/auth-store";
import { useToast } from "@/stores/toast-store";
import {
	BrainCircuit,
	GitMerge,
	GitPullRequestArrow,
	Network,
	RefreshCw,
	ScanSearch,
	Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";

type SearchMode = "semantic" | "hybrid";

const knowledgeAdminPanelStyle = {
	backgroundColor: "var(--surface-muted-bg)",
	borderColor: "var(--surface-muted-border)",
} as const;

const knowledgeAdminNestedSurfaceStyle = {
	backgroundColor: "var(--control-hover-bg)",
	borderColor: "var(--surface-muted-border)",
} as const;

const knowledgeAdminHeadingTextStyle = {
	color: "var(--field-foreground)",
} as const;

const knowledgeAdminMutedTextStyle = {
	color: "var(--surface-muted-text)",
} as const;

const knowledgeAdminSelectedControlStyle = {
	backgroundColor: "var(--control-selected-bg)",
	borderColor: "var(--control-selected-border)",
	color: "var(--control-selected-text)",
} as const;

const knowledgeAdminFieldSurfaceStyle = {
	backgroundColor: "var(--field-surface)",
	borderColor: "var(--field-border)",
	color: "var(--field-foreground)",
} as const;

const knowledgeAdminHeroStyle = {
	backgroundImage: "var(--surface-hero-primary-gradient)",
	borderColor: "var(--surface-accent-border)",
} as const;

const knowledgeAdminAccentIconStyle = {
	backgroundColor: "var(--surface-accent-icon-bg)",
	color: "var(--surface-accent-strong)",
} as const;

function formatPercent(value: number) {
	return `${(value * 100).toFixed(1)}%`;
}

function AdminKnowledgeContent() {
	const t = useT();
	const { success, error } = useToast();
	const roles = useAuthStore((state) => state.roles);
	const isAdmin = roles.some((role) => ["super_admin", "tenant_admin", "admin"].includes(role));

	const formatEntityTypeLabel = (entityType: string) => {
		switch (entityType) {
			case "organization":
				return t("Organization");
			case "regulation":
				return t("Regulation");
			case "person":
				return t("Person");
			case "date":
				return t("Date");
			case "location":
				return t("Location");
			case "legal_term":
				return t("Legal term");
			case "concept":
				return t("Concept");
			case "event":
				return t("Event");
			case "law":
				return t("Law");
			default:
				return entityType;
		}
	};

	const [searchMode, setSearchMode] = useState<SearchMode>("semantic");
	const [query, setQuery] = useState("");
	const [duplicateThresholdInput, setDuplicateThresholdInput] = useState("0.85");
	const [minCooccurrenceInput, setMinCooccurrenceInput] = useState("2");
	const [activeEntityId, setActiveEntityId] = useState<string | null>(null);

	const duplicateThreshold = Number.isFinite(Number.parseFloat(duplicateThresholdInput))
		? Math.min(0.99, Math.max(0.5, Number.parseFloat(duplicateThresholdInput)))
		: 0.85;
	const minCooccurrence = Number.isFinite(Number.parseInt(minCooccurrenceInput, 10))
		? Math.max(1, Number.parseInt(minCooccurrenceInput, 10))
		: 2;

	const statsQuery = useKnowledgeGraphStats(isAdmin);
	const duplicatesQuery = useKnowledgeDuplicateCandidates(duplicateThreshold, 12, isAdmin);
	const centralityQuery = useKnowledgeDegreeCentrality(10, isAdmin);
	const cooccurrenceQuery = useKnowledgeCooccurrenceNetwork(minCooccurrence, 10, isAdmin);
	const semanticSearchQuery = useKnowledgeSemanticSearch(query, 10);
	const hybridSearchQuery = useKnowledgeHybridSearch(query, 10);
	const mergeEntities = useKnowledgeMergeEntities();

	const searchResults = searchMode === "semantic" ? semanticSearchQuery.data ?? [] : hybridSearchQuery.data ?? [];
	const searchLoading = searchMode === "semantic" ? semanticSearchQuery.isLoading : hybridSearchQuery.isLoading;
	const searchError = searchMode === "semantic" ? semanticSearchQuery.error : hybridSearchQuery.error;
	const searchHasError = searchMode === "semantic" ? semanticSearchQuery.isError : hybridSearchQuery.isError;

	const embeddingCoverage = useMemo(() => {
		if (!statsQuery.data || statsQuery.data.entity_count === 0) return 0;
		return statsQuery.data.entities_with_embedding / statsQuery.data.entity_count;
	}, [statsQuery.data]);

	const statsCards = [
		{
			title: t("Entities"),
			value: String(statsQuery.data?.entity_count ?? 0),
			description: t("Unique graph nodes currently stored for this tenant."),
			icon: Network,
		},
		{
			title: t("Relations"),
			value: String(statsQuery.data?.relation_count ?? 0),
			description: t("Typed edges available for traversal and governance review."),
			icon: GitPullRequestArrow,
		},
		{
			title: t("Entity mentions"),
			value: String(statsQuery.data?.article_entity_count ?? 0),
			description: t("Article to entity links grounded in real ingestion output."),
			icon: BrainCircuit,
		},
		{
			title: t("Embedding coverage"),
			value: formatPercent(embeddingCoverage),
			description: t("Semantic search readiness computed from real embedding availability."),
			icon: Sparkles,
		},
	];

	const handleMerge = (targetId: string, sourceId: string) => {
		mergeEntities.mutate(
			{ target_id: targetId, source_id: sourceId },
			{
				onSuccess: () => {
					success(t("Entities merged"), t("The duplicate queue and graph metrics have been refreshed."));
				},
				onError: (cause) => {
					error(t("Merge failed"), cause instanceof Error ? cause.message : t("Unknown error"));
				},
			},
		);
	};

	return (
		<>
		<div className="min-h-screen" style={{ backgroundColor: "var(--color-background)" }}>
			<Sidebar />
			<MainContent>
				<Header />
				<div className="space-y-6 p-4 md:p-6">
					<Card style={knowledgeAdminHeroStyle}>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-3xl font-bold tracking-tight" style={knowledgeAdminHeadingTextStyle}>
								<Network
									aria-hidden="true"
									className="h-7 w-7"
									style={{ color: "var(--surface-accent-strong)" }}
								/>
								{t("Knowledge governance hub")}
							</CardTitle>
							<CardDescription>
								{t("Operate graph quality, review duplicates, run retrieval checks, and monitor embedding coverage from one console.")}
							</CardDescription>
						</CardHeader>
					</Card>

					{!isAdmin ? (
						<EmptyState
							title={t("Access restricted")}
							description={t("You need an administrative role to access this workspace.")}
						/>
					) : (
						<>
							<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
								{statsCards.map((item) => {
									const Icon = item.icon;
									return (
										<Card key={item.title}>
											<CardContent className="flex items-start gap-4 p-6">
												<div className="rounded-2xl p-3" style={knowledgeAdminAccentIconStyle}>
													<Icon aria-hidden="true" className="h-5 w-5" />
												</div>
												<div className="space-y-1">
													<p className="text-sm" style={knowledgeAdminMutedTextStyle}>{item.title}</p>
													<p className="text-3xl font-semibold" style={knowledgeAdminHeadingTextStyle}>{item.value}</p>
													<p className="text-xs" style={knowledgeAdminMutedTextStyle}>{item.description}</p>
												</div>
											</CardContent>
										</Card>
									);
								})}
							</div>

							<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
								<Card>
									<CardHeader>
										<div className="flex items-center justify-between gap-3">
											<div>
												<CardTitle>{t("Governance search")}</CardTitle>
												<CardDescription>
													{t("Run live semantic and hybrid retrieval checks against the tenant graph.")}
												</CardDescription>
											</div>
											<Button variant="outline" size="sm" onClick={() => {
												if (searchMode === "semantic") {
													void semanticSearchQuery.refetch();
												} else {
													void hybridSearchQuery.refetch();
												}
											}} disabled={searchLoading || query.trim().length === 0}>
												<RefreshCw aria-hidden="true" className={searchLoading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
												{t("Refresh")}
											</Button>
										</div>
									</CardHeader>
									<CardContent className="space-y-4">
										<div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
											<Input
												value={query}
												onChange={(event) => setQuery(event.target.value)}
												placeholder={t("Search entities by policy concept, organization, or legal term")}
												style={knowledgeAdminFieldSurfaceStyle}
											/>
											<select
												value={searchMode}
												onChange={(event) => setSearchMode(event.target.value as SearchMode)}
												className="h-10 rounded-lg border px-3 text-sm outline-none transition-colors focus:border-[var(--control-selected-border)]"
												style={
													searchMode === "hybrid"
														? knowledgeAdminSelectedControlStyle
														: knowledgeAdminFieldSurfaceStyle
												}
											>
												<option value="semantic">{t("Semantic")}</option>
												<option value="hybrid">{t("Hybrid")}</option>
											</select>
										</div>

										{query.trim().length === 0 ? (
											<EmptyState title={t("Enter a search query")} description={t("Results appear after you provide a real query against the knowledge graph.")} className="py-8" icon={ScanSearch} />
										) : searchHasError ? (
											<EmptyState variant="error" title={t("Search failed")} description={searchError instanceof Error ? searchError.message : t("Unknown error")} className="py-8" />
										) : searchLoading ? (
											<p className="text-sm" style={knowledgeAdminMutedTextStyle}>{t("Searching graph")}</p>
										) : searchResults.length === 0 ? (
											<EmptyState title={t("No graph matches")}
												description={t("Try another legal concept, organization alias, or policy term.")}
												className="py-8" />
										) : (
											<div className="space-y-3">
												{searchResults.map((item) => (
													<button
														type="button"
														key={item.id}
														onClick={() => setActiveEntityId(item.id)}
														className="block w-full rounded-2xl border px-4 py-4 text-left transition-colors hover:bg-[var(--control-hover-bg)]"
														style={knowledgeAdminPanelStyle}
													>
														<div className="flex flex-wrap items-start justify-between gap-3">
											<div>
												<p className="text-base font-semibold" style={knowledgeAdminHeadingTextStyle}>{item.name}</p>
												<p className="mt-1 text-sm" style={knowledgeAdminMutedTextStyle}>{formatEntityTypeLabel(item.entity_type)}</p>
											</div>
															<div className="flex flex-wrap items-center gap-2">
																<Badge variant="outline">{t("Mentions")}: {item.mention_count}</Badge>
																{"similarity" in item ? <Badge variant="info">{t("Similarity")}: {formatPercent(Number(item.similarity))}</Badge> : null}
															</div>
														</div>
														<div className="mt-3 flex flex-wrap gap-2">
															{item.aliases.slice(0, 4).map((alias) => (
																<Badge key={alias} variant="secondary">{alias}</Badge>
															))}
														</div>
													</button>
												))}
											</div>
										)}
									</CardContent>
								</Card>

								<Card>
									<CardHeader>
										<CardTitle>{t("Type distribution")}</CardTitle>
										<CardDescription>
											{t("Monitor which entity classes dominate the tenant graph right now.")}
										</CardDescription>
									</CardHeader>
									<CardContent className="space-y-3">
										{statsQuery.isLoading ? (
											<p className="text-sm" style={knowledgeAdminMutedTextStyle}>{t("Loading graph statistics")}</p>
										) : statsQuery.isError ? (
											<EmptyState variant="error" title={t("Failed to load graph statistics")} description={statsQuery.error instanceof Error ? statsQuery.error.message : t("Unknown error")} className="py-8" />
										) : (statsQuery.data?.type_distribution.length ?? 0) === 0 ? (
											<EmptyState title={t("No entity types yet")} description={t("Ingest more real articles to build graph distribution signals.")} className="py-8" />
										) : (
											statsQuery.data?.type_distribution.map((item) => (
												<div key={item.entity_type} className="rounded-2xl border px-4 py-4" style={knowledgeAdminPanelStyle}>
													<div className="flex items-center justify-between gap-3">
												<div>
													<p className="text-base font-semibold" style={knowledgeAdminHeadingTextStyle}>{formatEntityTypeLabel(item.entity_type)}</p>
													<p className="mt-1 text-xs" style={knowledgeAdminMutedTextStyle}>{t("Real entity count by ontology bucket")}</p>
												</div>
														<Badge variant="outline">{item.count}</Badge>
													</div>
												</div>
											))
										)}
									</CardContent>
								</Card>
							</div>

							<div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
								<Card>
									<CardHeader>
										<div className="flex items-center justify-between gap-3">
											<div>
												<CardTitle>{t("Duplicate candidates")}</CardTitle>
												<CardDescription>
													{t("Review graph duplicate pairs generated from real similarity scoring and merge them deliberately.")}
												</CardDescription>
											</div>
											<div className="w-32">
												<Input
													value={duplicateThresholdInput}
													onChange={(event) => setDuplicateThresholdInput(event.target.value)}
													inputMode="decimal"
													placeholder="0.85"
													style={knowledgeAdminFieldSurfaceStyle}
												/>
											</div>
										</div>
									</CardHeader>
									<CardContent className="space-y-3">
										{duplicatesQuery.isLoading ? (
											<p className="text-sm" style={knowledgeAdminMutedTextStyle}>{t("Loading duplicate candidates")}</p>
										) : duplicatesQuery.isError ? (
											<EmptyState variant="error" title={t("Failed to load duplicate candidates")} description={duplicatesQuery.error instanceof Error ? duplicatesQuery.error.message : t("Unknown error")} className="py-8" />
										) : (duplicatesQuery.data?.length ?? 0) === 0 ? (
											<EmptyState title={t("No duplicate candidates")}
												description={t("No duplicate pair exceeds the current similarity threshold.")}
												className="py-8" />
										) : (
											duplicatesQuery.data?.map((item) => (
												<div key={`${item.entity1.id}:${item.entity2.id}`} className="rounded-2xl border px-4 py-4" style={knowledgeAdminPanelStyle}>
													<div className="flex flex-wrap items-start justify-between gap-3">
											<div>
												<p className="text-base font-semibold" style={knowledgeAdminHeadingTextStyle}>{item.entity1.name}</p>
												<p className="mt-1 text-sm" style={knowledgeAdminMutedTextStyle}>
													{formatEntityTypeLabel(item.entity1.entity_type)} · {t("Mentions")}: {item.entity1.mention_count}
												</p>
											</div>
														<Badge variant="warning">{t("Similarity")}: {formatPercent(item.similarity)}</Badge>
													</div>
											<div className="mt-3 rounded-2xl border border-dashed px-4 py-3" style={knowledgeAdminNestedSurfaceStyle}>
												<p className="text-sm font-medium" style={knowledgeAdminHeadingTextStyle}>{item.entity2.name}</p>
												<p className="mt-1 text-sm" style={knowledgeAdminMutedTextStyle}>
													{formatEntityTypeLabel(item.entity2.entity_type)} · {t("Mentions")}: {item.entity2.mention_count}
												</p>
											</div>
													<div className="mt-4 flex flex-wrap gap-2">
														<Button type="button" variant="outline" onClick={() => handleMerge(item.entity1.id, item.entity2.id)} disabled={mergeEntities.isPending}>
															<GitMerge aria-hidden="true" className="h-4 w-4" />
															{t("Merge right into left")}
														</Button>
														<Button type="button" variant="outline" onClick={() => handleMerge(item.entity2.id, item.entity1.id)} disabled={mergeEntities.isPending}>
															<GitMerge aria-hidden="true" className="h-4 w-4" />
															{t("Merge left into right")}
														</Button>
													</div>
												</div>
											))
										)}
									</CardContent>
								</Card>

								<div className="space-y-4">
									<Card>
										<CardHeader>
											<CardTitle>{t("Centrality leaderboard")}</CardTitle>
											<CardDescription>
												{t("Watch the most connected entities to identify dominant policy actors and hubs.")}
											</CardDescription>
										</CardHeader>
										<CardContent className="space-y-3">
											{centralityQuery.isLoading ? (
												<p className="text-sm" style={knowledgeAdminMutedTextStyle}>{t("Loading centrality")}</p>
											) : centralityQuery.isError ? (
												<EmptyState variant="error" title={t("Failed to load centrality")} description={centralityQuery.error instanceof Error ? centralityQuery.error.message : t("Unknown error")} className="py-8" />
											) : (centralityQuery.data?.length ?? 0) === 0 ? (
												<EmptyState title={t("No ranked entities yet")} description={t("Graph analytics will appear after more real relations are ingested.")} className="py-8" />
											) : (
												centralityQuery.data?.map((item, index) => (
													<button type="button" key={item.entity.id} onClick={() => setActiveEntityId(item.entity.id)} className="block w-full rounded-2xl border px-4 py-4 text-left transition-colors hover:bg-[var(--control-hover-bg)]" style={knowledgeAdminPanelStyle}>
														<div className="flex items-start justify-between gap-3">
											<div>
												<p className="text-base font-semibold" style={knowledgeAdminHeadingTextStyle}>{index + 1}. {item.entity.name}</p>
												<p className="mt-1 text-sm" style={knowledgeAdminMutedTextStyle}>{formatEntityTypeLabel(item.entity.entity_type)}</p>
											</div>
															<Badge variant="outline">{t("Total degree")}: {item.total_degree}</Badge>
														</div>
								<p className="mt-3 text-xs" style={knowledgeAdminMutedTextStyle}>
									{t("Outgoing degree")}: {item.out_degree} · {t("Incoming degree")}: {item.in_degree}
								</p>
													</button>
												))
											)}
										</CardContent>
									</Card>

									<Card>
										<CardHeader>
											<div className="flex items-center justify-between gap-3">
												<div>
													<CardTitle>{t("Co-occurrence network")}</CardTitle>
													<CardDescription>
														{t("Inspect strong article-level co-occurrence edges that may deserve ontology review.")}
													</CardDescription>
												</div>
												<div className="w-28">
													<Input
														value={minCooccurrenceInput}
														onChange={(event) => setMinCooccurrenceInput(event.target.value)}
														inputMode="numeric"
														placeholder="2"
														style={knowledgeAdminFieldSurfaceStyle}
													/>
												</div>
											</div>
										</CardHeader>
										<CardContent className="space-y-3">
											{cooccurrenceQuery.isLoading ? (
												<p className="text-sm" style={knowledgeAdminMutedTextStyle}>{t("Loading co-occurrence edges")}</p>
											) : cooccurrenceQuery.isError ? (
												<EmptyState variant="error" title={t("Failed to load co-occurrence edges")} description={cooccurrenceQuery.error instanceof Error ? cooccurrenceQuery.error.message : t("Unknown error")} className="py-8" />
											) : (cooccurrenceQuery.data?.length ?? 0) === 0 ? (
												<EmptyState title={t("No co-occurrence edges yet")} description={t("Lower the threshold or ingest more real graph links.")} className="py-8" />
											) : (
												cooccurrenceQuery.data?.map((item) => (
													<div key={`${item.entity1_id}:${item.entity2_id}`} className="rounded-2xl border px-4 py-4" style={knowledgeAdminPanelStyle}>
														<div className="flex items-center justify-between gap-3">
															<div>
																<p className="text-sm font-semibold" style={knowledgeAdminHeadingTextStyle}>{item.entity1_name}</p>
																<p className="mt-1 text-sm" style={knowledgeAdminMutedTextStyle}>{item.entity2_name}</p>
															</div>
															<Badge variant="info">{t("Co-occurrences")}: {item.cooccurrence_count}</Badge>
														</div>
													</div>
												))
											)}
										</CardContent>
									</Card>
								</div>
							</div>
						</>
					)}
				</div>
			</MainContent>
		</div>
		<EntityDetailDrawer
			open={activeEntityId !== null}
			entityId={activeEntityId}
			onClose={() => setActiveEntityId(null)}
		/>
		</>
	);
}

export default function AdminKnowledgePage() {
	return (
		<ProtectedRoute>
			<AdminKnowledgeContent />
		</ProtectedRoute>
	);
}
