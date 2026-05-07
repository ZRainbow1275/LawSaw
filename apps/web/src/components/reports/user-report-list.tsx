"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useReports } from "@/hooks/use-reports";
import type { Report } from "@/lib/api/types";
import { isRoleTierAtLeast } from "@/lib/authz";
import { formatDateTime } from "@/lib/i18n";
import { withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { useAuthStore } from "@/stores/auth-store";
import { motion } from "framer-motion";
import {
	Calendar,
	CalendarClock,
	ClipboardList,
	History,
	Lock,
	Sparkles,
} from "lucide-react";
import Link from "next/link";

const SUBSCRIPTION_WINDOW_DAYS = 30;
const RECOMMEND_WINDOW_DAYS = 90;

interface UserReportListProps {
	limit?: number;
}

interface ReportSegmentProps {
	title: string;
	description: string;
	icon: React.ReactNode;
	reports: Report[];
	emptyHint: string;
	locked?: boolean;
	lockedTitle?: string;
	lockedDescription?: string;
	"data-testid"?: string;
}

const cardVariants = {
	hidden: { opacity: 0, y: 8 },
	visible: { opacity: 1, y: 0 },
} as const;

const listVariants = {
	visible: {
		transition: { staggerChildren: 0.04 },
	},
} as const;

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

function ageInDays(report: Report): number {
	const reference = report.published_at ?? report.updated_at;
	const ts = new Date(reference).getTime();
	if (!Number.isFinite(ts)) return Number.POSITIVE_INFINITY;
	return (Date.now() - ts) / (1000 * 60 * 60 * 24);
}

function ReportSegment({
	title,
	description,
	icon,
	reports,
	emptyHint,
	locked,
	lockedTitle,
	lockedDescription,
	"data-testid": testId,
}: ReportSegmentProps) {
	const t = useT();
	const locale = useLocale();
	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedStyle = { color: "var(--surface-muted-text)" } as const;
	const surfaceStyle = {
		borderColor: "color-mix(in srgb, var(--color-border) 78%, transparent)",
		backgroundColor: "var(--surface-popover-bg)",
	} as const;
	const accentBgStyle = {
		backgroundColor: "var(--surface-accent-icon-bg)",
		color: "var(--surface-accent-strong)",
	} as const;

	if (locked) {
		return (
			<section className="space-y-3" data-testid={testId}>
				<header className="flex items-center gap-2">
					<span
						className="flex h-9 w-9 items-center justify-center rounded-2xl"
						style={accentBgStyle}
					>
						<Lock aria-hidden="true" className="h-4 w-4" />
					</span>
					<div>
						<h2 className="text-base font-semibold" style={headingStyle}>
							{lockedTitle ?? title}
						</h2>
						<p className="text-xs" style={mutedStyle}>
							{lockedDescription ?? description}
						</p>
					</div>
				</header>
				<div
					className="rounded-2xl border p-6 text-sm"
					style={{ ...surfaceStyle, color: "var(--surface-muted-text)" }}
					data-testid={testId ? `${testId}-locked` : undefined}
				>
					<p>
						{lockedDescription ??
							t("Upgrade to Premium to unlock the full report archive.")}
					</p>
					<div className="mt-3">
						<Link
							href={withLocalePath(locale, "/settings")}
							className="inline-flex h-8 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition-colors"
							style={{
								backgroundColor: "var(--color-primary-500)",
								color: "var(--surface-popover-bg)",
							}}
							data-testid={testId ? `${testId}-upgrade` : undefined}
						>
							{t("Upgrade plan")}
						</Link>
					</div>
				</div>
			</section>
		);
	}

	return (
		<section className="space-y-3" data-testid={testId}>
			<header className="flex items-center gap-2">
				<span
					className="flex h-9 w-9 items-center justify-center rounded-2xl"
					style={accentBgStyle}
				>
					{icon}
				</span>
				<div>
					<h2 className="text-base font-semibold" style={headingStyle}>
						{title}
					</h2>
					<p className="text-xs" style={mutedStyle}>
						{description}
					</p>
				</div>
			</header>

			{reports.length === 0 ? (
				<EmptyState title={emptyHint} className="py-8" />
			) : (
				<motion.ul
					className="grid gap-3 md:grid-cols-2"
					variants={listVariants}
					initial="hidden"
					animate="visible"
				>
					{reports.map((report) => (
						<motion.li
							key={report.id}
							variants={cardVariants}
							transition={{ duration: 0.2 }}
						>
							<Link
								href={withLocalePath(locale, `/reports/${report.id}`)}
								className="block rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-popup-card"
								style={surfaceStyle}
								data-testid="user-report-card"
							>
								<div className="flex items-start gap-3">
									<span
										className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
										style={accentBgStyle}
									>
										<ClipboardList aria-hidden="true" className="h-4 w-4" />
									</span>
									<div className="min-w-0 flex-1 space-y-1">
										<p
											className="truncate text-sm font-semibold"
											style={headingStyle}
											title={report.title}
										>
											{report.title}
										</p>
										<p className="font-mono text-xs" style={mutedStyle}>
											{report.report_number}
										</p>
										<div className="flex flex-wrap items-center gap-2 text-xs">
											<Badge variant="outline">
												{t(periodLabelKey(report.period_type))}
											</Badge>
											<span
												className="inline-flex items-center gap-1"
												style={mutedStyle}
											>
												<Calendar aria-hidden="true" className="h-3 w-3" />
												{formatDateTime(
													locale,
													report.published_at ?? report.updated_at,
													{
														year: "numeric",
														month: "2-digit",
														day: "2-digit",
													},
												)}
											</span>
											<span style={mutedStyle}>
												{t("{count} articles", { count: report.article_count })}
											</span>
										</div>
									</div>
								</div>
							</Link>
						</motion.li>
					))}
				</motion.ul>
			)}
		</section>
	);
}

export function UserReportList({ limit = 50 }: UserReportListProps) {
	const t = useT();
	const roleTier = useAuthStore((state) => state.roleTier);
	const isPremiumOrAbove = isRoleTierAtLeast(roleTier, "premium_user");

	const reportsQuery = useReports({ status: "published", limit });

	if (reportsQuery.isLoading) {
		return (
			<div className="space-y-4" aria-busy="true">
				{[0, 1, 2].map((idx) => (
					<div
						key={idx}
						className="h-32 animate-pulse rounded-2xl"
						style={{
							backgroundColor: "var(--surface-muted-bg)",
						}}
					/>
				))}
			</div>
		);
	}

	if (reportsQuery.isError) {
		return (
			<EmptyState
				variant="error"
				title={t("Failed to load reports")}
				description={
					reportsQuery.error instanceof Error
						? reportsQuery.error.message
						: t("Unknown error")
				}
				action={{ label: t("Retry"), onClick: () => reportsQuery.refetch() }}
			/>
		);
	}

	const reports = reportsQuery.data?.data ?? [];
	const subscribed = reports.filter(
		(report) => ageInDays(report) <= SUBSCRIPTION_WINDOW_DAYS,
	);
	const recommended = reports.filter((report) => {
		const age = ageInDays(report);
		return age > SUBSCRIPTION_WINDOW_DAYS && age <= RECOMMEND_WINDOW_DAYS;
	});
	const archived = reports.filter(
		(report) => ageInDays(report) > RECOMMEND_WINDOW_DAYS,
	);

	return (
		<div className="space-y-8">
			<ReportSegment
				title={t("Subscribed reports")}
				description={t(
					"Reports published in the last {count} days based on your subscription cadence.",
					{ count: SUBSCRIPTION_WINDOW_DAYS },
				)}
				icon={<CalendarClock aria-hidden="true" className="h-4 w-4" />}
				reports={subscribed}
				emptyHint={t("No subscribed reports yet")}
				data-testid="user-reports-subscribed"
			/>
			<ReportSegment
				title={t("Recommended reports")}
				description={t(
					"Recently published reports we think align with your tier and reading history.",
				)}
				icon={<Sparkles aria-hidden="true" className="h-4 w-4" />}
				reports={recommended}
				emptyHint={t("No recommended reports right now")}
				data-testid="user-reports-recommended"
			/>
			<ReportSegment
				title={t("Historical archive")}
				description={t(
					"Reports older than {count} days are archived for long-term reference.",
					{ count: RECOMMEND_WINDOW_DAYS },
				)}
				icon={<History aria-hidden="true" className="h-4 w-4" />}
				reports={isPremiumOrAbove ? archived : []}
				emptyHint={t("No archived reports yet")}
				locked={!isPremiumOrAbove}
				lockedTitle={t("Historical archive")}
				lockedDescription={t(
					"Premium readers can browse the full historical archive of operational reports.",
				)}
				data-testid="user-reports-archive"
			/>
		</div>
	);
}
