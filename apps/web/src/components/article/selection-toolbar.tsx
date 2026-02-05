"use client";

/**
 * Selection toolbar.
 * A contextual menu shown after selecting text: highlight, AI explain, copy quote.
 */

import { useT } from "@/lib/i18n-client";
import { popVariants } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useToast } from "@/stores/toast-store";
import { AnimatePresence, motion } from "framer-motion";
import { Copy, Highlighter, Quote, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// ============================================
// Types
// ============================================

interface SelectionToolbarProps {
	containerRef: React.RefObject<HTMLElement | null>;
	onHighlight?: (text: string, range: Range) => void;
	onAiExplain?: (text: string) => void;
	onCopyQuote?: (text: string) => void;
	className?: string;
}

interface ToolbarPosition {
	top: number;
	left: number;
}

// ============================================
// Button
// ============================================

interface ToolbarButtonProps {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	onClick: () => void;
	variant?: "default" | "primary" | "ai";
}

function ToolbarButton({
	icon: Icon,
	label,
	onClick,
	variant = "default",
}: ToolbarButtonProps) {
	const variants = {
		default: "hover:bg-neutral-700 hover:text-white",
		primary: "hover:bg-primary-500 hover:text-white",
		ai: "hover:bg-gradient-to-r hover:from-purple-500 hover:to-pink-500 hover:text-white",
	};

	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex items-center gap-1.5 px-3 py-2 text-sm text-neutral-200 transition-colors rounded-md",
				variants[variant],
			)}
			title={label}
		>
			<Icon className="h-4 w-4" />
			<span className="hidden sm:inline">{label}</span>
		</button>
	);
}

// ============================================
// Main
// ============================================

