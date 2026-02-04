"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { safeReturnTo } from "@/lib/utils";
import { useToastStore } from "@/stores/toast-store";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(value: string): string | null {
	const trimmed = value.trim();
	if (!trimmed) return "请输入邮箱";
	if (trimmed.length > 254) return "邮箱过长";
	if (!EMAIL_RE.test(trimmed)) return "邮箱格式不正确";
	return null;
}

function validatePassword(value: string): string | null {
	if (!value.trim()) return "请输入密码";
	if (value.length > 1024) return "密码过长";
	return null;
}

export function LoginForm() {
	const router = useRouter();
	const { login } = useAuth();
	const [returnTo, setReturnTo] = useState<string | null>(null);
	const [error, setError] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [touched, setTouched] = useState({ email: false, password: false });
	const [isSubmitting, setIsSubmitting] = useState(false);

	useEffect(() => {
		setReturnTo(
			safeReturnTo(new URLSearchParams(window.location.search).get("returnTo")),
		);
	}, []);

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setError("");

		setTouched({ email: true, password: true });

		const emailError = validateEmail(email);
		const passwordError = validatePassword(password);
		if (emailError || passwordError) {
			setError(emailError || passwordError || "请检查输入内容");
			return;
		}

		setIsSubmitting(true);

		try {
			const result = await login({ email: email.trim(), password });
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
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					onBlur={() => setTouched((v) => ({ ...v, email: true }))}
					placeholder="your@email.com"
					required
					autoComplete="email"
					aria-invalid={touched.email && !!validateEmail(email)}
					aria-describedby={touched.email && validateEmail(email) ? "email-error" : undefined}
				/>
				{touched.email && validateEmail(email) && (
					<p id="email-error" className="text-xs text-error">
						{validateEmail(email)}
					</p>
				)}
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
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					onBlur={() => setTouched((v) => ({ ...v, password: true }))}
					placeholder="••••••••"
					required
					autoComplete="current-password"
					aria-invalid={touched.password && !!validatePassword(password)}
					aria-describedby={
						touched.password && validatePassword(password)
							? "password-error"
							: undefined
					}
				/>
				{touched.password && validatePassword(password) && (
					<p id="password-error" className="text-xs text-error">
						{validatePassword(password)}
					</p>
				)}
			</div>

			<Button
				type="submit"
				className="w-full"
				disabled={isSubmitting || !!validateEmail(email) || !!validatePassword(password)}
			>
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
