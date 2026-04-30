"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { RoleTier } from "@/lib/authz";
import { withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { motion } from "framer-motion";
import { Crown, LockKeyhole, Sparkles } from "lucide-react";
import Link from "next/link";

interface KnowledgeTierGateProps {
	feature: "graph" | "articles";
	currentTier: RoleTier;
	requiredTier: "verified_user" | "premium_user";
}

const COPY: Record<
	KnowledgeTierGateProps["feature"],
	{ titleKey: string; descKey: string }
> = {
	graph: {
		titleKey: "Unlock the relationship graph",
		descKey:
			"Upgrade to premium to visualize how entities connect and trace their cross-domain influence.",
	},
	articles: {
		titleKey: "Unlock source articles",
		descKey:
			"Verify your account to see source articles linked to each entity, with one-click navigation.",
	},
};

export function KnowledgeTierGate({
	feature,
	currentTier,
	requiredTier,
}: KnowledgeTierGateProps) {
	const t = useT();
	const locale = useLocale();
	const copy = COPY[feature];
	const Icon = requiredTier === "premium_user" ? Crown : Sparkles;
	const accent = requiredTier === "premium_user" ? "#b45309" : "#0f766e";
	const accentBg =
		requiredTier === "premium_user"
			? "color-mix(in srgb, #b45309 14%, transparent)"
			: "color-mix(in srgb, #0f766e 14%, transparent)";
	const tierLabelKey =
		requiredTier === "premium_user" ? "Premium user" : "Verified user";

	return (
		<motion.div
			data-testid={`knowledge-tier-gate-${feature}`}
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.34, ease: [0.25, 0.8, 0.25, 1] }}
			className="flex h-full min-h-0 items-center justify-center"
		>
			<Card
				className="max-w-xl overflow-hidden border shadow-sm"
				style={{
					backgroundImage: "var(--surface-hero-amber-gradient)",
					borderColor: "var(--surface-accent-border)",
				}}
			>
				<CardContent className="flex flex-col items-start gap-4 p-7">
					<div className="flex items-start gap-3">
						<div
							className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
							style={{ backgroundColor: accentBg, color: accent }}
						>
							<Icon aria-hidden="true" className="h-6 w-6" />
						</div>
						<div className="min-w-0 space-y-1.5">
							<div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
								<LockKeyhole
									aria-hidden="true"
									className="h-3.5 w-3.5"
									style={{ color: accent }}
								/>
								<span style={{ color: accent }}>
									{t(tierLabelKey)} {t("required")}
								</span>
							</div>
							<h3
								className="text-lg font-semibold"
								style={{ color: "var(--field-foreground)" }}
							>
								{t(copy.titleKey)}
							</h3>
							<p
								className="text-sm leading-6"
								style={{ color: "var(--surface-muted-text)" }}
							>
								{t(copy.descKey)}
							</p>
							<p
								className="text-xs"
								style={{ color: "var(--surface-muted-text)" }}
							>
								{t("Current tier")}: {t(`role.${currentTier}`)}
							</p>
						</div>
					</div>
					<Link href={withLocalePath(locale, "/me/settings")}>
						<Button variant="default">
							<Sparkles aria-hidden="true" className="mr-2 h-4 w-4" />
							{t("Upgrade account")}
						</Button>
					</Link>
				</CardContent>
			</Card>
		</motion.div>
	);
}
