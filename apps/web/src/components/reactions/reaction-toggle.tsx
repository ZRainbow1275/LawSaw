"use client";

/**
 * ReactionToggle — Wave 8 Stream C-2 user-facing reactions UI.
 *
 * A two-button chip (thumbs-up / thumbs-down) with a numeric counter on each
 * side. State machine:
 *   - `my_kind === "like"`     → like button highlighted (brand colour)
 *   - `my_kind === "dislike"`  → dislike button highlighted (error colour)
 *   - clicking the active kind → optimistic clear (mutate { kind: null })
 *   - clicking the opposite    → optimistic switch
 *
 * Honours `useReducedMotion()`: when reduced motion is preferred, the count
 * value is rendered statically and the tap scale-bounce is suppressed.
 */

import { type UseReactionResult, useReaction } from "@/hooks/use-reaction";
import type {
	ReactionKind,
	ReactionSummary,
	ReactionTargetType,
} from "@/lib/api/reactions";
import { useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { useToast } from "@/stores/toast-store";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useEffect, useRef } from "react";

export type ReactionToggleVariant = "inline" | "stacked" | "reader";

interface ReactionToggleProps {
	targetType: ReactionTargetType;
	targetId: string;
	/** Seed value, e.g. `article.reaction_summary`. Avoids an extra round-trip. */
	initialSummary?: ReactionSummary | null;
	/** Visual density: inline (cards) / stacked (reader hero) / reader (CTA bottom). */
	variant?: ReactionToggleVariant;
	className?: string;
	/** Suppress error toast — useful when the page already shows global errors. */
	silent?: boolean;
	/**
	 * When true, the toggle skips its own auto-fetch and relies on a parent
	 * `useReactionSummariesBatch` to hydrate the cache. Use for list scenarios
	 * to avoid the N+1 round trips that would otherwise happen.
	 */
	lazy?: boolean;
}

const VARIANT_BUTTON: Record<
	ReactionToggleVariant,
	{ root: string; button: string; icon: string; gap: string; count: string }
> = {
	inline: {
		root: "gap-1.5",
		button: "h-7 px-2.5 text-xs",
		icon: "h-3.5 w-3.5",
		gap: "gap-1",
		count: "text-xs",
	},
	stacked: {
		root: "gap-3",
		button: "h-10 px-4 text-sm",
		icon: "h-4 w-4",
		gap: "gap-2",
		count: "text-sm",
	},
	reader: {
		root: "gap-2",
		button: "h-9 px-3.5 text-sm",
		icon: "h-4 w-4",
		gap: "gap-1.5",
		count: "text-sm",
	},
};

export function ReactionToggle({
	targetType,
	targetId,
	initialSummary,
	variant = "inline",
	className,
	silent = false,
	lazy = false,
}: ReactionToggleProps) {
	const t = useT();
	const reducedMotion = useReducedMotion() ?? false;
	const toast = useToast();
	const styles = VARIANT_BUTTON[variant];

	const reaction = useReaction(targetType, targetId, {
		initialSummary: initialSummary ?? undefined,
		lazy,
	});

	// Surface a toast when a mutation fails so users know the action was rolled back.
	const errorRef = useRef<unknown>(null);
	useEffect(() => {
		if (silent) return;
		if (
			reaction.isError &&
			reaction.error &&
			reaction.error !== errorRef.current
		) {
			errorRef.current = reaction.error;
			const message =
				reaction.error instanceof Error
					? reaction.error.message
					: t("Reaction failed");
			toast.error(t("Reaction failed: {message}", { message }));
		}
	}, [reaction.isError, reaction.error, silent, toast, t]);

	const summary = reaction.summary ?? {
		likes: 0,
		dislikes: 0,
		score: 0,
	};
	const myKind = reaction.myKind;

	const handleClick = (kind: ReactionKind) => {
		if (reaction.isPending) return;
		reaction.toggle(kind);
	};

	return (
		<div
			className={cn("inline-flex items-center", styles.root, className)}
			data-testid="reaction-toggle"
			data-target-type={targetType}
			data-target-id={targetId}
			data-my-kind={myKind ?? "none"}
		>
			<ReactionButton
				kind="like"
				active={myKind === "like"}
				count={summary.likes}
				onClick={() => handleClick("like")}
				disabled={reaction.isPending}
				styles={styles}
				reducedMotion={reducedMotion}
				ariaLabel={ariaLabelFor("like", myKind, summary, t)}
				ariaPressed={myKind === "like"}
			/>
			<ReactionButton
				kind="dislike"
				active={myKind === "dislike"}
				count={summary.dislikes}
				onClick={() => handleClick("dislike")}
				disabled={reaction.isPending}
				styles={styles}
				reducedMotion={reducedMotion}
				ariaLabel={ariaLabelFor("dislike", myKind, summary, t)}
				ariaPressed={myKind === "dislike"}
			/>
		</div>
	);
}

