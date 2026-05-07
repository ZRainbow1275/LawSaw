"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { safeReturnTo } from "@/lib/utils";
import { useToastStore } from "@/stores/toast-store";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(value: string): string | null {
	const trimmed = value.trim();
	if (!trimmed) return "Please enter an email";
	if (trimmed.length > 254) return "Email is too long";
	if (!EMAIL_RE.test(trimmed)) return "Invalid email format";
	return null;
}

type PasswordCheck = { label: string; ok: boolean };

function passwordChecks(password: string): PasswordCheck[] {
	const value = password;
	return [
		{ label: "At least 12 characters", ok: value.length >= 12 },
		{ label: "No more than 128 characters", ok: value.length <= 128 },
		{ label: "Includes uppercase letter", ok: /[A-Z]/.test(value) },
		{ label: "Includes lowercase letter", ok: /[a-z]/.test(value) },
		{ label: "Includes number", ok: /\d/.test(value) },
		{ label: "Includes symbol", ok: /[^A-Za-z0-9]/.test(value) },
		{ label: "No whitespace characters", ok: !/\s/.test(value) },
	];
}

function passwordStrengthLabel(password: string): "Weak" | "Medium" | "Strong" {
	const checks = passwordChecks(password);
	const score = checks.filter((c) => c.ok).length;
	if (score >= 7) return "Strong";
	if (score >= 5) return "Medium";
	return "Weak";
}

function validatePasswordPolicy(password: string): string | null {
	if (!password) return "Please enter a password";
	if (password.length < 12) return "Password must be at least 12 characters";
	if (password.length > 128)
		return "Password must be no more than 128 characters";
	if (/\s/.test(password)) return "Password must not contain whitespace";
	const hasLower = /[a-z]/.test(password);
	const hasUpper = /[A-Z]/.test(password);
	const hasDigit = /\d/.test(password);
	const hasSymbol = /[^A-Za-z0-9]/.test(password);
	if (!(hasLower && hasUpper && hasDigit && hasSymbol)) {
		return "Password must include uppercase, lowercase, number, and symbol";
	}
	return null;
}

export function RegisterForm() {
	const router = useRouter();
	const locale = useLocale();
	const t = useT();
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
			setError(emailError || passwordError || "Please check your input");
			return;
		}

		if (password !== confirmPassword) {
			setError("Passwords do not match");
			return;
		}

		const normalizedTenantSlug = tenantSlug.trim().toLowerCase();
		if (
			normalizedTenantSlug &&
			!/^[a-z][a-z0-9-]{2,31}$/.test(normalizedTenantSlug)
		) {
			setError(
				"Invalid tenant slug: start with a lowercase letter, length 3-32, only a-z0-9- allowed",
			);
			return;
		}

		const normalizedTenantName = tenantName.trim();
		if (normalizedTenantName.length > 100) {
			setError("Tenant name is too long (max 100 characters)");
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
					title: t("Signed up"),
					description: t("Signed in automatically"),
				});
				router.replace(withLocalePath(locale, nextReturnTo || "/"));
			} else {
				setError(result.error || "Sign up failed. Please try again.");
			}
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			{error && (
				<div className="rounded-lg bg-error-light p-3 text-sm text-error">
					{t(error)}
				</div>
			)}

			<div className="space-y-2">
				<label
					htmlFor="displayName"
					className="text-sm font-medium text-neutral-700 dark:text-neutral-200"
				>
					{t("Display name")}{" "}
					<span className="text-neutral-400 dark:text-neutral-500">({t("Optional")})</span>
				</label>
				<Input
					id="displayName"
					type="text"
					value={displayName}
					onChange={(e) => setDisplayName(e.target.value)}
					placeholder={t("Your name")}
					autoComplete="name"
				/>
			</div>

			<div className="space-y-2">
				<label
					htmlFor="tenantSlug"
					className="text-sm font-medium text-neutral-700 dark:text-neutral-200"
				>
					{t("Tenant slug")}{" "}
					<span className="text-neutral-400 dark:text-neutral-500">({t("Optional")})</span>
				</label>
				<Input
					id="tenantSlug"
					type="text"
					value={tenantSlug}
					onChange={(e) => setTenantSlug(e.target.value)}
					placeholder="default / acme / beta"
					autoComplete="organization"
				/>
				<p className="text-xs text-neutral-500 dark:text-neutral-400 dark:text-neutral-500">
					{t("Leave blank to use")} <span className="font-mono">default</span>
					{t(". Rules: start with a lowercase letter, length 3-32, allowed")}{" "}
					<span className="font-mono">a-z0-9-</span>
				</p>
			</div>

			<div className="space-y-2">
				<label
					htmlFor="tenantName"
					className="text-sm font-medium text-neutral-700 dark:text-neutral-200"
				>
					{t("Tenant name")}{" "}
					<span className="text-neutral-400 dark:text-neutral-500">({t("Optional")})</span>
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
				<p className="text-xs text-neutral-500 dark:text-neutral-400 dark:text-neutral-500">
					{t(
						"Only used when you set a tenant slug; if empty, the slug will be used as the name.",
					)}
				</p>
			</div>

			<div className="space-y-2">
				<label htmlFor="email" className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
					{t("Email")}
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
					aria-describedby={
						touched.email && validateEmail(email) ? "email-error" : undefined
					}
				/>
				{touched.email && validateEmail(email) && (
					<p id="email-error" className="text-xs text-error">
						{t(validateEmail(email) ?? "")}
					</p>
				)}
			</div>

			<div className="space-y-2">
				<label
					htmlFor="password"
					className="text-sm font-medium text-neutral-700 dark:text-neutral-200"
				>
					{t("Password")}
				</label>
				<Input
					id="password"
					type="password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					onBlur={() => setTouched((v) => ({ ...v, password: true }))}
					placeholder={t("At least 12 characters")}
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
					<p className="text-xs text-neutral-500 dark:text-neutral-400 dark:text-neutral-500">
						{t("Strength: ")}
						{password ? t(passwordStrengthLabel(password)) : "—"}
					</p>
					<ul className="space-y-0.5 text-xs">
						{passwordChecks(password).map((c) => (
							<li
								key={c.label}
								className={c.ok ? "text-emerald-700 dark:text-emerald-300" : "text-neutral-500 dark:text-neutral-400"}
							>
								{t(c.label)}
							</li>
						))}
					</ul>
				</div>
				{touched.password && validatePasswordPolicy(password) && (
					<p id="password-error" className="text-xs text-error">
						{t(validatePasswordPolicy(password) ?? "")}
					</p>
				)}
			</div>

			<div className="space-y-2">
				<label
					htmlFor="confirmPassword"
					className="text-sm font-medium text-neutral-700 dark:text-neutral-200"
				>
					{t("Confirm password")}
				</label>
				<Input
					id="confirmPassword"
					type="password"
					value={confirmPassword}
					onChange={(e) => setConfirmPassword(e.target.value)}
					onBlur={() => setTouched((v) => ({ ...v, confirmPassword: true }))}
					placeholder={t("Re-enter password")}
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
							{t("Passwords do not match")}
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
				{isSubmitting ? t("Signing up...") : t("Create account")}
			</Button>

			<p className="text-center text-sm text-neutral-500 dark:text-neutral-400">
				{t("Already have an account?")}{" "}
				<a
					href={withLocalePath(
						locale,
						returnTo
							? `/login?returnTo=${encodeURIComponent(returnTo)}`
							: "/login",
					)}
					className="text-primary-600 hover:underline"
				>
					{t("Sign in now")}
				</a>
			</p>
		</form>
	);
}
