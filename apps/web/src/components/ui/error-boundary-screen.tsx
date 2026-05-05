"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { AlertTriangle, Home, RefreshCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useId } from "react";

interface ErrorBoundaryScreenProps {
	error: Error & { digest?: string };
	reset: () => void;
}

export function ErrorBoundaryScreen({
	error,
	reset,
}: ErrorBoundaryScreenProps) {
	const locale = useLocale();
	const t = useT();
	const titleId = useId();
	const pageStyle = {
		backgroundColor:
			"color-mix(in srgb, var(--surface-muted-bg) 70%, var(--color-background) 30%)",
	} as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;
	const subtleTextStyle = {
		color: "color-mix(in srgb, var(--surface-muted-text) 78%, transparent)",
	} as const;
	const detailPanelStyle = {
		borderColor: "color-mix(in srgb, var(--color-border) 78%, transparent)",
		backgroundColor:
			"color-mix(in srgb, var(--surface-muted-bg) 70%, var(--color-background) 30%)",
	} as const;
	const detailHeadingStyle = { color: "var(--color-foreground)" } as const;

	useEffect(() => {
		console.error(error);
	}, [error]);

	const showDetails = process.env.NODE_ENV !== "production";

	return (
		<div
			className="flex min-h-screen items-center justify-center p-6"
			style={pageStyle}
		>
			<div className="w-full max-w-lg">
				<Card role="alert" aria-labelledby={titleId}>
					<CardHeader>
						<CardTitle id={titleId} className="flex items-center gap-2">
							<AlertTriangle
								aria-hidden="true"
								className="h-5 w-5 text-destructive"
							/>
							{t("Something went wrong")}
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<p className="text-sm" style={mutedTextStyle}>
							{t(
								"An error occurred while rendering the page. Please try again. If it keeps happening, contact an administrator.",
							)}
						</p>

						{showDetails ? (
							<div className="rounded-lg border p-3" style={detailPanelStyle}>
								<p className="text-xs font-medium" style={detailHeadingStyle}>
									{t("Error details")}
								</p>
								<pre
									className="mt-2 whitespace-pre-wrap break-words text-xs"
									style={mutedTextStyle}
								>
									{error.message}
								</pre>
								{error.digest ? (
									<p className="mt-2 text-xs" style={subtleTextStyle}>
										digest: {error.digest}
									</p>
								) : null}
							</div>
						) : error.digest ? (
							<p className="text-xs" style={subtleTextStyle}>
								{t("Error ID")}: {error.digest}
							</p>
						) : null}

						<div className="flex flex-col gap-2 sm:flex-row">
							<Button onClick={() => reset()}>
								<RefreshCcw aria-hidden="true" className="h-4 w-4" />
								{t("Retry")}
							</Button>
							<Link
								href={withLocalePath(locale, "/")}
								className={buttonVariants({
									variant: "outline",
									className: "w-full sm:w-auto",
								})}
							>
								<Home aria-hidden="true" className="h-4 w-4" />
								{t("Back to home")}
							</Link>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
