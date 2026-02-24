"use client";

import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";

interface RouteTransitionProviderProps {
	children: ReactNode;
}

export function RouteTransitionProvider({
	children,
}: RouteTransitionProviderProps) {
	const pathname = usePathname();

	useEffect(() => {
		const recoveryKey = `law-eye-route-recovery:${pathname}`;
		const timer = window.setTimeout(() => {
			const main = document.querySelector("#main-content");
			const hasMainChildren =
				main instanceof HTMLElement && main.children.length > 0;
			const hasVisibleText = (document.body?.innerText || "").trim().length > 24;
			const hasSpinner = !!document.querySelector(".animate-spin");
			const shouldRecover =
				!hasMainChildren && !hasVisibleText && !hasSpinner;

			if (!shouldRecover) return;

			// Recover only once per-path per-session to avoid reload loops.
			if (sessionStorage.getItem(recoveryKey) === "1") return;
			sessionStorage.setItem(recoveryKey, "1");
			window.location.replace(window.location.href);
		}, 12_000);

		return () => {
			window.clearTimeout(timer);
		};
	}, [pathname]);

	return (
		<div id="main-content" tabIndex={-1} className="min-h-screen">
			{children}
		</div>
	);
}
