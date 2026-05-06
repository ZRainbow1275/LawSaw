"use client";

import { ProtectedRoute } from "@/components/auth/protected-route";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminDashboardSummary } from "@/hooks/use-admin-dashboard";
import { apiClient } from "@/lib/api";
import { useT } from "@/lib/i18n-client";
import { useAuthStore } from "@/stores/auth-store";
import { useToast } from "@/stores/toast-store";
import { useQuery } from "@tanstack/react-query";
import {
	AlertTriangle,
	BrainCircuit,
	CheckCircle2,
	DollarSign,
	Download,
	Gauge,
	type LucideIcon,
	TrendingUp,
	Users,
	Zap,
} from "lucide-react";
import { useMemo } from "react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Legend,
	Line,
	LineChart,
	Pie,
	PieChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AiUsageEventRecord {
	id: string;
	request_scope: string;
	operation: string;
	provider: string;
	model: string | null;
	success: boolean;
	error_category: string | null;
	error_message: string | null;
	latency_ms: number;
	created_at: string;
}

interface AiUsageListResponse {
	data: AiUsageEventRecord[];
	total: number;
	limit: number;
	offset: number;
}

interface HourBucketPoint {
	bucket: string;
	tokens: number;
	calls: number;
}

interface ModelSlice {
	model: string;
	calls: number;
	tokens: number;
}

interface TopActor {
	actor: string;
	calls: number;
	tokens: number;
}

// ─── Validators ─────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertAiUsageList(
	value: unknown,
): asserts value is AiUsageListResponse {
	if (
		!isRecord(value) ||
		!Array.isArray(value.data) ||
		typeof value.total !== "number"
	) {
		throw new Error("Invalid AI usage list response");
	}
}

// ─── Style tokens (mirrors admin-stats-strip) ───────────────────────────────

const NEUTRAL_TILE = {
	background: "var(--surface-elevated-bg)",
	borderColor: "var(--surface-muted-border)",
	iconBackground: "var(--control-selected-bg)",
	iconColor: "var(--color-primary-600)",
	labelColor: "var(--surface-muted-text)",
	valueColor: "var(--color-foreground)",
	captionColor: "var(--surface-muted-text)",
} as const;

const MODEL_COLORS: Record<string, string> = {
	"Qwen3-8B": "#3b82f6",
	"qwen3-8b": "#3b82f6",
	"bge-m3": "#10b981",
	"bge-reranker-v2-m3": "#f59e0b",
};

const FALLBACK_PALETTE = [
	"#6366f1",
	"#0ea5e9",
	"#14b8a6",
	"#84cc16",
	"#eab308",
	"#f97316",
	"#ef4444",
	"#a855f7",
];

function colorForModel(model: string, idx: number): string {
	return MODEL_COLORS[model] ?? FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length];
}

// ─── KPI tile component ─────────────────────────────────────────────────────

interface KpiTileProps {
	label: string;
	value: string;
	caption?: string;
	icon: LucideIcon;
	valueColor?: string;
}

function KpiTile({
	label,
	value,
	caption,
	icon: Icon,
	valueColor,
}: KpiTileProps) {
	return (
		<div
			className="flex h-full flex-col justify-between gap-3 rounded-2xl border p-5 shadow-sm"
			style={{
				background: NEUTRAL_TILE.background,
				borderColor: NEUTRAL_TILE.borderColor,
			}}
		>
			<div className="flex items-center justify-between">
				<p
					className="text-xs font-semibold uppercase tracking-[0.08em]"
					style={{ color: NEUTRAL_TILE.labelColor }}
				>
					{label}
				</p>
				<span
					className="flex h-9 w-9 items-center justify-center rounded-xl"
					style={{
						backgroundColor: NEUTRAL_TILE.iconBackground,
						color: NEUTRAL_TILE.iconColor,
					}}
				>
					<Icon aria-hidden="true" className="h-4 w-4" />
				</span>
			</div>
			<div className="space-y-1">
				<p
					className="text-3xl font-bold leading-tight"
					style={{ color: valueColor ?? NEUTRAL_TILE.valueColor }}
				>
					{value}
				</p>
				{caption ? (
					<p className="text-xs" style={{ color: NEUTRAL_TILE.captionColor }}>
						{caption}
					</p>
				) : null}
			</div>
		</div>
	);
}

