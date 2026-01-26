import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Compass, Home, Search } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
	return (
		<div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
			<div className="w-full max-w-lg">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Compass className="h-5 w-5 text-primary-500" />
							页面不存在
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<p className="text-sm text-neutral-600">
							你访问的页面不存在，可能已被移动或删除。
						</p>
						<div className="flex flex-col gap-2 sm:flex-row">
							<Link
								href="/"
								className={buttonVariants({ className: "w-full sm:w-auto" })}
							>
								<Home className="h-4 w-4" />
								返回首页
							</Link>
							<Link
								href="/search"
								className={buttonVariants({
									variant: "outline",
									className: "w-full sm:w-auto",
								})}
							>
								<Search className="h-4 w-4" />
								去搜索
							</Link>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

