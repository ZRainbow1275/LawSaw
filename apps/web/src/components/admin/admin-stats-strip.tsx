"use client";

import { AnimatedNumber } from "@/components/ui/animated-number";
import { Skeleton } from "@/components/ui/skeleton";
import {
	type AdminDashboardSummary,
	type AiGatewayStatus,
	useAdminDashboardSummary,
} from "@/hooks/use-admin-dashboard";
import { useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import {
	AlertTriangle,
	BrainCircuit,
	CheckCircle2,
	FileStack,
	type LucideIcon,
	MessageSquareWarning,
	UserCheck,
	XCircle,
} from "lucide-react";

/**
 * Visual styling for one KPI tile. Kept inline rather than reaching for
 * Card component because the strip uses a tighter vertical rhythm than
 * the workspace tile grid below it.
 */
interface TileStyle {
	background: string;
	borderColor: string;
	iconBackground: string;
	iconColor: string;
	labelColor: string;
	valueColor: string;
	captionColor: string;
}

const NEUTRAL_TILE: TileStyle = {
	background: "var(--surface-elevated-bg)",
	borderColor: "var(--surface-muted-border)",
	iconBackground: "var(--control-selected-bg)",
	iconColor: "var(--color-primary-600)",
	labelColor: "var(--surface-muted-text)",
	valueColor: "var(--color-foreground)",
	captionColor: "var(--surface-muted-text)",
};

const GATEWAY_TILE: Record<AiGatewayStatus, TileStyle> = {
	healthy: {
		background: "var(--surface-hero-emerald-gradient)",
		borderColor: "color-mix(in srgb, #10b981 35%, transparent)",
		iconBackground: "rgba(255, 255, 255, 0.7)",
		iconColor: "#047857",
		labelColor: "#065f46",
		valueColor: "#064e3b",
		captionColor: "#065f46",
	},
	degraded: {
		background: "var(--surface-hero-amber-gradient)",
		borderColor: "color-mix(in srgb, #f59e0b 35%, transparent)",
		iconBackground: "rgba(255, 255, 255, 0.75)",
		iconColor: "#b45309",
		labelColor: "#78350f",
		valueColor: "#78350f",
		captionColor: "#92400e",
	},
	down: {
		background: "var(--surface-hero-rose-gradient)",
		borderColor: "color-mix(in srgb, #ef4444 35%, transparent)",
		iconBackground: "rgba(255, 255, 255, 0.75)",
		iconColor: "#b91c1c",
		labelColor: "#7f1d1d",
		valueColor: "#7f1d1d",
		captionColor: "#991b1b",
	},
};

const GATEWAY_ICON: Record<AiGatewayStatus, LucideIcon> = {
	healthy: CheckCircle2,
	degraded: AlertTriangle,
	down: XCircle,
};

interface KpiTileProps {
	label: string;
	value: number;
	caption?: string;
	icon: LucideIcon;
	style: TileStyle;
}

function KpiTile({ label, value, caption, icon: Icon, style }: KpiTileProps) {
	return (
		<div
			className="flex h-full flex-col justify-between gap-3 rounded-2xl border p-5 shadow-sm"
			style={{
				background: style.background,
				borderColor: style.borderColor,
			}}
		>
			<div className="flex items-center justify-between">
				<p
					className="text-xs font-semibold uppercase tracking-[0.08em]"
					style={{ color: style.labelColor }}
				>
					{label}
				</p>
				<span
					className="flex h-9 w-9 items-center justify-center rounded-xl"
					style={{
						backgroundColor: style.iconBackground,
						color: style.iconColor,
					}}
				>
					<Icon aria-hidden="true" className="h-4 w-4" />
				</span>
			</div>
			<div className="space-y-1">
				<AnimatedNumber
					value={value}
					duration={1000}
					animateOnView={false}
					numberClassName="text-3xl font-bold leading-tight"
					className="block"
				/>
				{caption ? (
					<p className="text-xs" style={{ color: style.captionColor }}>
						{caption}
					</p>
				) : null}
			</div>
		</div>
	);
}

/**
 * Status tile is special-cased: the value is a label, not a numeral, and
 * the entire surface is colored by the gateway status (traffic light).
 */
interface StatusTileProps {
	label: string;
	statusLabel: string;
	caption: string;
	status: AiGatewayStatus;
}

function StatusTile({ label, statusLabel, caption, status }: StatusTileProps) {
	const style = GATEWAY_TILE[status];
	const Icon = GATEWAY_ICON[status];

	return (
		<div
			className="flex h-full flex-col justify-between gap-3 rounded-2xl border p-5 shadow-sm"
			style={{
				background: style.background,
				borderColor: style.borderColor,
			}}
		>
			<div className="flex items-center justify-between">
				<p
					className="text-xs font-semibold uppercase tracking-[0.08em]"
					style={{ color: style.labelColor }}
				>
					{label}
				</p>
				<span
					className="flex h-9 w-9 items-center justify-center rounded-xl"
					style={{
						backgroundColor: style.iconBackground,
						color: style.iconColor,
					}}
				>
					<Icon aria-hidden="true" className="h-4 w-4" />
				</span>
			</div>
			<div className="space-y-1">
				<p
					className="text-3xl font-bold leading-tight"
					style={{ color: style.valueColor }}
				>
					{statusLabel}
				</p>
				<p className="text-xs" style={{ color: style.captionColor }}>
					{caption}
				</p>
			</div>
		</div>
	);
}

function StripSkeleton() {
	const placeholders = [0, 1, 2, 3, 4];
	return (
		<div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
			{placeholders.map((idx) => (
				<div
					key={`admin-strip-skeleton-${idx}`}
					className="rounded-2xl border p-5 shadow-sm"
					style={{
						backgroundColor: "var(--surface-elevated-bg)",
						borderColor: "var(--surface-muted-border)",
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
	const totalArticles = summary.articles_total;
	const tokensApprox = Math.round(summary.ai_tokens_24h);

	const tokensCaption = t("{count} calls in 24h", {
		count: summary.ai_calls_24h.toLocaleString(),
	});
	const feedbacksCaption = t("{total} total feedback", {
		total: summary.feedbacks_total.toLocaleString(),
	});
	const totalArticlesCaption = t("{total} articles in library", {
		total: totalArticles.toLocaleString(),
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

	void tokensApprox;
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
 * 1. Active users (24h)
 * 2. Articles ingested (24h)
 * 3. AI tokens used (24h)
 * 4. Pending feedback
 * 5. AI gateway status (traffic light)
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
					backgroundColor: "var(--surface-muted-bg)",
					borderColor: "var(--surface-muted-border)",
					color: "var(--surface-muted-text)",
				}}
			>
				{t("Unable to load operational metrics. Please retry shortly.")}
			</div>
		);
	}

	const resolved = resolveStrip(data, t);

	return (
		<div
			className={cn("grid gap-3", "grid-cols-2 md:grid-cols-3 xl:grid-cols-5")}
		>
			<KpiTile
				label={t("Active users 24h")}
				value={resolved.summary.active_users_24h}
				icon={UserCheck}
				style={NEUTRAL_TILE}
			/>
			<KpiTile
				label={t("Articles 24h")}
				value={resolved.summary.articles_ingested_24h}
				caption={resolved.totalArticlesCaption}
				icon={FileStack}
				style={NEUTRAL_TILE}
			/>
			<KpiTile
				label={t("AI tokens 24h")}
				value={resolved.summary.ai_tokens_24h}
				caption={resolved.tokensCaption}
				icon={BrainCircuit}
				style={NEUTRAL_TILE}
			/>
			<KpiTile
				label={t("Pending feedback")}
				value={resolved.summary.feedbacks_pending}
				caption={resolved.feedbacksCaption}
				icon={MessageSquareWarning}
				style={NEUTRAL_TILE}
			/>
			<StatusTile
				label={t("AI gateway")}
				statusLabel={resolved.statusLabel}
				caption={resolved.statusCaption}
				status={resolved.summary.ai_gateway_status}
			/>
		</div>
	);
}

export default AdminStatsStrip;