// ─── Aggregation helpers (client-side derive from event list) ───────────────

function aggregateHourBuckets(
	events: ReadonlyArray<AiUsageEventRecord>,
): HourBucketPoint[] {
	const buckets = new Map<string, { tokens: number; calls: number }>();
	const now = new Date();
	const baseHour = new Date(
		Date.UTC(
			now.getUTCFullYear(),
			now.getUTCMonth(),
			now.getUTCDate(),
			now.getUTCHours(),
		),
	);
	for (let i = 23; i >= 0; i -= 1) {
		const slot = new Date(baseHour.getTime() - i * 3_600_000);
		buckets.set(slot.toISOString(), { tokens: 0, calls: 0 });
	}

	for (const event of events) {
		const parsed = new Date(event.created_at);
		if (Number.isNaN(parsed.getTime())) continue;
		const hourKey = new Date(
			Date.UTC(
				parsed.getUTCFullYear(),
				parsed.getUTCMonth(),
				parsed.getUTCDate(),
				parsed.getUTCHours(),
			),
		).toISOString();
		const bucket = buckets.get(hourKey);
		if (!bucket) continue;
		bucket.calls += 1;
		// token approximation = latency_ms / 4 if real token counts unavailable
		bucket.tokens += Math.max(1, Math.round(event.latency_ms / 4));
	}

	return Array.from(buckets.entries()).map(([iso, value]) => {
		const date = new Date(iso);
		const hour = date.getUTCHours().toString().padStart(2, "0");
		return {
			bucket: `${hour}:00`,
			tokens: value.tokens,
			calls: value.calls,
		};
	});
}

function aggregateByModel(
	events: ReadonlyArray<AiUsageEventRecord>,
): ModelSlice[] {
	const map = new Map<string, ModelSlice>();
	for (const event of events) {
		const key = event.model ?? "unknown";
		const existing = map.get(key) ?? { model: key, calls: 0, tokens: 0 };
		existing.calls += 1;
		existing.tokens += Math.max(1, Math.round(event.latency_ms / 4));
		map.set(key, existing);
	}
	return Array.from(map.values()).sort((a, b) => b.calls - a.calls);
}

function topActorsByScope(
	events: ReadonlyArray<AiUsageEventRecord>,
	limit: number,
): TopActor[] {
	const map = new Map<string, TopActor>();
	for (const event of events) {
		const key = event.request_scope || "unknown";
		const existing = map.get(key) ?? { actor: key, calls: 0, tokens: 0 };
		existing.calls += 1;
		existing.tokens += Math.max(1, Math.round(event.latency_ms / 4));
		map.set(key, existing);
	}
	return Array.from(map.values())
		.sort((a, b) => b.calls - a.calls)
		.slice(0, limit);
}

function computeP95Latency(events: ReadonlyArray<AiUsageEventRecord>): number {
	if (events.length === 0) return 0;
	const sorted = events.map((e) => e.latency_ms).sort((a, b) => a - b);
	const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
	return sorted[idx];
}

function computeFailureRate(events: ReadonlyArray<AiUsageEventRecord>): number {
	if (events.length === 0) return 0;
	const failed = events.filter((e) => !e.success).length;
	return (failed / events.length) * 100;
}

function compactNumber(value: number): string {
	if (!Number.isFinite(value)) return "-";
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
	return value.toLocaleString();
}

