"use client";

import { Badge } from "@/components/ui/badge";
import { useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import {
	AlertCircle,
	Archive,
	Calendar,
	CalendarClock,
	CalendarDays,
	CalendarRange,
	CheckCircle,
	CheckCircle2,
	Eye,
	Loader2,
	type LucideIcon,
	Pencil,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Report Status Badge
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
	string,
	{
		variant:
			| "default"
			| "secondary"
			| "destructive"
			| "outline"
			| "success"
			| "warning"
			| "info";
		icon: LucideIcon;
		spin?: boolean;
	}
> = {
	draft: { variant: "outline", icon: Pencil },
	generating: { variant: "warning", icon: Loader2, spin: true },
	generated: { variant: "info", icon: CheckCircle },
	review: { variant: "warning", icon: Eye },
	published: { variant: "success", icon: CheckCircle2 },
	archived: { variant: "secondary", icon: Archive },
	error: { variant: "destructive", icon: AlertCircle },
};

interface ReportStatusBadgeProps {
	status: string;
	className?: string;
}

export function ReportStatusBadge({
	status,
	className,
}: ReportStatusBadgeProps) {
	const t = useT();
	const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
	const Icon = config.icon;

	const statusLabels: Record<string, string> = {
		draft: t("Draft"),
		generating: t("Generating"),
		generated: t("Generated"),
		review: t("In Review"),
		published: t("Published"),
		archived: t("Archived"),
		error: t("Error"),
	};

	return (
		<Badge variant={config.variant} className={cn("gap-1", className)}>
			<Icon
				aria-hidden="true"
				className={cn("h-3 w-3", config.spin && "animate-spin")}
			/>
			{statusLabels[status] ?? status}
		</Badge>
	);
}

// ---------------------------------------------------------------------------
// Report Period Badge
// ---------------------------------------------------------------------------

const PERIOD_CONFIG: Record<string, { icon: LucideIcon }> = {
	weekly: { icon: Calendar },
	monthly: { icon: CalendarDays },
	quarterly: { icon: CalendarRange },
	custom: { icon: CalendarClock },
};

interface ReportPeriodBadgeProps {
	periodType: string;
	className?: string;
}

export function ReportPeriodBadge({
	periodType,
	className,
}: ReportPeriodBadgeProps) {
	const t = useT();
	const config = PERIOD_CONFIG[periodType] ?? PERIOD_CONFIG.custom;
	const Icon = config.icon;

	const periodLabels: Record<string, string> = {
		weekly: t("Weekly"),
		monthly: t("Monthly"),
		quarterly: t("Quarterly"),
		custom: t("Custom"),
	};

	return (
		<Badge variant="outline" className={cn("gap-1", className)}>
			<Icon aria-hidden="true" className="h-3 w-3" />
			{periodLabels[periodType] ?? periodType}
		</Badge>
	);
}
