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
import {
	type CSSProperties,
	type FormEvent,
	type ReactNode,
	useState,
} from "react";

interface TypeOption {
	value: CreateFeedbackInput["type"];
	labelKey: string;
	Icon: typeof Rss;
	bg: string;
	color: string;
}

const containerStyle: CSSProperties = {
	width: "100%",
};

const headerStyle: CSSProperties = {
	display: "flex",
	flexDirection: "column",
	gap: 4,
	marginBottom: 24,
};

const titleStyle: CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: 10,
	fontSize: 22,
	fontWeight: 700,
	color: "var(--color-neutral-900)",
	margin: 0,
};

const subtitleStyle: CSSProperties = {
	fontSize: 13,
	color: "var(--color-neutral-500)",
};

const layoutStyle: CSSProperties = {
	display: "grid",
	gridTemplateColumns: "2fr 1fr",
	gap: 16,
	alignItems: "start",
};

const cardStyle: CSSProperties = {
	background: "var(--color-card)",
	border: "1px solid var(--color-neutral-200)",
	borderRadius: 12,
	padding: 24,
};

const sectionTitleStyle: CSSProperties = {
	fontSize: 14,
	fontWeight: 700,
	color: "var(--color-neutral-800)",
	marginBottom: 16,
};

const formLabelStyle: CSSProperties = {
	display: "block",
	fontSize: 13,
	fontWeight: 600,
	color: "var(--color-neutral-700)",
	marginBottom: 8,
};

const typeGridStyle: CSSProperties = {
	display: "grid",
	gridTemplateColumns: "repeat(2, 1fr)",
	gap: 12,
	marginBottom: 20,
};

const typeCardStyle = (selected: boolean): CSSProperties => ({
	display: "flex",
	alignItems: "center",
	gap: 12,
	padding: "14px 16px",
	border: `2px solid ${selected ? "var(--color-primary-500)" : "var(--color-neutral-200)"}`,
	background: selected ? "var(--color-primary-50)" : "var(--color-card)",
	borderRadius: 10,
	cursor: "pointer",
	transition: "border-color 0.15s ease, background-color 0.15s ease",
});

const typeIconStyle = (bg: string, color: string): CSSProperties => ({
	width: 36,
	height: 36,
	borderRadius: 8,
	background: bg,
	color,
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	flexShrink: 0,
});

const typeNameStyle: CSSProperties = {
	fontSize: 13,
	fontWeight: 600,
	color: "var(--color-neutral-800)",
};

const formGroupStyle: CSSProperties = {
	marginBottom: 16,
};

const formInputStyle: CSSProperties = {
	width: "100%",
	padding: "10px 14px",
	fontSize: 13,
	color: "var(--color-neutral-800)",
	background: "var(--color-card)",
	border: "1px solid var(--color-neutral-200)",
	borderRadius: 8,
	outline: "none",
	transition: "border-color 0.15s ease",
	fontFamily: "inherit",
};

const formTextareaStyle: CSSProperties = {
	...formInputStyle,
	minHeight: 120,
	resize: "vertical",
};

const optionalStyle: CSSProperties = {
	color: "var(--color-neutral-400)",
	fontWeight: 400,
	marginLeft: 4,
};

const formActionsStyle: CSSProperties = {
	display: "flex",
	justifyContent: "flex-end",
	gap: 12,
	marginTop: 8,
};

const btnCancelStyle: CSSProperties = {
	padding: "8px 18px",
	fontSize: 13,
	fontWeight: 600,
	background: "transparent",
	border: "1px solid var(--color-neutral-300)",
	borderRadius: 8,
	color: "var(--color-neutral-700)",
	cursor: "pointer",
};

const btnSubmitStyle = (disabled: boolean): CSSProperties => ({
	display: "inline-flex",
	alignItems: "center",
	gap: 8,
	padding: "8px 20px",
	fontSize: 13,
	fontWeight: 600,
	border: "none",
	borderRadius: 8,
	color: "#fff",
	background: disabled
		? "var(--color-neutral-300)"
		: "linear-gradient(135deg, #ff8a5e, #ff6b35)",
	boxShadow: disabled ? "none" : "var(--shadow-brand)",
	cursor: disabled ? "not-allowed" : "pointer",
	opacity: disabled ? 0.7 : 1,
});

const historyItemStyle: CSSProperties = {
	padding: "16px 0",
	borderBottom: "1px solid var(--color-neutral-100)",
};

const historyTitleStyle: CSSProperties = {
	fontSize: 13,
	fontWeight: 600,
	color: "var(--color-neutral-800)",
	marginBottom: 6,
};

const historyMetaStyle: CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: 10,
	fontSize: 11,
	color: "var(--color-neutral-500)",
};

const adminReplyStyle: CSSProperties = {
	marginTop: 10,
	padding: "10px 12px",
	background: "var(--color-neutral-50)",
	borderLeft: "3px solid var(--color-primary-500)",
	borderRadius: 6,
	fontSize: 12,
	color: "var(--color-neutral-700)",
	lineHeight: 1.5,
};

