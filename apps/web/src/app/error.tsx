"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
							<AlertTriangle className="h-5 w-5 text-destructive" />
							出现错误
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<p className="text-sm text-neutral-600">
							页面渲染时发生错误，请重试；若持续发生，请联系管理员。
						</p>

						{showDetails ? (
							<div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
								<p className="text-xs font-medium text-neutral-700">错误详情</p>
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
							<p className="text-xs text-neutral-500">错误标识：{error.digest}</p>
						) : null}

						<div className="flex flex-col gap-2 sm:flex-row">
							<Button onClick={() => reset()}>
								<RefreshCcw className="h-4 w-4" />
								重试
							</Button>
							<Link
								href="/"
								className={buttonVariants({
									variant: "outline",
									className: "w-full sm:w-auto",
								})}
							>
								<Home className="h-4 w-4" />
								返回首页
							</Link>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

