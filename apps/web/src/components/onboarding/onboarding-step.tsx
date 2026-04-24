"use client";

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n-client";
import { ArrowRight } from "lucide-react";
import type { OnboardingStep as OnboardingStepDefinition } from "./tour-steps";
import { ONBOARDING_FALLBACK_COPY } from "./tour-steps";

function translateOr(
	t: (key: string) => string,
	key: string,
	fallback: string,
): string {
	const result = t(key);
	return result === key ? fallback : result;
}

interface OnboardingStepProps {
	step: OnboardingStepDefinition;
	index: number;
	total: number;
	onFollow?: (step: OnboardingStepDefinition) => void;
	className?: string;
}

/**
 * Renders a single step card for the onboarding tour. Pure presentational —
 * the controlling overlay positions the card and wires navigation buttons.
 *
 * The card intentionally avoids animation hooks so it can be reused both in
 * the centered overlay variant and inside a popover anchored to a sidebar
 * item. Callers compose motion/position externally when needed.
 */
export function OnboardingStepCard({
	step,
	index,
	total,
	onFollow,
	className,
}: OnboardingStepProps) {
	const t = useT();
	const Icon = step.icon;

	const fallback = ONBOARDING_FALLBACK_COPY[`onboarding.${step.id}`] ?? {
		title: step.titleKey,
		description: step.descriptionKey,
	};

	const rawTitle = t(step.titleKey);
	const rawDescription = t(step.descriptionKey);
	const title = rawTitle === step.titleKey ? fallback.title : rawTitle;
	const description =
		rawDescription === step.descriptionKey ? fallback.description : rawDescription;

	return (
		<dialog
			open
			aria-modal="true"
			aria-labelledby={`onboarding-step-${step.id}-title`}
			className={cn(
				"relative rounded-2xl border shadow-lg overflow-hidden",
				"w-full max-w-md p-0",
				className,
			)}
			style={{
				backgroundColor: "var(--surface-popover-bg)",
				borderColor: "var(--surface-muted-border)",
			}}
		>
			<div
				className="absolute inset-x-0 top-0 h-1"
				style={{
					background:
						"linear-gradient(90deg, var(--color-primary-500), var(--color-primary-600))",
				}}
				aria-hidden
			/>

			<div className="p-6">
				<div className="flex items-start justify-between gap-4">
					<div
						className="flex h-12 w-12 items-center justify-center rounded-xl"
						style={{
							backgroundColor: "var(--surface-accent-icon-bg)",
							color: "var(--surface-accent-strong)",
						}}
					>
						<Icon aria-hidden="true" className="h-6 w-6" />
					</div>

					<span
						className="text-xs font-semibold uppercase tracking-wider"
						style={{ color: "var(--surface-muted-text)" }}
					>
						{index + 1} / {total}
					</span>
				</div>

				<h3
					id={`onboarding-step-${step.id}-title`}
					className="mt-4 text-lg font-semibold"
					style={{ color: "var(--color-foreground)" }}
				>
					{title}
				</h3>

				<p
					className="mt-2 text-sm leading-relaxed"
					style={{ color: "var(--surface-muted-text)" }}
				>
					{description}
				</p>

				{onFollow ? (
					<button
						type="button"
						onClick={() => onFollow(step)}
						className="mt-4 inline-flex items-center gap-1 text-sm font-medium transition-opacity hover:opacity-80"
						style={{ color: "var(--color-primary-600)" }}
					>
						{translateOr(t, "onboarding.action.open", "进入页面体验")}
						<ArrowRight aria-hidden="true" className="h-4 w-4" />
					</button>
				) : null}
			</div>
		</dialog>
	);
}
