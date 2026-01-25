"use client";

/**
 * Modal 组件
 * 基于 Glassmorphism 设计的通用模态框
 */

import { overlayVariants, scaleVariants } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

interface ModalProps {
	isOpen: boolean;
	onClose: () => void;
	children: React.ReactNode;
	className?: string;
	overlayClassName?: string;
	showCloseButton?: boolean;
	closeOnOverlayClick?: boolean;
	closeOnEscape?: boolean;
	size?: "sm" | "md" | "lg" | "xl" | "full";
}

const sizeClasses = {
	sm: "max-w-sm",
	md: "max-w-lg",
	lg: "max-w-2xl",
	xl: "max-w-4xl",
	full: "max-w-[95vw] max-h-[95vh]",
};

export function Modal({
	isOpen,
	onClose,
	children,
	className,
	overlayClassName,
	showCloseButton = true,
	closeOnOverlayClick = true,
	closeOnEscape = true,
	size = "md",
}: ModalProps) {
	const modalRef = useRef<HTMLDialogElement>(null);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (closeOnEscape && e.key === "Escape") {
				onClose();
			}
		},
		[closeOnEscape, onClose],
	);

	useEffect(() => {
		if (isOpen) {
			document.addEventListener("keydown", handleKeyDown);
			document.body.style.overflow = "hidden";
		}

		return () => {
			document.removeEventListener("keydown", handleKeyDown);
			document.body.style.overflow = "";
		};
	}, [isOpen, handleKeyDown]);

	const handleOverlayClick = (e: React.MouseEvent) => {
		if (closeOnOverlayClick && e.target === e.currentTarget) {
			onClose();
		}
	};

	return (
		<AnimatePresence>
			{isOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center">
					{/* Overlay */}
					<motion.div
						variants={overlayVariants}
						initial="hidden"
						animate="visible"
						exit="exit"
						className={cn(
							"absolute inset-0 bg-black/60 backdrop-blur-sm",
							overlayClassName,
						)}
						onClick={handleOverlayClick}
					/>

						{/* Modal Content */}
						<motion.dialog
							open
							ref={modalRef}
							variants={scaleVariants}
							initial="hidden"
							animate="visible"
							exit="exit"
							className={cn(
								"relative z-10 w-full mx-4 p-0 my-0",
								"bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl",
								"border border-neutral-200/50",
								sizeClasses[size],
								className,
							)}
							aria-modal="true"
						>
						{showCloseButton && (
							<button
								type="button"
								onClick={onClose}
								className={cn(
									"absolute right-4 top-4 z-10",
									"flex h-8 w-8 items-center justify-center rounded-full",
									"bg-neutral-100 text-neutral-500",
									"hover:bg-neutral-200 hover:text-neutral-700",
									"transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/20",
								)}
								aria-label="关闭"
							>
								<X className="h-4 w-4" />
							</button>
							)}
							{children}
						</motion.dialog>
					</div>
				)}
			</AnimatePresence>
		);
	}

// Header 子组件
interface ModalHeaderProps {
	children: React.ReactNode;
	className?: string;
}

export function ModalHeader({ children, className }: ModalHeaderProps) {
	return (
		<div
			className={cn("px-6 pt-6 pb-4 border-b border-neutral-100", className)}
		>
			{children}
		</div>
	);
}

// Body 子组件
interface ModalBodyProps {
	children: React.ReactNode;
	className?: string;
}

export function ModalBody({ children, className }: ModalBodyProps) {
	return (
		<div className={cn("px-6 py-4 overflow-y-auto", className)}>{children}</div>
	);
}

// Footer 子组件
interface ModalFooterProps {
	children: React.ReactNode;
	className?: string;
}

export function ModalFooter({ children, className }: ModalFooterProps) {
	return (
		<div
			className={cn(
				"px-6 py-4 border-t border-neutral-100 flex justify-end gap-3",
				className,
			)}
		>
			{children}
		</div>
	);
}
