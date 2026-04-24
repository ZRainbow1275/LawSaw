"use client";

import { Button } from "@/components/ui/button";
import { groupedShortcuts, type ShortcutDescriptor } from "@/lib/commands";
import { useLocale, useT } from "@/lib/i18n-client";
import { overlayVariants, scaleVariants } from "@/lib/motion";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Keyboard, X } from "lucide-react";
import { useEffect, useRef } from "react";

interface ShortcutsHelpProps {
	isOpen: boolean;
	onClose: () => void;
}

const backdropStyle = {
	backgroundColor:
		"color-mix(in srgb, var(--color-neutral-950) 40%, transparent)",
} as const;

const surfaceStyle = {
	backgroundColor: "var(--surface-muted-bg)",
	borderColor: "var(--surface-muted-border)",
} as const;

const nestedSurfaceStyle = {
	backgroundColor: "var(--control-hover-bg)",
	borderColor: "var(--surface-muted-border)",
} as const;

const headingTextStyle = {
	color: "var(--field-foreground)",
} as const;

const mutedTextStyle = {
	color: "var(--surface-muted-text)",
} as const;

const accentIconStyle = {
	color: "var(--surface-accent-strong)",
} as const;

function ShortcutRow({
	descriptor,
	locale,
}: {
	descriptor: ShortcutDescriptor;
	locale: "zh" | "en";
}) {
	const title = locale === "en" ? descriptor.titleEn : descriptor.titleZh;
	return (
		<div
			className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2"
			style={nestedSurfaceStyle}
		>
			<p className="text-sm" style={headingTextStyle}>
				{title}
			</p>
			<div className="flex items-center gap-1">
				{descriptor.combo.map((key, index) => (
					<span key={`${descriptor.id}-${index}`} className="flex items-center gap-1">
						<kbd
							className="rounded border px-2 py-1 font-sans text-[11px] font-medium"
							style={{ ...surfaceStyle, ...headingTextStyle }}
						>
							{key}
						</kbd>
						{index < descriptor.combo.length - 1 ? (
							<span className="text-[10px]" style={mutedTextStyle}>
								+
							</span>
						) : null}
					</span>
				))}
			</div>
		</div>
	);
}

export function ShortcutsHelp({ isOpen, onClose }: ShortcutsHelpProps) {
	const locale = useLocale();
	const t = useT();
	const reducedMotion = useReducedMotion() ?? false;
	const closeButtonRef = useRef<HTMLButtonElement | null>(null);

	useEffect(() => {
		if (!isOpen) return;
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		const raf = window.requestAnimationFrame(() => {
			closeButtonRef.current?.focus();
		});
		return () => {
			window.cancelAnimationFrame(raf);
			document.body.style.overflow = previousOverflow;
		};
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen) return;
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				onClose();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, onClose]);

	const groups = groupedShortcuts(locale);

	return (
		<AnimatePresence initial={!reducedMotion}>
			{isOpen ? (
				<motion.div
					className="fixed inset-0 z-[60] flex items-center justify-center p-4 backdrop-blur-sm"
					style={backdropStyle}
					initial="hidden"
					animate="visible"
					exit="hidden"
					variants={overlayVariants}
					onClick={onClose}
					role="presentation"
				>
					<motion.div
						className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border shadow-2xl"
						style={surfaceStyle}
						variants={scaleVariants}
						initial="hidden"
						animate="visible"
						exit="hidden"
						onClick={(event) => event.stopPropagation()}
						role="dialog"
						aria-modal="true"
						aria-labelledby="shortcuts-help-title"
					>
						<div
							className="flex items-center justify-between gap-3 border-b px-5 py-4"
							style={{ borderColor: "var(--surface-muted-border)" }}
						>
							<div className="flex items-center gap-3">
								<Keyboard
									aria-hidden="true"
									className="h-5 w-5"
									style={accentIconStyle}
								/>
								<div>
									<h2
										id="shortcuts-help-title"
										className="text-base font-semibold"
										style={headingTextStyle}
									>
										{t("Keyboard shortcuts")}
									</h2>
									<p className="text-xs" style={mutedTextStyle}>
										{t(
											"Browse all registered shortcuts. Press Esc to close.",
										)}
									</p>
								</div>
							</div>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								aria-label={t("Close")}
								ref={closeButtonRef}
								onClick={onClose}
							>
								<X aria-hidden="true" className="h-4 w-4" />
							</Button>
						</div>

						<div className="flex-1 overflow-y-auto p-5">
							<div className="flex flex-col gap-6">
								{groups.map((group) => (
									<section
										key={group.key}
										aria-label={group.title}
										className="flex flex-col gap-3"
									>
										<header className="flex items-center gap-2">
											<span
												className="text-xs font-semibold uppercase tracking-wide"
												style={mutedTextStyle}
											>
												{group.title}
											</span>
											<span
												className="h-px flex-1"
												style={{
													backgroundColor: "var(--surface-muted-border)",
												}}
												aria-hidden="true"
											/>
										</header>
										<div className="flex flex-col gap-2">
											{group.items.map((descriptor) => (
												<ShortcutRow
													key={descriptor.id}
													descriptor={descriptor}
													locale={locale}
												/>
											))}
										</div>
									</section>
								))}
							</div>
						</div>

						<div
							className="border-t px-5 py-3 text-xs"
							style={{
								borderColor: "var(--surface-muted-border)",
								...mutedTextStyle,
							}}
						>
							{t(
								"Tip: press Ctrl+Shift+P to open the command palette for commands beyond shortcuts.",
							)}
						</div>
					</motion.div>
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}
