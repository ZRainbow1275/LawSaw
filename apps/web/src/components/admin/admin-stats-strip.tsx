"use client";

import { KpiCard, KpiCardGrid, type KpiTone } from "@/components/ui/kpi-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
	type AdminDashboardSummary,
	type AiGatewayStatus,
	useAdminDashboardSummary,
} from "@/hooks/use-admin-dashboard";
import { useT } from "@/lib/i18n-client";
import {
	AlertTriangle,
	BrainCircuit,
	CheckCircle2,
	FileStack,
	MessageSquareWarning,
	UserCheck,
	XCircle,
} from "lucide-react";

const GATEWAY_TONE: Record<AiGatewayStatus, KpiTone> = {
	healthy: "success",
	degraded: "warning",
	down: "error",
};

const GATEWAY_ICON = {
	healthy: CheckCircle2,
	degraded: AlertTriangle,
	down: XCircle,
} as const;

function StripSkeleton() {
	const placeholders = [0, 1, 2, 3, 4];
	return (
		<div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
			{placeholders.map((idx) => (
				<div
					key={`admin-strip-skeleton-${idx}`}
					className="rounded-2xl border p-5"
					style={{
						backgroundColor: "var(--admin-card-bg)",
						borderColor: "var(--admin-card-border)",
						boxShadow: "var(--admin-shadow-card)",
					}}
				>
					<div className="flex items-center justify-between">
						<Skeleton variant="text" width={72} height={12} />
						<Skeleton variant="rectangular" width={36} height={36} />
					</div>
					<div className="mt-4 space-y-2">
						<Skeleton variant="text" width={120} height={28} />
						<Skeleton variant="text" width={88} height={12} />
					</div>
				</div>
			))}
		</div>
	);
}

interface ResolvedStrip {
	summary: AdminDashboardSummary;
	tokensCaption: string;
	feedbacksCaption: string;
	totalArticlesCaption: string;
	statusLabel: string;
	statusCaption: string;
}

function resolveStrip(
	summary: AdminDashboardSummary,
	t: (key: string, params?: Record<string, string | number>) => string,
): ResolvedStrip {
	const tokensCaption = t("{count} calls in 24h", {
		count: summary.ai_calls_24h.toLocaleString(),
	});
	const feedbacksCaption = t("{total} total feedback", {
		total: summary.feedbacks_total.toLocaleString(),
	});
	const totalArticlesCaption = t("{total} articles in library", {
		total: summary.articles_total.toLocaleString(),
	});

	const statusLabel =
		summary.ai_gateway_status === "healthy"
			? t("Healthy")
			: summary.ai_gateway_status === "degraded"
				? t("Degraded")
				: t("Down");

	const statusCaption =
		summary.ai_gateway_status === "healthy"
			? t("LLM gateway responding normally")
			: summary.ai_gateway_status === "degraded"
				? t("LLM gateway partially degraded")
				: t("LLM gateway unreachable");

	return {
		summary,
		tokensCaption,
		feedbacksCaption,
		totalArticlesCaption,
		statusLabel,
		statusCaption,
	};
}

/**
 * Five-tile KPI strip rendered atop the admin workspace landing page.
 *
 * Tiles:
 * 1. Active users (24h) — info
 * 2. Articles ingested (24h) — info
 * 3. AI tokens used (24h) — info
 * 4. Pending feedback — warning when pending>0
 * 5. AI gateway status (traffic light) — success/warning/error
 */
export function AdminStatsStrip() {
	const t = useT();
	const { data, isLoading, isError } = useAdminDashboardSummary();

	if (isLoading) {
		return <StripSkeleton />;
	}

	if (isError || !data) {
		return (
			<div
				className="rounded-2xl border p-4 text-sm"
				style={{
					backgroundColor: "var(--admin-card-bg)",
					borderColor: "var(--admin-card-border)",
					color: "var(--surface-muted-text)",
					boxShadow: "var(--admin-shadow-card)",
				}}
			>
				{t("Unable to load operational metrics. Please retry shortly.")}
			</div>
		);
	}

	const resolved = resolveStrip(data, t);
	const gatewayTone = GATEWAY_TONE[resolved.summary.ai_gateway_status];
	const GatewayIcon = GATEWAY_ICON[resolved.summary.ai_gateway_status];

	return (
		<KpiCardGrid columns={5}>
			<KpiCard
				tone="info"
				icon={UserCheck}
				label={t("Active users 24h")}
				value={resolved.summary.active_users_24h}
			/>
			<KpiCard
				tone="info"
				icon={FileStack}
				label={t("Articles 24h")}
				value={resolved.summary.articles_ingested_24h}
				subtitle={resolved.totalArticlesCaption}
			/>
			<KpiCard
				tone="info"
				icon={BrainCircuit}
				label={t("AI tokens 24h")}
				value={resolved.summary.ai_tokens_24h}
				subtitle={resolved.tokensCaption}
			/>
			<KpiCard
				tone={resolved.summary.feedbacks_pending > 0 ? "warning" : "info"}
				icon={MessageSquareWarning}
				label={t("Pending feedback")}
				value={resolved.summary.feedbacks_pending}
				subtitle={resolved.feedbacksCaption}
			/>
			<KpiCard
				tone={gatewayTone}
				icon={GatewayIcon}
				label={t("AI gateway")}
				value={resolved.statusLabel}
				subtitle={resolved.statusCaption}
			/>
		</KpiCardGrid>
	);
}

export default AdminStatsStrip;
