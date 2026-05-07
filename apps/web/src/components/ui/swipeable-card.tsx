"use client";

import { useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import {
	type PanInfo,
	motion,
	useAnimation,
	useMotionValue,
	useTransform,
} from "framer-motion";
import { Bookmark, MoreHorizontal, Share2, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";

// ============================================
// Type definitions
// ============================================

interface SwipeAction {
	id: string;
	icon: ReactNode;
	label: string;
	color: string;
	bgColor: string;
	onClick: () => void;
}

interface SwipeableCardProps {
	children: ReactNode;
	/** Actions revealed by swiping right */
	leftActions?: SwipeAction[];
	/** Actions revealed by swiping left */
	rightActions?: SwipeAction[];
	/** Swipe threshold (px) */
	threshold?: number;
	/** Max swipe distance (px) */
	maxSwipe?: number;
	/** Custom class name */
	className?: string;
	/** Disable swiping */
	disabled?: boolean;
	/** Swipe start callback */
	onSwipeStart?: () => void;
	/** Swipe end callback */
	onSwipeEnd?: () => void;
}

// ============================================
// Presets
// ============================================

export const swipeActionPresets = {
	bookmark: (onClick: () => void, isBookmarked = false): SwipeAction => ({
		id: "bookmark",
		icon: (
			<Bookmark
				aria-hidden="true"
				className={cn("h-5 w-5", isBookmarked && "fill-current")}
			/>
		),
		label: isBookmarked ? "Remove bookmark" : "Bookmark",
		color: "text-white",
		bgColor: "bg-primary-500",
		onClick,
	}),
	share: (onClick: () => void): SwipeAction => ({
		id: "share",
		icon: <Share2 aria-hidden="true" className="h-5 w-5" />,
		label: "Share",
		color: "text-white",
		bgColor: "bg-blue-500",
		onClick,
	}),
	delete: (onClick: () => void): SwipeAction => ({
		id: "delete",
		icon: <Trash2 aria-hidden="true" className="h-5 w-5" />,
		label: "Delete",
		color: "text-white",
		bgColor: "bg-red-500",
		onClick,
	}),
	more: (onClick: () => void): SwipeAction => ({
		id: "more",
		icon: <MoreHorizontal aria-hidden="true" className="h-5 w-5" />,
		label: "More",
		color: "text-white",
		bgColor: "bg-neutral-500",
		onClick,
	}),
};

// ============================================
// SwipeableCard
// ============================================

export function SwipeableCard({
	children,
	leftActions = [],
	rightActions = [],
	threshold = 50,
	maxSwipe = 160,
	className,
	disabled = false,
	onSwipeStart,
	onSwipeEnd,
}: SwipeableCardProps) {
	const t = useT();
	const [isOpen, setIsOpen] = useState<"left" | "right" | null>(null);
	const x = useMotionValue(0);
	const controls = useAnimation();

	// Compute opacity/scale for action buttons.
	const leftOpacity = useTransform(x, [0, threshold], [0, 1]);
	const leftScale = useTransform(x, [0, threshold], [0.8, 1]);
	const rightOpacity = useTransform(x, [-threshold, 0], [1, 0]);
	const rightScale = useTransform(x, [-threshold, 0], [1, 0.8]);

	const leftBgClass = leftActions[0]?.bgColor ?? "bg-transparent";
	const rightBgClass = rightActions[0]?.bgColor ?? "bg-transparent";

	const handleDragStart = () => {
		onSwipeStart?.();
	};

	const handleDragEnd = (
		_: MouseEvent | TouchEvent | PointerEvent,
		info: PanInfo,
	) => {
		const velocity = info.velocity.x;
		const offset = info.offset.x;

		// Determine direction and distance.
		if (offset > threshold || velocity > 500) {
			// Swipe right (show left actions)
			if (leftActions.length > 0) {
				controls.start({ x: maxSwipe });
				setIsOpen("left");
			} else {
				controls.start({ x: 0 });
				setIsOpen(null);
			}
		} else if (offset < -threshold || velocity < -500) {
			// Swipe left (show right actions)
			if (rightActions.length > 0) {
				controls.start({ x: -maxSwipe });
				setIsOpen("right");
			} else {
				controls.start({ x: 0 });
				setIsOpen(null);
			}
		} else {
			// Reset
			controls.start({ x: 0 });
			setIsOpen(null);
		}

		onSwipeEnd?.();
	};

	const handleClose = () => {
		controls.start({ x: 0 });
		setIsOpen(null);
	};

	const handleActionClick = (action: SwipeAction) => {
		action.onClick();
		handleClose();
	};

	const actionButtonWidth =
		maxSwipe / Math.max(leftActions.length, rightActions.length, 1);

	return (
		<div className={cn("relative overflow-hidden rounded-xl", className)}>
			{/* Background layer (Tailwind class, not style.backgroundColor) */}
			{rightActions.length > 0 && (
				<motion.div
					className={cn("absolute inset-0 rounded-xl", rightBgClass)}
					style={{ opacity: rightOpacity }}
				/>
			)}
			{leftActions.length > 0 && (
				<motion.div
					className={cn("absolute inset-0 rounded-xl", leftBgClass)}
					style={{ opacity: leftOpacity }}
				/>
			)}

			{/* Left actions (swipe right) */}
			{leftActions.length > 0 && (
				<motion.div
					className="absolute left-0 top-0 bottom-0 flex items-center"
					style={{ opacity: leftOpacity, scale: leftScale }}
				>
					{leftActions.map((action, index) => (
						<button
							key={action.id}
							type="button"
							onClick={() => handleActionClick(action)}
							className={cn(
								"flex flex-col items-center justify-center h-full transition-transform",
								action.color,
								action.bgColor,
							)}
							style={{ width: actionButtonWidth }}
						>
							{action.icon}
							<span className="text-xs mt-1 font-medium">
								{t(action.label)}
							</span>
						</button>
					))}
				</motion.div>
			)}

			{/* Right actions (swipe left) */}
			{rightActions.length > 0 && (
				<motion.div
					className="absolute right-0 top-0 bottom-0 flex items-center"
					style={{ opacity: rightOpacity, scale: rightScale }}
				>
					{rightActions.map((action, index) => (
						<button
							key={action.id}
							type="button"
							onClick={() => handleActionClick(action)}
							className={cn(
								"flex flex-col items-center justify-center h-full transition-transform",
								action.color,
								action.bgColor,
							)}
							style={{ width: actionButtonWidth }}
						>
							{action.icon}
							<span className="text-xs mt-1 font-medium">
								{t(action.label)}
							</span>
						</button>
					))}
				</motion.div>
			)}

			{/* Main content (draggable) */}
			<motion.div
				drag={disabled ? false : "x"}
				dragConstraints={{ left: -maxSwipe, right: maxSwipe }}
				dragElastic={0.1}
				onDragStart={handleDragStart}
				onDragEnd={handleDragEnd}
				animate={controls}
				style={{ x }}
				className="relative bg-white rounded-xl touch-pan-y dark:bg-neutral-900"
				onClick={isOpen ? handleClose : undefined}
			>
				{children}
			</motion.div>

			{/* Backdrop (click to close) */}
			{isOpen && (
				<button
					type="button"
					className="absolute inset-0 z-10 bg-transparent p-0"
					onClick={handleClose}
					aria-label={t("Close")}
				/>
			)}
		</div>
	);
}

// ============================================
// SwipeHint
// ============================================

interface SwipeHintProps {
	direction?: "left" | "right" | "both";
	className?: string;
}

export function SwipeHint({ direction = "left", className }: SwipeHintProps) {
	const t = useT();

	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			className={cn(
				"flex items-center justify-center gap-2 text-xs text-neutral-400 py-2 dark:text-neutral-500",
				className,
			)}
		>
			{(direction === "left" || direction === "both") && (
				<span className="flex items-center gap-1">
					<motion.span
						animate={{ x: [-2, 2, -2] }}
						transition={{ repeat: Number.POSITIVE_INFINITY, duration: 1.5 }}
					>
						←
					</motion.span>
					{t("Swipe left for actions")}
				</span>
			)}
			{direction === "both" && <span className="text-neutral-300 dark:text-neutral-600">|</span>}
			{(direction === "right" || direction === "both") && (
				<span className="flex items-center gap-1">
					{t("Swipe right to bookmark")}
					<motion.span
						animate={{ x: [2, -2, 2] }}
						transition={{ repeat: Number.POSITIVE_INFINITY, duration: 1.5 }}
					>
						→
					</motion.span>
				</span>
			)}
		</motion.div>
	);
}

// ============================================
// Exports
// ============================================

export default SwipeableCard;
