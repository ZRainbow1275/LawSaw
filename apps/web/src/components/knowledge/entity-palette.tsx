"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { KnowledgeEntity } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { Database, Search, Sparkles, TriangleAlert } from "lucide-react";

function getTypeBadge(entityType: string) {
	switch (entityType) {
		case "organization":
			return "bg-sky-50 text-sky-700 border-sky-200";
		case "concept":
			return "bg-emerald-50 text-emerald-700 border-emerald-200";
		case "law":
			return "bg-violet-50 text-violet-700 border-violet-200";
		case "person":
			return "bg-amber-50 text-amber-700 border-amber-200";
		default:
			return "bg-neutral-50 text-neutral-700 border-neutral-200";
	}
}

export function EntityPalette({
	items,
	isLoading,
	isError,
	mode,
	searchTerm,
	onSearchTermChange,
	selectedId,
	onSelect,
	onBackfill,
	backfillPending,
	className,
}: {
	items: KnowledgeEntity[];
	isLoading: boolean;
	isError: boolean;
	mode: "top" | "search";
	searchTerm: string;
	onSearchTermChange: (value: string) => void;
	selectedId: string | null;
	onSelect: (id: string) => void;
	onBackfill: (() => void) | null;
	backfillPending: boolean;
	className?: string;
}) {
	const empty = !isLoading && !isError && items.length === 0;

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
						<Sparkles className="h-4 w-4" />
					</div>
					<div className="min-w-0">
						<div className="text-sm font-semibold text-neutral-900">
							实体列表
						</div>
						<div className="text-xs text-neutral-500">
							{mode === "search" ? "搜索结果" : "按热度排序"}
						</div>
					</div>
				</div>

				<div className="relative mt-3">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
					<Input
						value={searchTerm}
						onChange={(e) => onSearchTermChange(e.target.value)}
						placeholder="搜索实体（例：网信办 / 反垄断 / GDPR）"
						className="pl-10"
					/>
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-auto p-2">
				{isLoading ? (
					<div className="space-y-2 p-2">
						{Array.from(
							{ length: 8 },
							(_, idx) => `knowledge-skeleton-${idx}`,
						).map((key) => (
							<div
								key={key}
								className="h-12 rounded-xl bg-neutral-100 animate-pulse"
							/>
						))}
					</div>
				) : isError ? (
					<div className="p-4">
						<div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
							<div className="flex items-start gap-2">
								<TriangleAlert className="mt-0.5 h-4 w-4" />
								<div>
									<div className="font-medium">实体数据加载失败</div>
									<div className="mt-1 text-xs text-red-600">
										请检查 API / 登录状态，或稍后重试。
									</div>
								</div>
							</div>
						</div>
					</div>
				) : empty ? (
					<div className="p-4">
						<div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-sm text-neutral-700">
							<div className="flex items-start gap-3">
								<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-neutral-600 shadow-sm">
									<Database className="h-5 w-5" />
								</div>
								<div className="min-w-0">
									<div className="font-semibold text-neutral-900">暂无实体</div>
									<p className="mt-1 text-xs text-neutral-600">
										知识图谱依赖实体/关系数据。你可以先运行采集/AI 流程，
										或使用初始化按钮从现有资讯生成基础图谱。
									</p>
									{onBackfill && (
										<Button
											type="button"
											variant="outline"
											size="sm"
											className="mt-3"
											onClick={onBackfill}
											disabled={backfillPending}
											data-testid="knowledge-backfill"
										>
											{backfillPending ? "初始化中…" : "初始化知识图谱"}
										</Button>
									)}
								</div>
							</div>
						</div>
					</div>
				) : (
					<div className="space-y-1">
						{items.map((entity) => {
							const active = entity.id === selectedId;
							return (
								<button
									key={entity.id}
									type="button"
									data-testid={`knowledge-entity-item-${entity.id}`}
									onClick={() => onSelect(entity.id)}
									className={cn(
										"w-full rounded-xl px-3 py-2 text-left transition-colors",
										"hover:bg-neutral-50",
										active && "bg-primary-50 hover:bg-primary-50",
									)}
								>
									<div className="flex items-start justify-between gap-2">
										<div className="min-w-0">
											<div className="truncate text-sm font-medium text-neutral-900">
												{entity.name}
											</div>
											<div className="mt-0.5 text-xs text-neutral-500">
												出现 {entity.mention_count} 次
											</div>
										</div>
										<span
											className={cn(
												"shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
												getTypeBadge(entity.entity_type),
											)}
										>
											{entity.entity_type}
										</span>
									</div>
								</button>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}
