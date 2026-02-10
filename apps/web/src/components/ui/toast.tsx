"use client";

/**
 * Toast notifications.
 * UI implementation for the global notification system.
 */

import { toastVariants } from "@/lib/motion";
import { cn } from "@/lib/utils";
import {
	type Toast as ToastType,
	type ToastType as ToastVariant,
	useToastStore,
} from "@/stores/toast-store";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

// ============================================
// Icon mapping
// ============================================

const iconMap: Record<
	ToastVariant,
	React.ComponentType<{ className?: string }>
> = {
	success: CheckCircle2,
	error: XCircle,
	warning: AlertTriangle,
	info: Info,
};

const styleMap: Record<
	ToastVariant,
	{ bg: string; border: string; iconColor: string }
> = {
	success: {
		bg: "bg-green-50",
		border: "border-green-200",
		iconColor: "text-green-600",
	},
	error: {
		bg: "bg-red-50",
		border: "border-red-200",
		iconColor: "text-red-600",
	},
	warning: {
		bg: "bg-amber-50",
		border: "border-amber-200",
		iconColor: "text-amber-600",
	},
	info: {
		bg: "bg-blue-50",
		border: "border-blue-200",
		iconColor: "text-blue-600",
	},
};

// ============================================
// Single toast item
// ============================================

interface ToastItemProps {
	toast: ToastType;
	onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
	const Icon = iconMap[toast.type];
	const styles = styleMap[toast.type];
	const pauseToast = useToastStore((s) => s.pauseToast);
	const resumeToast = useToastStore((s) => s.resumeToast);

	const shouldAutoDismiss = toast.duration > 0;
	const handlePause = () => {
		if (!shouldAutoDismiss) return;
		pauseToast(toast.id);
	};
	const handleResume = () => {
		if (!shouldAutoDismiss) return;
		resumeToast(toast.id);
	};

	return (
		<motion.div
			layout
			variants={toastVariants}
			initial="hidden"
			animate="visible"
			exit="exit"
			onPointerEnter={handlePause}
			onPointerLeave={handleResume}
			onFocusCapture={handlePause}
			onBlurCapture={(e) => {
				const next = e.relatedTarget;
				if (!(next instanceof Node) || !e.currentTarget.contains(next)) {
					handleResume();
				}
			}}
			className={cn(
				"pointer-events-auto w-full max-w-sm overflow-hidden rounded-xl border shadow-lg backdrop-blur-sm",
				styles.bg,
				styles.border,
			)}
		>
			<div className="p-4">
				<div className="flex items-start gap-3">
					{/* Icon */}
					<Icon aria-hidden="true" className={cn("h-5 w-5 shrink-0 mt-0.5", styles.iconColor)} />

					{/* Content */}
					<div className="flex-1 min-w-0">
						<p className="text-sm font-semibold text-neutral-900">
							{toast.title}
						</p>
						{toast.description && (
							<p className="mt-1 text-sm text-neutral-600">
								{toast.description}
							</p>
						)}
						{toast.action && (
							<button
								type="button"
								onClick={toast.action.onClick}
								className="mt-2 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
							>
								{toast.action.label}
							</button>
						)}
					</div>

					{/* Dismiss */}
					<button
						type="button"
						onClick={() => onDismiss(toast.id)}
						className="shrink-0 rounded-lg p-1 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
					>
						<X aria-hidden="true" className="h-4 w-4" />
						<span className="sr-only">Close</span>
					</button>
				</div>
			</div>
		</motion.div>
	);
}

// ============================================
// Toast container
// ============================================

export function ToastContainer() {
	const toasts = useToastStore((s) => s.toasts);
	const removeToast = useToastStore((s) => s.removeToast);

	return (
		<div
			aria-live="polite"
			aria-atomic="true"
			className="pointer-events-none fixed bottom-0 right-0 z-50 flex flex-col gap-3 p-6 w-full max-w-sm"
		>
			<AnimatePresence mode="popLayout">
				{toasts.map((toast) => (
					<ToastItem key={toast.id} toast={toast} onDismiss={removeToast} />
				))}
			</AnimatePresence>
		</div>
	);
}

// ============================================
// Toast provider
// ============================================

interface ToastProviderProps {
	children: React.ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
	return (
		<>
			{children}
			<ToastContainer />
		</>
	);
}

export { useToast } from "@/stores/toast-store";
