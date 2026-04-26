"use client";

import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n-client";
import { Bell, ClipboardList, MessageSquarePlus, Settings } from "lucide-react";
import type { CSSProperties } from "react";

type NotificationAction = {
	id: string;
	icon: typeof Bell;
	titleKey: string;
	descriptionKey: string;
	onSelect: () => void;
};

interface NotificationPanelProps {
	actions: NotificationAction[];
}

export function NotificationPanel({ actions }: NotificationPanelProps) {
	const t = useT();
	const panelStyle = {
		backgroundColor: "color-mix(in srgb, var(--surface-popover-bg) 95%, transparent)",
		borderColor: "color-mix(in srgb, var(--surface-muted-border) 60%, transparent)",
	} satisfies CSSProperties;
	const titleStyle = { color: "var(--field-foreground)" } as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;
	const emptyStateStyle = {
		backgroundColor: "color-mix(in srgb, var(--surface-muted-bg) 70%, transparent)",
		borderColor: "var(--surface-muted-border)",
	} satisfies CSSProperties;
	const emptyIconShellStyle = {
		backgroundColor: "var(--surface-popover-bg)",
		color: "var(--surface-muted-text)",
	} satisfies CSSProperties;
	const actionCardStyle = {
		backgroundColor: "var(--surface-popover-bg)",
		borderColor: "color-mix(in srgb, var(--surface-muted-border) 70%, transparent)",
	} satisfies CSSProperties;
	const actionCardHoverStyle = {
		borderColor: "color-mix(in srgb, var(--color-primary-500) 24%, transparent)",
		backgroundColor:
			"color-mix(in srgb, var(--color-primary-50) 60%, var(--surface-popover-bg) 40%)",
	} satisfies CSSProperties;
	const actionIconShellStyle = {
		backgroundColor: "var(--surface-muted-bg)",
		color: "var(--surface-muted-text)",
	} satisfies CSSProperties;

	return (
		<div
			className="w-[min(24rem,calc(100vw-2rem))] rounded-2xl border p-3 shadow-lg backdrop-blur-xl"
			style={panelStyle}
		>
			<div className="flex items-start justify-between gap-3 px-1 pb-3">
				<div>
					<p className="text-sm font-semibold" style={titleStyle}>
						{t("Message center")}
					</p>
					<p className="mt-1 text-xs" style={mutedTextStyle}>
						{t("Your latest system and delivery updates appear here.")}
					</p>
				</div>
			</div>

			<div
				className="rounded-xl border border-dashed p-4"
				style={emptyStateStyle}
			>
				<div className="flex items-start gap-3">
					<div
						className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm"
						style={emptyIconShellStyle}
					>
						<Bell aria-hidden="true" className="h-5 w-5" />
					</div>
					<div className="min-w-0">
						<p className="text-sm font-medium" style={titleStyle}>
							{t("No notifications yet")}
						</p>
						<p className="mt-1 text-xs leading-5" style={mutedTextStyle}>
							{t("When new delivery events, report exports, or feedback updates arrive, they will be listed here.")}
						</p>
					</div>
				</div>
			</div>

			<div className="mt-3 space-y-2">
				{actions.map((action) => {
					const Icon = action.icon;
					return (
						<button
							key={action.id}
							type="button"
							onClick={action.onSelect}
							className="flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors"
							style={actionCardStyle}
							onMouseEnter={(event) => {
								Object.assign(
									event.currentTarget.style,
									actionCardHoverStyle,
								);
							}}
							onMouseLeave={(event) => {
								Object.assign(event.currentTarget.style, actionCardStyle);
							}}
						>
							<div
								className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
								style={actionIconShellStyle}
							>
								<Icon aria-hidden="true" className="h-4 w-4" />
							</div>
							<div className="min-w-0 flex-1">
								<p className="text-sm font-medium" style={titleStyle}>
									{t(action.titleKey)}
								</p>
								<p className="mt-1 text-xs leading-5" style={mutedTextStyle}>
									{t(action.descriptionKey)}
								</p>
							</div>
						</button>
					);
				})}
			</div>

			<div className="mt-3 flex justify-end">
				<Button type="button" variant="ghost" size="sm" onClick={actions[0]?.onSelect}>
					{t("Notification settings")}
				</Button>
			</div>
		</div>
	);
}

export const notificationPanelIcons = {
	feedback: MessageSquarePlus,
	reports: ClipboardList,
	settings: Settings,
};
