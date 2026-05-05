"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { VirtualList } from "@/components/ui/virtual-list";
import { apiClient } from "@/lib/api";
import { localizeAuditEvent } from "@/lib/audit-event-labels";
import { useLocale, useT } from "@/lib/i18n-client";
import { useQuery } from "@tanstack/react-query";
import { FileSearch } from "lucide-react";
import { useMemo, useState } from "react";

type AuditLogRecord = {
	id: string;
	tenant_id: string;
	seq: number;
	event_version: number;
	prev_hash: string;
	hash: string;
	user_id: string | null;
	action: string;
	resource: string;
	resource_id: string | null;
	old_value: Record<string, unknown> | null;
	new_value: Record<string, unknown> | null;
	ip_address: string | null;
	user_agent: string | null;
	created_at: string;
};

type AuditListResponse = {
	data: AuditLogRecord[];
	total: number;
	limit: number;
	offset: number;
};

function assertAuditList(value: unknown): asserts value is AuditListResponse {
	if (
		typeof value !== "object" ||
		value === null ||
		!Array.isArray((value as { data?: unknown }).data)
	) {
		throw new Error("Invalid audit list response");
	}
}

const ROW_HEIGHT = 44;
const VIRTUAL_HEIGHT = 528;
const LIST_LIMIT = 200;

function formatAuditTimestamp(timestamp: string): string {
	const parsed = new Date(timestamp);
	if (Number.isNaN(parsed.getTime())) return timestamp;
	return parsed.toLocaleString("zh-CN", { hour12: false });
}

function shortenId(value: string | null | undefined, length = 8): string {
	if (!value) return "-";
	return value.length > length ? `${value.slice(0, length)}…` : value;
}

function deriveStatus(action: string): {
	label: string;
	variant: "success" | "destructive" | "secondary";
} {
	const normalized = action.toLowerCase();
	if (
		normalized.includes("delete") ||
		normalized.includes("revoke") ||
		normalized.includes("archive")
	) {
		return { label: "destructive", variant: "destructive" };
	}
	if (
		normalized.includes("create") ||
		normalized.includes("restore") ||
		normalized.includes("login")
	) {
		return { label: "success", variant: "success" };
	}
	return { label: "neutral", variant: "secondary" };
}

function statusCopy(key: string, t: (k: string) => string): string {
	switch (key) {
		case "success":
			return t("audit.status.success");
		case "destructive":
			return t("audit.status.destructive");
		default:
			return t("audit.status.neutral");
	}
}

