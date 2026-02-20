"use client";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { Compass, Home, Search } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
	const locale = useLocale();
	const t = useT();

	return (
		<div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
			<div className="w-full max-w-lg">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Compass
								aria-hidden="true"
								className="h-5 w-5 text-primary-500"
							/>
							{t("Page not found")}
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<p className="text-sm text-neutral-600">
							{t(
								"The page you are looking for doesn't exist. It may have been moved or deleted.",
							)}
						</p>
						<div className="flex flex-col gap-2 sm:flex-row">
							<Link
								href={withLocalePath(locale, "/")}
								className={buttonVariants({ className: "w-full sm:w-auto" })}
							>
								<Home aria-hidden="true" className="h-4 w-4" />
								{t("Back to home")}
							</Link>
							<Link
								href={withLocalePath(locale, "/search")}
								className={buttonVariants({
									variant: "outline",
									className: "w-full sm:w-auto",
								})}
							>
								<Search aria-hidden="true" className="h-4 w-4" />
								{t("Go to search")}
							</Link>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
