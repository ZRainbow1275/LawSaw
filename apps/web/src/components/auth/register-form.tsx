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

type PasswordCheck = { label: string; ok: boolean };

function passwordChecks(password: string): PasswordCheck[] {
	const value = password;
	return [
		{ label: "至少 12 个字符", ok: value.length >= 12 },
		{ label: "不超过 128 个字符", ok: value.length <= 128 },
		{ label: "包含大写字母", ok: /[A-Z]/.test(value) },
		{ label: "包含小写字母", ok: /[a-z]/.test(value) },
		{ label: "包含数字", ok: /\d/.test(value) },
		{ label: "包含符号", ok: /[^A-Za-z0-9]/.test(value) },
		{ label: "不包含空白字符", ok: !/\s/.test(value) },
	];
}

function passwordStrengthLabel(password: string): "弱" | "中" | "强" {
	const checks = passwordChecks(password);
	const score = checks.filter((c) => c.ok).length;
	if (score >= 7) return "强";
	if (score >= 5) return "中";
	return "弱";
}

function validatePasswordPolicy(password: string): string | null {
	if (!password) return "请输入密码";
	if (password.length < 12) return "密码至少需要 12 个字符";
	if (password.length > 128) return "密码不能超过 128 个字符";
	if (/\s/.test(password)) return "密码不能包含空白字符";
	const hasLower = /[a-z]/.test(password);
	const hasUpper = /[A-Z]/.test(password);
	const hasDigit = /\d/.test(password);
	const hasSymbol = /[^A-Za-z0-9]/.test(password);
	if (!(hasLower && hasUpper && hasDigit && hasSymbol)) {
		return "密码需包含大写/小写字母、数字和符号";
	}
	return null;
}

