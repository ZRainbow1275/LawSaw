"use client";

import { ErrorBoundaryScreen } from "@/components/ui/error-boundary-screen";
import { bcp47 } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n-client";
import "./globals.css";

export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	const locale = useLocale();

	return (
		<html lang={bcp47(locale)} suppressHydrationWarning>
			<body className="min-h-screen bg-background antialiased">
				<ErrorBoundaryScreen error={error} reset={reset} />
			</body>
		</html>
	);
}
