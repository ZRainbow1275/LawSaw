"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard, KpiCardGrid } from "@/components/ui/kpi-card";
import {
	useAiBudgetAlerts,
	useAiContentFlags,
	useAiMetrics,
	useAiPolicy,
	useAiPromptVersions,
	useAiTokenUsage,
	useFeedExperiments,
	useRecomputeAiBudgetAlerts,
} from "@/hooks/use-ai-governance";
import { useT } from "@/lib/i18n-client";
import { motion } from "framer-motion";
import {
	AlertTriangle,
	BarChart3,
	Bot,
	Coins,
	FlaskConical,
	Loader2,
	type LucideIcon,
	RefreshCw,
	ShieldCheck,
} from "lucide-react";

const POLICY_KIND = "article_pipeline";
const variants = { hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } } as const;

function n(value: number): string {
	return new Intl.NumberFormat("zh-CN").format(value);
}

export default function AdminAiGovernancePage() {
	const t = useT();
	const policyQuery = useAiPolicy(POLICY_KIND);
	const promptsQuery = useAiPromptVersions(POLICY_KIND, { limit: 5, offset: 0 });
	const flagsQuery = useAiContentFlags({ limit: 5, offset: 0 });
	const metricsQuery = useAiMetrics();
	const usageQuery = useAiTokenUsage({ limit: 5, offset: 0 });
	const alertsQuery = useAiBudgetAlerts({ limit: 5, offset: 0 });
	const experimentsQuery = useFeedExperiments();
	const recompute = useRecomputeAiBudgetAlerts();
	const error = [
		policyQuery.error,
		promptsQuery.error,
		flagsQuery.error,
		metricsQuery.error,
		usageQuery.error,
		alertsQuery.error,
		experimentsQuery.error,
	].find(Boolean);

	if (error) {
		return (
			<EmptyState
				variant="error"
				title={t("AI governance data unavailable")}
				description={error instanceof Error ? error.message : t("Unknown error")}
			/>
		);
	}

	const loading =
		policyQuery.isLoading ||
		metricsQuery.isLoading ||
		usageQuery.isLoading ||
		alertsQuery.isLoading ||
		experimentsQuery.isLoading;
	const policy = policyQuery.data?.policy;
	const metrics = metricsQuery.data;
	const usage = usageQuery.data;
	const alerts = alertsQuery.data;
	const prompts = promptsQuery.data?.data ?? [];
	const flags = flagsQuery.data?.data ?? [];
	const experiments = experimentsQuery.data?.data ?? [];

	return (
		<motion.div initial="hidden" animate="visible" className="space-y-6">
			<motion.section variants={variants}>
				<Card className="overflow-hidden">
					<CardHeader className="relative">
						<div
							aria-hidden="true"
							className="absolute inset-0 opacity-70"
							style={{
								background:
									"radial-gradient(circle at 8% 0%, color-mix(in srgb, var(--color-primary-500) 18%, transparent), transparent 38%), radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--color-info) 18%, transparent), transparent 34%)",
							}}
						/>
						<div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
							<div>
								<p className="mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em]">
									<ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
									{t("AI governance")}
								</p>
								<CardTitle className="text-3xl font-bold tracking-tight">
									{t("Model policy")}
								</CardTitle>
								<p className="mt-2 text-sm text-[var(--surface-muted-text)]">
									{t("Govern model allow-lists, redaction policy, and tenant AI spend caps.")}
								</p>
							</div>
							<Button type="button" variant="outline" onClick={() => recompute.mutate()} disabled={recompute.isPending}>
								{recompute.isPending ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="h-4 w-4" />}
								{t("Recompute budget alerts")}
							</Button>
						</div>
					</CardHeader>
					<CardContent>
						{loading ? (
							<p className="flex items-center gap-2 text-sm text-[var(--surface-muted-text)]">
								<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> {t("Loading")}
							</p>
						) : (
							<KpiCardGrid columns={4}>
								<KpiCard tone="info" label={t("Default model")} value={policy?.model || t("Not configured")} icon={Bot} />
								<KpiCard tone="success" label={t("Processed 24h")} value={n(metrics?.processed_24h ?? 0)} icon={BarChart3} />
								<KpiCard tone="warning" label={t("Total tokens")} value={n(usage?.aggregate.total_tokens ?? 0)} icon={Coins} />
								<KpiCard tone="error" label={t("Budget alerts")} value={n(alerts?.total ?? 0)} icon={AlertTriangle} />
							</KpiCardGrid>
						)}
					</CardContent>
				</Card>
			</motion.section>

			<div className="grid gap-6 xl:grid-cols-3">
				<List title={t("Prompt versions")} rows={prompts.map((p) => [`v${p.version}`, p.prompt_checksum.slice(0, 12)])} empty={t("No prompt versions yet")} />
				<List title={t("Content flags")} rows={flags.map((f) => [f.policy_kind, f.risk_level ?? "unknown"])} empty={t("No content flags yet")} />
				<List title={t("Feed experiments")} rows={experiments.map((e) => [e.experiment_key, e.is_enabled ? `${e.rollout_percent}%` : t("disabled")])} empty={`${t("Configured experiments")}: 0`} icon={FlaskConical} />
			</div>
		</motion.div>
	);
}

function List({ title, rows, empty, icon: Icon }: { title: string; rows: string[][]; empty: string; icon?: LucideIcon }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					{Icon ? <Icon aria-hidden="true" className="h-5 w-5 text-[var(--color-primary-500)]" /> : null}
					{title}
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3">
				{rows.length === 0 ? <p className="text-sm text-[var(--surface-muted-text)]">{empty}</p> : null}
				{rows.map(([label, value]) => (
					<div key={`${title}-${label}`} className="flex items-center justify-between gap-4 rounded-xl border px-3 py-2">
						<span className="text-sm text-[var(--surface-muted-text)]">{label}</span>
						<span className="text-sm font-semibold">{value}</span>
					</div>
				))}
			</CardContent>
		</Card>
	);
}
