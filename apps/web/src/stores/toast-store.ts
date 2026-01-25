/**
 * Toast 通知状态管理
 * 全局通知系统
 */

"use client";

import { create } from "zustand";

// ============================================
// 类型定义
// ============================================

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastAction {
	label: string;
	onClick: () => void;
}

export interface Toast {
	/** 唯一 ID */
	id: string;
	/** 通知类型 */
	type: ToastType;
	/** 标题 */
	title: string;
	/** 描述（可选） */
	description?: string;
	/** 持续时间（毫秒），0 表示不自动关闭 */
	duration: number;
	/** 操作按钮（可选） */
	action?: ToastAction;
	/** 创建时间 */
	createdAt: number;
}

export type ToastInput = Omit<Toast, "id" | "createdAt" | "duration"> & {
	duration?: number;
};

interface ToastState {
	/** 当前显示的 Toast 列表 */
	toasts: Toast[];
	/** 最大同时显示数量 */
	maxToasts: number;

	// Actions
	addToast: (toast: ToastInput) => string;
	removeToast: (id: string) => void;
	clearAll: () => void;
	pauseToast: (id: string) => void;
	resumeToast: (id: string) => void;
}

// ============================================
// 工具函数
// ============================================

let toastIdCounter = 0;

function generateId(): string {
	return `toast-${Date.now()}-${++toastIdCounter}`;
}

type ToastTimer = {
	timeoutId: ReturnType<typeof setTimeout> | null;
	startedAt: number;
	remaining: number;
};

const toastTimers = new Map<string, ToastTimer>();

function clearToastTimer(id: string) {
	const timer = toastTimers.get(id);
	if (!timer) return;

	if (timer.timeoutId !== null) {
		clearTimeout(timer.timeoutId);
	}

	toastTimers.delete(id);
}

function startToastTimer(id: string, duration: number, onExpire: () => void) {
	clearToastTimer(id);

	const startedAt = Date.now();
	const timeoutId = setTimeout(onExpire, duration);
	toastTimers.set(id, { timeoutId, startedAt, remaining: duration });
}

function pauseToastTimer(id: string) {
	const timer = toastTimers.get(id);
	if (!timer || timer.timeoutId === null) return;

	const elapsed = Date.now() - timer.startedAt;
	const remaining = Math.max(0, timer.remaining - elapsed);

	clearTimeout(timer.timeoutId);
	toastTimers.set(id, {
		timeoutId: null,
		startedAt: timer.startedAt,
		remaining,
	});
}

function resumeToastTimer(id: string, onExpire: () => void) {
	const timer = toastTimers.get(id);
	if (!timer || timer.timeoutId !== null) return;

	if (timer.remaining <= 0) {
		clearToastTimer(id);
		onExpire();
		return;
	}

	const startedAt = Date.now();
	const timeoutId = setTimeout(onExpire, timer.remaining);
	toastTimers.set(id, { timeoutId, startedAt, remaining: timer.remaining });
}

// 默认持续时间（毫秒）
const DEFAULT_DURATION = 5000;
const MAX_TOASTS = 5;

// ============================================
// Store 实现
// ============================================

function createToastStore() {
	return create<ToastState>((set, get) => ({
		toasts: [],
		maxToasts: MAX_TOASTS,

		addToast: (input) => {
			const id = generateId();
			const toast: Toast = {
				...input,
				id,
				duration: input.duration ?? DEFAULT_DURATION,
				createdAt: Date.now(),
			};

			const evictedIds: string[] = [];
			set((state) => {
				// 如果超过最大数量，移除最旧的
				const newToasts = [...state.toasts, toast];
				while (newToasts.length > state.maxToasts) {
					const removed = newToasts.shift();
					if (removed) {
						evictedIds.push(removed.id);
					}
				}
				return { toasts: newToasts };
			});

			for (const removedId of evictedIds) {
				clearToastTimer(removedId);
			}

			// 自动关闭
			if (toast.duration > 0) {
				startToastTimer(id, toast.duration, () => {
					get().removeToast(id);
				});
			}

			return id;
		},

		removeToast: (id) => {
			clearToastTimer(id);
			set((state) => ({
				toasts: state.toasts.filter((t) => t.id !== id),
			}));
		},

		clearAll: () => {
			for (const toast of get().toasts) {
				clearToastTimer(toast.id);
			}
			set({ toasts: [] });
		},

		pauseToast: (id) => {
			pauseToastTimer(id);
		},

		resumeToast: (id) => {
			resumeToastTimer(id, () => {
				get().removeToast(id);
			});
		},
	}));
}

type ToastStore = ReturnType<typeof createToastStore>;
type GlobalWithToastStore = typeof globalThis & {
	__LAW_EYE_INTERNAL_TOAST_STORE_INSTANCE?: ToastStore;
};

export const useToastStore: ToastStore = (() => {
	const g = globalThis as GlobalWithToastStore;
	if (!g.__LAW_EYE_INTERNAL_TOAST_STORE_INSTANCE) {
		g.__LAW_EYE_INTERNAL_TOAST_STORE_INSTANCE = createToastStore();
	}

	return g.__LAW_EYE_INTERNAL_TOAST_STORE_INSTANCE;
})();

// ============================================
// 便捷 Hooks
// ============================================

/**
 * Toast 操作 Hook
 */
export function useToast() {
	const addToast = useToastStore((s) => s.addToast);
	const removeToast = useToastStore((s) => s.removeToast);

	return {
		toast: addToast,
		dismiss: removeToast,

		// 快捷方法
		success: (title: string, description?: string) =>
			addToast({ type: "success", title, description }),

		error: (title: string, description?: string) =>
			addToast({ type: "error", title, description }),

		warning: (title: string, description?: string) =>
			addToast({ type: "warning", title, description }),

		info: (title: string, description?: string) =>
			addToast({ type: "info", title, description }),
	};
}

// ============================================
// 类型颜色映射
// ============================================

export const toastTypeStyles: Record<
	ToastType,
	{ bg: string; border: string; icon: string; iconColor: string }
> = {
	success: {
		bg: "bg-success/5",
		border: "border-success/20",
		icon: "CheckCircle2",
		iconColor: "text-success",
	},
	error: {
		bg: "bg-error/5",
		border: "border-error/20",
		icon: "XCircle",
		iconColor: "text-error",
	},
	warning: {
		bg: "bg-warning/5",
		border: "border-warning/20",
		icon: "AlertTriangle",
		iconColor: "text-warning",
	},
	info: {
		bg: "bg-info/5",
		border: "border-info/20",
		icon: "Info",
		iconColor: "text-info",
	},
};
