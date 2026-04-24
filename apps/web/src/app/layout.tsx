import { OnboardingTour } from "@/components/onboarding";
import { AuthProvider } from "@/components/providers/auth-provider";
import { AppearanceProvider } from "@/components/providers/appearance-provider";
import { AppShortcutsProvider } from "@/components/providers/app-shortcuts-provider";
import { KeyboardViewportAdapter } from "@/components/providers/keyboard-viewport-adapter";
import { NetworkStatusIndicator } from "@/components/providers/network-status-indicator";
import { QueryProvider } from "@/components/providers/query-provider";
import { RouteTransitionProvider } from "@/components/providers/route-transition-provider";
import { ToastProvider } from "@/components/ui/toast";
import {
	DEFAULT_LOCALE,
	LOCALE_COOKIE_NAME,
	bcp47,
	isLocale,
	t,
} from "@/lib/i18n";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import "./globals.css";

async function getRequestLocale() {
	const headerStore = await headers();
	const headerLocale = headerStore.get("x-law-eye-locale");
	const cookieStore = await cookies();
	const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;

	return isLocale(headerLocale)
		? headerLocale
		: isLocale(cookieLocale)
			? cookieLocale
			: DEFAULT_LOCALE;
}

export async function generateMetadata(): Promise<Metadata> {
	const locale = await getRequestLocale();

	return {
		title: t(locale, "Law Eye"),
		description: t(
			locale,
			"A legal intelligence platform that aggregates multi-source legal updates and builds an authoritative knowledge base.",
		),
		keywords: [
			"law",
			"regulation",
			"news",
			"compliance",
			"supervision",
			"legal intelligence",
			"Law Eye",
		],
		manifest: "/manifest.webmanifest",
	};
}

export default async function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const locale = await getRequestLocale();

	return (
		<html lang={bcp47(locale)} suppressHydrationWarning>
			<body className="min-h-screen bg-background antialiased">
				<a href="#main-content" className="skip-link">
					{t(locale, "Skip to main content")}
				</a>
				<QueryProvider>
					<AuthProvider>
						<AppearanceProvider>
							<ToastProvider>
								<AppShortcutsProvider>
									<KeyboardViewportAdapter />
									<NetworkStatusIndicator />
									<RouteTransitionProvider>{children}</RouteTransitionProvider>
									<OnboardingTour />
								</AppShortcutsProvider>
							</ToastProvider>
						</AppearanceProvider>
					</AuthProvider>
				</QueryProvider>
			</body>
		</html>
	);
}
