"use client";

import { useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { ArrowRight, ChevronLeft, ChevronRight, Sparkles, X } from "lucide-react";
import { Button } from "../ui/button";
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
	onClose?: () => void;
	onSkip?: () => void;
	onPrev?: () => void;
	onNext?: () => void;
	onFinish?: () => void;
	isFirst?: boolean;
	isLast?: boolean;
	className?: string;
}

/**
 * Single-card onboarding step renderer. Owns header (sparkle + LawSaw 快速上手
 * + close), body (icon + step counter + title + description + optional follow
 * link), and footer (skip + prev/next/finish). The hosting overlay only
 * supplies the backdrop and motion wrapper so we never get a double-card
 * stack.
 */
export function OnboardingStepCard({
	step,
	index,
	total,
	onFollow,
	onClose,
	onSkip,
	onPrev,
	onNext,
	onFinish,
	isFirst = false,
	isLast = false,
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
		rawDescription === step.descriptionKey
			? fallback.description
			: rawDescription;

	const showFooter = onSkip || onPrev || onNext || onFinish;

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

			{onClose ? (
				<div
					className="flex items-center justify-between border-b px-5 pt-4 pb-3"
					style={{ borderColor: "var(--surface-muted-border)" }}
				>
					<div className="flex items-center gap-2">
						<Sparkles
							aria-hidden="true"
							className="h-4 w-4"
							style={{ color: "var(--color-primary-500)" }}
						/>
						<span
							className="text-sm font-semibold"
							style={{ color: "var(--color-foreground)" }}
						>
							{translateOr(t, "onboarding.headline", "LawSaw 快速上手")}
						</span>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-lg p-1 transition-opacity hover:opacity-80"
						style={{ color: "var(--surface-muted-text)" }}
						aria-label={t("Close")}
					>
						<X aria-hidden="true" className="h-4 w-4" />
					</button>
				</div>
			) : null}

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

			{showFooter ? (
				<div
					className="flex items-center justify-between gap-3 border-t px-5 py-3"
					style={{ borderColor: "var(--surface-muted-border)" }}
				>
					{onSkip ? (
						<button
							type="button"
							onClick={onSkip}
							className="text-sm font-medium transition-opacity hover:opacity-80"
							style={{ color: "var(--surface-muted-text)" }}
						>
							{translateOr(t, "onboarding.action.skip", "跳过引导")}
						</button>
					) : (
						<span />
					)}

					<div className="flex items-center gap-2">
						{onPrev ? (
							<Button
								variant="outline"
								onClick={onPrev}
								disabled={isFirst}
								aria-label={translateOr(
									t,
									"onboarding.action.previous",
									"上一步",
								)}
							>
								<ChevronLeft aria-hidden="true" className="h-4 w-4" />
							</Button>
						) : null}

						{isLast && onFinish ? (
							<Button onClick={onFinish}>
								{translateOr(t, "onboarding.action.finish", "开始使用")}
							</Button>
						) : onNext ? (
							<Button onClick={onNext}>
								{translateOr(t, "onboarding.action.next", "下一步")}
								<ChevronRight aria-hidden="true" className="ml-1 h-4 w-4" />
							</Button>
						) : null}
					</div>
				</div>
			) : null}
		</dialog>
	);
}
