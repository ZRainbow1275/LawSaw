import { AuthProvider } from "@/components/providers/auth-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { ToastProvider } from "@/components/ui/toast";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "法眼 | Law Eye",
	description:
		'数字时代法律赛道的"参考消息" - 聚合多渠道法律资讯，构建权威信息仓库',
	keywords: ["法律", "法规", "资讯", "合规", "监管", "法眼", "Law Eye"],
	manifest: "/manifest.webmanifest",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="zh-CN" suppressHydrationWarning>
			<body className="min-h-screen bg-background antialiased">
				<QueryProvider>
					<AuthProvider>
						<ToastProvider>{children}</ToastProvider>
					</AuthProvider>
				</QueryProvider>
			</body>
		</html>
	);
}