export function SelectionToolbar({
	containerRef,
	onHighlight,
	onAiExplain,
	onCopyQuote,
	className,
}: SelectionToolbarProps) {
	const t = useT();
	const [isVisible, setIsVisible] = useState(false);
	const [position, setPosition] = useState<ToolbarPosition>({
		top: 0,
		left: 0,
	});
	const [selectedText, setSelectedText] = useState("");
	const [selectionRange, setSelectionRange] = useState<Range | null>(null);
	const toolbarRef = useRef<HTMLDivElement>(null);
	const { success } = useToast();

	// Compute toolbar position.
	const calculatePosition = useCallback((rect: DOMRect): ToolbarPosition => {
		const toolbarHeight = 44;
		const toolbarWidth = 280;
		const offset = 8;

		let top = rect.top - toolbarHeight - offset + window.scrollY;
		let left = rect.left + rect.width / 2 - toolbarWidth / 2 + window.scrollX;

		// Boundary checks.
		if (top < window.scrollY + 10) {
			top = rect.bottom + offset + window.scrollY;
		}
		if (left < 10) {
			left = 10;
		}
		if (left + toolbarWidth > window.innerWidth - 10) {
			left = window.innerWidth - toolbarWidth - 10;
		}

		return { top, left };
	}, []);

	// Handle selection changes.
	const handleSelectionChange = useCallback(() => {
		const selection = window.getSelection();

		if (!selection || selection.isCollapsed || !selection.rangeCount) {
			setIsVisible(false);
			setSelectedText("");
			setSelectionRange(null);
			return;
		}

		const range = selection.getRangeAt(0);
		const text = selection.toString().trim();

		// Ensure selection is inside the container.
		if (
			containerRef.current &&
			!containerRef.current.contains(range.commonAncestorContainer)
		) {
			setIsVisible(false);
			return;
		}

		// Require at least 2 characters.
		if (text.length < 2) {
			setIsVisible(false);
			return;
		}

		const rect = range.getBoundingClientRect();
		const pos = calculatePosition(rect);

		setPosition(pos);
		setSelectedText(text);
		setSelectionRange(range.cloneRange());
		setIsVisible(true);
	}, [containerRef, calculatePosition]);

	// Listen to selection changes.
	useEffect(() => {
		const handleMouseUp = () => {
			// Delay a tick to ensure selection is finalized.
			setTimeout(handleSelectionChange, 10);
		};

		const handleKeyUp = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setIsVisible(false);
				window.getSelection()?.removeAllRanges();
			}
		};

		document.addEventListener("mouseup", handleMouseUp);
		document.addEventListener("keyup", handleKeyUp);

		return () => {
			document.removeEventListener("mouseup", handleMouseUp);
			document.removeEventListener("keyup", handleKeyUp);
		};
	}, [handleSelectionChange]);

	// Close on outside click.
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (
				toolbarRef.current &&
				!toolbarRef.current.contains(e.target as Node)
			) {
				// Delay close to allow button clicks.
				setTimeout(() => {
					const selection = window.getSelection();
					if (!selection || selection.isCollapsed) {
						setIsVisible(false);
					}
				}, 100);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	// Actions.
	const handleHighlight = () => {
		if (selectionRange) {
			onHighlight?.(selectedText, selectionRange);
			success(t("Highlight added"));
		}
		setIsVisible(false);
	};

	const handleAiExplain = () => {
		onAiExplain?.(selectedText);
		setIsVisible(false);
	};

	const handleCopyQuote = async () => {
		const quote = `"${selectedText}"`;
		try {
			await navigator.clipboard.writeText(quote);
			success(t("Quote copied"));
		} catch {
			// Fallback
			const textArea = document.createElement("textarea");
			textArea.value = quote;
			document.body.appendChild(textArea);
			textArea.select();
			document.execCommand("copy");
			document.body.removeChild(textArea);
			success(t("Quote copied"));
		}
		onCopyQuote?.(selectedText);
		setIsVisible(false);
	};

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(selectedText);
			success(t("Copied to clipboard"));
		} catch {
			const textArea = document.createElement("textarea");
			textArea.value = selectedText;
			document.body.appendChild(textArea);
			textArea.select();
			document.execCommand("copy");
			document.body.removeChild(textArea);
			success(t("Copied to clipboard"));
		}
		setIsVisible(false);
	};

	return (
		<AnimatePresence>
			{isVisible && (
				<motion.div
					ref={toolbarRef}
					variants={popVariants}
					initial="hidden"
					animate="visible"
					exit="exit"
					className={cn(
						"fixed z-50 flex items-center gap-0.5 px-1 py-1 rounded-xl",
						"bg-neutral-900/95 backdrop-blur-sm shadow-xl",
						"border border-neutral-700/50",
						className,
					)}
					style={{
						top: position.top,
						left: position.left,
					}}
				>
					{/* Highlight */}
					{onHighlight && (
						<ToolbarButton
							icon={Highlighter}
							label={t("Highlight")}
							onClick={handleHighlight}
							variant="primary"
						/>
					)}

					{/* AI explain */}
					{onAiExplain && (
						<ToolbarButton
							icon={Sparkles}
							label={t("AI explain")}
							onClick={handleAiExplain}
							variant="ai"
						/>
					)}

					{/* Quote */}
					<ToolbarButton
						icon={Quote}
						label={t("Quote")}
						onClick={handleCopyQuote}
					/>

					{/* Copy */}
					<ToolbarButton icon={Copy} label={t("Copy")} onClick={handleCopy} />

					{/* Divider */}
					<div className="w-px h-6 bg-neutral-700 mx-1" />

					{/* Close */}
					<button
						type="button"
						onClick={() => setIsVisible(false)}
						className="p-1.5 text-neutral-400 hover:text-white transition-colors rounded-md hover:bg-neutral-700"
						title={t("Close")}
					>
						<X className="h-4 w-4" />
					</button>
				</motion.div>
			)}
		</AnimatePresence>
	);
}

// ============================================
// Hook
// ============================================

export function useSelectionToolbar() {
	const [selectedText, setSelectedText] = useState("");
	const [isExplaining, setIsExplaining] = useState(false);

	const handleAiExplain = useCallback(async (text: string) => {
		setSelectedText(text);
		setIsExplaining(true);
		// Actual AI explain logic is handled by the parent.
	}, []);

	const closeExplain = useCallback(() => {
		setIsExplaining(false);
		setSelectedText("");
	}, []);

	return {
		selectedText,
		isExplaining,
		handleAiExplain,
		closeExplain,
	};
}
