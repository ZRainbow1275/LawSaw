"use client";

import { useEffect } from "react";

const KEYBOARD_OPEN_THRESHOLD_PX = 120;

function updateKeyboardInset() {
	if (typeof window === "undefined") return;
	const root = document.documentElement;
	const viewport = window.visualViewport;
	if (!viewport) {
		root.style.setProperty("--keyboard-inset", "0px");
		root.dataset.keyboardOpen = "false";
		return;
	}

	const keyboardInset = Math.max(
		0,
		window.innerHeight - viewport.height - viewport.offsetTop,
	);
	root.style.setProperty("--keyboard-inset", `${Math.round(keyboardInset)}px`);
	root.dataset.keyboardOpen =
		keyboardInset >= KEYBOARD_OPEN_THRESHOLD_PX ? "true" : "false";
}

export function KeyboardViewportAdapter() {
	useEffect(() => {
		if (typeof window === "undefined") return;
		const viewport = window.visualViewport;
		if (!viewport) {
			updateKeyboardInset();
			return;
		}

		updateKeyboardInset();
		viewport.addEventListener("resize", updateKeyboardInset);
		viewport.addEventListener("scroll", updateKeyboardInset);
		window.addEventListener("orientationchange", updateKeyboardInset);

		return () => {
			viewport.removeEventListener("resize", updateKeyboardInset);
			viewport.removeEventListener("scroll", updateKeyboardInset);
			window.removeEventListener("orientationchange", updateKeyboardInset);

			const root = document.documentElement;
			root.style.removeProperty("--keyboard-inset");
			delete root.dataset.keyboardOpen;
		};
	}, []);

	return null;
}
