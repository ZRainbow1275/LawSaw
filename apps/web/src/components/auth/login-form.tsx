"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { safeReturnTo } from "@/lib/utils";
import { useToastStore } from "@/stores/toast-store";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function LoginForm() {
	const router = useRouter();
	const { login } = useAuth();
	const [returnTo, setReturnTo] = useState<string | null>(null);
	const [error, setError] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	useEffect(() => {
		setReturnTo(
			safeReturnTo(new URLSearchParams(window.location.search).get("returnTo")),
		);
	}, []);

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setError("");

		const formData = new FormData(e.currentTarget);
		const email = formData.get("email") as string;
		const password = formData.get("password") as string;

		if (!email?.trim() || !password?.trim()) {
			setError("请输入邮箱和密码");
			return;
		}

		setIsSubmitting(true);

		try {
			const result = await login({ email, password });
			if (result.success) {
				const nextReturnTo =
					returnTo ||
					safeReturnTo(
						new URLSearchParams(window.location.search).get("returnTo"),
					);
				useToastStore.getState().addToast({
					type: "success",
					title: "登录成功",
					description: "欢迎回来",
				});
				router.replace(nextReturnTo || "/");
			} else {
				setError(result.error || "登录失败，请重试");
			}
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			{error && (
				<div className="rounded-lg bg-error-light p-3 text-sm text-error">
					{error}
				</div>
			)}

			<div className="space-y-2">
				<label htmlFor="email" className="text-sm font-medium text-neutral-700">
					邮箱
				</label>
				<Input
					id="email"
					name="email"
					type="email"
					placeholder="your@email.com"
					required
					autoComplete="email"
				/>
			</div>

			<div className="space-y-2">
				<label
					htmlFor="password"
					className="text-sm font-medium text-neutral-700"
				>
					密码
				</label>
				<Input
					id="password"
					name="password"
					type="password"
					placeholder="••••••••"
					required
					autoComplete="current-password"
				/>
			</div>

			<Button type="submit" className="w-full" disabled={isSubmitting}>
				{isSubmitting ? "登录中..." : "登录"}
			</Button>

			<p className="text-center text-sm text-neutral-500">
				还没有账号？{" "}
				<a
					href={
						returnTo
							? `/register?returnTo=${encodeURIComponent(returnTo)}`
							: "/register"
					}
					className="text-primary-600 hover:underline"
				>
					立即注册
				</a>
			</p>
		</form>
	);
}
