"use client";

/**
 * /[locale]/admin/sources/[id] — native source detail page (P0 D1).
 *
 * Shows the source profile, scheduling config, last-fetch metrics, and a
 * "Trigger fetch" CTA. Per-run history is not yet exposed by the backend;
 * the corresponding card surfaces an in-line gap notice instead of mocking
 * data.
 */

import { AdminDetailErrorCard } from "@/components/admin/detail-error-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSource, useTriggerFetch } from "@/hooks/use-sources";
import { formatDateTime, withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { useToast } from "@/stores/toast-store";
import {
	Activity,
	AlertTriangle,
	ArrowLeft,
	CheckCircle2,
	Globe,
	Loader2,
	PlayCircle,
	Rss,
	XCircle,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";

const HEALTH_VARIANT: Record<
	string,
	"success" | "warning" | "destructive" | "secondary"
> = {
	healthy: "success",
	degraded: "warning",
	unhealthy: "destructive",
	unknown: "secondary",
	"": "secondary",
};

export default function AdminSourceDetailPage() {
	const t = useT();
	const locale = useLocale();
	const router = useRouter();
	const params = useParams<{ id: string }>();
	const sourceId = typeof params?.id === "string" ? params.id : "";

	const sourceQuery = useSource(sourceId);
	const triggerFetch = useTriggerFetch();
	const { success, error } = useToast();

	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;

	const handleBack = () =>
		router.push(withLocalePath(locale, "/admin/sources"));
	const handleTriggerFetch = async () => {
		if (!sourceId) return;
		try {
			await triggerFetch.mutateAsync(sourceId);
			success(t("Fetch triggered"), t("The source will be refreshed shortly."));
		} catch (cause) {
			error(
				t("Trigger failed"),
				cause instanceof Error ? cause.message : t("Unknown error"),
			);
		}
	};

	if (!sourceId) return null;

	const source = sourceQuery.data;

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div>
							<CardTitle
								className="flex items-center gap-2 text-3xl font-bold tracking-tight"
								style={headingStyle}
							>
								<Rss
									aria-hidden="true"
									className="h-7 w-7"
									style={{ color: "var(--color-primary-500)" }}
								/>
								{t("Source detail")}
							</CardTitle>
							<p className="mt-1 text-sm" style={mutedTextStyle}>
								{t("Inspect crawl configuration, last-fetch metrics, and health.")}
							</p>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<Button type="button" variant="outline" onClick={handleBack}>
								<ArrowLeft aria-hidden="true" className="h-4 w-4" />
								{t("Back to sources")}
							</Button>
							<Button
								type="button"
								onClick={handleTriggerFetch}
								disabled={!source || triggerFetch.isPending}
							>
								{triggerFetch.isPending ? (
									<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
								) : (
									<PlayCircle aria-hidden="true" className="h-4 w-4" />
								)}
								{t("Trigger fetch")}
							</Button>
						</div>
					</div>
				</CardHeader>
			</Card>

			{sourceQuery.isLoading ? (
				<Card>
					<CardContent className="flex items-center gap-2 py-8 text-sm">
						<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
						{t("Loading source detail")}
					</CardContent>
				</Card>
			) : sourceQuery.isError || !source ? (
				<AdminDetailErrorCard
					resource="source"
					error={sourceQuery.error}
					onRetry={() => sourceQuery.refetch()}
				/>
			) : (
				<>
					<Card>
						<CardHeader>
							<CardTitle className="text-base">{t("Profile")}</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							<div className="flex flex-wrap items-center gap-2">
								<p className="text-lg font-semibold" style={headingStyle}>
									{source.name}
								</p>
								<Badge variant="outline">{source.source_type}</Badge>
								<Badge variant={HEALTH_VARIANT[source.health_status] ?? "secondary"}>
									<Activity aria-hidden="true" className="mr-1 h-3 w-3" />
									{t(
										source.health_status
											? source.health_status
													.charAt(0)
													.toUpperCase() + source.health_status.slice(1)
											: "Unknown",
									)}
								</Badge>
								{source.is_active ? (
									<Badge variant="success">
										<CheckCircle2 aria-hidden="true" className="mr-1 h-3 w-3" />
										{t("Active")}
									</Badge>
								) : (
									<Badge variant="outline">
										<XCircle aria-hidden="true" className="mr-1 h-3 w-3" />
										{t("Paused")}
									</Badge>
								)}
							</div>
							<a
								href={source.url}
								target="_blank"
								rel="noopener noreferrer"
								className="flex items-center gap-2 break-all text-sm underline-offset-4 hover:underline"
								style={{ color: "var(--color-primary-500)" }}
							>
								<Globe aria-hidden="true" className="h-4 w-4 shrink-0" />
								{source.url}
							</a>
							<dl
								className="grid gap-3 text-xs sm:grid-cols-2"
								style={mutedTextStyle}
							>
								<div>
									<dt className="uppercase tracking-wide">{t("Schedule")}</dt>
									<dd className="mt-1" style={headingStyle}>
										{source.schedule ?? t("On-demand")}
									</dd>
								</div>
								<div>
									<dt className="uppercase tracking-wide">{t("Priority")}</dt>
									<dd className="mt-1" style={headingStyle}>
										{source.priority}
									</dd>
								</div>
								<div>
									<dt className="uppercase tracking-wide">
										{t("Render mode")}
									</dt>
									<dd className="mt-1" style={headingStyle}>
										{source.render_mode || t("Static")}
									</dd>
								</div>
								<div>
									<dt className="uppercase tracking-wide">{t("Encoding")}</dt>
									<dd className="mt-1" style={headingStyle}>
										{source.encoding ?? t("Auto-detect")}
									</dd>
								</div>
							</dl>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-base">
								<Activity aria-hidden="true" className="h-4 w-4" />
								{t("Fetch metrics")}
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							<dl
								className="grid gap-4 text-xs sm:grid-cols-2 lg:grid-cols-4"
								style={mutedTextStyle}
							>
								<div>
									<dt className="uppercase tracking-wide">
										{t("Last fetch")}
									</dt>
									<dd className="mt-1 text-sm" style={headingStyle}>
										{source.last_fetch
											? formatDateTime(locale, source.last_fetch, {
													year: "numeric",
													month: "2-digit",
													day: "2-digit",
													hour: "2-digit",
													minute: "2-digit",
												})
											: t("Never fetched")}
									</dd>
								</div>
								<div>
									<dt className="uppercase tracking-wide">
										{t("Total articles fetched")}
									</dt>
									<dd className="mt-1 text-sm" style={headingStyle}>
										{source.total_articles_fetched}
									</dd>
								</div>
								<div>
									<dt className="uppercase tracking-wide">
										{t("Avg fetch duration")}
									</dt>
									<dd className="mt-1 text-sm" style={headingStyle}>
										{source.avg_fetch_duration_ms
											? `${source.avg_fetch_duration_ms} ms`
											: t("No data")}
									</dd>
								</div>
								<div>
									<dt className="uppercase tracking-wide">
										{t("Consecutive failures")}
									</dt>
									<dd className="mt-1 text-sm" style={headingStyle}>
										{source.consecutive_failures}
									</dd>
								</div>
							</dl>

							{source.last_error ? (
								<div
									className="flex items-start gap-2 rounded-2xl border p-3 text-sm"
									style={{
										borderColor: "color-mix(in srgb, #f87171 70%, transparent)",
										backgroundColor:
											"color-mix(in srgb, #fee2e2 60%, transparent)",
										color: "#b91c1c",
									}}
								>
									<AlertTriangle
										aria-hidden="true"
										className="mt-0.5 h-4 w-4 shrink-0"
									/>
									<p className="break-words">{source.last_error}</p>
								</div>
							) : null}
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="text-base">
								{t("Crawl configuration")}
							</CardTitle>
						</CardHeader>
						<CardContent>
							{source.config && Object.keys(source.config).length > 0 ? (
								<pre
									className="overflow-x-auto rounded-xl border p-3 text-xs"
									style={{
										borderColor:
											"color-mix(in srgb, var(--color-border) 78%, transparent)",
										backgroundColor: "var(--field-surface)",
										color: "var(--field-foreground)",
									}}
								>
									{JSON.stringify(source.config, null, 2)}
								</pre>
							) : (
								<p className="text-sm" style={mutedTextStyle}>
									{t("No crawl configuration overrides.")}
								</p>
							)}
						</CardContent>
					</Card>
				</>
			)}
		</div>
	);
}
