"use client";

/**
 * SettingsSystemTab — `/me/settings` System info pane.
 * Mirrors `prototype/app.html:1772-1782` (read-only system metadata).
 *
 * Shows app version (from package.json), expected API version, and
 * placeholder-driven sync/role labels. No mock data — values come from
 * auth store / build-time constants. Operational health checks live in
 * the admin dashboard, not here.
 */

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	type RoleTier,
	normalizeRoleTier,
	roleTierLabelKey,
} from "@/lib/authz";
import { formatDateTime } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { useAuthStore } from "@/stores/auth-store";
import { motion } from "framer-motion";
import { Database } from "lucide-react";

const containerVariants = {
	hidden: { opacity: 0 },
	visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
	hidden: { opacity: 0, y: 10 },
	visible: {
		opacity: 1,
		y: 0,
		transition: { duration: 0.28, ease: [0.25, 0.8, 0.25, 1] as const },
	},
};

const APP_VERSION = "0.1.0";
const API_VERSION = "v1";

export function SettingsSystemTab() {
	const t = useT();
	const locale = useLocale();
	const user = useAuthStore((state) => state.user);
	const roleTier = useAuthStore((state) => state.roleTier);
	const tier: RoleTier = normalizeRoleTier(roleTier);
	const roleLabel = t(roleTierLabelKey(tier));

	const lastLoginLabel = user?.last_login
		? formatDateTime(locale, user.last_login)
		: "—";

	const rows: Array<{ label: string; value: string }> = [
		{ label: t("App version"), value: `v${APP_VERSION}` },
		{ label: t("API version"), value: API_VERSION },
		{ label: t("Last login"), value: lastLoginLabel },
		{ label: t("Account role"), value: roleLabel },
	];

	return (
		<motion.div
			className="space-y-5"
			variants={containerVariants}
			initial="hidden"
			animate="visible"
		>
			<motion.div variants={itemVariants}>
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<Database
								aria-hidden="true"
								className="h-4 w-4"
								style={{ color: "var(--color-primary-500)" }}
							/>
							{t("System information")}
						</CardTitle>
						<CardDescription>
							{t(
								"Build metadata for support. For service health, see the admin dashboard.",
							)}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<dl className="divide-y" style={{ borderColor: "var(--surface-card-border)" }}>
							{rows.map((row) => (
								<div
									key={row.label}
									className="flex items-center justify-between py-3 text-sm"
								>
									<dt style={{ color: "var(--surface-card-faint-fg)" }}>
										{row.label}
									</dt>
									<dd
										className="font-semibold tabular-nums"
										style={{ color: "var(--surface-card-foreground)" }}
									>
										{row.value}
									</dd>
								</div>
							))}
						</dl>
					</CardContent>
				</Card>
			</motion.div>
		</motion.div>
	);
}
