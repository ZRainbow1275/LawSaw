"use client";

/**
 * SubscriptionPanel — `prototype/app.html:1069-1095`.
 *
 * Lists the user's report subscriptions (周/月/季 + delivery channels).
 * Each row exposes the active/paused toggle, edit, and trigger-now actions.
 *
 * Driven by the real `/api/v1/report-subscriptions` endpoint via
 * `useReportSubscriptions`. If the endpoint returns 401/403 (not entitled)
 * the panel hides itself — no mock data is rendered.
 */

import {
	useCreateReportSubscription,
	useDeleteReportSubscription,
	useReportSubscriptions,
	useReportTemplates,
	useTriggerReportSubscription,
	useUpdateReportSubscription,
} from "@/hooks/use-reports";
import { ApiClientError } from "@/lib/api";
import type { ReportSubscription } from "@/lib/api/types";
import { hasPermission } from "@/lib/authz";
import { useT } from "@/lib/i18n-client";
import { useAuthStore } from "@/stores/auth-store";
import { useToast } from "@/stores/toast-store";
import { PauseCircle, PlayCircle, Plus, Send, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";

interface SubscriptionPanelProps {
	onCreate?: () => void;
}

function periodLabelKey(periodType: string): string {
	switch (periodType) {
		case "weekly":
			return "Weekly template · every Monday";
		case "monthly":
			return "Monthly template · 1st of month";
		case "quarterly":
			return "Quarterly template · Q-start";
		case "custom":
			return "Custom template";
		default:
			return periodType;
	}
}

function deliveryLabelKey(channel: string): string {
	switch (channel) {
		case "email":
			return "Email delivery";
		case "webhook":
			return "Webhook delivery";
		case "web_push":
			return "Web push delivery";
		case "in_app":
			return "In-app delivery";
		default:
			return channel;
	}
}

function SubscriptionRow({ item }: { item: ReportSubscription }) {
	const t = useT();
	const updateMutation = useUpdateReportSubscription();
	const deleteMutation = useDeleteReportSubscription();
	const triggerMutation = useTriggerReportSubscription();
	const { success: toastSuccess, error: toastError } = useToast();

	const onToggle = () => {
		updateMutation.mutate(
			{ id: item.id, is_active: !item.is_active },
			{
				onSuccess: () =>
					toastSuccess(
						item.is_active
							? t("Subscription paused")
							: t("Subscription resumed"),
					),
				onError: (cause) =>
					toastError(
						t("Failed to update subscription"),
						cause instanceof Error ? cause.message : t("Unknown error"),
					),
			},
		);
	};

	const onTrigger = () => {
		triggerMutation.mutate(item.id, {
			onSuccess: () => toastSuccess(t("Subscription triggered")),
			onError: (cause) =>
				toastError(
					t("Failed to trigger subscription"),
					cause instanceof Error ? cause.message : t("Unknown error"),
				),
		});
	};

	const onDelete = () => {
		if (typeof window !== "undefined") {
			const confirmed = window.confirm(t("Delete this subscription?"));
			if (!confirmed) return;
		}
		deleteMutation.mutate(item.id, {
			onSuccess: () => toastSuccess(t("Subscription deleted")),
			onError: (cause) =>
				toastError(
					t("Failed to delete subscription"),
					cause instanceof Error ? cause.message : t("Unknown error"),
				),
		});
	};

	const badgeStyle = item.is_active
		? { backgroundColor: "#e8f5e9", color: "#2e7d32" }
		: {
				backgroundColor: "var(--surface-card-tint-bg)",
				color: "var(--surface-card-muted-fg)",
			};

	return (
		<div
			className="flex flex-wrap items-center justify-between gap-3 border-b py-3.5 last:border-0"
			style={{ borderColor: "var(--surface-card-border)" }}
			data-testid={`subscription-row-${item.id}`}
		>
			<div className="min-w-0 flex-1">
				<div
					className="text-sm font-semibold"
					style={{ color: "var(--surface-card-foreground)" }}
				>
					{item.name}
				</div>
				<div
					className="mt-1 text-xs"
					style={{ color: "var(--surface-card-faint-fg)" }}
				>
					{t(periodLabelKey(item.period_type))} ·{" "}
					{t(deliveryLabelKey(item.delivery_channel))} ·{" "}
					{item.export_format.toUpperCase()}
				</div>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				<span
					className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
					style={badgeStyle}
				>
					{item.is_active ? t("Active") : t("Paused")}
				</span>
				<button
					type="button"
					onClick={onTrigger}
					disabled={!item.is_active || triggerMutation.isPending}
					title={t("Trigger now")}
					className="inline-flex h-7 w-7 items-center justify-center rounded-md border text-neutral-600 transition hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
					style={{ borderColor: "var(--surface-card-border-strong)" }}
				>
					<Send aria-hidden="true" className="h-3.5 w-3.5" />
				</button>
				<button
					type="button"
					onClick={onToggle}
					disabled={updateMutation.isPending}
					title={item.is_active ? t("Pause") : t("Resume")}
					className="inline-flex h-7 w-7 items-center justify-center rounded-md border text-neutral-600 transition hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
					style={{ borderColor: "var(--surface-card-border-strong)" }}
				>
					{item.is_active ? (
						<PauseCircle aria-hidden="true" className="h-3.5 w-3.5" />
					) : (
						<PlayCircle aria-hidden="true" className="h-3.5 w-3.5" />
					)}
				</button>
				<button
					type="button"
					onClick={onDelete}
					disabled={deleteMutation.isPending}
					title={t("Delete")}
					className="inline-flex h-7 w-7 items-center justify-center rounded-md border text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
					style={{ borderColor: "var(--surface-card-border-strong)" }}
				>
					<Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
				</button>
			</div>
		</div>
	);
}

export function SubscriptionPanel({ onCreate }: SubscriptionPanelProps) {
	const t = useT();
	const { success: toastSuccess, error: toastError } = useToast();
	const permissions = useAuthStore((state) => state.permissions);
	const canSubscribe = hasPermission(permissions, "reports:subscribe");
	const { data, error, isLoading, isError } = useReportSubscriptions({
		enabled: canSubscribe,
	});
	const templatesQuery = useReportTemplates(undefined, {
		enabled: canSubscribe,
	});
	const createMutation = useCreateReportSubscription();
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [draft, setDraft] = useState({
		name: "",
		templateId: "",
		deliveryChannel: "in_app",
		exportFormat: "pdf",
	});

	const templates = templatesQuery.data ?? [];
	const selectedTemplate =
		templates.find((template) => template.id === draft.templateId) ??
		templates[0];
	const selectedTemplateId = selectedTemplate?.id ?? "";

	const openCreate = () => {
		if (onCreate) {
			onCreate();
			return;
		}
		setIsCreateOpen((value) => !value);
	};

	const onSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!selectedTemplate) {
			toastError(
				t("No report template available"),
				t("Ask an administrator to publish a report template first."),
			);
			return;
		}

		const name = draft.name.trim() || `${selectedTemplate.name} subscription`;
		createMutation.mutate(
			{
				name,
				template_id: selectedTemplate.id,
				period_type: selectedTemplate.period_type,
				delivery_channel: draft.deliveryChannel,
				export_format: draft.exportFormat,
				filters: {},
				is_active: true,
			},
			{
				onSuccess: () => {
					toastSuccess(t("Subscription created"));
					setDraft({
						name: "",
						templateId: "",
						deliveryChannel: "in_app",
						exportFormat: "pdf",
					});
					setIsCreateOpen(false);
				},
				onError: (cause) =>
					toastError(
						t("Failed to create subscription"),
						cause instanceof Error ? cause.message : t("Unknown error"),
					),
			},
		);
	};

	const isEntitlementError =
		error instanceof ApiClientError &&
		(error.status === 401 || error.status === 403);

	if (!canSubscribe) return null;

	// If the endpoint is forbidden (e.g. tenant disabled), hide silently — no mock.
	if (isError && isEntitlementError) return null;

	return (
		<section
			className="mb-5 rounded-2xl border bg-white p-5 shadow-sm dark:bg-neutral-900"
			style={{ borderColor: "var(--surface-card-border)" }}
			data-testid="subscription-panel"
		>
			<div className="mb-3 flex items-center justify-between">
				<div
					className="text-sm font-bold"
					style={{ color: "var(--surface-card-foreground)" }}
				>
					{t("Periodic subscriptions")}
				</div>
				<button
					type="button"
					onClick={openCreate}
					className="inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-semibold transition hover:bg-neutral-50 dark:hover:bg-white/5"
					style={{
						borderColor: "var(--surface-card-border-strong)",
						color: "var(--surface-card-muted-fg)",
					}}
				>
					<Plus aria-hidden="true" className="h-3.5 w-3.5" />
					{t("New subscription")}
				</button>
			</div>

			{isCreateOpen ? (
				<form
					onSubmit={onSubmit}
					className="mb-4 grid gap-3 rounded-xl border p-3 md:grid-cols-[1.2fr_1fr_0.8fr_0.8fr_auto]"
					style={{ borderColor: "var(--surface-card-border)" }}
					data-testid="subscription-create-form"
				>
					<input
						value={draft.name}
						onChange={(event) =>
							setDraft((value) => ({ ...value, name: event.target.value }))
						}
						placeholder={t("Subscription name")}
						className="h-9 rounded-md border px-3 text-sm"
						style={{ borderColor: "var(--surface-card-border-strong)" }}
					/>
					<select
						value={selectedTemplateId}
						onChange={(event) =>
							setDraft((value) => ({
								...value,
								templateId: event.target.value,
							}))
						}
						disabled={templatesQuery.isLoading || templates.length === 0}
						className="h-9 rounded-md border px-3 text-sm"
						style={{ borderColor: "var(--surface-card-border-strong)" }}
					>
						{templates.length === 0 ? (
							<option value="">{t("No templates available")}</option>
						) : (
							templates.map((template) => (
								<option key={template.id} value={template.id}>
									{template.name} · {t(periodLabelKey(template.period_type))}
								</option>
							))
						)}
					</select>
					<select
						value={draft.deliveryChannel}
						onChange={(event) =>
							setDraft((value) => ({
								...value,
								deliveryChannel: event.target.value,
							}))
						}
						className="h-9 rounded-md border px-3 text-sm"
						style={{ borderColor: "var(--surface-card-border-strong)" }}
					>
						<option value="in_app">{t("In-app delivery")}</option>
						<option value="web_push">{t("Web push delivery")}</option>
					</select>
					<select
						value={draft.exportFormat}
						onChange={(event) =>
							setDraft((value) => ({
								...value,
								exportFormat: event.target.value,
							}))
						}
						className="h-9 rounded-md border px-3 text-sm"
						style={{ borderColor: "var(--surface-card-border-strong)" }}
					>
						<option value="pdf">PDF</option>
						<option value="docx">DOCX</option>
						<option value="html">HTML</option>
					</select>
					<button
						type="submit"
						disabled={!selectedTemplate || createMutation.isPending}
						className="h-9 rounded-md bg-neutral-900 px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-900"
					>
						{createMutation.isPending ? t("Creating") : t("Create")}
					</button>
				</form>
			) : null}

			{isLoading ? (
				<div className="space-y-2" aria-busy="true">
					{[0, 1].map((i) => (
						<div
							key={i}
							className="h-14 animate-pulse rounded-lg"
							style={{ backgroundColor: "var(--surface-card-tint-bg)" }}
						/>
					))}
				</div>
			) : isError ? (
				<div
					className="rounded-lg border-dashed border px-4 py-6 text-center text-xs"
					style={{
						borderColor: "#fecdd3",
						color: "#be123c",
					}}
				>
					{t("Failed to load subscriptions")}
				</div>
			) : !data || data.data.length === 0 ? (
				<div
					className="rounded-lg border-dashed border px-4 py-6 text-center text-xs"
					style={{
						borderColor: "var(--surface-card-border-strong)",
						color: "var(--surface-card-faint-fg)",
					}}
				>
					{t("No subscription yet — create one to receive scheduled reports.")}
				</div>
			) : (
				<div>
					{data.data.map((item) => (
						<SubscriptionRow key={item.id} item={item} />
					))}
				</div>
			)}
		</section>
	);
}
