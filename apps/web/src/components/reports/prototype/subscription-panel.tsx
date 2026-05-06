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
	useDeleteReportSubscription,
	useReportSubscriptions,
	useTriggerReportSubscription,
	useUpdateReportSubscription,
} from "@/hooks/use-reports";
import type { ReportSubscription } from "@/lib/api/types";
import { useT } from "@/lib/i18n-client";
import { useToast } from "@/stores/toast-store";
import { PauseCircle, PlayCircle, Plus, Send, Trash2 } from "lucide-react";

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
				backgroundColor: "var(--color-neutral-100)",
				color: "var(--color-neutral-600)",
			};

	return (
		<div
			className="flex flex-wrap items-center justify-between gap-3 border-b py-3.5 last:border-0"
			style={{ borderColor: "var(--color-neutral-100)" }}
			data-testid={`subscription-row-${item.id}`}
		>
			<div className="min-w-0 flex-1">
				<div
					className="text-sm font-semibold"
					style={{ color: "var(--color-neutral-800)" }}
				>
					{item.name}
				</div>
				<div
					className="mt-1 text-xs"
					style={{ color: "var(--color-neutral-500)" }}
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
					className="inline-flex h-7 w-7 items-center justify-center rounded-md border text-neutral-600 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
					style={{ borderColor: "var(--color-neutral-200)" }}
				>
					<Send aria-hidden="true" className="h-3.5 w-3.5" />
				</button>
				<button
					type="button"
					onClick={onToggle}
					disabled={updateMutation.isPending}
					title={item.is_active ? t("Pause") : t("Resume")}
					className="inline-flex h-7 w-7 items-center justify-center rounded-md border text-neutral-600 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
					style={{ borderColor: "var(--color-neutral-200)" }}
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
					style={{ borderColor: "var(--color-neutral-200)" }}
				>
					<Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
				</button>
			</div>
		</div>
	);
}

export function SubscriptionPanel({ onCreate }: SubscriptionPanelProps) {
	const t = useT();
	const { data, isLoading, isError } = useReportSubscriptions();

	// If the endpoint is forbidden (e.g. tenant disabled), hide silently — no mock.
	if (isError) return null;

	return (
		<section
			className="mb-5 rounded-2xl border bg-white p-5 shadow-sm"
			style={{ borderColor: "var(--color-neutral-100)" }}
			data-testid="subscription-panel"
		>
			<div className="mb-3 flex items-center justify-between">
				<div
					className="text-sm font-bold"
					style={{ color: "var(--color-neutral-900)" }}
				>
					{t("Periodic subscriptions")}
				</div>
				{onCreate ? (
					<button
						type="button"
						onClick={onCreate}
						className="inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-semibold transition hover:bg-neutral-50"
						style={{
							borderColor: "var(--color-neutral-200)",
							color: "var(--color-neutral-700)",
						}}
					>
						<Plus aria-hidden="true" className="h-3.5 w-3.5" />
						{t("New subscription")}
					</button>
				) : null}
			</div>
			{isLoading ? (
				<div className="space-y-2" aria-busy="true">
					{[0, 1].map((i) => (
						<div
							key={i}
							className="h-14 animate-pulse rounded-lg"
							style={{ backgroundColor: "var(--color-neutral-100)" }}
						/>
					))}
				</div>
			) : !data || data.data.length === 0 ? (
				<div
					className="rounded-lg border-dashed border px-4 py-6 text-center text-xs"
					style={{
						borderColor: "var(--color-neutral-200)",
						color: "var(--color-neutral-500)",
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
