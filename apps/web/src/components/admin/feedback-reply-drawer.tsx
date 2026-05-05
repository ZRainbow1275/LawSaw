"use client";

/**
 * Right-slide drawer for handling a single feedback ticket.
 *
 * Surfaces the original user content, contact metadata, and a Markdown reply
 * editor (compact toolbar). Status transitions follow the spec:
 *   pending → reviewing (auto when admin starts replying / clicks "Mark reviewing")
 *   reviewing → resolved
 *   any → rejected (closes the ticket)
 *
 * The reply editor is the production `MarkdownEditor` (Milkdown) running in
 * `minimal` mode so admins can use bold/italic/lists without the full slash
 * menu surface area.
 */

import { MarkdownEditor } from "@/components/editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useUpdateFeedback } from "@/hooks/use-feedback";
import type { Feedback } from "@/lib/api/types";
import { formatDateTime } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { overlayVariants } from "@/lib/motion";
import { useToast } from "@/stores/toast-store";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Send, X } from "lucide-react";
import { useEffect, useState } from "react";

const PANEL_VARIANTS = {
	hidden: { x: "100%", opacity: 0.6 },
	visible: {
		x: 0,
		opacity: 1,
		transition: { type: "spring", stiffness: 320, damping: 32 },
	},
	exit: {
		x: "100%",
		opacity: 0.6,
		transition: { duration: 0.2 },
	},
} as const;

interface FeedbackReplyDrawerProps {
	open: boolean;
	feedback: Feedback | null;
	onClose: () => void;
}

const STATUS_VARIANTS: Record<
	Feedback["status"],
	"outline" | "secondary" | "success" | "destructive"
> = {
	pending: "outline",
	reviewing: "secondary",
	resolved: "success",
	rejected: "destructive",
};

const STATUS_LABEL_KEY: Record<Feedback["status"], string> = {
	pending: "Pending",
	reviewing: "Reviewing",
	resolved: "Resolved",
	rejected: "Closed",
};

const TYPE_LABEL_KEY: Record<Feedback["type"], string> = {
	source_suggestion: "Source suggestion",
	bug_report: "Bug report",
	feature_request: "Feature request",
	other: "Other",
};

