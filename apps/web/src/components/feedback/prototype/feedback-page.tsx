"use client";

/**
 * FeedbackPagePrototype — 1:1 still of `prototype/app.html:1550-1632`.
 *
 * Layout:
 *   - .page-header (Sparkle icon + 留言反馈 + subtitle)
 *   - .feedback-layout grid 2fr 1fr
 *     - left .content-card: form (type grid 2x2 + title + textarea + email + actions)
 *     - right .content-card: feedback-history-item list
 *
 * Real data:
 *   - submit → POST /api/v1/feedbacks via useCreateFeedback
 *   - history → useMyFeedbacks
 *
 * Chrome (Sidebar/Header/Auth) is provided by the route-level UserShell wrapper.
 *
 * Styling: Tailwind classes + design tokens only. Color palette for status
 * pills / type icons lives in globals.css `--feedback-*` tokens (light + dark).
 */

import { useCreateFeedback, useMyFeedbacks } from "@/hooks/use-feedback";
import type { CreateFeedbackInput, Feedback } from "@/lib/api/types";
import { useT } from "@/lib/i18n-client";
import { useToast } from "@/stores/toast-store";
import {
	Bug,
	HelpCircle,
	Lightbulb,
	Loader2,
	Rss,
	Sparkles,
} from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";

interface TypeOption {
	value: CreateFeedbackInput["type"];
	labelKey: string;
	Icon: typeof Rss;
	bgVar: string;
	fgVar: string;
}

const TYPE_OPTIONS: TypeOption[] = [
	{
		value: "source_suggestion",
		labelKey: "Source suggestion",
		Icon: Rss,
		bgVar: "var(--feedback-type-source-bg)",
		fgVar: "var(--feedback-type-source-fg)",
	},
	{
		value: "bug_report",
		labelKey: "Bug report",
		Icon: Bug,
		bgVar: "var(--feedback-type-bug-bg)",
		fgVar: "var(--feedback-type-bug-fg)",
	},
	{
		value: "feature_request",
		labelKey: "Feature request",
		Icon: Lightbulb,
		bgVar: "var(--feedback-type-feature-bg)",
		fgVar: "var(--feedback-type-feature-fg)",
	},
	{
		value: "other",
		labelKey: "Other",
		Icon: HelpCircle,
		bgVar: "var(--surface-card-tint-bg)",
		fgVar: "var(--surface-card-muted-fg)",
	},
];

function statusBadgeVars(status: Feedback["status"]): {
	labelKey: string;
	bg: string;
	fg: string;
} {
	switch (status) {
		case "resolved":
			return {
				labelKey: "Resolved",
				bg: "var(--feedback-status-resolved-bg)",
				fg: "var(--feedback-status-resolved-fg)",
			};
		case "reviewing":
			return {
				labelKey: "Processing",
				bg: "var(--feedback-status-reviewing-bg)",
				fg: "var(--feedback-status-reviewing-fg)",
			};
		case "rejected":
			return {
				labelKey: "Rejected",
				bg: "var(--feedback-status-rejected-bg)",
				fg: "var(--feedback-status-rejected-fg)",
			};
		default:
			return {
				labelKey: "Pending",
				bg: "var(--feedback-status-pending-bg)",
				fg: "var(--feedback-status-pending-fg)",
			};
	}
}

function formatDate(dateStr: string): string {
	const d = new Date(dateStr);
	if (Number.isNaN(d.getTime())) return dateStr.slice(0, 10);
	const yr = d.getFullYear();
	const mo = String(d.getMonth() + 1).padStart(2, "0");
	const dy = String(d.getDate()).padStart(2, "0");
	return `${yr}-${mo}-${dy}`;
}

function HistoryEmpty({ children }: { children: ReactNode }) {
	return (
		<div className="p-8 text-center text-[13px] text-[color:var(--surface-card-faint-fg)]">
			{children}
		</div>
	);
}

