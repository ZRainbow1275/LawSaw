"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { safeReturnTo } from "@/lib/utils";
import { useToastStore } from "@/stores/toast-store";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function RegisterForm() {
	const router = useRouter();
	const { register } = useAuth();
	const [returnTo, setReturnTo] = useState<string | null>(null);
	const [tenantSlug, setTenantSlug] = useState("");
	const [tenantName, setTenantName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [displayName, setDisplayName] = useState("");
	const [error, setError] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	useEffect(() => {
		setReturnTo(
			safeReturnTo(new URLSearchParams(window.location.search).get("returnTo")),
		);
	}, []);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");

		if (password.length < 8) {
			setError("密码至少需要8个字符");
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
				email,
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
					type="password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					placeholder="至少8个字符"
					required
					autoComplete="new-password"
				/>
			</div>

			<Button type="submit" className="w-full" disabled={isSubmitting}>
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
