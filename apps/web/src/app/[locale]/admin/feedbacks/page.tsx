"use client";

import { FeedbackReplyDrawer } from "@/components/admin/feedback-reply-drawer";
import { useAdminDeepLink } from "@/hooks/use-admin-deep-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard, KpiCardGrid } from "@/components/ui/kpi-card";
import { useFeedback, useFeedbacks } from "@/hooks/use-feedback";
import type { Feedback } from "@/lib/api/types";
import { formatDateTime } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import {
	CheckCircle2,
	Clock,
	Inbox,
	MessageSquareText,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const statusOptions: Array<{
	value: Feedback["status"] | "all";
	label: string;
}> = [
	{ value: "all", label: "All statuses" },
	{ value: "pending", label: "Pending" },
	{ value: "reviewing", label: "Reviewing" },
	{ value: "resolved", label: "Resolved" },
	{ value: "rejected", label: "Closed" },
];

const statusVariant: Record<
	Feedback["status"],
	"outline" | "secondary" | "success" | "destructive"
> = {
	pending: "outline",
	reviewing: "secondary",
	resolved: "success",
	rejected: "destructive",
};

function AdminFeedbacksContent() {
	const locale = useLocale();
	const t = useT();
	const { searchParams, clearSearchParams } = useAdminDeepLink();
	// Server-side admin guard at [locale]/admin/layout.tsx — see users/page.tsx.
	const isAdmin = true;
	const [statusFilter, setStatusFilter] = useState<Feedback["status"] | "all">(
		"all",
	);
	const [activeId, setActiveId] = useState<string | null>(null);
	const feedbackIdParam = searchParams.get("feedbackId");
	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;
	const subtleTextStyle = {
		color: "color-mix(in srgb, var(--surface-muted-text) 78%, transparent)",
	} as const;

	const feedbacksQuery = useFeedbacks({ limit: 100, offset: 0 });
	const deepLinkedFeedbackQuery = useFeedback(feedbackIdParam ?? "");

	const items = useMemo(() => {
		const rows = feedbacksQuery.data?.data ?? [];
		if (statusFilter === "all") return rows;
		return rows.filter((item) => item.status === statusFilter);
	}, [feedbacksQuery.data, statusFilter]);

	const feedbackStats = useMemo(() => {
		const rows = feedbacksQuery.data?.data ?? [];
		let pending = 0;
		let reviewing = 0;
		let resolved = 0;
		for (const row of rows) {
			if (row.status === "pending") pending += 1;
			else if (row.status === "reviewing") reviewing += 1;
			else if (row.status === "resolved") resolved += 1;
		}
		return { total: rows.length, pending, reviewing, resolved };
	}, [feedbacksQuery.data]);

	useEffect(() => {
		if (!feedbackIdParam) return;
		setStatusFilter("all");
		setActiveId(feedbackIdParam);
	}, [feedbackIdParam]);

	const activeFeedback = useMemo(
		() =>
			feedbacksQuery.data?.data.find((item) => item.id === activeId) ??
			deepLinkedFeedbackQuery.data ??
			null,
		[feedbacksQuery.data, activeId, deepLinkedFeedbackQuery.data],
	);

	const closeFeedbackDrawer = () => {
		setActiveId(null);
		clearSearchParams(["feedbackId"]);
	};

	const feedbackTypeLabel = (type: Feedback["type"]) => {
		switch (type) {
			case "source_suggestion":
				return t("Source suggestion");
			case "bug_report":
				return t("Bug report");
			case "feature_request":
				return t("Feature request");
			default:
				return t("Other");
		}
	};

	return (
		<>
			<div className="space-y-6">
				<Card>
					<CardHeader>
						<CardTitle
							className="flex items-center gap-2 text-3xl font-bold tracking-tight"
							style={headingStyle}
						>
							<MessageSquareText
								aria-hidden="true"
								className="h-7 w-7"
								style={{ color: "var(--color-primary-500)" }}
							/>
							{t("Feedback desk")}
						</CardTitle>
						<p className="text-sm" style={mutedTextStyle}>
							{t("Review tenant feedback and issue responses.")}
						</p>
					</CardHeader>
				</Card>

				<KpiCardGrid columns={4}>
					<KpiCard
						tone="info"
						label={t("Total feedback")}
						value={feedbackStats.total}
						icon={Inbox}
					/>
					<KpiCard
						tone="warning"
						label={t("Pending")}
						value={feedbackStats.pending}
						icon={Clock}
					/>
					<KpiCard
						tone="info"
						label={t("Reviewing")}
						value={feedbackStats.reviewing}
						icon={MessageSquareText}
					/>
					<KpiCard
						tone="success"
						label={t("Resolved")}
						value={feedbackStats.resolved}
						icon={CheckCircle2}
					/>
				</KpiCardGrid>

				{!isAdmin ? (
					<EmptyState
						title={t("Access restricted")}
						description={t(
							"You need an administrative role to access this workspace.",
						)}
					/>
				) : feedbacksQuery.isLoading ? (
					<Card>
						<CardContent className="py-10 text-sm" style={mutedTextStyle}>
							{t("Loading feedback")}
						</CardContent>
					</Card>
				) : feedbacksQuery.isError ? (
					<EmptyState
						variant="error"
						title={t("Failed to load feedback")}
						description={
							feedbacksQuery.error instanceof Error
								? feedbacksQuery.error.message
								: t("Unknown error")
						}
						action={{
							label: t("Retry"),
							onClick: () => feedbacksQuery.refetch(),
						}}
					/>
				) : (
					<>
						<Card>
							<CardContent
								className="flex flex-wrap gap-2 p-4"
								role="tablist"
								aria-label={t("Status filter")}
							>
								{statusOptions.map((option) => (
									<Button
										key={option.value}
										type="button"
										role="tab"
										aria-selected={statusFilter === option.value}
										variant={
											statusFilter === option.value ? "default" : "outline"
										}
										size="sm"
										onClick={() => setStatusFilter(option.value)}
									>
										{t(option.label)}
									</Button>
								))}
							</CardContent>
						</Card>
						{items.length === 0 ? (
							<EmptyState
								title={t("No feedback found")}
								description={t(
									"No tenant feedback is available for the current filter.",
								)}
							/>
						) : (
							<div className="grid gap-4 xl:grid-cols-2">
								{items.map((item) => (
									<Card key={item.id}>
										<CardContent className="space-y-4 p-5">
											<div className="flex items-start justify-between gap-4">
												<div className="min-w-0">
													<p
														className="truncate text-base font-semibold"
														style={headingStyle}
													>
														{item.title}
													</p>
													<p className="mt-1 text-sm" style={mutedTextStyle}>
														{item.contact_email ??
															item.source_name ??
															feedbackTypeLabel(item.type)}
													</p>
												</div>
												<Badge variant={statusVariant[item.status]}>
													{t(
														statusOptions.find(
															(option) => option.value === item.status,
														)?.label ?? item.status,
													)}
												</Badge>
											</div>
											<p className="text-sm leading-6" style={mutedTextStyle}>
												{item.content}
											</p>
											<div
												className="grid gap-3 text-sm sm:grid-cols-2"
												style={mutedTextStyle}
											>
												<div>
													<p
														className="text-xs uppercase tracking-wide"
														style={subtleTextStyle}
													>
														{t("Created at")}
													</p>
													<p className="mt-1">
														{formatDateTime(locale, item.created_at, {
															year: "numeric",
															month: "2-digit",
															day: "2-digit",
															hour: "2-digit",
															minute: "2-digit",
														})}
													</p>
												</div>
												<div>
													<p
														className="text-xs uppercase tracking-wide"
														style={subtleTextStyle}
													>
														{t("Feedback type")}
													</p>
													<p className="mt-1">{feedbackTypeLabel(item.type)}</p>
												</div>
											</div>
											<div className="flex flex-wrap gap-2">
												<Button
													type="button"
													size="sm"
													onClick={() => setActiveId(item.id)}
												>
													{t("Open ticket")}
												</Button>
											</div>
										</CardContent>
									</Card>
								))}
							</div>
						)}
					</>
				)}
			</div>
			<FeedbackReplyDrawer
				open={activeId !== null}
				feedback={activeFeedback}
				onClose={closeFeedbackDrawer}
			/>
		</>
	);
}

export default function AdminFeedbacksPage() {
	return <AdminFeedbacksContent />;
}
