"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { safeReturnTo } from "@/lib/utils";
import { useToastStore } from "@/stores/toast-store";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(value: string): string | null {
	const trimmed = value.trim();
	if (!trimmed) return "Please enter an email";
	if (trimmed.length > 254) return "Email is too long";
	if (!EMAIL_RE.test(trimmed)) return "Invalid email format";
	return null;
}

function validatePassword(value: string): string | null {
	if (!value.trim()) return "Please enter a password";
	if (value.length > 1024) return "Password is too long";
	return null;
}

interface MfaState {
	email: string;
	challenge: string;
}

export function LoginForm() {
	const router = useRouter();
	const locale = useLocale();
	const t = useT();
	const { login, verifyMfa, refreshSession } = useAuth();
	const [returnTo, setReturnTo] = useState<string | null>(null);
	const [error, setError] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [touched, setTouched] = useState({ email: false, password: false });
	const [isSubmitting, setIsSubmitting] = useState(false);

	const [mfaState, setMfaState] = useState<MfaState | null>(null);
	const [mfaCode, setMfaCode] = useState("");
	const mfaInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		setReturnTo(
			safeReturnTo(new URLSearchParams(window.location.search).get("returnTo")),
		);
	}, []);

	useEffect(() => {
		if (mfaState) {
			mfaInputRef.current?.focus();
		}
	}, [mfaState]);

	const navigateAfterLogin = useCallback(async () => {
		const nextReturnTo =
			returnTo ||
			safeReturnTo(new URLSearchParams(window.location.search).get("returnTo"));
		// Force one session recheck before navigation to reduce first-page bootstrap races.
		await refreshSession();
		useToastStore.getState().addToast({
			type: "success",
			title: t("Signed in"),
			description: t("Welcome back"),
		});
		router.replace(withLocalePath(locale, nextReturnTo || "/"));
		router.refresh();
	}, [returnTo, t, router, locale, refreshSession]);

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setError("");

		setTouched({ email: true, password: true });

		const emailError = validateEmail(email);
		const passwordError = validatePassword(password);
		if (emailError || passwordError) {
			setError(emailError || passwordError || "Please check your input");
			return;
		}

		setIsSubmitting(true);

		try {
			const result = await login({ email: email.trim(), password });
			if (result.success) {
				await navigateAfterLogin();
			} else if ("mfaRequired" in result && result.mfaRequired) {
				setMfaState({
					email: result.email,
					challenge: result.mfaChallenge,
				});
				setMfaCode("");
				setError("");
			} else {
				setError(result.error || "Sign in failed. Please try again.");
			}
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleMfaSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (!mfaState) return;

		const trimmedCode = mfaCode.trim();
		if (trimmedCode.length !== 6 || !/^\d{6}$/.test(trimmedCode)) {
			setError("Enter the 6-digit verification code");
			return;
		}

		setError("");
		setIsSubmitting(true);

		try {
			const result = await verifyMfa({
				email: mfaState.email,
				challenge: mfaState.challenge,
				code: trimmedCode,
			});
			if (result.success) {
				await navigateAfterLogin();
			} else {
				setError(result.error || "MFA verification failed.");
			}
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleBackToLogin = () => {
		setMfaState(null);
		setMfaCode("");
		setError("");
		setPassword("");
	};

	if (mfaState) {
		return (
			<form onSubmit={handleMfaSubmit} className="space-y-4">
				{error && (
					<div className="rounded-lg bg-error-light p-3 text-sm text-error">
						{t(error)}
					</div>
				)}

				<p className="text-center text-sm text-neutral-600">
					{t("Enter the 6-digit code from your authenticator app")}
				</p>

				<div className="space-y-2">
					<label
						htmlFor="mfa-code"
						className="text-sm font-medium text-neutral-700"
					>
						{t("Verification code")}
					</label>
					<Input
						ref={mfaInputRef}
						id="mfa-code"
						name="mfa-code"
						type="text"
						inputMode="numeric"
						pattern="\d{6}"
						maxLength={6}
						value={mfaCode}
						onChange={(e) => {
							const val = e.target.value.replace(/\D/g, "").slice(0, 6);
							setMfaCode(val);
						}}
						placeholder="000000"
						required
						autoComplete="one-time-code"
						autoFocus
						aria-label={t("Verification code")}
						aria-invalid={!!error}
						aria-describedby={error ? "mfa-error" : undefined}
						className="text-center text-lg tracking-[0.3em]"
					/>
					{error && (
						<p id="mfa-error" className="sr-only">
							{t(error)}
						</p>
					)}
				</div>

				<Button
					type="submit"
					className="w-full"
					disabled={isSubmitting || mfaCode.length !== 6}
				>
					{isSubmitting ? t("Verifying...") : t("Verify")}
				</Button>

				<button
					type="button"
					onClick={handleBackToLogin}
					className="w-full text-center text-sm text-neutral-500 hover:text-neutral-700 hover:underline"
				>
					{t("Back to login")}
				</button>
			</form>
		);
	}

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			{error && (
				<div className="rounded-lg bg-error-light p-3 text-sm text-error">
					{t(error)}
				</div>
			)}

			<div className="space-y-2">
				<label htmlFor="email" className="text-sm font-medium text-neutral-700">
					{t("Email")}
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
					className="text-sm font-medium text-neutral-700"
				>
					{t("Password")}
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
						{t(validatePassword(password) ?? "")}
					</p>
				)}
			</div>

			<Button
				type="submit"
				className="w-full"
				disabled={
					isSubmitting || !!validateEmail(email) || !!validatePassword(password)
				}
			>
				{isSubmitting ? t("Signing in...") : t("Sign in")}
			</Button>

			<p className="text-center text-sm text-neutral-500">
				{t("Don't have an account?")}{" "}
				<a
					href={withLocalePath(
						locale,
						returnTo
							? `/register?returnTo=${encodeURIComponent(returnTo)}`
							: "/register",
					)}
					className="text-primary-600 hover:underline"
				>
					{t("Sign up now")}
				</a>
			</p>
		</form>
	);
}
