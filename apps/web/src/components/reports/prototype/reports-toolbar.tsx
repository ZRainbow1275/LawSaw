"use client";

/**
 * ReportsToolbar — `prototype/app.html:1043-1067`.
 *
 * Two select filters (status / period) on the left, primary "Create report"
 * button on the right. Mirrors the toolbar visuals used across reports/feed.
 */

import { useT } from "@/lib/i18n-client";
import { Plus } from "lucide-react";
import type { ChangeEvent } from "react";

const STATUS_OPTIONS = [
	{ value: "", labelKey: "All statuses" },
	{ value: "draft", labelKey: "Draft" },
	{ value: "generating", labelKey: "Generating" },
	{ value: "generated", labelKey: "Generated" },
	{ value: "review", labelKey: "In Review" },
	{ value: "approved", labelKey: "Approved" },
	{ value: "published", labelKey: "Published" },
	{ value: "archived", labelKey: "Archived" },
	{ value: "error", labelKey: "Error" },
] as const;

const PERIOD_OPTIONS = [
	{ value: "", labelKey: "All periods" },
	{ value: "weekly", labelKey: "Weekly" },
	{ value: "monthly", labelKey: "Monthly" },
	{ value: "quarterly", labelKey: "Quarterly" },
	{ value: "custom", labelKey: "Custom" },
] as const;

interface ReportsToolbarProps {
	status: string;
	period: string;
	onStatusChange: (value: string) => void;
	onPeriodChange: (value: string) => void;
	onCreate: () => void;
	createDisabled?: boolean;
}

export function ReportsToolbar({
	status,
	period,
	onStatusChange,
	onPeriodChange,
	onCreate,
	createDisabled = false,
}: ReportsToolbarProps) {
	const t = useT();

	const selectStyle = {
		borderColor: "var(--color-neutral-200)",
		color: "var(--color-neutral-700)",
		backgroundColor: "white",
	} as const;

	const handleStatus = (e: ChangeEvent<HTMLSelectElement>) =>
		onStatusChange(e.target.value);
	const handlePeriod = (e: ChangeEvent<HTMLSelectElement>) =>
		onPeriodChange(e.target.value);

	return (
		<div
			className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm"
			style={{ borderColor: "var(--color-neutral-100)" }}
		>
			<div className="flex flex-wrap items-center gap-2">
				<select
					value={status}
					onChange={handleStatus}
					className="h-9 rounded-lg border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"
					style={selectStyle}
					data-testid="reports-status-filter"
				>
					{STATUS_OPTIONS.map((opt) => (
						<option key={opt.value} value={opt.value}>
							{t(opt.labelKey)}
						</option>
					))}
				</select>
				<select
					value={period}
					onChange={handlePeriod}
					className="h-9 rounded-lg border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"
					style={selectStyle}
					data-testid="reports-period-filter"
				>
					{PERIOD_OPTIONS.map((opt) => (
						<option key={opt.value} value={opt.value}>
							{t(opt.labelKey)}
						</option>
					))}
				</select>
			</div>
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={onCreate}
					disabled={createDisabled}
					className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
					style={{
						backgroundColor: "var(--color-primary-500)",
					}}
					data-testid="reports-create-btn"
				>
					<Plus aria-hidden="true" className="h-4 w-4" />
					{t("Create report")}
				</button>
			</div>
		</div>
	);
}
