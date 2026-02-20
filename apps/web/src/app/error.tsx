"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { AlertTriangle, Home, RefreshCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	const locale = useLocale();
	const t = useT();

	useEffect(() => {
		console.error(error);
	}, [error]);

	const showDetails = process.env.NODE_ENV !== "production";

	return (
		<div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
			<div className="w-full max-w-lg">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<AlertTriangle
								aria-hidden="true"
								className="h-5 w-5 text-destructive"
							/>
							{t("Something went wrong")}
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<p className="text-sm text-neutral-600">
							{t(
								"An error occurred while rendering the page. Please try again. If it keeps happening, contact an administrator.",
							)}
						</p>

						{showDetails ? (
							<div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
								<p className="text-xs font-medium text-neutral-700">
									{t("Error details")}
								</p>
								<pre className="mt-2 whitespace-pre-wrap break-words text-xs text-neutral-600">
									{error.message}
								</pre>
								{error.digest ? (
									<p className="mt-2 text-xs text-neutral-500">
										digest: {error.digest}
									</p>
								) : null}
							</div>
						) : error.digest ? (
							<p className="text-xs text-neutral-500">
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
