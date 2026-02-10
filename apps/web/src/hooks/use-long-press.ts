"use client";

import { useCallback, useEffect, useRef } from "react";

type UseLongPressOptions = {
	onLongPress: () => void;
	delayMs?: number;
	enabled?: boolean;
};

function hasNestedInteractiveTarget(
	target: EventTarget | null,
	currentTarget: EventTarget | null,
): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (!(currentTarget instanceof HTMLElement)) return false;
	if (target === currentTarget) return false;

	return Boolean(
		target.closest(
			"button, a, input, textarea, select, [role='button'], [data-long-press-ignore='true']",
		),
	);
}

export function useLongPress({
	onLongPress,
	delayMs = 550,
	enabled = true,
}: UseLongPressOptions) {
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const triggeredRef = useRef(false);

	const clear = useCallback(() => {
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
			timeoutRef.current = null;
		}
	}, []);

	const cancel = useCallback(() => {
		clear();
	}, [clear]);

	const onPointerDown = useCallback(
		(event: React.PointerEvent<HTMLElement>) => {
			if (!enabled) return;
			if (event.pointerType === "mouse" && event.button !== 0) return;
			if (hasNestedInteractiveTarget(event.target, event.currentTarget)) return;

			triggeredRef.current = false;
			clear();
			timeoutRef.current = setTimeout(() => {
				triggeredRef.current = true;
				onLongPress();
			}, delayMs);
		},
		[clear, delayMs, enabled, onLongPress],
	);

	const onClickCapture = useCallback(
		(event: React.MouseEvent<HTMLElement>) => {
			if (!enabled) return;
			if (!triggeredRef.current) return;

			triggeredRef.current = false;
			event.preventDefault();
			event.stopPropagation();
		},
		[enabled],
	);

	const onContextMenu = useCallback((event: React.MouseEvent<HTMLElement>) => {
		if (!enabled) return;
		event.preventDefault();
	}, [enabled]);

	useEffect(() => {
		return () => {
			clear();
		};
	}, [clear]);

	return {
		onPointerDown,
		onPointerUp: cancel,
		onPointerLeave: cancel,
		onPointerCancel: cancel,
		onClickCapture,
		onContextMenu,
	};
}