function escapeCsvField(value: string): string {
	if (/[,"\n\r]/.test(value)) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

function eventsToCsv(events: ReadonlyArray<AiUsageEventRecord>): string {
	const header = [
		"id",
		"created_at",
		"provider",
		"model",
		"operation",
		"scope",
		"success",
		"latency_ms",
		"error_category",
		"error_message",
	].join(",");
	const rows = events.map((e) =>
		[
			e.id,
			e.created_at,
			e.provider,
			e.model ?? "",
			e.operation,
			e.request_scope,
			e.success ? "true" : "false",
			String(e.latency_ms),
			e.error_category ?? "",
			e.error_message ?? "",
		]
			.map(escapeCsvField)
			.join(","),
	);
	return [header, ...rows].join("\r\n");
}

// ─── Page content ───────────────────────────────────────────────────────────

const DAILY_TOKEN_BUDGET = 1_000_000;
const MONTHLY_TOKEN_BUDGET = 25_000_000;
const COST_PER_1K_TOKENS_USD = 0.0008;
const P95_WARNING_MS = 1_500;

function AdminAiUsageDashboardContent() {
	const t = useT();
	const roles = useAuthStore((s) => s.roles);
	const isAdmin = roles.some((role) =>
		["super_admin", "tenant_admin", "admin"].includes(role),
	);
	const { error: toastError, success: toastSuccess } = useToast();

	const summaryQuery = useAdminDashboardSummary({ enabled: isAdmin });

	const eventsQuery = useQuery({
		queryKey: ["admin-ai-usage", "dashboard", 200],
		enabled: isAdmin,
		queryFn: () =>
			apiClient.get<AiUsageListResponse>(
				"/api/v1/admin/ai-usage?limit=200",
				assertAiUsageList,
			),
	});

	// Detailed time-series, per-user breakdown, and budget actuals are tracked
	// in B.6b. We keep the queries declared for ergonomic refresh later but
	// disable them to avoid hitting non-existent endpoints today.
	useQuery({
		queryKey: ["admin-ai-usage", "timeseries", "24h"],
		enabled: false,
		queryFn: async () => null,
	});
	useQuery({
		queryKey: ["admin-ai-usage", "top-users"],
		enabled: false,
		queryFn: async () => null,
	});
	useQuery({
		queryKey: ["admin-ai-usage", "budget"],
		enabled: false,
		queryFn: async () => null,
	});

	const events = eventsQuery.data?.data ?? [];

	const hourBuckets = useMemo(() => aggregateHourBuckets(events), [events]);
	const modelSlices = useMemo(() => aggregateByModel(events), [events]);
	const topActors = useMemo(() => topActorsByScope(events, 10), [events]);
	const p95Latency = useMemo(() => computeP95Latency(events), [events]);
	const failureRate = useMemo(() => computeFailureRate(events), [events]);

	const summary = summaryQuery.data;
	const tokens24h = summary?.ai_tokens_24h ?? 0;
	const calls24h = summary?.ai_calls_24h ?? 0;
	const cost24hUsd = (tokens24h / 1000) * COST_PER_1K_TOKENS_USD;
	const dailyUsedPct = Math.min(100, (tokens24h / DAILY_TOKEN_BUDGET) * 100);
	const monthlyApprox = tokens24h * 30;
	const monthlyUsedPct = Math.min(
		100,
		(monthlyApprox / MONTHLY_TOKEN_BUDGET) * 100,
	);

	const handleExportCsv = () => {
		try {
			const csv = eventsToCsv(events);
			const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			const stamp = new Date().toISOString().replace(/[:.]/g, "-");
			link.href = url;
			link.download = `ai-usage-${stamp}.csv`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);
			toastSuccess(
				t("Export ready"),
				t("Downloaded {n} rows", { n: events.length }),
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : t("Unknown error");
			toastError(t("Export failed"), message);
		}
	};

	const pageStyle = {
		backgroundColor:
			"color-mix(in srgb, var(--surface-muted-bg) 55%, transparent)",
	} as const;
	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;

	if (!isAdmin) {
		return (
			<div className="p-4 md:p-6">
				<EmptyState
					title={t("Access restricted")}
					description={t(
						"You need an administrative role to access this workspace.",
					)}
				/>
			</div>
		);
	}

	const isLoading = summaryQuery.isLoading || eventsQuery.isLoading;
	const isError = summaryQuery.isError || eventsQuery.isError;

	return (
		<div className="space-y-6 p-4 md:p-6">
			<Card>
				<CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<CardTitle
							className="flex items-center gap-2 text-3xl font-bold tracking-tight"
							style={headingStyle}
						>
									<BrainCircuit
										aria-hidden="true"
										className="h-7 w-7"
										style={{ color: "var(--color-primary-500)" }}
									/>
									{t("AI usage dashboard")}
								</CardTitle>
								<CardDescription>
									{t(
										"Monitor LLM and embedding traffic, model mix, latency budgets and cost trajectories across your tenant.",
									)}
								</CardDescription>
							</div>
							<Button
								variant="outline"
								size="sm"
								onClick={handleExportCsv}
								disabled={events.length === 0}
							>
								<Download aria-hidden="true" className="mr-2 h-4 w-4" />
								{t("Export CSV")}
							</Button>
						</CardHeader>
					</Card>

					{isLoading ? (
						<div className="grid gap-3 grid-cols-2 md:grid-cols-4">
							{[0, 1, 2, 3].map((i) => (
								<div
									key={`kpi-skeleton-${i}`}
									className="rounded-2xl border p-5"
									style={{
										backgroundColor: "var(--surface-elevated-bg)",
										borderColor: "var(--surface-muted-border)",
									}}
								>
									<Skeleton variant="text" width={72} height={12} />
									<div className="mt-4">
										<Skeleton variant="text" width={120} height={28} />
									</div>
								</div>
							))}
						</div>
					) : isError ? (
						<EmptyState
							variant="error"
							title={t("Failed to load AI usage")}
							description={t(
								"Backend services are unreachable. Verify gateway health and retry.",
							)}
							action={{
								label: t("Retry"),
								onClick: () => {
									void summaryQuery.refetch();
									void eventsQuery.refetch();
								},
							}}
						/>
					) : (
						<>
							{/* KPI strip — 4 cards */}
							<div className="grid gap-3 grid-cols-2 md:grid-cols-4">
								<KpiTile
									label={t("Tokens 24h")}
									value={compactNumber(tokens24h)}
									caption={t("{n} model calls", {
										n: calls24h.toLocaleString(),
									})}
									icon={Zap}
								/>
								<KpiTile
									label={t("Calls 24h")}
									value={calls24h.toLocaleString()}
									caption={t("Across all models and operations")}
									icon={TrendingUp}
								/>
								<KpiTile
									label={t("Estimated cost 24h")}
									value={`$${cost24hUsd.toFixed(2)}`}
									caption={t("@ {rate}/1K tokens", {
										rate: COST_PER_1K_TOKENS_USD.toFixed(4),
									})}
									icon={DollarSign}
								/>
								<KpiTile
									label={t("Failure rate")}
									value={`${failureRate.toFixed(2)}%`}
									caption={t("Last {n} events", { n: events.length })}
									icon={AlertTriangle}
									valueColor={
										failureRate >= 5
											? "var(--color-error)"
											: failureRate >= 1
												? "#b45309"
												: undefined
									}
								/>
							</div>

							{/* P95 latency alert bar */}
							<Card
								className="border"
								style={{
									borderColor:
										p95Latency >= P95_WARNING_MS
											? "color-mix(in srgb, var(--color-error) 35%, transparent)"
											: "var(--surface-muted-border)",
									backgroundColor:
										p95Latency >= P95_WARNING_MS
											? "color-mix(in srgb, var(--color-error-light) 50%, transparent)"
											: undefined,
								}}
							>
								<CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
									<div className="flex items-center gap-3">
										<span
											className="flex h-10 w-10 items-center justify-center rounded-xl"
											style={{
												backgroundColor:
													p95Latency >= P95_WARNING_MS
														? "color-mix(in srgb, var(--color-error) 18%, transparent)"
														: "var(--control-selected-bg)",
												color:
													p95Latency >= P95_WARNING_MS
														? "var(--color-error)"
														: "var(--color-primary-600)",
											}}
										>
											{p95Latency >= P95_WARNING_MS ? (
												<AlertTriangle aria-hidden="true" className="h-5 w-5" />
											) : (
												<CheckCircle2 aria-hidden="true" className="h-5 w-5" />
											)}
										</span>
										<div>
											<p className="text-sm font-semibold" style={headingStyle}>
												{t("P95 latency")}: {p95Latency} ms
											</p>
											<p className="text-xs" style={mutedTextStyle}>
												{p95Latency >= P95_WARNING_MS
													? t(
															"Latency exceeds the {budget}ms SLA threshold. Investigate gateway or upstream model.",
															{ budget: P95_WARNING_MS },
														)
													: t(
															"Latency is within the {budget}ms SLA threshold.",
															{ budget: P95_WARNING_MS },
														)}
											</p>
										</div>
									</div>
									<Badge
										variant={
											p95Latency >= P95_WARNING_MS ? "destructive" : "outline"
										}
									>
										{p95Latency >= P95_WARNING_MS
											? t("Above SLA")
											: t("Within SLA")}
									</Badge>
								</CardContent>
							</Card>

							{/* Budget bars */}
							<Card>
								<CardHeader>
									<CardTitle
										className="flex items-center gap-2 text-base"
										style={headingStyle}
									>
										<Gauge aria-hidden="true" className="h-4 w-4" />
										{t("Token budget")}
									</CardTitle>
									<CardDescription>
										{t(
											"Daily and monthly token allowances. Monthly is projected from the most recent 24h.",
										)}
									</CardDescription>
								</CardHeader>
								<CardContent className="space-y-4">
									<BudgetBar
										label={t("Daily")}
										used={tokens24h}
										total={DAILY_TOKEN_BUDGET}
										usedPct={dailyUsedPct}
									/>
									<BudgetBar
										label={t("Monthly (projected)")}
										used={monthlyApprox}
										total={MONTHLY_TOKEN_BUDGET}
										usedPct={monthlyUsedPct}
									/>
								</CardContent>
							</Card>

							{/* Charts grid */}
							<div className="grid gap-4 lg:grid-cols-3">
								<Card className="lg:col-span-2">
									<CardHeader>
										<CardTitle className="text-base" style={headingStyle}>
											{t("Tokens & calls — last 24h")}
										</CardTitle>
										<CardDescription>
											{t(
												"Hourly buckets derived from recorded AI events. Detailed time-series will replace this once aggregation endpoints land.",
											)}
										</CardDescription>
									</CardHeader>
									<CardContent>
										{events.length === 0 ? (
											<EmptyState
												title={t("No AI traffic recorded yet")}
												description={t(
													"Charts will populate after the gateway ingests requests.",
												)}
											/>
										) : (
											<ResponsiveContainer width="100%" height={300}>
												<LineChart
													data={hourBuckets}
													margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
												>
													<CartesianGrid
														strokeDasharray="3 3"
														stroke="var(--surface-muted-border)"
													/>
													<XAxis
														dataKey="bucket"
														tick={{ fontSize: 11 }}
														axisLine={false}
														tickLine={false}
													/>
													<YAxis
														yAxisId="left"
														tick={{ fontSize: 11 }}
														axisLine={false}
														tickLine={false}
													/>
													<YAxis
														yAxisId="right"
														orientation="right"
														tick={{ fontSize: 11 }}
														axisLine={false}
														tickLine={false}
													/>
													<Tooltip
														contentStyle={{
															borderRadius: "8px",
															border: "1px solid #e5e5e5",
															fontSize: "12px",
														}}
													/>
													<Legend wrapperStyle={{ fontSize: "12px" }} />
													<Line
														yAxisId="left"
														type="monotone"
														dataKey="tokens"
														name={t("Tokens")}
														stroke="#3b82f6"
														strokeWidth={2}
														dot={false}
													/>
													<Line
														yAxisId="right"
														type="monotone"
														dataKey="calls"
														name={t("Calls")}
														stroke="#10b981"
														strokeWidth={2}
														dot={false}
													/>
												</LineChart>
											</ResponsiveContainer>
										)}
									</CardContent>
								</Card>

								<Card>
									<CardHeader>
										<CardTitle className="text-base" style={headingStyle}>
											{t("Model distribution")}
										</CardTitle>
										<CardDescription>
											{t("Share of calls by model name.")}
										</CardDescription>
									</CardHeader>
									<CardContent>
										{modelSlices.length === 0 ? (
											<p
												className="py-6 text-center text-sm"
												style={mutedTextStyle}
											>
												{t("No data")}
											</p>
										) : (
											<ResponsiveContainer width="100%" height={300}>
												<PieChart>
													<Pie
														data={modelSlices}
														dataKey="calls"
														nameKey="model"
														cx="50%"
														cy="50%"
														outerRadius={100}
														innerRadius={50}
														paddingAngle={2}
													>
														{modelSlices.map((entry, idx) => (
															<Cell
																key={entry.model}
																fill={colorForModel(entry.model, idx)}
															/>
														))}
													</Pie>
													<Tooltip
														formatter={(value: number) => [value, t("Calls")]}
														contentStyle={{
															borderRadius: "8px",
															border: "1px solid #e5e5e5",
															fontSize: "12px",
														}}
													/>
													<Legend
														verticalAlign="bottom"
														height={36}
														iconType="circle"
														formatter={(value: string) => (
															<span className="text-xs text-neutral-600">
																{value}
															</span>
														)}
													/>
												</PieChart>
											</ResponsiveContainer>
										)}
									</CardContent>
								</Card>
							</div>

							{/* Top scopes (placeholder for top users until B.6b) */}
							<Card>
								<CardHeader>
									<CardTitle
										className="flex items-center gap-2 text-base"
										style={headingStyle}
									>
										<Users aria-hidden="true" className="h-4 w-4" />
										{t("Top usage scopes")}
									</CardTitle>
									<CardDescription>
										{t(
											"Per-user breakdown will land with B.6b. Until then, traffic is grouped by request scope.",
										)}
									</CardDescription>
								</CardHeader>
								<CardContent>
									{topActors.length === 0 ? (
										<p
											className="py-6 text-center text-sm"
											style={mutedTextStyle}
										>
											{t("No data")}
										</p>
									) : (
										<ResponsiveContainer width="100%" height={320}>
											<BarChart
												data={topActors}
												layout="vertical"
												margin={{ top: 8, right: 16, bottom: 8, left: 16 }}
											>
												<CartesianGrid
													strokeDasharray="3 3"
													stroke="var(--surface-muted-border)"
												/>
												<XAxis
													type="number"
													tick={{ fontSize: 11 }}
													axisLine={false}
													tickLine={false}
												/>
												<YAxis
													type="category"
													dataKey="actor"
													width={220}
													tick={{ fontSize: 11 }}
													axisLine={false}
													tickLine={false}
												/>
												<Tooltip
													formatter={(value: number, key: string) => [
														value,
														key === "calls" ? t("Calls") : t("Tokens"),
													]}
													contentStyle={{
														borderRadius: "8px",
														border: "1px solid #e5e5e5",
														fontSize: "12px",
													}}
												/>
												<Legend wrapperStyle={{ fontSize: "12px" }} />
												<Bar
													dataKey="calls"
													name={t("Calls")}
													fill="#3b82f6"
													radius={[0, 4, 4, 0]}
												/>
											</BarChart>
										</ResponsiveContainer>
									)}
								</CardContent>
							</Card>
						</>
					)}
		</div>
	);
}

interface BudgetBarProps {
	label: string;
	used: number;
	total: number;
	usedPct: number;
}

function BudgetBar({ label, used, total, usedPct }: BudgetBarProps) {
	const tone = usedPct >= 90 ? "danger" : usedPct >= 70 ? "warn" : "ok";
	const fillColor =
		tone === "danger"
			? "var(--color-error)"
			: tone === "warn"
				? "#f59e0b"
				: "#10b981";
	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between text-xs">
				<span
					className="font-medium"
					style={{ color: "var(--color-foreground)" }}
				>
					{label}
				</span>
				<span style={{ color: "var(--surface-muted-text)" }}>
					{compactNumber(used)} / {compactNumber(total)} ({usedPct.toFixed(1)}
					%)
				</span>
			</div>
			<div
				className="h-2 w-full overflow-hidden rounded-full"
				style={{ backgroundColor: "var(--surface-muted-bg)" }}
			>
				<div
					className="h-full transition-all"
					style={{
						width: `${usedPct}%`,
						backgroundColor: fillColor,
					}}
				/>
			</div>
		</div>
	);
}

export default function AdminAiUsageDashboardPage() {
	return (
		<ProtectedRoute>
			<AdminAiUsageDashboardContent />
		</ProtectedRoute>
	);
}
