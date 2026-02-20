"use client";

import { LoginForm } from "@/components/auth/login-form";
import { useT } from "@/lib/i18n-client";
import { motion } from "framer-motion";
import { Eye, Sparkles } from "lucide-react";

export default function LoginPage() {
	const t = useT();

	return (
		<div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-neutral-50 via-primary-50/30 to-neutral-50 px-4">
			{/* Background decoration - floating accents */}
			<div className="pointer-events-none absolute inset-0 overflow-hidden">
				<motion.div
					className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-primary-200/30 blur-3xl"
					animate={{
						x: [0, 30, 0],
						y: [0, 20, 0],
						scale: [1, 1.1, 1],
					}}
					transition={{
						duration: 8,
						repeat: Number.POSITIVE_INFINITY,
						ease: "easeInOut",
					}}
				/>
				<motion.div
					className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-primary-300/20 blur-3xl"
					animate={{
						x: [0, -20, 0],
						y: [0, -30, 0],
						scale: [1, 1.15, 1],
					}}
					transition={{
						duration: 10,
						repeat: Number.POSITIVE_INFINITY,
						ease: "easeInOut",
					}}
				/>
				<motion.div
					className="absolute left-1/2 top-1/4 h-48 w-48 rounded-full bg-orange-200/20 blur-3xl"
					animate={{
						x: [0, 40, 0],
						y: [0, -20, 0],
					}}
					transition={{
						duration: 12,
						repeat: Number.POSITIVE_INFINITY,
						ease: "easeInOut",
					}}
				/>
			</div>

			<motion.div
				className="relative z-10 w-full max-w-md"
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.5, ease: "easeOut" }}
			>
				{/* Logo */}
				<motion.div
					className="mb-8 text-center"
					initial={{ opacity: 0, scale: 0.9 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={{ duration: 0.4, delay: 0.1 }}
				>
					<motion.div
						className="relative mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 shadow-brand-lg"
						whileHover={{ scale: 1.05, rotate: 5 }}
						whileTap={{ scale: 0.95 }}
					>
						<Eye aria-hidden="true" className="h-8 w-8 text-white" />
						<motion.div
							className="absolute -right-1 -top-1"
							animate={{ rotate: [0, 15, -15, 0] }}
							transition={{
								duration: 2,
								repeat: Number.POSITIVE_INFINITY,
								ease: "easeInOut",
							}}
						>
							<Sparkles
								aria-hidden="true"
								className="h-4 w-4 text-primary-300"
							/>
						</motion.div>
					</motion.div>
					<motion.h1
						className="text-2xl font-bold text-neutral-900"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ delay: 0.2 }}
					>
						{t("Welcome back")}
					</motion.h1>
					<motion.p
						className="mt-2 text-neutral-500"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ delay: 0.3 }}
					>
						{t("Sign in to your Law Eye account")}
					</motion.p>
				</motion.div>

				{/* Form Card - glassmorphism */}
				<motion.div
					className="rounded-2xl border border-white/60 bg-white/80 p-8 shadow-xl backdrop-blur-xl"
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5, delay: 0.2 }}
					whileHover={{
						boxShadow: "0 25px 50px -12px rgba(255, 107, 53, 0.15)",
					}}
				>
					<LoginForm />
				</motion.div>

				{/* Footer */}
				<motion.p
					className="mt-8 text-center text-xs text-neutral-400"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ delay: 0.5 }}
				>
					{t(
						"By signing in, you agree to our Terms of Service and Privacy Policy.",
					)}
				</motion.p>
			</motion.div>
		</div>
	);
}
