"use client";

import { useT } from "@/lib/i18n-client";
import { Wifi, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const ONLINE_TOAST_MS = 2500;

export function NetworkStatusIndicator() {
	const t = useT();
	const router = useRouter();
	const [isOnline, setIsOnline] = useState(true);
	const [showOnlineHint, setShowOnlineHint] = useState(false);
	const [isRetrying, setIsRetrying] = useState(false);

	useEffect(() => {
		const current = typeof navigator === "undefined" ? true : navigator.onLine;
		setIsOnline(current);

		let hideTimer: ReturnType<typeof setTimeout> | null = null;

		const handleOnline = () => {
			setIsOnline(true);
			setShowOnlineHint(true);
			if (hideTimer) {
				clearTimeout(hideTimer);
			}
			hideTimer = setTimeout(() => {
				setShowOnlineHint(false);
			}, ONLINE_TOAST_MS);
		};

		const handleOffline = () => {
			setIsOnline(false);
			setShowOnlineHint(false);
			if (hideTimer) {
				clearTimeout(hideTimer);
				hideTimer = null;
			}
		};

		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);

		return () => {
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
			if (hideTimer) {
				clearTimeout(hideTimer);
			}
		};
	}, []);

	if (isOnline && !showOnlineHint) {
		return null;
	}

	const offline = !isOnline;
	const canRetry = !offline && showOnlineHint;

	const handleRetry = () => {
		setIsRetrying(true);
		router.refresh();
		setShowOnlineHint(false);
		setTimeout(() => {
			setIsRetrying(false);
		}, 600);
	};

	return (
		<output
			className={
				offline
					? "fixed bottom-4 right-4 z-[85] inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-700 shadow-md"
					: "fixed bottom-4 right-4 z-[85] inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-sm text-green-700 shadow-md"
			}
			aria-live="polite"
		>
			{offline ? (
				<WifiOff className="h-4 w-4" aria-hidden="true" />
			) : (
				<Wifi className="h-4 w-4" aria-hidden="true" />
			)}
			<span>{offline ? t("Network disconnected") : t("Network restored")}</span>
			{canRetry && (
				<button
					type="button"
					onClick={handleRetry}
					disabled={isRetrying}
					className="rounded-full border border-green-300 bg-white/90 px-2 py-0.5 text-xs font-medium text-green-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
				>
					{isRetrying ? t("Refreshing...") : t("Refresh")}
				</button>
			)}
		</output>
	);
}
