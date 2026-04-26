"use client";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { useT } from "@/lib/i18n-client";
import { useToast } from "@/stores/toast-store";
import { motion } from "framer-motion";
import {
	AlertTriangle,
	Download,
	FileJson,
	ShieldAlert,
	Trash2,
} from "lucide-react";

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

export function SettingsPrivacyTab() {
	const t = useT();
	const { success: toastSuccess, error: toastError } = useToast();

	const handleRequestExport = () => {
		toastSuccess(
			t("Data export requested"),
			t(
				"We'll email you when your archive is ready. Self-service export is being rolled out.",
			),
		);
	};

	const handleRequestDeletion = () => {
		const confirmed = window.confirm(
			t(
				"Are you sure you want to request account deletion? Your tenant admin will need to approve this request and the action cannot be undone after approval.",
			),
		);
		if (!confirmed) return;
		toastError(
			t("Account deletion requested"),
			t(
				"Your tenant admin has been notified. You can withdraw the request before it is approved.",
			),
		);
	};

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
							<Download aria-hidden="true" className="h-5 w-5" />
							{t("Export my data")}
						</CardTitle>
						<CardDescription>
							{t(
								"Request a JSON archive of your profile, pins, follows and notification preferences.",
							)}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						<div
							className="flex items-start gap-3 rounded-lg border p-4"
							style={{
								borderColor: "var(--surface-muted-border)",
								backgroundColor: "var(--surface-muted-bg)",
							}}
						>
							<FileJson
								aria-hidden="true"
								className="mt-0.5 h-5 w-5 shrink-0"
								style={{ color: "var(--surface-muted-text)" }}
							/>
							<div className="space-y-1">
								<p
									className="text-sm font-medium"
									style={{ color: "var(--field-foreground)" }}
								>
									{t("What's included")}
								</p>
								<p
									className="text-sm"
									style={{ color: "var(--surface-muted-text)" }}
								>
									{t(
										"Profile, pins, follows, saved searches, web push subscriptions and notification preferences.",
									)}
								</p>
							</div>
						</div>
						<div className="flex justify-end">
							<Button onClick={handleRequestExport}>
								<Download aria-hidden="true" className="mr-2 h-4 w-4" />
								{t("Request export")}
							</Button>
						</div>
					</CardContent>
				</Card>
			</motion.div>

			<motion.div variants={itemVariants}>
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<ShieldAlert aria-hidden="true" className="h-5 w-5" />
							{t("Privacy controls")}
						</CardTitle>
						<CardDescription>
							{t("Manage how your activity is processed for personalization.")}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<p
							className="text-sm"
							style={{ color: "var(--surface-muted-text)" }}
						>
							{t(
								"Granular privacy controls (e.g. opt-out of behavior-based recommendations) are coming soon. Contact support to opt out manually.",
							)}
						</p>
					</CardContent>
				</Card>
			</motion.div>

			<motion.div variants={itemVariants}>
				<Card
					className="border"
					style={{
						borderColor:
							"color-mix(in srgb, var(--color-error) 28%, transparent)",
						backgroundColor:
							"color-mix(in srgb, var(--color-error-light) 60%, transparent)",
					}}
				>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-error">
							<AlertTriangle aria-hidden="true" className="h-5 w-5" />
							{t("Delete account")}
						</CardTitle>
						<CardDescription>
							{t(
								"Request permanent deletion. Your tenant admin must approve before the request is finalized.",
							)}
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<p
							className="text-sm"
							style={{ color: "var(--surface-muted-text)" }}
						>
							{t(
								"This will queue an erasure request. You can withdraw it before approval.",
							)}
						</p>
						<Button variant="outline" onClick={handleRequestDeletion}>
							<Trash2 aria-hidden="true" className="mr-2 h-4 w-4" />
							{t("Request account deletion")}
						</Button>
					</CardContent>
				</Card>
			</motion.div>
		</motion.div>
	);
}
