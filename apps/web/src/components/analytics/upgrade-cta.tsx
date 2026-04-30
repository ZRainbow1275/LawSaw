"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { RoleTier } from "@/lib/authz";
import { withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { motion } from "framer-motion";
import { Crown, LockKeyhole, Sparkles } from "lucide-react";
import Link from "next/link";

interface UpgradeCtaProps {
	tabKey: string;
	currentTier: RoleTier;
	requiredTier: "verified_user" | "premium_user";
}

const messageByTab: Record<string, { titleKey: string; descKey: string }> = {
	regional: {
		titleKey: "Unlock regional intelligence",
		descKey:
			"Verify your account to access China + global heatmaps and per-region ranking.",
	},
	industry: {
		titleKey: "Unlock industry intelligence",
		descKey:
			"Verify your account to compare domain distribution and drill into sub-domains.",
	},
	importance: {
		titleKey: "Unlock importance & authority insights",
		descKey:
			"Upgrade to premium to prioritize review by importance scores, authority levels, and issuer concentration.",
	},
	cross: {
		titleKey: "Unlock cross-dimensional analysis",
		descKey:
			"Upgrade to premium to correlate domain × region × importance signals and trace timeline shifts.",
	},
};

export function UpgradeCta({
	tabKey,
	currentTier,
	requiredTier,
}: UpgradeCtaProps) {
	const t = useT();
	const locale = useLocale();
	const message = messageByTab[tabKey] ?? {
		titleKey: "Upgrade required",
		descKey: "This view is available on a higher account tier.",
	};

	const Icon = requiredTier === "premium_user" ? Crown : Sparkles;
	const tierLabelKey =
		requiredTier === "premium_user" ? "Premium user" : "Verified user";
	const accentBg =
		requiredTier === "premium_user"
			? "color-mix(in srgb, #b45309 14%, transparent)"
			: "color-mix(in srgb, #0f766e 14%, transparent)";
	const accentColor =
		requiredTier === "premium_user" ? "#b45309" : "#0f766e";

	return (
		<motion.div
			data-testid={`analytics-upgrade-${tabKey}`}
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.32, ease: [0.25, 0.8, 0.25, 1] }}
		>
			<Card
				className="overflow-hidden border shadow-sm"
				style={{
					backgroundImage: "var(--surface-hero-amber-gradient)",
					borderColor: "var(--surface-accent-border)",
				}}
			>
				<CardContent className="flex flex-col gap-5 p-8 lg:flex-row lg:items-center lg:justify-between">
					<div className="flex items-start gap-4">
						<div
							className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
							style={{ backgroundColor: accentBg, color: accentColor }}
						>
							<Icon aria-hidden="true" className="h-6 w-6" />
						</div>
						<div className="space-y-2">
							<div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
								<LockKeyhole
									aria-hidden="true"
									className="h-3.5 w-3.5"
									style={{ color: accentColor }}
								/>
								<span style={{ color: accentColor }}>
									{t(tierLabelKey)} {t("required")}
								</span>
							</div>
							<h3
								className="text-lg font-semibold"
								style={{ color: "var(--field-foreground)" }}
							>
								{t(message.titleKey)}
							</h3>
							<p
								className="max-w-xl text-sm leading-6"
								style={{ color: "var(--surface-muted-text)" }}
							>
								{t(message.descKey)}
							</p>
							<p
								className="text-xs"
								style={{ color: "var(--surface-muted-text)" }}
							>
								{t("Current tier")}: {t(`role.${currentTier}`)}
							</p>
						</div>
					</div>
					<div className="flex flex-shrink-0 gap-2">
						<Link href={withLocalePath(locale, "/me/settings")}>
							<Button variant="default">
								<Sparkles aria-hidden="true" className="mr-2 h-4 w-4" />
								{t("Upgrade account")}
							</Button>
						</Link>
					</div>
				</CardContent>
			</Card>
		</motion.div>
	);
}
