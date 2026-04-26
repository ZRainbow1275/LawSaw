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
import { type RoleTier, roleTierLabelKey } from "@/lib/authz";
import { withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { motion } from "framer-motion";
import {
	ArrowRight,
	CheckCircle2,
	Crown,
	Receipt,
	ShieldCheck,
	Sparkles,
} from "lucide-react";
import Link from "next/link";

interface BillingTabProps {
	tier: RoleTier;
}

interface PlanCardData {
	tier: "basic_user" | "verified_user" | "premium_user";
	highlightKey: string;
	descKey: string;
	bulletKeys: ReadonlyArray<string>;
	priceKey: string;
}

const PLANS: ReadonlyArray<PlanCardData> = [
	{
		tier: "basic_user",
		highlightKey: "Basic",
		descKey: "Read public regulatory updates and explore the public knowledge graph.",
		bulletKeys: [
			"Read public articles",
			"Browse top knowledge entities",
			"Get regulator-curated daily picks",
		],
		priceKey: "Free",
	},
	{
		tier: "verified_user",
		highlightKey: "Verified",
		descKey:
			"Verified accounts unlock regional and industry analytics plus source articles for every entity.",
		bulletKeys: [
			"All Basic features",
			"Regional and industry analytics",
			"Entity-to-article navigation",
			"Save personal pins and follows",
		],
		priceKey: "Verify your email to unlock",
	},
	{
		tier: "premium_user",
		highlightKey: "Premium",
		descKey:
			"Premium opens up the full knowledge graph canvas, cross-dimensional analytics, and API key issuance.",
		bulletKeys: [
			"All Verified features",
			"Knowledge graph canvas",
			"Cross-dimensional analytics",
			"API keys for programmatic access",
		],
		priceKey: "Upgrade for full access",
	},
];

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

function tierWeight(t: RoleTier): number {
	switch (t) {
		case "basic_user":
			return 0;
		case "verified_user":
			return 1;
		case "premium_user":
			return 2;
		case "tenant_admin":
			return 3;
		case "super_admin":
			return 4;
	}
}

export function SettingsBillingTab({ tier }: BillingTabProps) {
	const t = useT();
	const locale = useLocale();
	const currentLabelKey = roleTierLabelKey(tier);
	const isStaffTier = tier === "tenant_admin" || tier === "super_admin";

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
							<Receipt aria-hidden="true" className="h-5 w-5" />
							{t("Current plan")}
						</CardTitle>
						<CardDescription>
							{t(
								"Plan controls the features available to your account. Upgrades unlock additional analytics and API access.",
							)}
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div className="flex items-center gap-3">
							<div
								className="flex h-12 w-12 items-center justify-center rounded-xl"
								style={{
									backgroundColor: "var(--surface-accent-icon-bg)",
									color: "#b45309",
								}}
							>
								<Crown aria-hidden="true" className="h-6 w-6" />
							</div>
							<div>
								<div className="flex items-center gap-2">
									<p
										className="text-lg font-semibold"
										style={{ color: "var(--field-foreground)" }}
									>
										{t(currentLabelKey)}
									</p>
									{isStaffTier && (
										<Badge variant="outline">{t("Staff access")}</Badge>
									)}
								</div>
								<p
									className="text-sm"
									style={{ color: "var(--surface-muted-text)" }}
								>
									{isStaffTier
										? t(
												"Staff accounts have all premium features plus admin tools.",
											)
										: t("All features available at this tier are unlocked.")}
								</p>
							</div>
						</div>
						{!isStaffTier && tier !== "premium_user" && (
							<Link href={withLocalePath(locale, "/settings/profile")}>
								<Button>
									<Sparkles aria-hidden="true" className="mr-2 h-4 w-4" />
									{t("Upgrade account")}
								</Button>
							</Link>
						)}
					</CardContent>
				</Card>
			</motion.div>

			<motion.div
				variants={itemVariants}
				className="grid grid-cols-1 gap-4 lg:grid-cols-3"
			>
				{PLANS.map((plan) => {
					const isCurrent = !isStaffTier && plan.tier === tier;
					const isUpgrade =
						!isStaffTier && tierWeight(plan.tier) > tierWeight(tier);
					return (
						<Card
							key={plan.tier}
							className={
								isCurrent
									? "border-2"
									: "border"
							}
							style={{
								borderColor: isCurrent
									? "var(--surface-accent-border)"
									: "var(--surface-muted-border)",
								backgroundColor: isCurrent
									? "var(--surface-accent-icon-bg)"
									: undefined,
							}}
						>
							<CardHeader>
								<div className="flex items-center justify-between">
									<CardTitle className="flex items-center gap-2 text-base">
										{plan.tier === "premium_user" ? (
											<Crown aria-hidden="true" className="h-4 w-4" />
										) : plan.tier === "verified_user" ? (
											<ShieldCheck aria-hidden="true" className="h-4 w-4" />
										) : (
											<CheckCircle2 aria-hidden="true" className="h-4 w-4" />
										)}
										{t(plan.highlightKey)}
									</CardTitle>
									{isCurrent && (
										<Badge variant="outline">{t("Current")}</Badge>
									)}
								</div>
								<CardDescription>{t(plan.descKey)}</CardDescription>
							</CardHeader>
							<CardContent className="space-y-3">
								<p
									className="text-sm font-medium"
									style={{ color: "var(--field-foreground)" }}
								>
									{t(plan.priceKey)}
								</p>
								<ul className="space-y-1.5 text-sm">
									{plan.bulletKeys.map((bulletKey) => (
										<li
											key={bulletKey}
											className="flex items-start gap-2"
											style={{ color: "var(--surface-muted-text)" }}
										>
											<CheckCircle2
												aria-hidden="true"
												className="mt-0.5 h-4 w-4 shrink-0"
												style={{ color: "#0f766e" }}
											/>
											<span>{t(bulletKey)}</span>
										</li>
									))}
								</ul>
								{isUpgrade && (
									<Link
										href={withLocalePath(locale, "/settings/profile")}
										className="block"
									>
										<Button variant="outline" className="w-full">
											{t("Upgrade to {plan}", { plan: t(plan.highlightKey) })}
											<ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
										</Button>
									</Link>
								)}
							</CardContent>
						</Card>
					);
				})}
			</motion.div>

			<motion.div variants={itemVariants}>
				<Card>
					<CardHeader>
						<CardTitle>{t("Billing history")}</CardTitle>
						<CardDescription>
							{t(
								"Self-service billing is rolling out. Contact your tenant admin for invoices in the meantime.",
							)}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<p
							className="text-sm"
							style={{ color: "var(--surface-muted-text)" }}
						>
							{t("No invoices to display yet.")}
						</p>
					</CardContent>
				</Card>
			</motion.div>
		</motion.div>
	);
}
