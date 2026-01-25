"use client";

import { RegisterForm } from "@/components/auth/register-form";
import { motion } from "framer-motion";
import { Eye, UserPlus } from "lucide-react";

export default function RegisterPage() {
	return (
		<div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-neutral-50 via-primary-50/30 to-neutral-50 px-4">
			{/* 背景装饰 - 灵动浮动元素 */}
			<div className="pointer-events-none absolute inset-0 overflow-hidden">
				<motion.div
					className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-primary-200/30 blur-3xl"
					animate={{
						x: [0, -30, 0],
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
					className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-primary-300/20 blur-3xl"
					animate={{
						x: [0, 20, 0],
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
					className="absolute right-1/4 top-1/3 h-48 w-48 rounded-full bg-orange-200/20 blur-3xl"
					animate={{
						x: [0, -40, 0],
						y: [0, 20, 0],
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
						whileHover={{ scale: 1.05, rotate: -5 }}
						whileTap={{ scale: 0.95 }}
					>
						<Eye className="h-8 w-8 text-white" />
						<motion.div
							className="absolute -right-1 -top-1"
							initial={{ scale: 0 }}
							animate={{ scale: 1 }}
							transition={{ delay: 0.5, type: "spring" }}
						>
							<div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500 shadow-sm">
								<UserPlus className="h-3 w-3 text-white" />
							</div>
						</motion.div>
					</motion.div>
					<motion.h1
						className="text-2xl font-bold text-neutral-900"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ delay: 0.2 }}
					>
						创建账户
					</motion.h1>
					<motion.p
						className="mt-2 text-neutral-500"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ delay: 0.3 }}
					>
						加入法眼，掌握法律资讯前沿
					</motion.p>
				</motion.div>

				{/* Form Card - 毛玻璃效果 */}
				<motion.div
					className="rounded-2xl border border-white/60 bg-white/80 p-8 shadow-xl backdrop-blur-xl"
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5, delay: 0.2 }}
					whileHover={{
						boxShadow: "0 25px 50px -12px rgba(255, 107, 53, 0.15)",
					}}
				>
					<RegisterForm />
				</motion.div>

				{/* Footer */}
				<motion.p
					className="mt-8 text-center text-xs text-neutral-400"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ delay: 0.5 }}
				>
					注册即表示您同意我们的服务条款和隐私政策
				</motion.p>
			</motion.div>
		</div>
	);
}
