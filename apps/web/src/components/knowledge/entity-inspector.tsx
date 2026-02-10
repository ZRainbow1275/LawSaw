"use client";

import { buttonVariants } from "@/components/ui/button";
import {
	useKnowledgeEntity,
	useKnowledgeEntityArticles,
} from "@/hooks/use-knowledge";
import { formatDateTime, withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import {
	ExternalLink,
	FileText,
	Loader2,
	PanelRight,
	Sparkles,
} from "lucide-react";
import Link from "next/link";

export function EntityInspector({
	selectedEntityId,
	className,
}: {
	selectedEntityId: string | null;
	className?: string;
}) {
	const locale = useLocale();
	const t = useT();
	const entityQuery = useKnowledgeEntity(selectedEntityId);
	const articlesQuery = useKnowledgeEntityArticles(selectedEntityId, 10);

	const entity = entityQuery.data ?? null;
	const articles = articlesQuery.data ?? [];

	return (
		<div
			className={cn(
				"flex h-full min-h-0 flex-col rounded-2xl border border-neutral-200 bg-white",
				className,
			)}
		>
			<div className="border-b border-neutral-100 p-4">
				<div className="flex items-center gap-2">
					<div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-100 text-neutral-700">
						<PanelRight aria-hidden="true" className="h-4 w-4" />
					</div>
					<div className="min-w-0">
						<div className="text-sm font-semibold text-neutral-900">
							{t("Entity panel")}
						</div>
						<div className="text-xs text-neutral-500">
							{t("Inspect entity details and related articles")}
						</div>
					</div>
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-auto p-4">
				{!selectedEntityId ? (
					<div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-sm text-neutral-700">
						<div className="flex items-start gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-neutral-600 shadow-sm">
								<Sparkles aria-hidden="true" className="h-5 w-5" />
							</div>
							<div className="min-w-0">
								<div className="font-semibold text-neutral-900">
									{t("No entity selected")}
								</div>
								<p className="mt-1 text-xs text-neutral-600">
									{t(
										"Select a node on the canvas or an item in the left list to view details.",
									)}
								</p>
							</div>
						</div>
					</div>
				) : entityQuery.isLoading ? (
					<div className="flex items-center justify-center py-10 text-sm text-neutral-600">
						<Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
						{t("Loading entity...")}
					</div>
				) : entityQuery.isError ? (
					<div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
						{t("Failed to load entity. Please try again later.")}
					</div>
				) : !entity ? (
					<div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
						{t(
							"Entity not found (it may have been deleted or not generated yet).",
						)}
					</div>
				) : (
					<div className="space-y-5">
						<div>
							<div className="text-xs font-medium uppercase tracking-wider text-neutral-400">
								{t("Entity")}
							</div>
							<div className="mt-2 rounded-2xl border border-neutral-200 bg-white p-4">
								<div className="text-base font-semibold text-neutral-900">
									{entity.name}
								</div>
								<div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-600">
									<span className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5">
										{entity.entity_type}
									</span>
									<span className="text-neutral-300">•</span>
									<span>
										{t("Mentioned {count} times", {
											count: entity.mention_count,
										})}
									</span>
								</div>
								<div className="mt-3 text-xs text-neutral-500">
									<div>
										<span className="text-neutral-400">ID:</span>
										<span className="font-mono">{entity.id}</span>
									</div>
								</div>
							</div>
						</div>

						<div>
							<div className="flex items-center justify-between">
								<div className="text-xs font-medium uppercase tracking-wider text-neutral-400">
									{t("Related articles")}
								</div>
								{articlesQuery.isFetching && (
									<div className="text-xs text-neutral-500">
										{t("Refreshing...")}
									</div>
								)}
							</div>

							{articlesQuery.isLoading ? (
								<div className="mt-2 flex items-center text-sm text-neutral-600">
									<Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
									{t("Loading...")}
								</div>
							) : articlesQuery.isError ? (
								<div className="mt-2 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
									{t("Failed to load related articles.")}
								</div>
							) : articles.length === 0 ? (
								<div className="mt-2 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
									{t("No related articles yet.")}
								</div>
							) : (
								<div className="mt-2 space-y-2">
									{articles.map((article) => (
										<div
											key={article.article_id}
											className="flex items-start justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-3"
										>
											<div className="min-w-0">
												<div className="flex items-center gap-2">
													<FileText aria-hidden="true" className="h-4 w-4 shrink-0 text-neutral-400" />
													<Link
														href={withLocalePath(
															locale,
															`/articles/${article.article_id}`,
														)}
														className="truncate text-sm font-medium text-neutral-900 hover:text-primary-700"
													>
														{article.title}
													</Link>
												</div>
												<div className="mt-1 text-xs text-neutral-500">
													{article.published_at
														? formatDateTime(locale, article.published_at, {
																year: "numeric",
																month: "short",
																day: "numeric",
															})
														: t("Unknown date")}{" "}
													· {article.status}
												</div>
											</div>
											<Link
												href={withLocalePath(
													locale,
													`/articles/${article.article_id}`,
												)}
												title={t("Open article details")}
												className={cn(
													buttonVariants({ variant: "outline", size: "sm" }),
													"shrink-0",
												)}
											>
												<ExternalLink aria-hidden="true" className="h-4 w-4" />
											</Link>
										</div>
									))}
								</div>
							)}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
