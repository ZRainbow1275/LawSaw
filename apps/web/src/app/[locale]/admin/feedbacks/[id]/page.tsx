"use client";

/**
 * /[locale]/admin/feedbacks/[id] — native feedback detail + reply page (P0 D1).
 *
 * Surfaces the user message, status, contact, and admin reply form inline so
 * the route renders without depending on the list-page drawer. Status changes
 * and admin responses are persisted via `useUpdateFeedback`, the same hook
 * used by the drawer.
 */

import { AdminDetailErrorCard } from "@/components/admin/detail-error-card";
import { DetailLayout, MetaList } from "@/components/admin/detail-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFeedback, useUpdateFeedback } from "@/hooks/use-feedback";
import type { Feedback } from "@/lib/api/types";
import { formatDateTime, withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { useToast } from "@/stores/toast-store";
import {
	ArrowLeft,
	Bug,
	Hash,
	HelpCircle,
	Lightbulb,
	Loader2,
	Mail,
	MessageSquareText,
	Reply,
	Rss,
	Save,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const TYPE_META: Record<
	Feedback["type"],
	{ labelKey: string; icon: typeof Bug }
> = {
	source_suggestion: { labelKey: "Source suggestion", icon: Rss },
	bug_report: { labelKey: "Bug report", icon: Bug },
	feature_request: { labelKey: "Feature request", icon: Lightbulb },
	other: { labelKey: "Other", icon: HelpCircle },
};

const STATUS_META: Record<
	Feedback["status"],
	{
		labelKey: string;
		variant: "outline" | "secondary" | "success" | "destructive";
	}
> = {
	pending: { labelKey: "Pending", variant: "outline" },
	reviewing: { labelKey: "Reviewing", variant: "secondary" },
	resolved: { labelKey: "Resolved", variant: "success" },
	rejected: { labelKey: "Closed", variant: "destructive" },
};

const STATUS_OPTIONS: Feedback["status"][] = [
	"pending",
	"reviewing",
	"resolved",
	"rejected",
];

export default function AdminFeedbackDetailPage() {
	const t = useT();
	const locale = useLocale();
	const router = useRouter();
	const params = useParams<{ id: string }>();
	const feedbackId = typeof params?.id === "string" ? params.id : "";

	const feedbackQuery = useFeedback(feedbackId);
	const updateFeedback = useUpdateFeedback();
	const { success, error } = useToast();

	const [statusDraft, setStatusDraft] = useState<Feedback["status"]>("pending");
	const [responseDraft, setResponseDraft] = useState("");

	useEffect(() => {
		if (!feedbackQuery.data) return;
		setStatusDraft(feedbackQuery.data.status);
		setResponseDraft(feedbackQuery.data.admin_response ?? "");
	}, [feedbackQuery.data]);

	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;
	const fieldStyle = {
		borderColor: "color-mix(in srgb, var(--color-border) 78%, transparent)",
		backgroundColor: "var(--field-surface)",
		color: "var(--field-foreground)",
	} as const;

	const handleBack = () =>
		router.push(withLocalePath(locale, "/admin/feedbacks"));

	const handleSave = async () => {
		if (!feedbackQuery.data) return;
		try {
			await updateFeedback.mutateAsync({
				id: feedbackQuery.data.id,
				version: feedbackQuery.data.version,
				status: statusDraft,
				admin_response: responseDraft.trim() || null,
			});
			success(
				t("Saved successfully"),
				t("The feedback ticket is updated."),
			);
		} catch (cause) {
			error(
				t("Save failed"),
				cause instanceof Error ? cause.message : t("Unknown error"),
			);
		}
	};

	if (!feedbackId) return null;

	const feedback = feedbackQuery.data;
	const TypeIcon = feedback ? TYPE_META[feedback.type].icon : MessageSquareText;

	const dateOptions = {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	} as const;

	const header = (
		<Card>
			<CardHeader>
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<CardTitle
							className="flex items-center gap-2 text-3xl font-bold tracking-tight"
							style={headingStyle}
						>
							<MessageSquareText
								aria-hidden="true"
								className="h-7 w-7"
								style={{ color: "var(--color-primary-500)" }}
							/>
							{t("Feedback ticket")}
						</CardTitle>
						<p className="mt-1 text-sm" style={mutedTextStyle}>
							{t("Review the user message and respond directly.")}
						</p>
					</div>
					<Button type="button" variant="outline" onClick={handleBack}>
						<ArrowLeft aria-hidden="true" className="h-4 w-4" />
						{t("Back to feedback")}
					</Button>
				</div>
			</CardHeader>
		</Card>
	);

	if (feedbackQuery.isLoading) {
		return (
			<DetailLayout
				header={header}
				main={
					<Card>
						<CardContent className="flex items-center gap-2 py-8 text-sm">
							<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
							{t("Loading feedback")}
						</CardContent>
					</Card>
				}
			/>
		);
	}

	if (feedbackQuery.isError || !feedback) {
		return (
			<DetailLayout
				header={header}
				main={
					<AdminDetailErrorCard
						resource="feedback"
						error={feedbackQuery.error}
						onRetry={() => feedbackQuery.refetch()}
					/>
				}
			/>
		);
	}

	const main = (
		<>
			<Card>
				<CardHeader>
					<div className="flex flex-wrap items-start justify-between gap-3">
						<CardTitle
							className="flex items-center gap-2 text-base"
							style={headingStyle}
						>
							<TypeIcon aria-hidden="true" className="h-4 w-4" />
							{feedback.title}
						</CardTitle>
						<Badge variant={STATUS_META[feedback.status].variant}>
							{t(STATUS_META[feedback.status].labelKey)}
						</Badge>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex flex-wrap gap-2">
						<Badge variant="outline">
							{t(TYPE_META[feedback.type].labelKey)}
						</Badge>
					</div>
					<p
						className="whitespace-pre-wrap text-sm leading-6"
						style={headingStyle}
					>
						{feedback.content}
					</p>
					{feedback.source_url || feedback.source_name ? (
						<div className="space-y-1 text-sm" style={mutedTextStyle}>
							{feedback.source_name ? (
								<p>
									{t("Source name")}: {feedback.source_name}
								</p>
							) : null}
							{feedback.source_url ? (
								<p>
									{t("Source URL")}:{" "}
									<a
										href={feedback.source_url}
										target="_blank"
										rel="noopener noreferrer"
										className="underline-offset-4 hover:underline"
										style={{ color: "var(--color-primary-500)" }}
									>
										{feedback.source_url}
									</a>
								</p>
							) : null}
						</div>
					) : null}
					{feedback.contact_email ? (
						<p
							className="flex items-center gap-2 text-sm"
							style={mutedTextStyle}
						>
							<Mail aria-hidden="true" className="h-4 w-4" />
							{feedback.contact_email}
						</p>
					) : null}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-base">
						<Reply aria-hidden="true" className="h-4 w-4" />
						{t("Admin response")}
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div>
						<label
							htmlFor="feedback-status"
							className="mb-1 block text-sm font-medium"
							style={headingStyle}
						>
							{t("Status")}
						</label>
						<select
							id="feedback-status"
							className="h-10 w-full max-w-xs rounded-lg border px-3 text-sm outline-none focus-visible:ring-2"
							style={fieldStyle}
							value={statusDraft}
							onChange={(event) =>
								setStatusDraft(event.target.value as Feedback["status"])
							}
						>
							{STATUS_OPTIONS.map((status) => (
								<option key={status} value={status}>
									{t(STATUS_META[status].labelKey)}
								</option>
							))}
						</select>
					</div>
					<div>
						<label
							htmlFor="feedback-response"
							className="mb-1 block text-sm font-medium"
							style={headingStyle}
						>
							{t("Reply to user")}
						</label>
						<textarea
							id="feedback-response"
							className="min-h-[140px] w-full rounded-xl border-2 px-4 py-3 text-sm outline-none focus-visible:ring-2"
							style={fieldStyle}
							value={responseDraft}
							onChange={(event) => setResponseDraft(event.target.value)}
							placeholder={t(
								"Compose a reply that will be visible to the user.",
							)}
						/>
					</div>
					<div className="flex justify-end">
						<Button
							type="button"
							onClick={handleSave}
							disabled={updateFeedback.isPending}
						>
							{updateFeedback.isPending ? (
								<Loader2
									aria-hidden="true"
									className="h-4 w-4 animate-spin"
								/>
							) : (
								<Save aria-hidden="true" className="h-4 w-4" />
							)}
							{t("Save reply")}
						</Button>
					</div>
				</CardContent>
			</Card>
		</>
	);

	const meta = (
		<MetaList
			title={t("Feedback metadata")}
			icon={<Hash aria-hidden="true" className="h-4 w-4" />}
			items={[
				{
					label: t("Feedback ID"),
					value: (
						<code className="break-all font-mono text-xs">{feedback.id}</code>
					),
				},
				{
					label: t("Type"),
					value: t(TYPE_META[feedback.type].labelKey),
				},
				{
					label: t("Created at"),
					value: formatDateTime(locale, feedback.created_at, dateOptions),
				},
				...(feedback.contact_email
					? [{ label: t("Contact"), value: feedback.contact_email }]
					: []),
			]}
		/>
	);

	return <DetailLayout header={header} main={main} meta={meta} />;
}
