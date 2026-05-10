"use client";

/**
 * EntityListPanel — `prototype/app.html:1434-1473` left panel.
 *
 * 260px-wide panel: search input + scrollable list of entities. Each row
 * shows a typed badge (org/concept/law/person/event/standard) plus
 * mention count. Selected item gains a primary-orange highlight.
 */

import type { KnowledgeEntity } from "@/lib/api/types";
import { useT } from "@/lib/i18n-client";
import { Search } from "lucide-react";
import type { ChangeEvent } from "react";

const TYPE_BADGE_STYLE: Record<
	string,
	{ bg: string; fg: string; labelKey: string }
> = {
	organization: { bg: "#e0f2fe", fg: "#0284c7", labelKey: "Organization" },
	concept: { bg: "#d1fae5", fg: "#059669", labelKey: "Concept" },
	law: { bg: "#ede9fe", fg: "#7c3aed", labelKey: "Law" },
	person: { bg: "#fef3c7", fg: "#d97706", labelKey: "Person" },
	event: { bg: "#ffedd5", fg: "#c2410c", labelKey: "Event" },
	standard: { bg: "#f1f5f9", fg: "#475569", labelKey: "Standard" },
};

export function getEntityTypeStyle(type: string) {
	return (
		TYPE_BADGE_STYLE[type] ?? {
			bg: "#f1f5f9",
			fg: "#475569",
			labelKey: type,
		}
	);
}

interface EntityListPanelProps {
	entities: KnowledgeEntity[];
	isLoading: boolean;
	isError: boolean;
	searchTerm: string;
	onSearchTermChange: (value: string) => void;
	selectedId: string | null;
	onSelect: (id: string) => void;
}

export function EntityListPanel({
	entities,
	isLoading,
	isError,
	searchTerm,
	onSearchTermChange,
	selectedId,
	onSelect,
}: EntityListPanelProps) {
	const t = useT();
	const handleSearch = (e: ChangeEvent<HTMLInputElement>) =>
		onSearchTermChange(e.target.value);

	return (
		<aside
			className="flex h-full min-h-0 flex-col rounded-2xl border bg-white p-4 shadow-sm"
			style={{ borderColor: "var(--surface-card-border)" }}
			data-testid="kg-entity-list-panel"
		>
			<div className="relative mb-3">
				<Search
					aria-hidden="true"
					className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
					style={{ color: "var(--surface-card-faint-fg)" }}
				/>
				<input
					type="text"
					value={searchTerm}
					onChange={handleSearch}
					placeholder={t("Search entities...")}
					className="h-9 w-full rounded-lg border bg-white px-3 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"
					style={{
						borderColor: "var(--surface-card-border-strong)",
						color: "var(--surface-card-foreground)",
					}}
				/>
			</div>

			<div
				className="mb-2 text-[13px] font-bold"
				style={{ color: "var(--surface-card-foreground)" }}
			>
				{t("Entity list")}
			</div>

			<div className="-mx-1 flex-1 overflow-auto px-1 scrollbar-subtle">
				{isLoading ? (
					<div className="space-y-1.5">
						{[
							"sk-1",
							"sk-2",
							"sk-3",
							"sk-4",
							"sk-5",
							"sk-6",
							"sk-7",
							"sk-8",
						].map((key) => (
							<div
								key={key}
								className="h-12 animate-pulse rounded-lg"
								style={{ backgroundColor: "var(--surface-card-tint-bg)" }}
							/>
						))}
					</div>
				) : isError ? (
					<div
						className="rounded-lg border p-3 text-xs"
						style={{
							borderColor: "color-mix(in srgb, #c62828 30%, transparent)",
							backgroundColor: "color-mix(in srgb, #c62828 6%, transparent)",
							color: "#c62828",
						}}
					>
						{t("Failed to load entities")}
					</div>
				) : entities.length === 0 ? (
					<div
						className="rounded-lg border-dashed border px-3 py-6 text-center text-xs"
						style={{
							borderColor: "var(--surface-card-border-strong)",
							color: "var(--surface-card-faint-fg)",
						}}
					>
						{t("No entities found")}
					</div>
				) : (
					<ul className="space-y-1">
						{entities.map((entity) => {
							const active = entity.id === selectedId;
							const style = getEntityTypeStyle(entity.entity_type);
							return (
								<li key={entity.id}>
									<button
										type="button"
										onClick={() => onSelect(entity.id)}
										className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition ${active ? "" : "hover:bg-neutral-50 focus:bg-neutral-50"}`}
										style={{
											borderColor: active
												? "var(--color-primary-500)"
												: "transparent",
											backgroundColor: active
												? "color-mix(in srgb, var(--color-primary-500) 8%, white)"
												: "transparent",
										}}
										data-testid={`kg-entity-item-${entity.id}`}
									>
										<span
											className="mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-tight"
											style={{
												backgroundColor: style.bg,
												color: style.fg,
											}}
										>
											{t(style.labelKey)}
										</span>
										<div className="min-w-0">
											<div
												className="truncate text-sm font-medium"
												style={{ color: "var(--surface-card-foreground)" }}
											>
												{entity.name}
											</div>
											<div
												className="text-[11px]"
												style={{ color: "var(--surface-card-faint-fg)" }}
											>
												{t("Mentioned {count} times", {
													count: entity.mention_count,
												})}
											</div>
										</div>
									</button>
								</li>
							);
						})}
					</ul>
				)}
			</div>
		</aside>
	);
}
