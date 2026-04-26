"use client";

import { MarkdownReader } from "@/components/editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useReport } from "@/hooks/use-reports";
import type { Report } from "@/lib/api/types";
import { isRoleTierAtLeast } from "@/lib/authz";
import { formatDateTime, withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { useAuthStore } from "@/stores/auth-store";
import { motion } from "framer-motion";
import {
	AlertTriangle,
	ArrowLeft,
	Calendar,
	Clock,
	FileText,
	Hash,
	Lock,
	Printer,
	Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

interface UserReportReaderProps {
	reportId: string;
}

interface ReportArticleSummary {
	id: string;
	title: string;
	summary: string;
	domain_label: string;
	issuer: string | null;
	published_at: string | null;
	importance: number | null;
	risk_score: number | null;
	link: string;
}

interface ReportRiskItem {
	title: string;
	description: string;
	level: string;
	level_label: string;
	article_id: string | null;
}

interface ReportContentExtract {
	aiSummary: string | null;
	highlights: ReportArticleSummary[];
	riskItems: ReportRiskItem[];
	totalArticles: number | null;
	highRiskCount: number | null;
	highImportanceCount: number | null;
}

const ESTIMATE_WORDS_PER_MINUTE = 360;

const cardVariants = {
	hidden: { opacity: 0, y: 8 },
	visible: { opacity: 1, y: 0 },
} as const;

const listVariants = {
	visible: {
		transition: { staggerChildren: 0.05 },
	},
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readArticles(value: unknown): ReportArticleSummary[] {
	if (!Array.isArray(value)) return [];
	const out: ReportArticleSummary[] = [];
	for (const item of value) {
		if (!isRecord(item)) continue;
		const id = readString(item.id);
		const title = readString(item.title);
		if (!id || !title) continue;
		out.push({
			id,
			title,
			summary: readString(item.summary) ?? "",
			domain_label: readString(item.domain_label) ?? "",
			issuer: readString(item.issuer),
			published_at: readString(item.published_at),
			importance: readNumber(item.importance),
			risk_score: readNumber(item.risk_score),
			link: readString(item.link) ?? "",
		});
	}
	return out;
}

function readRiskItems(value: unknown): ReportRiskItem[] {
	if (!Array.isArray(value)) return [];
	const out: ReportRiskItem[] = [];
	for (const item of value) {
		if (!isRecord(item)) continue;
		const title = readString(item.title);
		if (!title) continue;
		out.push({
			title,
			description: readString(item.description) ?? "",
			level: readString(item.level) ?? "low",
			level_label: readString(item.level_label) ?? "",
			article_id: readString(item.article_id),
		});
	}
	return out;
}

function extractReportContent(
	content: Report["content"],
): ReportContentExtract {
	const overview = isRecord(content.overview) ? content.overview : null;
	return {
		aiSummary: overview ? readString(overview.ai_summary) : null,
		totalArticles: overview ? readNumber(overview.total_articles) : null,
		highRiskCount: overview ? readNumber(overview.high_risk_count) : null,
		highImportanceCount: overview
			? readNumber(overview.high_importance_count)
			: null,
		highlights: readArticles(content.highlights),
		riskItems: readRiskItems(content.risk_items),
	};
}

function estimateMinutes(extract: ReportContentExtract): number {
	const summaryWords = extract.aiSummary
		? extract.aiSummary.split(/\s+/u).filter(Boolean).length
		: 0;
	const highlightWords = extract.highlights.reduce((acc, item) => {
		const titleWords = item.title.split(/\s+/u).filter(Boolean).length;
		const summaryW = item.summary.split(/\s+/u).filter(Boolean).length;
		return acc + titleWords + summaryW;
	}, 0);
	const total = summaryWords + highlightWords;
	if (total === 0) return 1;
	return Math.max(1, Math.ceil(total / ESTIMATE_WORDS_PER_MINUTE));
}

function periodLabelKey(periodType: string): string {
	switch (periodType) {
		case "weekly":
			return "Weekly";
		case "monthly":
			return "Monthly";
		case "quarterly":
			return "Quarterly";
		case "custom":
			return "Custom";
		default:
			return periodType;
	}
}

function riskBadgeVariant(
	level: string,
): "outline" | "warning" | "destructive" | "secondary" {
	switch (level.toLowerCase()) {
		case "critical":
			return "destructive";
		case "high":
			return "destructive";
		case "medium":
			return "warning";
		case "low":
			return "secondary";
		default:
			return "outline";
	}
}

export function UserReportReader({ reportId }: UserReportReaderProps) {
	const t = useT();
	const locale = useLocale();
	const roleTier = useAuthStore((state) => state.roleTier);
	const isVerifiedOrAbove = isRoleTierAtLeast(roleTier, "verified_user");
	const isPremiumOrAbove = isRoleTierAtLeast(roleTier, "premium_user");
	const isBasicTier = !isVerifiedOrAbove;

	const reportQuery = useReport(reportId);
	const report = reportQuery.data ?? null;

	const extract = useMemo(
		() =>
			report
				? extractReportContent(report.content)
				: ({
						aiSummary: null,
						highlights: [],
						riskItems: [],
						totalArticles: null,
						highRiskCount: null,
						highImportanceCount: null,
					} satisfies ReportContentExtract),
		[report],
	);

	const minutes = useMemo(() => estimateMinutes(extract), [extract]);

	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedStyle = { color: "var(--surface-muted-text)" } as const;
	const surfaceStyle = {
		borderColor: "color-mix(in srgb, var(--color-border) 78%, transparent)",
		backgroundColor: "var(--surface-popover-bg)",
	} as const;
	const accentStyle = {
		backgroundColor: "var(--surface-accent-icon-bg)",
		color: "var(--surface-accent-strong)",
	} as const;

	if (reportQuery.isLoading) {
		return (
			<div className="space-y-4" aria-busy="true">
				{[0, 1, 2].map((idx) => (
					<div
						key={idx}
						className="h-32 animate-pulse rounded-2xl"
						style={{ backgroundColor: "var(--surface-muted-bg)" }}
					/>
				))}
			</div>
		);
	}

	if (reportQuery.isError || !report) {
		return (
			<EmptyState
				variant="error"
				title={t("Failed to load report")}
				description={
					reportQuery.error instanceof Error
						? reportQuery.error.message
						: t("Unknown error")
				}
				action={{ label: t("Retry"), onClick: () => reportQuery.refetch() }}
			/>
		);
	}

	const handlePrint = () => {
		if (typeof window !== "undefined") {
			window.print();
		}
	};

	return (
		<div className="space-y-6 print:space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
				<Link
					href={withLocalePath(locale, "/reports")}
					className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[var(--control-hover-bg)]"
					style={mutedStyle}
				>
					<ArrowLeft aria-hidden="true" className="h-4 w-4" />
					{t("Back to reports")}
				</Link>
				{isPremiumOrAbove ? (
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={handlePrint}
						data-testid="user-report-print"
					>
						<Printer aria-hidden="true" className="h-4 w-4" />
						{t("Print or save as PDF")}
					</Button>
				) : (
					<Link
						href="/settings"
						className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors"
						style={{
							borderColor:
								"color-mix(in srgb, var(--color-border) 80%, transparent)",
							color: "var(--surface-muted-text)",
						}}
						data-testid="user-report-print-locked"
						title={t("PDF export is available on the Premium plan.")}
					>
						<Lock aria-hidden="true" className="h-4 w-4" />
						{t("Premium-only PDF export")}
					</Link>
				)}
			</div>

			<motion.header
				className="space-y-3 rounded-3xl border p-6 shadow-popup-card print:rounded-none print:border-0 print:p-0 print:shadow-none"
				style={surfaceStyle}
				initial={{ opacity: 0, y: 4 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.25 }}
			>
				<div className="flex flex-wrap items-center gap-2 text-xs" style={mutedStyle}>
					<Badge variant="outline">
						{t(periodLabelKey(report.period_type))}
					</Badge>
					<span className="inline-flex items-center gap-1">
						<Calendar aria-hidden="true" className="h-3.5 w-3.5" />
						{formatDateTime(locale, report.period_start, {
							year: "numeric",
							month: "2-digit",
							day: "2-digit",
						})}
						{" → "}
						{formatDateTime(locale, report.period_end, {
							year: "numeric",
							month: "2-digit",
							day: "2-digit",
						})}
					</span>
					<span className="inline-flex items-center gap-1">
						<Clock aria-hidden="true" className="h-3.5 w-3.5" />
						{t("{count} min read", { count: minutes })}
					</span>
					<span className="inline-flex items-center gap-1 font-mono">
						<Hash aria-hidden="true" className="h-3.5 w-3.5" />
						{report.report_number}
					</span>
				</div>
				<h1
					className="text-2xl font-bold leading-tight md:text-3xl"
					style={headingStyle}
				>
					{report.title}
				</h1>
				<dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
					<div>
						<dt className="text-xs uppercase tracking-wide" style={mutedStyle}>
							{t("Articles")}
						</dt>
						<dd className="mt-1 font-semibold tabular-nums" style={headingStyle}>
							{extract.totalArticles ?? report.article_count}
						</dd>
					</div>
					<div>
						<dt className="text-xs uppercase tracking-wide" style={mutedStyle}>
							{t("High importance")}
						</dt>
						<dd className="mt-1 font-semibold tabular-nums" style={headingStyle}>
							{extract.highImportanceCount ?? "—"}
						</dd>
					</div>
					<div>
						<dt className="text-xs uppercase tracking-wide" style={mutedStyle}>
							{t("High risk")}
						</dt>
						<dd className="mt-1 font-semibold tabular-nums" style={headingStyle}>
							{extract.highRiskCount ?? "—"}
						</dd>
					</div>
					<div>
						<dt className="text-xs uppercase tracking-wide" style={mutedStyle}>
							{t("Status")}
						</dt>
						<dd className="mt-1 font-semibold capitalize" style={headingStyle}>
							{report.status}
						</dd>
					</div>
				</dl>
			</motion.header>

			<motion.section
				className="space-y-3 rounded-3xl border p-6 print:border-0 print:p-0 print:shadow-none"
				style={{
					borderColor: "var(--surface-accent-border)",
					backgroundColor: "var(--surface-accent-bg)",
				}}
				initial={{ opacity: 0, y: 4 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.25, delay: 0.05 }}
			>
				<header className="flex items-center gap-2">
					<span
						className="flex h-8 w-8 items-center justify-center rounded-2xl"
						style={accentStyle}
					>
						<Sparkles aria-hidden="true" className="h-4 w-4" />
					</span>
					<h2
						className="text-sm font-semibold uppercase tracking-[0.12em]"
						style={{ color: "var(--surface-accent-strong)" }}
					>
						{t("Executive summary")}
					</h2>
				</header>
				{extract.aiSummary ? (
					<MarkdownReader markdown={extract.aiSummary} />
				) : (
					<p className="text-sm" style={{ color: "var(--surface-accent-copy)" }}>
						{t(
							"The executive summary will appear here once the report is published.",
						)}
					</p>
				)}
			</motion.section>

			{isBasicTier ? (
				<aside
					className="rounded-3xl border p-6 print:hidden"
					style={surfaceStyle}
					data-testid="user-report-upgrade-cta"
				>
					<div className="flex items-start gap-3">
						<span
							className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl"
							style={accentStyle}
						>
							<Lock aria-hidden="true" className="h-4 w-4" />
						</span>
						<div className="min-w-0 flex-1">
							<p className="text-sm font-semibold" style={headingStyle}>
								{t("Upgrade to read the full report")}
							</p>
							<p className="mt-1 text-sm" style={mutedStyle}>
								{t(
									"Basic readers see the executive summary. Verified and Premium tiers unlock the highlights, risk register, and PDF export.",
								)}
							</p>
							<div className="mt-3">
								<Link
									href="/settings"
									className="inline-flex h-8 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition-colors"
									style={{
										backgroundColor: "var(--color-primary-500)",
										color: "var(--surface-popover-bg)",
									}}
									data-testid="user-report-upgrade-button"
								>
									{t("Upgrade plan")}
								</Link>
							</div>
						</div>
					</div>
				</aside>
			) : null}

			{!isBasicTier ? (
				<motion.section
					className="space-y-3 rounded-3xl border p-6 print:border-0 print:p-0 print:shadow-none"
					style={surfaceStyle}
					initial={{ opacity: 0, y: 4 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.25, delay: 0.1 }}
					data-testid="user-report-highlights"
				>
					<header className="flex items-center gap-2">
						<span
							className="flex h-8 w-8 items-center justify-center rounded-2xl"
							style={accentStyle}
						>
							<FileText aria-hidden="true" className="h-4 w-4" />
						</span>
						<h2 className="text-base font-semibold" style={headingStyle}>
							{t("Highlights")}
						</h2>
					</header>
					{extract.highlights.length === 0 ? (
						<p className="text-sm" style={mutedStyle}>
							{t("No highlighted articles in this report.")}
						</p>
					) : (
						<motion.ul
							className="space-y-3"
							variants={listVariants}
							initial="hidden"
							animate="visible"
						>
							{extract.highlights.map((item) => (
								<motion.li
									key={item.id}
									className="rounded-2xl border p-4"
									variants={cardVariants}
									transition={{ duration: 0.2 }}
									style={{
										borderColor:
											"color-mix(in srgb, var(--color-border) 70%, transparent)",
										backgroundColor:
											"color-mix(in srgb, var(--surface-muted-bg) 60%, transparent)",
									}}
								>
									<div className="flex flex-wrap items-start justify-between gap-2">
										<div className="min-w-0">
											<p
												className="truncate text-sm font-semibold"
												style={headingStyle}
												title={item.title}
											>
												{item.title}
											</p>
											<div
												className="mt-1 flex flex-wrap items-center gap-2 text-xs"
												style={mutedStyle}
											>
												{item.domain_label ? (
													<Badge variant="outline">{item.domain_label}</Badge>
												) : null}
												{item.issuer ? <span>{item.issuer}</span> : null}
												{item.published_at ? (
													<span>
														{formatDateTime(locale, item.published_at, {
															year: "numeric",
															month: "2-digit",
															day: "2-digit",
														})}
													</span>
												) : null}
												{item.importance != null ? (
													<span>
														{t("Importance")}: {item.importance}
													</span>
												) : null}
												{item.risk_score != null ? (
													<span>
														{t("Risk")}: {item.risk_score}
													</span>
												) : null}
											</div>
										</div>
										{isPremiumOrAbove && item.link ? (
											<Link
												href={withLocalePath(locale, `/articles/${item.id}`)}
												className="text-xs font-medium underline"
												style={{ color: "var(--color-primary-600)" }}
											>
												{t("Open article")}
											</Link>
										) : null}
									</div>
									{item.summary ? (
										<blockquote
											className="mt-2 border-l-[3px] pl-3 text-sm leading-relaxed"
											style={{
												borderColor:
													"color-mix(in srgb, var(--color-primary-500) 50%, transparent)",
												color: "var(--surface-muted-text)",
											}}
										>
											{item.summary}
										</blockquote>
									) : null}
								</motion.li>
							))}
						</motion.ul>
					)}
				</motion.section>
			) : null}

			{!isBasicTier ? (
				<motion.section
					className="space-y-3 rounded-3xl border p-6 print:border-0 print:p-0 print:shadow-none"
					style={surfaceStyle}
					initial={{ opacity: 0, y: 4 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.25, delay: 0.15 }}
					data-testid="user-report-risks"
				>
					<header className="flex items-center gap-2">
						<span
							className="flex h-8 w-8 items-center justify-center rounded-2xl"
							style={accentStyle}
						>
							<AlertTriangle aria-hidden="true" className="h-4 w-4" />
						</span>
						<h2 className="text-base font-semibold" style={headingStyle}>
							{t("Risk register")}
						</h2>
					</header>
					{extract.riskItems.length === 0 ? (
						<p className="text-sm" style={mutedStyle}>
							{t("No risk items flagged in this report.")}
						</p>
					) : (
						<motion.ul
							className="space-y-3"
							variants={listVariants}
							initial="hidden"
							animate="visible"
						>
							{extract.riskItems.map((item, idx) => (
								<motion.li
									key={`${item.title}-${idx}`}
									className="rounded-2xl border p-4"
									variants={cardVariants}
									transition={{ duration: 0.2 }}
									style={{
										borderColor:
											"color-mix(in srgb, var(--color-border) 70%, transparent)",
										backgroundColor:
											"color-mix(in srgb, var(--surface-muted-bg) 60%, transparent)",
									}}
								>
									<div className="flex flex-wrap items-start justify-between gap-2">
										<p className="font-semibold" style={headingStyle}>
											{item.title}
										</p>
										<Badge variant={riskBadgeVariant(item.level)}>
											{item.level_label || item.level}
										</Badge>
									</div>
									{item.description ? (
										<p
											className="mt-2 text-sm leading-relaxed"
											style={mutedStyle}
										>
											{item.description}
										</p>
									) : null}
								</motion.li>
							))}
						</motion.ul>
					)}
				</motion.section>
			) : null}
		</div>
	);
}