export function FeedbackReplyDrawer({
	open,
	feedback,
	onClose,
}: FeedbackReplyDrawerProps) {
	const t = useT();
	const locale = useLocale();
	const { success, error } = useToast();
	const [reply, setReply] = useState("");

	useEffect(() => {
		setReply(feedback?.admin_response ?? "");
	}, [feedback]);

	const update = useUpdateFeedback();

	const surfaceStyle = {
		backgroundColor: "var(--surface-muted-bg)",
		borderColor: "var(--surface-muted-border)",
	} as const;
	const fieldStyle = {
		backgroundColor: "var(--field-surface)",
		borderColor: "var(--field-border)",
		color: "var(--field-foreground)",
	} as const;
	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedStyle = { color: "var(--surface-muted-text)" } as const;

	if (!feedback) {
		return null;
	}

	const submit = (nextStatus: Feedback["status"]) => {
		update.mutate(
			{
				id: feedback.id,
				version: feedback.version,
				status: nextStatus,
				admin_response: reply.trim().length > 0 ? reply : null,
			},
			{
				onSuccess: () => {
					success(t("Feedback updated successfully."));
					if (nextStatus !== "reviewing") {
						onClose();
					}
				},
				onError: (cause) => {
					error(cause instanceof Error ? cause.message : t("Unknown error"));
				},
			},
		);
	};

	return (
		<AnimatePresence>
			{open ? (
				<div className="fixed inset-0 z-50 flex">
					<motion.div
						variants={overlayVariants}
						initial="hidden"
						animate="visible"
						exit="exit"
						className="absolute inset-0 bg-black/55 backdrop-blur-sm"
						onClick={onClose}
						aria-hidden="true"
					/>
					<motion.dialog
						open
						variants={PANEL_VARIANTS}
						initial="hidden"
						animate="visible"
						exit="exit"
						className="m-0 ml-auto flex h-full w-full max-h-none max-w-2xl flex-col overflow-hidden border-0 border-l p-0 shadow-2xl"
						style={{
							backgroundColor: "var(--color-background)",
							borderColor: "var(--surface-muted-border)",
						}}
						aria-label={t("Feedback reply")}
					>
						<header
							className="flex items-start justify-between gap-4 border-b px-6 py-4"
							style={{ borderColor: "var(--surface-muted-border)" }}
						>
							<div className="min-w-0">
								<p
									className="text-xs uppercase tracking-wide"
									style={mutedStyle}
								>
									{t("Feedback ticket")}
								</p>
								<h2
									className="mt-1 truncate text-lg font-semibold"
									style={headingStyle}
								>
									{feedback.title}
								</h2>
								<div className="mt-2 flex flex-wrap gap-2">
									<Badge variant={STATUS_VARIANTS[feedback.status]}>
										{t(STATUS_LABEL_KEY[feedback.status])}
									</Badge>
									<Badge variant="outline">
										{t(TYPE_LABEL_KEY[feedback.type])}
									</Badge>
								</div>
							</div>
							<button
								type="button"
								onClick={onClose}
								className="flex h-9 w-9 items-center justify-center rounded-full border"
								style={fieldStyle}
								aria-label={t("Close")}
							>
								<X aria-hidden="true" className="h-4 w-4" />
							</button>
						</header>

						<div className="flex-1 overflow-y-auto px-6 py-4">
							<section className="space-y-2">
								<h3
									className="text-xs uppercase tracking-wide"
									style={mutedStyle}
								>
									{t("Original message")}
								</h3>
								<div
									className="whitespace-pre-wrap rounded-2xl border px-4 py-3 text-sm leading-6"
									style={surfaceStyle}
								>
									<p style={headingStyle}>{feedback.content}</p>
								</div>
								<div
									className="grid gap-2 rounded-2xl border px-4 py-3 text-xs md:grid-cols-2"
									style={surfaceStyle}
								>
									<div>
										<p style={mutedStyle}>{t("Submitted at")}</p>
										<p className="mt-1" style={headingStyle}>
											{formatDateTime(locale, feedback.created_at, {
												year: "numeric",
												month: "2-digit",
												day: "2-digit",
												hour: "2-digit",
												minute: "2-digit",
											})}
										</p>
									</div>
									<div>
										<p style={mutedStyle}>{t("Last updated")}</p>
										<p className="mt-1" style={headingStyle}>
											{formatDateTime(locale, feedback.updated_at, {
												year: "numeric",
												month: "2-digit",
												day: "2-digit",
												hour: "2-digit",
												minute: "2-digit",
											})}
										</p>
									</div>
									{feedback.contact_email ? (
										<div>
											<p style={mutedStyle}>{t("Contact email")}</p>
											<p className="mt-1" style={headingStyle}>
												{feedback.contact_email}
											</p>
										</div>
									) : null}
									{feedback.source_url ? (
										<div className="md:col-span-2">
											<p style={mutedStyle}>{t("Suggested source")}</p>
											<a
												href={feedback.source_url}
												className="mt-1 block truncate underline-offset-2 hover:underline"
												style={headingStyle}
												target="_blank"
												rel="noopener noreferrer"
											>
												{feedback.source_name ?? feedback.source_url}
											</a>
										</div>
									) : null}
								</div>
							</section>

							<section className="mt-6 space-y-2">
								<h3 className="text-sm font-semibold" style={headingStyle}>
									{t("Admin response")}
								</h3>
								<MarkdownEditor
									value={reply}
									onChange={setReply}
									toolbar="minimal"
									minHeight={220}
									placeholder={t("Reply to the user with Markdown formatting.")}
								/>
							</section>
						</div>

						<footer
							className="flex flex-wrap items-center justify-end gap-2 border-t px-6 py-4"
							style={{ borderColor: "var(--surface-muted-border)" }}
						>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => submit("reviewing")}
								disabled={update.isPending}
							>
								{update.isPending ? (
									<Loader2
										aria-hidden="true"
										className="h-4 w-4 animate-spin"
									/>
								) : null}
								{t("Save and mark reviewing")}
							</Button>
							<Button
								type="button"
								size="sm"
								onClick={() => submit("resolved")}
								disabled={update.isPending}
							>
								{update.isPending ? (
									<Loader2
										aria-hidden="true"
										className="h-4 w-4 animate-spin"
									/>
								) : (
									<Send aria-hidden="true" className="h-4 w-4" />
								)}
								{t("Send and resolve")}
							</Button>
							<Button
								type="button"
								variant="destructive"
								size="sm"
								onClick={() => submit("rejected")}
								disabled={update.isPending}
							>
								{t("Reject")}
							</Button>
						</footer>
					</motion.dialog>
				</div>
			) : null}
		</AnimatePresence>
	);
}
