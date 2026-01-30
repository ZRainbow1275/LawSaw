"use client";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { EntityInspector } from "@/components/knowledge/entity-inspector";
import { EntityPalette } from "@/components/knowledge/entity-palette";
import { KnowledgeCanvas } from "@/components/knowledge/knowledge-canvas";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { Sidebar } from "@/components/layout/sidebar";
import {
	useKnowledgeBackfill,
	useKnowledgeSearchEntities,
	useKnowledgeTopEntities,
} from "@/hooks/use-knowledge";
import { useToast } from "@/stores/toast-store";
import { useCallback, useState } from "react";

export default function KnowledgePage() {
	const [searchTerm, setSearchTerm] = useState("");
	const [seedEntityId, setSeedEntityId] = useState<string | null>(null);
	const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);

	const topQuery = useKnowledgeTopEntities(50);
	const searchQuery = useKnowledgeSearchEntities(searchTerm, 50);
	const backfillMutation = useKnowledgeBackfill();

	const { success: toastSuccess, error: toastError } = useToast();

	const mode: "top" | "search" =
		searchTerm.trim().length > 0 ? "search" : "top";
	const items =
		mode === "search" ? (searchQuery.data ?? []) : (topQuery.data ?? []);
	const isLoading =
		mode === "search" ? searchQuery.isLoading : topQuery.isLoading;
	const isError = mode === "search" ? searchQuery.isError : topQuery.isError;

	const onSelect = (id: string) => {
		setSeedEntityId(id);
		setSelectedEntityId(id);
	};

	const handleBackfill = useCallback(() => {
		backfillMutation.mutate(
			{ limit: 500 },
			{
				onSuccess: (data) => {
					toastSuccess(
						"初始化完成",
						`已处理 ${data.articles_considered} 篇资讯，写入 ${data.article_entities_inserted} 条关联`,
					);
				},
				onError: (cause) => {
					const message = cause instanceof Error ? cause.message : "初始化失败";
					toastError("初始化知识图谱失败", message);
				},
			},
		);
	}, [backfillMutation, toastError, toastSuccess]);

	const onBackfill = mode === "top" ? handleBackfill : null;

	return (
		<ProtectedRoute>
			<div className="flex min-h-screen bg-neutral-50">
				<Sidebar />

				<MainContent className="flex min-h-screen flex-col">
					<Header />

					<div className="flex min-h-0 flex-1 flex-col p-6">
						<div className="mb-6">
							<h1 className="text-2xl font-bold text-neutral-900">知识图谱</h1>
							<p className="text-sm text-neutral-500">
								在无限画布中探索实体关系（支持节点拖拽、画布平移/缩放）。
							</p>
						</div>

						<div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[320px_1fr_360px]">
							<EntityPalette
								items={items}
								isLoading={isLoading}
								isError={isError}
								mode={mode}
								searchTerm={searchTerm}
								onSearchTermChange={setSearchTerm}
								selectedId={seedEntityId}
								onSelect={onSelect}
								onBackfill={onBackfill}
								backfillPending={backfillMutation.isPending}
							/>

							<KnowledgeCanvas
								seedEntityId={seedEntityId}
								selectedEntityId={selectedEntityId}
								onSelectEntity={setSelectedEntityId}
							/>

							<EntityInspector selectedEntityId={selectedEntityId} />
						</div>
					</div>
				</MainContent>
			</div>
		</ProtectedRoute>
	);
}