export function FeedbackPagePrototype() {
	const t = useT();
	const { success: toastSuccess, error: toastError } = useToast();
	const [type, setType] =
		useState<CreateFeedbackInput["type"]>("source_suggestion");
	const [title, setTitle] = useState("");
	const [content, setContent] = useState("");
	const [email, setEmail] = useState("");

	const myFeedbacks = useMyFeedbacks();
	const create = useCreateFeedback();

	const reset = () => {
		setType("source_suggestion");
		setTitle("");
		setContent("");
		setEmail("");
	};

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		if (!title.trim() || !content.trim()) {
			toastError(t("Submit failed"), t("Please fill in title and details"));
			return;
		}
		const payload: CreateFeedbackInput = {
			type,
			title: title.trim(),
			content: content.trim(),
		};
		if (email.trim()) payload.contact_email = email.trim();
		create.mutate(payload, {
			onSuccess: () => {
				toastSuccess(t("Submitted successfully!"));
				reset();
			},
			onError: (err) => {
				toastError(
					t("Submit failed"),
					err instanceof Error ? err.message : t("Unknown error"),
				);
			},
		});
	};

	const items = myFeedbacks.data?.data ?? [];
	const submitting = create.isPending;

	const cardClass =
		"rounded-xl border p-6 [border-color:var(--surface-card-border-strong)] bg-[var(--color-card)]";
	const sectionTitleClass =
		"text-sm font-bold mb-4 [color:var(--surface-card-foreground)]";
	const formLabelClass =
		"block text-[13px] font-semibold mb-2 [color:var(--surface-card-muted-fg)]";
	const formInputClass =
		"w-full rounded-lg border px-3.5 py-2.5 text-[13px] outline-none transition-colors duration-150 ease-out font-[inherit] " +
		"[border-color:var(--surface-card-border-strong)] [background:var(--color-card)] [color:var(--surface-card-foreground)] " +
		"focus-visible:[border-color:var(--color-primary-500)] focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary-500)]/30";

	return (
		<div className="w-full">
			<header className="mb-6 flex flex-col gap-1">
				<h1 className="m-0 flex items-center gap-2.5 text-2xl font-bold text-[color:var(--surface-card-foreground)]">
					<Sparkles
						aria-hidden="true"
						size={22}
						className="text-[color:var(--color-primary-500)]"
					/>
					{t("Feedback")}
				</h1>
				<p className="text-[13px] text-[color:var(--surface-card-faint-fg)]">
					{t("Submit suggestions, report issues, or recommend new sources")}
				</p>
			</header>

			<div className="grid items-start gap-4 grid-cols-1 lg:grid-cols-[2fr_1fr]">
				<form className={cardClass} onSubmit={handleSubmit}>
					<div className={sectionTitleClass}>{t("Submit feedback")}</div>

					<div className={formLabelClass}>{t("Feedback type")}</div>
					<div className="mb-5 grid grid-cols-2 gap-3">
						{TYPE_OPTIONS.map((opt) => {
							const selected = type === opt.value;
							return (
								<button
									type="button"
									key={opt.value}
									onClick={() => setType(opt.value)}
									aria-pressed={selected}
									className={`flex items-center gap-3 rounded-[10px] border-2 px-4 py-3.5 cursor-pointer transition-colors duration-150 ease-out ${
										selected
											? "[border-color:var(--color-primary-500)] [background:var(--color-primary-50)]"
											: "[border-color:var(--surface-card-border-strong)] [background:var(--color-card)] hover:[border-color:var(--color-primary-300)] hover:[background:var(--color-primary-50)]/40"
									}`}
								>
									<span
										className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
										style={{ background: opt.bgVar, color: opt.fgVar }}
									>
										<opt.Icon aria-hidden="true" size={18} />
									</span>
									<span className="text-[13px] font-semibold text-[color:var(--surface-card-foreground)]">
										{t(opt.labelKey)}
									</span>
								</button>
							);
						})}
					</div>

					<div className="mb-4">
						<label htmlFor="fb-title" className={formLabelClass}>
							{t("Title")}
						</label>
						<input
							id="fb-title"
							type="text"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder={t("Briefly describe your feedback")}
							className={formInputClass}
							required
						/>
					</div>

					<div className="mb-4">
						<label htmlFor="fb-content" className={formLabelClass}>
							{t("Details")}
						</label>
						<textarea
							id="fb-content"
							value={content}
							onChange={(e) => setContent(e.target.value)}
							placeholder={t("Please describe your feedback in detail...")}
							className={`${formInputClass} min-h-[120px] resize-y`}
							required
						/>
					</div>

					<div className="mb-4">
						<label htmlFor="fb-email" className={formLabelClass}>
							{t("Contact email")}
							<span className="ml-1 font-normal text-[color:var(--surface-card-faint-fg)]">
								{t("(optional)")}
							</span>
						</label>
						<input
							id="fb-email"
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="your@email.com"
							className={formInputClass}
						/>
					</div>

					<div className="mt-2 flex justify-end gap-3">
						<button
							type="button"
							onClick={reset}
							className="rounded-lg border bg-transparent px-[18px] py-2 text-[13px] font-semibold cursor-pointer transition-colors duration-150 ease-out [border-color:var(--surface-card-border-strong)] [color:var(--surface-card-muted-fg)] hover:[background:var(--surface-card-subtle-bg)]"
						>
							{t("Cancel")}
						</button>
						<button
							type="submit"
							disabled={submitting}
							className={`inline-flex items-center gap-2 rounded-lg border-0 px-5 py-2 text-[13px] font-semibold text-white transition-[opacity,box-shadow,background] duration-150 ease-out ${
								submitting
									? "opacity-70 cursor-not-allowed [background:var(--surface-card-border-strong)]"
									: "cursor-pointer shadow-[var(--shadow-brand)] [background:var(--gradient-feedback-submit)] hover:[background:var(--gradient-feedback-submit-hover)] hover:shadow-[var(--shadow-brand-lg)] focus-visible:shadow-[var(--shadow-brand-lg)]"
							}`}
						>
							{submitting ? (
								<>
									<Loader2
										aria-hidden="true"
										size={14}
										className="animate-spin"
									/>
									{t("Submitting...")}
								</>
							) : (
								t("Submit feedback")
							)}
						</button>
					</div>
				</form>

				<aside className={cardClass}>
					<div className={sectionTitleClass}>{t("My feedback")}</div>

					{myFeedbacks.isLoading ? (
						<HistoryEmpty>
							<Loader2
								aria-hidden="true"
								size={18}
								className="animate-spin text-[color:var(--surface-card-faint-fg)]"
							/>
						</HistoryEmpty>
					) : myFeedbacks.isError ? (
						<HistoryEmpty>{t("Failed to load")}</HistoryEmpty>
					) : items.length === 0 ? (
						<HistoryEmpty>{t("No feedback yet")}</HistoryEmpty>
					) : (
						<ul className="m-0 list-none p-0">
							{items.map((fb) => {
								const badge = statusBadgeVars(fb.status);
								return (
									<li
										key={fb.id}
										className="border-b py-4 [border-color:var(--surface-card-tint-bg)] last:border-b-0"
									>
										<div className="mb-1.5 text-[13px] font-semibold text-[color:var(--surface-card-foreground)]">
											{fb.title}
										</div>
										<div className="flex items-center gap-2.5 text-[11px] text-[color:var(--surface-card-faint-fg)]">
											<span
												className="rounded-full px-2.5 py-[3px] text-[11px] font-semibold"
												style={{ background: badge.bg, color: badge.fg }}
											>
												{t(badge.labelKey)}
											</span>
											<span>{formatDate(fb.created_at)}</span>
										</div>
										{fb.admin_response ? (
											<div className="mt-2.5 rounded-md border-l-[3px] px-3 py-2.5 text-xs leading-[1.5] [background:var(--surface-card-subtle-bg)] [border-left-color:var(--color-primary-500)] [color:var(--surface-card-muted-fg)]">
												<b className="text-[color:var(--surface-card-foreground)]">
													{t("Admin reply:")}
												</b>
												{` ${fb.admin_response}`}
											</div>
										) : null}
									</li>
								);
							})}
						</ul>
					)}
				</aside>
			</div>
		</div>
	);
}
