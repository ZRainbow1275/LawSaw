"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { useT } from "@/lib/i18n-client";
import { motion } from "framer-motion";
import { Bell, BellRing, Mail, Newspaper, ShieldAlert } from "lucide-react";
import { useState } from "react";

const containerVariants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: { staggerChildren: 0.08, delayChildren: 0.05 },
	},
};

const itemVariants = {
	hidden: { opacity: 0, y: 14 },
	visible: {
		opacity: 1,
		y: 0,
		transition: { duration: 0.32, ease: [0.25, 0.8, 0.25, 1] as const },
	},
};

interface NotificationToggle {
	key:
		| "email_alerts"
		| "risk_alerts"
		| "weekly_digest"
		| "new_articles";
	labelKey: string;
	descKey: string;
}

const TOGGLES: ReadonlyArray<NotificationToggle> = [
	{
		key: "email_alerts",
		labelKey: "Email alerts",
		descKey: "Receive email notifications for important regulatory updates.",
	},
	{
		key: "risk_alerts",
		labelKey: "Risk alerts",
		descKey: "Notify me when high-risk articles are detected in my watchlist.",
	},
	{
		key: "weekly_digest",
		labelKey: "Weekly digest",
		descKey: "A weekly digest summarizing what changed across your followed entities.",
	},
	{
		key: "new_articles",
		labelKey: "New articles",
		descKey: "Notify me when sources I follow ingest new articles.",
	},
];

interface SettingsNotificationsTabProps {
	initialPreferences?: Partial<Record<NotificationToggle["key"], boolean>>;
	webPushSupported: boolean;
	webPushEnabled: boolean;
	webPushBusy: boolean;
	webPushPermissionDenied: boolean;
	onEnableWebPush: () => void;
	onDisableWebPush: () => void;
	onSendTestWebPush: () => void;
	onSavePreferences: (
		next: Record<NotificationToggle["key"], boolean>,
	) => void;
	saving: boolean;
}

export function SettingsNotificationsTab({
	initialPreferences,
	webPushSupported,
	webPushEnabled,
	webPushBusy,
	webPushPermissionDenied,
	onEnableWebPush,
	onDisableWebPush,
	onSendTestWebPush,
	onSavePreferences,
	saving,
}: SettingsNotificationsTabProps) {
	const t = useT();
	const [prefs, setPrefs] = useState<
		Record<NotificationToggle["key"], boolean>
	>({
		email_alerts: initialPreferences?.email_alerts ?? true,
		risk_alerts: initialPreferences?.risk_alerts ?? true,
		weekly_digest: initialPreferences?.weekly_digest ?? false,
		new_articles: initialPreferences?.new_articles ?? true,
	});

	return (
		<motion.div
			variants={containerVariants}
			initial="hidden"
			animate="visible"
			className="space-y-6"
		>
			<motion.div variants={itemVariants}>
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Mail aria-hidden="true" className="h-5 w-5" />
							{t("Email notification preferences")}
						</CardTitle>
						<CardDescription>
							{t("Choose which categories of email notifications you receive.")}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						{TOGGLES.map((toggle) => {
							const Icon =
								toggle.key === "email_alerts"
									? Mail
									: toggle.key === "risk_alerts"
										? ShieldAlert
										: toggle.key === "new_articles"
											? Newspaper
											: Bell;
							return (
								<div
									key={toggle.key}
									className="flex items-center justify-between rounded-lg border p-4"
									style={{ borderColor: "var(--surface-muted-border)" }}
								>
									<div className="flex items-start gap-3">
										<Icon
											aria-hidden="true"
											className="mt-0.5 h-4 w-4 shrink-0"
											style={{ color: "var(--surface-muted-text)" }}
										/>
										<div>
											<p
												className="text-sm font-medium"
												style={{ color: "var(--field-foreground)" }}
											>
												{t(toggle.labelKey)}
											</p>
											<p
												className="text-xs"
												style={{ color: "var(--surface-muted-text)" }}
											>
												{t(toggle.descKey)}
											</p>
										</div>
									</div>
									<label className="relative inline-flex cursor-pointer items-center">
										<input
											type="checkbox"
											checked={prefs[toggle.key]}
											onChange={(e) =>
												setPrefs((prev) => ({
													...prev,
													[toggle.key]: e.target.checked,
												}))
											}
											className="peer sr-only"
										/>
										<div className="peer h-6 w-11 rounded-full bg-neutral-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary-500 peer-checked:after:translate-x-full" />
									</label>
								</div>
							);
						})}

						<div className="flex justify-end">
							<Button
								onClick={() => onSavePreferences(prefs)}
								disabled={saving}
							>
								{saving ? t("Saving...") : t("Save preferences")}
							</Button>
						</div>
					</CardContent>
				</Card>
			</motion.div>

			<motion.div variants={itemVariants}>
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<BellRing aria-hidden="true" className="h-5 w-5" />
							{t("Browser push notifications")}
						</CardTitle>
						<CardDescription>
							{t(
								"Web Push delivers updates in the background, even when LawSaw isn't open. Requires browser permission.",
							)}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						<div
							className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
							style={{ borderColor: "var(--surface-muted-border)" }}
						>
							<div className="space-y-1">
								<p
									className="text-sm font-medium"
									style={{ color: "var(--field-foreground)" }}
								>
									{t("Status")}
								</p>
								{!webPushSupported ? (
									<Badge variant="outline">{t("Not supported")}</Badge>
								) : webPushEnabled ? (
									<Badge variant="outline">{t("Enabled")}</Badge>
								) : webPushPermissionDenied ? (
									<Badge variant="destructive">{t("Permission denied")}</Badge>
								) : (
									<Badge variant="outline">{t("Not enabled")}</Badge>
								)}
								{webPushSupported && webPushPermissionDenied && (
									<p
										className="text-xs"
										style={{ color: "var(--surface-muted-text)" }}
									>
										{t(
											"The browser blocked notifications for this site. Allow notifications in browser settings to retry.",
										)}
									</p>
								)}
							</div>
							<div className="flex flex-wrap gap-2">
								{webPushSupported && webPushEnabled ? (
									<>
										<Button
											type="button"
											variant="outline"
											size="sm"
											disabled={webPushBusy}
											onClick={onSendTestWebPush}
										>
											{t("Send test notification")}
										</Button>
										<Button
											type="button"
											variant="outline"
											size="sm"
											disabled={webPushBusy}
											onClick={onDisableWebPush}
										>
											{t("Disable")}
										</Button>
									</>
								) : webPushSupported ? (
									<Button
										type="button"
										size="sm"
										disabled={webPushBusy || webPushPermissionDenied}
										onClick={onEnableWebPush}
									>
										{t("Enable")}
									</Button>
								) : null}
							</div>
						</div>
					</CardContent>
				</Card>
			</motion.div>
		</motion.div>
	);
}