function statusBadge(status: Feedback["status"]): {
	labelKey: string;
	bg: string;
	color: string;
} {
	switch (status) {
		case "resolved":
			return { labelKey: "Resolved", bg: "#e8f5e9", color: "#2e7d32" };
		case "reviewing":
			return { labelKey: "Processing", bg: "#e3f2fd", color: "#1565c0" };
		case "rejected":
			return { labelKey: "Rejected", bg: "#fee2e2", color: "#c62828" };
		default:
			return {
				labelKey: "Pending",
				bg: "#fff8e1",
				color: "#f57f17",
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
		<div
			style={{
				padding: 32,
				textAlign: "center",
				fontSize: 13,
				color: "var(--color-neutral-500)",
			}}
		>
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

	const types: TypeOption[] = [
		{
			value: "source_suggestion",
			labelKey: "Source suggestion",
			Icon: Rss,
			bg: "#e0f2fe",
			color: "#0284c7",
		},
		{
			value: "bug_report",
			labelKey: "Bug report",
			Icon: Bug,
			bg: "#fee2e2",
			color: "#ef4444",
		},
		{
			value: "feature_request",
			labelKey: "Feature request",
			Icon: Lightbulb,
			bg: "#fef3c7",
			color: "#d97706",
		},
		{
			value: "other",
			labelKey: "Other",
			Icon: HelpCircle,
			bg: "var(--color-neutral-100)",
			color: "var(--color-neutral-600)",
		},
	];

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

	return (
		<div style={containerStyle}>
			<div style={headerStyle}>
				<h1 style={titleStyle}>
					<Sparkles
						aria-hidden="true"
						size={22}
						style={{ color: "var(--color-primary-500)" }}
					/>
					{t("Feedback")}
				</h1>
				<div style={subtitleStyle}>
					{t("Submit suggestions, report issues, or recommend new sources")}
				</div>
			</div>

			<div style={layoutStyle}>
				<form style={cardStyle} onSubmit={handleSubmit}>
					<div style={sectionTitleStyle}>{t("Submit feedback")}</div>

					<div style={formLabelStyle}>{t("Feedback type")}</div>
					<div style={typeGridStyle}>
						{types.map((opt) => {
							const selected = type === opt.value;
							return (
								<button
									type="button"
									key={opt.value}
									style={typeCardStyle(selected)}
									onClick={() => setType(opt.value)}
									aria-pressed={selected}
								>
									<div style={typeIconStyle(opt.bg, opt.color)}>
										<opt.Icon aria-hidden="true" size={18} />
									</div>
									<span style={typeNameStyle}>{t(opt.labelKey)}</span>
								</button>
							);
						})}
					</div>

					<div style={formGroupStyle}>
						<label htmlFor="fb-title" style={formLabelStyle}>
							{t("Title")}
						</label>
						<input
							id="fb-title"
							type="text"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder={t("Briefly describe your feedback")}
							style={formInputStyle}
							required
						/>
					</div>

					<div style={formGroupStyle}>
						<label htmlFor="fb-content" style={formLabelStyle}>
							{t("Details")}
						</label>
						<textarea
							id="fb-content"
							value={content}
							onChange={(e) => setContent(e.target.value)}
							placeholder={t("Please describe your feedback in detail...")}
							style={formTextareaStyle}
							required
						/>
					</div>

					<div style={formGroupStyle}>
						<label htmlFor="fb-email" style={formLabelStyle}>
							{t("Contact email")}
							<span style={optionalStyle}>{t("(optional)")}</span>
						</label>
						<input
							id="fb-email"
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="your@email.com"
							style={formInputStyle}
						/>
					</div>

					<div style={formActionsStyle}>
						<button type="button" style={btnCancelStyle} onClick={reset}>
							{t("Cancel")}
						</button>
						<button
							type="submit"
							style={btnSubmitStyle(create.isPending)}
							disabled={create.isPending}
						>
							{create.isPending ? (
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

				<div style={cardStyle}>
					<div style={sectionTitleStyle}>{t("My feedback")}</div>

					{myFeedbacks.isLoading ? (
						<HistoryEmpty>
							<Loader2
								aria-hidden="true"
								size={18}
								className="animate-spin"
								style={{ color: "var(--color-neutral-400)" }}
							/>
						</HistoryEmpty>
					) : myFeedbacks.isError ? (
						<HistoryEmpty>{t("Failed to load")}</HistoryEmpty>
					) : items.length === 0 ? (
						<HistoryEmpty>{t("No feedback yet")}</HistoryEmpty>
					) : (
						<div>
							{items.map((fb) => {
								const badge = statusBadge(fb.status);
								return (
									<div key={fb.id} style={historyItemStyle}>
										<div style={historyTitleStyle}>{fb.title}</div>
										<div style={historyMetaStyle}>
											<span
												style={{
													padding: "3px 10px",
													borderRadius: 999,
													fontSize: 11,
													fontWeight: 600,
													background: badge.bg,
													color: badge.color,
												}}
											>
												{t(badge.labelKey)}
											</span>
											<span>{formatDate(fb.created_at)}</span>
										</div>
										{fb.admin_response ? (
											<div style={adminReplyStyle}>
												<b style={{ color: "var(--color-neutral-800)" }}>
													{t("Admin reply:")}
												</b>
												{` ${fb.admin_response}`}
											</div>
										) : null}
									</div>
								);
							})}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
