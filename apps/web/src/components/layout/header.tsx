"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useAuthStore } from "@/stores/auth-store";
import { Bell, LogOut, Search, Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function Header() {
	const router = useRouter();
	const { user } = useAuthStore();
	const { logout } = useAuth();
	const [showMenu, setShowMenu] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");

	const handleSearch = (e: React.FormEvent) => {
		e.preventDefault();
		if (searchQuery.trim()) {
			router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
		}
	};

	const handleLogout = async () => {
		await logout();
		router.push("/login");
	};

	const displayName =
		user?.display_name || user?.email?.split("@")[0] || "用户";
	const initials = displayName.charAt(0).toUpperCase();

	return (
		<header className="sticky top-0 z-20 flex h-16 items-center justify-between px-6 glass border-b border-neutral-100/50">
			{/* Search */}
			<form onSubmit={handleSearch} className="relative w-full max-w-md">
				<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
				<Input
					type="search"
					placeholder="搜索资讯、法规、关键词..."
					className="pl-10"
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
				/>
			</form>

			{/* Right Actions */}
			<div className="flex items-center gap-4">
				{/* Notifications */}
				<Button variant="ghost" size="icon" className="relative">
					<Bell className="h-5 w-5" />
					<span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary-500 text-[10px] font-bold text-white">
						3
					</span>
				</Button>

				{/* User Menu */}
				<div className="relative">
					<Button
						variant="ghost"
						className="gap-2"
						onClick={() => setShowMenu(!showMenu)}
					>
						<div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-600 text-white">
							{user?.avatar_url ? (
								<img
									src={user.avatar_url}
									alt={displayName}
									className="h-8 w-8 rounded-full object-cover"
								/>
							) : (
								<span className="text-sm font-medium">{initials}</span>
							)}
						</div>
						<span className="text-sm font-medium text-neutral-700">
							{displayName}
						</span>
					</Button>

					{showMenu && (
						<div className="absolute right-0 top-full mt-2 w-48 rounded-xl glass-card py-1.5 shadow-lg">
							<button
								type="button"
								className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50/80 transition-colors"
								onClick={() => {
									setShowMenu(false);
									router.push("/settings");
								}}
							>
								<Settings className="h-4 w-4" />
								设置
							</button>
							<button
								type="button"
								className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-error hover:bg-error/5 transition-colors"
								onClick={() => {
									setShowMenu(false);
									handleLogout();
								}}
							>
								<LogOut className="h-4 w-4" />
								退出登录
							</button>
						</div>
					)}
				</div>
			</div>
		</header>
	);
}