interface ReactionButtonProps {
	kind: ReactionKind;
	active: boolean;
	count: number;
	onClick: () => void;
	disabled: boolean;
	styles: (typeof VARIANT_BUTTON)[ReactionToggleVariant];
	reducedMotion: boolean;
	ariaLabel: string;
	ariaPressed: boolean;
}

function ReactionButton({
	kind,
	active,
	count,
	onClick,
	disabled,
	styles,
	reducedMotion,
	ariaLabel,
	ariaPressed,
}: ReactionButtonProps) {
	const Icon = kind === "like" ? ThumbsUp : ThumbsDown;
	const isLike = kind === "like";

	const palette = isLike
		? {
				active:
					"border-transparent bg-[var(--color-primary-50)] text-[var(--color-primary-700)] ring-1 ring-[var(--color-primary-200)]",
				inactive:
					"border-[var(--surface-muted-border)] text-[var(--surface-muted-text)] hover:bg-[var(--color-primary-50)] hover:text-[var(--color-primary-600)]",
			}
		: {
				active:
					"border-transparent bg-[var(--color-error-50,#fef2f2)] text-[var(--color-error-600,#dc2626)] ring-1 ring-[var(--color-error-200,#fecaca)]",
				inactive:
					"border-[var(--surface-muted-border)] text-[var(--surface-muted-text)] hover:bg-[var(--color-error-50,#fef2f2)] hover:text-[var(--color-error-600,#dc2626)]",
			};

	return (
		<motion.button
			type="button"
			onClick={onClick}
			disabled={disabled}
			aria-pressed={ariaPressed}
			aria-label={ariaLabel}
			whileTap={reducedMotion ? undefined : { scale: 0.95 }}
			transition={{ type: "spring", stiffness: 400, damping: 18 }}
			className={cn(
				"inline-flex items-center rounded-full border bg-white font-medium transition-colors",
				"focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-300)] focus-visible:ring-offset-1",
				"disabled:cursor-not-allowed disabled:opacity-60",
				styles.button,
				styles.gap,
				active ? palette.active : palette.inactive,
			)}
			data-kind={kind}
			data-active={active}
		>
			<Icon
				aria-hidden="true"
				className={cn(
					styles.icon,
					"transition-transform",
					active && !reducedMotion ? "scale-110" : "scale-100",
				)}
			/>
			<ReactionCount
				value={count}
				reducedMotion={reducedMotion}
				className={styles.count}
			/>
		</motion.button>
	);
}

interface ReactionCountProps {
	value: number;
	reducedMotion: boolean;
	className?: string;
}

function ReactionCount({
	value,
	reducedMotion,
	className,
}: ReactionCountProps) {
	if (reducedMotion) {
		return (
			<span className={cn("tabular-nums", className)} aria-hidden="true">
				{value}
			</span>
		);
	}

	return (
		<span
			className={cn(
				"relative inline-flex h-[1.2em] min-w-[1ch] items-center justify-center overflow-hidden tabular-nums",
				className,
			)}
			aria-hidden="true"
		>
			<AnimatePresence mode="popLayout" initial={false}>
				<motion.span
					key={value}
					initial={{ y: "100%", opacity: 0 }}
					animate={{ y: "0%", opacity: 1 }}
					exit={{ y: "-100%", opacity: 0 }}
					transition={{ duration: 0.18, ease: "easeOut" }}
					className="block"
				>
					{value}
				</motion.span>
			</AnimatePresence>
		</span>
	);
}

function ariaLabelFor(
	buttonKind: ReactionKind,
	currentMyKind: ReactionKind | null,
	summary: ReactionSummary,
	t: ReturnType<typeof useT>,
): string {
	const count = buttonKind === "like" ? summary.likes : summary.dislikes;
	const isActive = currentMyKind === buttonKind;
	const countLabel =
		buttonKind === "like"
			? t("{count} likes", { count })
			: t("{count} dislikes", { count });

	if (isActive) {
		// Pressing again removes the user's reaction.
		return buttonKind === "like"
			? `${t("Liked")} — ${countLabel}. ${t("Click to remove your reaction")}`
			: `${t("Disliked")} — ${countLabel}. ${t("Click to remove your reaction")}`;
	}

	return buttonKind === "like"
		? `${t("Like")} — ${countLabel}. ${t("Click to like")}`
		: `${t("Dislike")} — ${countLabel}. ${t("Click to dislike")}`;
}

export type { UseReactionResult };
export default ReactionToggle;