export function RegisterForm() {
	const router = useRouter();
	const { register } = useAuth();
	const [returnTo, setReturnTo] = useState<string | null>(null);
	const [tenantSlug, setTenantSlug] = useState("");
	const [tenantName, setTenantName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [displayName, setDisplayName] = useState("");
	const [error, setError] = useState("");
	const [touched, setTouched] = useState({
		email: false,
		password: false,
		confirmPassword: false,
	});
	const [isSubmitting, setIsSubmitting] = useState(false);

	useEffect(() => {
		setReturnTo(
			safeReturnTo(new URLSearchParams(window.location.search).get("returnTo")),
		);
	}, []);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");

		setTouched({ email: true, password: true, confirmPassword: true });

		const emailError = validateEmail(email);
		const passwordError = validatePasswordPolicy(password);
		if (emailError || passwordError) {
			setError(emailError || passwordError || "请检查输入内容");
			return;
		}

		if (password !== confirmPassword) {
			setError("两次输入的密码不一致");
			return;
		}

		const normalizedTenantSlug = tenantSlug.trim().toLowerCase();
		if (
			normalizedTenantSlug &&
			!/^[a-z][a-z0-9-]{2,31}$/.test(normalizedTenantSlug)
		) {
			setError("租户标识格式无效：需小写字母开头，长度 3-32，仅允许 a-z0-9-");
			return;
		}

		const normalizedTenantName = tenantName.trim();
		if (normalizedTenantName.length > 100) {
			setError("租户名称过长：最多 100 个字符");
			return;
		}

		setIsSubmitting(true);
		try {
			const result = await register({
				email: email.trim(),
				password,
				display_name: displayName || undefined,
				tenant_slug: normalizedTenantSlug || undefined,
				tenant_name:
					normalizedTenantSlug && normalizedTenantName
						? normalizedTenantName
						: undefined,
			});

			if (result.success) {
				const nextReturnTo =
					returnTo ||
					safeReturnTo(
						new URLSearchParams(window.location.search).get("returnTo"),
					);
				useToastStore.getState().addToast({
					type: "success",
					title: "注册成功",
					description: "已自动登录",
				});
				router.replace(nextReturnTo || "/");
			} else {
				setError(result.error || "注册失败，请重试");
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
				<label
					htmlFor="displayName"
					className="text-sm font-medium text-neutral-700"
				>
					显示名称 <span className="text-neutral-400">(可选)</span>
				</label>
				<Input
					id="displayName"
					type="text"
					value={displayName}
					onChange={(e) => setDisplayName(e.target.value)}
					placeholder="您的名称"
					autoComplete="name"
				/>
			</div>

			<div className="space-y-2">
				<label
					htmlFor="tenantSlug"
					className="text-sm font-medium text-neutral-700"
				>
					租户标识 <span className="text-neutral-400">(可选)</span>
				</label>
				<Input
					id="tenantSlug"
					type="text"
					value={tenantSlug}
					onChange={(e) => setTenantSlug(e.target.value)}
					placeholder="default / acme / beta"
					autoComplete="organization"
				/>
				<p className="text-xs text-neutral-500">
					不填则默认使用 <span className="font-mono">default</span>
					。规则：小写字母开头， 长度 3-32，仅允许{" "}
					<span className="font-mono">a-z0-9-</span>
				</p>
			</div>

			<div className="space-y-2">
				<label
					htmlFor="tenantName"
					className="text-sm font-medium text-neutral-700"
				>
					租户名称 <span className="text-neutral-400">(可选)</span>
				</label>
				<Input
					id="tenantName"
					type="text"
					value={tenantName}
					onChange={(e) => setTenantName(e.target.value)}
					placeholder="Acme Corp"
					autoComplete="organization"
					disabled={!tenantSlug.trim()}
				/>
				<p className="text-xs text-neutral-500">
					仅在你指定租户标识时生效；不填则默认使用租户标识作为名称。
				</p>
			</div>

			<div className="space-y-2">
				<label htmlFor="email" className="text-sm font-medium text-neutral-700">
					邮箱
				</label>
				<Input
					id="email"
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
					type="password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					onBlur={() => setTouched((v) => ({ ...v, password: true }))}
					placeholder="至少12个字符"
					required
					autoComplete="new-password"
					aria-invalid={touched.password && !!validatePasswordPolicy(password)}
					aria-describedby={
						touched.password && validatePasswordPolicy(password)
							? "password-error"
							: undefined
					}
				/>
				<div className="space-y-1">
					<p className="text-xs text-neutral-500">
						强度：{password ? passwordStrengthLabel(password) : "—"}
					</p>
					<ul className="space-y-0.5 text-xs">
						{passwordChecks(password).map((c) => (
							<li
								key={c.label}
								className={c.ok ? "text-emerald-700" : "text-neutral-500"}
							>
								{c.label}
							</li>
						))}
					</ul>
				</div>
				{touched.password && validatePasswordPolicy(password) && (
					<p id="password-error" className="text-xs text-error">
						{validatePasswordPolicy(password)}
					</p>
				)}
			</div>

			<div className="space-y-2">
				<label
					htmlFor="confirmPassword"
					className="text-sm font-medium text-neutral-700"
				>
					确认密码
				</label>
				<Input
					id="confirmPassword"
					type="password"
					value={confirmPassword}
					onChange={(e) => setConfirmPassword(e.target.value)}
					onBlur={() => setTouched((v) => ({ ...v, confirmPassword: true }))}
					placeholder="再次输入密码"
					required
					autoComplete="new-password"
					aria-invalid={
						touched.confirmPassword &&
						!!confirmPassword &&
						password !== confirmPassword
					}
					aria-describedby={
						touched.confirmPassword &&
						!!confirmPassword &&
						password !== confirmPassword
							? "confirm-password-error"
							: undefined
					}
				/>
				{touched.confirmPassword &&
					!!confirmPassword &&
					password !== confirmPassword && (
						<p id="confirm-password-error" className="text-xs text-error">
							两次输入的密码不一致
						</p>
					)}
			</div>

			<Button
				type="submit"
				className="w-full"
				disabled={
					isSubmitting ||
					!!validateEmail(email) ||
					!!validatePasswordPolicy(password) ||
					!confirmPassword ||
					password !== confirmPassword
				}
			>
				{isSubmitting ? "注册中..." : "创建账户"}
			</Button>

			<p className="text-center text-sm text-neutral-500">
				已有账号？{" "}
				<a
					href={returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : "/login"}
					className="text-primary-600 hover:underline"
				>
					立即登录
				</a>
			</p>
		</form>
	);
}