function AdminAuditContent() {
	const t = useT();
	const locale = useLocale();
	// Server-side admin guard at [locale]/admin/layout.tsx — see users/page.tsx.
	const isAdmin = true;
	const [resource, setResource] = useState("");
	const [action, setAction] = useState("");
	const [actorQuery, setActorQuery] = useState("");

	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;
	const tableWrapperStyle = {
		borderColor: "color-mix(in srgb, var(--color-border) 68%, transparent)",
		backgroundColor:
			"color-mix(in srgb, var(--surface-muted-bg) 78%, var(--color-background) 22%)",
	} as const;
	const headerRowStyle = {
		borderColor: "color-mix(in srgb, var(--color-border) 68%, transparent)",
		backgroundColor:
			"color-mix(in srgb, var(--surface-muted-bg) 92%, var(--color-background) 8%)",
		color: "var(--surface-muted-text)",
	} as const;

	const query = useQuery({
		queryKey: ["admin-audit-virtual", resource, action, LIST_LIMIT],
		enabled: isAdmin,
		queryFn: () => {
			const params = new URLSearchParams();
			params.set("limit", String(LIST_LIMIT));
			if (resource.trim()) params.set("resource", resource.trim());
			if (action.trim()) params.set("action", action.trim());
			return apiClient.get<AuditListResponse>(
				`/api/v1/admin/audit?${params.toString()}`,
				assertAuditList,
			);
		},
	});

	const rows = useMemo(() => {
		const all = query.data?.data ?? [];
		const needle = actorQuery.trim().toLowerCase();
		if (!needle) return all;
		return all.filter((entry) =>
			(entry.user_id ?? "").toLowerCase().includes(needle),
		);
	}, [actorQuery, query.data]);

	const titleText = t("audit.title");
	const subtitleText = t("audit.subtitle");
	const filterActorLabel = t("audit.filters.actor");
	const filterActionLabel = t("audit.filters.action");
	const filterResourceLabel = t("audit.filters.resource");
	const emptyTitle = t("audit.empty.title");
	const emptyDescription = t("audit.empty.description");
	const restrictedTitle = t("audit.restricted.title");
	const restrictedDescription = t("audit.restricted.description");
	const errorTitle = t("audit.error.title");
	const retryLabel = t("audit.retry");
	const breadcrumbText = t("audit.breadcrumb");
	const rowCountLabel = t("audit.rowCount", { count: rows.length });

	const columnTimestamp = t("audit.column.timestamp");
	const columnActor = t("audit.column.actor");
	const columnAction = t("audit.column.action");
	const columnTarget = t("audit.column.target");
	const columnStatus = t("audit.column.status");
	const columnCorrelation = t("audit.column.correlation");

	const actorPlaceholder = t("audit.filters.actor.placeholder");

	const tableBody = (() => {
		if (query.isLoading) {
			return (
				<div className="space-y-2 p-4" aria-busy="true">
					<Skeleton variant="rectangular" width="100%" height={ROW_HEIGHT} />
					<Skeleton variant="rectangular" width="100%" height={ROW_HEIGHT} />
					<Skeleton variant="rectangular" width="100%" height={ROW_HEIGHT} />
					<Skeleton variant="rectangular" width="100%" height={ROW_HEIGHT} />
					<Skeleton variant="rectangular" width="100%" height={ROW_HEIGHT} />
					<Skeleton variant="rectangular" width="100%" height={ROW_HEIGHT} />
				</div>
			);
		}

		if (query.isError) {
			return (
				<EmptyState
					variant="error"
					title={errorTitle}
					description={
						query.error instanceof Error
							? query.error.message
							: t("Unknown error")
					}
					action={{ label: retryLabel, onClick: () => query.refetch() }}
				/>
			);
		}

		if (rows.length === 0) {
			return <EmptyState title={emptyTitle} description={emptyDescription} />;
		}

		return (
			<VirtualList
				items={rows}
				sizing={{ mode: "fixed", size: ROW_HEIGHT }}
				overscan={6}
				height={VIRTUAL_HEIGHT}
				className="border-t"
				style={{
					borderColor:
						"color-mix(in srgb, var(--color-border) 68%, transparent)",
				}}
				getKey={(item) => item.id}
			>
				{({ item, style }) => {
					const status = deriveStatus(item.action);
					const targetLabel = item.resource_id
						? `${item.resource} · ${shortenId(item.resource_id, 10)}`
						: item.resource;
					return (
						<div
							style={style}
							className="grid grid-cols-[1.5fr_1fr_1fr_1.5fr_0.8fr_1fr] items-center border-b px-4 text-xs"
						>
							<span className="truncate" style={headingStyle}>
								{formatAuditTimestamp(item.created_at)}
							</span>
							<span
								className="truncate font-mono text-[11px]"
								style={mutedTextStyle}
								title={item.user_id ?? undefined}
							>
								{shortenId(item.user_id)}
							</span>
							<span className="truncate">
								<Badge variant="outline" title={item.action}>
									{localizeAuditEvent(locale, item.action)}
								</Badge>
							</span>
							<span
								className="truncate"
								style={headingStyle}
								title={targetLabel}
							>
								{targetLabel}
							</span>
							<span>
								<Badge variant={status.variant}>
									{statusCopy(status.label, t)}
								</Badge>
							</span>
							<span
								className="truncate font-mono text-[11px]"
								style={mutedTextStyle}
								title={item.hash}
							>
								{shortenId(item.hash, 12)}
							</span>
						</div>
					);
				}}
			</VirtualList>
		);
	})();

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<p
						className="mb-2 text-xs uppercase tracking-[0.12em]"
						style={mutedTextStyle}
					>
						{breadcrumbText}
					</p>
					<CardTitle
						className="flex items-center gap-2 text-3xl font-bold tracking-tight"
						style={headingStyle}
					>
						<FileSearch
							aria-hidden="true"
							className="h-7 w-7"
							style={{ color: "var(--color-primary-500)" }}
						/>
						{titleText}
					</CardTitle>
					<p className="text-sm" style={mutedTextStyle}>
						{subtitleText}
					</p>
				</CardHeader>
			</Card>

			{!isAdmin ? (
				<EmptyState
					variant="error"
					title={restrictedTitle}
					description={restrictedDescription}
				/>
			) : (
				<>
					<Card>
						<CardContent className="grid gap-3 p-4 md:grid-cols-3">
							<label
								htmlFor="audit-filter-actor"
								className="flex flex-col gap-1 text-xs"
								style={mutedTextStyle}
							>
								<span>{filterActorLabel}</span>
								<Input
									id="audit-filter-actor"
									value={actorQuery}
									onChange={(event) => setActorQuery(event.target.value)}
									placeholder={actorPlaceholder}
								/>
							</label>
							<label
								htmlFor="audit-filter-action"
								className="flex flex-col gap-1 text-xs"
								style={mutedTextStyle}
							>
								<span>{filterActionLabel}</span>
								<Input
									id="audit-filter-action"
									value={action}
									onChange={(event) => setAction(event.target.value)}
									placeholder="create / update / delete"
								/>
							</label>
							<label
								htmlFor="audit-filter-resource"
								className="flex flex-col gap-1 text-xs"
								style={mutedTextStyle}
							>
								<span>{filterResourceLabel}</span>
								<Input
									id="audit-filter-resource"
									value={resource}
									onChange={(event) => setResource(event.target.value)}
									placeholder="users / banners / channels"
								/>
							</label>
						</CardContent>
					</Card>

					<Card>
						<CardContent className="p-0">
							<div
								className="flex items-center justify-between gap-3 px-4 py-2 text-xs"
								style={mutedTextStyle}
							>
								<span>{rowCountLabel}</span>
								{query.isFetching ? (
									<span aria-live="polite">{t("audit.fetching")}</span>
								) : null}
							</div>
							<div
								className="grid grid-cols-[1.5fr_1fr_1fr_1.5fr_0.8fr_1fr] items-center border-t border-b px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em]"
								style={headerRowStyle}
							>
								<span>{columnTimestamp}</span>
								<span>{columnActor}</span>
								<span>{columnAction}</span>
								<span>{columnTarget}</span>
								<span>{columnStatus}</span>
								<span>{columnCorrelation}</span>
							</div>
							<div
								className="rounded-b-xl"
								style={tableWrapperStyle}
								data-testid="audit-virtual-body"
							>
								{tableBody}
							</div>
						</CardContent>
					</Card>
				</>
			)}
		</div>
	);
}

export default function AdminAuditPage() {
	return <AdminAuditContent />;
}
