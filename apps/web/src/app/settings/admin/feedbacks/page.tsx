"use client";

import { FeedbackReplyDrawer } from "@/components/admin/feedback-reply-drawer";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { Sidebar } from "@/components/layout/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useFeedbacks } from "@/hooks/use-feedback";
import type { Feedback } from "@/lib/api/types";
import { formatDateTime } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { useAuthStore } from "@/stores/auth-store";
import { MessageSquareText } from "lucide-react";
import { useMemo, useState } from "react";

const statusOptions: Array<{ value: Feedback["status"] | "all"; label: string }> = [
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
	const roles = useAuthStore((state) => state.roles);
	const isAdmin = roles.some((role) =>
		["super_admin", "tenant_admin", "admin"].includes(role),
	);
	const [statusFilter, setStatusFilter] = useState<Feedback["status"] | "all">(
		"all",
	);
	const [activeId, setActiveId] = useState<string | null>(null);
	const pageStyle = {
		backgroundColor:
			"color-mix(in srgb, var(--surface-muted-bg) 55%, transparent)",
	} as const;
	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;
	const subtleTextStyle = {
		color: "color-mix(in srgb, var(--surface-muted-text) 78%, transparent)",
	} as const;

	const feedbacksQuery = useFeedbacks({ limit: 100, offset: 0 });

	const items = useMemo(() => {
		const rows = feedbacksQuery.data?.data ?? [];
		if (statusFilter === "all") return rows;
		return rows.filter((item) => item.status === statusFilter);
	}, [feedbacksQuery.data, statusFilter]);

	const activeFeedback = useMemo(
		() => feedbacksQuery.data?.data.find((item) => item.id === activeId) ?? null,
		[feedbacksQuery.data, activeId],
	);

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
			<div className="min-h-screen" style={pageStyle}>
				<Sidebar />
				<MainContent>
					<Header />
					<div className="space-y-6 p-4 md:p-6">
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
													<p
														className="text-sm leading-6"
														style={mutedTextStyle}
													>
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
															<p className="mt-1">
																{feedbackTypeLabel(item.type)}
															</p>
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
				</MainContent>
			</div>
			<FeedbackReplyDrawer
				open={activeId !== null}
				feedback={activeFeedback}
				onClose={() => setActiveId(null)}
			/>
		</>
	);
}

export default function AdminFeedbacksPage() {
	return (
		<ProtectedRoute>
			<AdminFeedbacksContent />
		</ProtectedRoute>
	);
}
