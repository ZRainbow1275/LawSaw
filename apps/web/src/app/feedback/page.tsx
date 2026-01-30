"use client";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { Sidebar } from "@/components/layout/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCreateFeedback, useMyFeedbacks } from "@/hooks/use-feedback";
import type { CreateFeedbackInput, Feedback } from "@/lib/api/types";
import { AnimatePresence, motion } from "framer-motion";
import {
	Bug,
	CheckCircle2,
	Clock,
	HelpCircle,
	Lightbulb,
	Loader2,
	MessageSquarePlus,
	Rss,
	Send,
	Sparkles,
	XCircle,
} from "lucide-react";
import { useState } from "react";

const containerVariants = {
	hidden: { opacity: 0 },
	visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
	hidden: { opacity: 0, y: 20 },
	visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

const feedbackTypes = [
	{
		value: "source_suggestion" as const,
		label: "信息源建议",
		icon: Rss,
		color: "text-blue-500 bg-blue-50",
	},
	{
		value: "bug_report" as const,
		label: "问题反馈",
		icon: Bug,
		color: "text-red-500 bg-red-50",
	},
	{
		value: "feature_request" as const,
		label: "功能建议",
		icon: Lightbulb,
		color: "text-amber-500 bg-amber-50",
	},
	{
		value: "other" as const,
		label: "其他",
		icon: HelpCircle,
		color: "text-neutral-500 bg-neutral-50",
	},
];

const statusConfig: Record<
	Feedback["status"],
	{ label: string; color: string; icon: typeof Clock }
> = {
	pending: {
		label: "待处理",
		color: "bg-neutral-100 text-neutral-600",
		icon: Clock,
	},
	reviewing: {
		label: "处理中",
		color: "bg-blue-100 text-blue-600",
		icon: Loader2,
	},
	resolved: {
		label: "已解决",
		color: "bg-green-100 text-green-600",
		icon: CheckCircle2,
	},
	rejected: {
		label: "已关闭",
		color: "bg-red-100 text-red-600",
		icon: XCircle,
	},
};

function formatTime(dateStr: string): string {
	const date = new Date(dateStr);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);
	if (diffMins < 1) return "刚刚";
	if (diffMins < 60) return `${diffMins} 分钟前`;
	if (diffHours < 24) return `${diffHours} 小时前`;
	if (diffDays < 30) return `${diffDays} 天前`;
	return date.toLocaleDateString("zh-CN");
}

export default function FeedbackPage() {
	const { data: myFeedbacks, isLoading: feedbacksLoading } = useMyFeedbacks();
	const createFeedback = useCreateFeedback();
	const [selectedType, setSelectedType] = useState<
		CreateFeedbackInput["type"] | null
	>(null);
	const [formData, setFormData] = useState({
		title: "",
		content: "",
		contact_email: "",
		source_url: "",
		source_name: "",
	});
	const [submitted, setSubmitted] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!selectedType || !formData.title || !formData.content) return;
		const payload: CreateFeedbackInput = {
			type: selectedType,
			title: formData.title,
			content: formData.content,
		};
		if (formData.contact_email) payload.contact_email = formData.contact_email;
		if (formData.source_url) payload.source_url = formData.source_url;
		if (formData.source_name) payload.source_name = formData.source_name;
		createFeedback.mutate(payload, {
			onSuccess: () => {
				setSubmitted(true);
				setFormData({
					title: "",
					content: "",
					contact_email: "",
					source_url: "",
					source_name: "",
				});
				setSelectedType(null);
				setTimeout(() => setSubmitted(false), 3000);
			},
		});
	};

	const resetForm = () => {
		setSelectedType(null);
		setFormData({
			title: "",
			content: "",
			contact_email: "",
			source_url: "",
			source_name: "",
		});
	};

	return (
		<ProtectedRoute>
			<div className="flex min-h-screen bg-gradient-to-br from-neutral-50 via-white to-primary-50/20">
				<Sidebar />
				<MainContent>
					<Header />
					<motion.div
						className="p-6"
						variants={containerVariants}
						initial="hidden"
						animate="visible"
					>
						{/* Page Title */}
						<motion.div className="mb-8 relative" variants={itemVariants}>
							<div className="absolute -left-3 top-0 h-full w-1 rounded-full bg-gradient-to-b from-primary-500 to-primary-300" />
							<div className="flex items-center gap-3">
								<h1 className="text-2xl font-bold text-neutral-900">
									留言反馈
								</h1>
								<motion.div
									animate={{ rotate: [0, 10, -10, 0] }}
									transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
								>
									<Sparkles className="h-5 w-5 text-primary-400" />
								</motion.div>
							</div>
							<p className="mt-1 text-sm text-neutral-500">
								向我们提交建议、反馈问题或推荐新的信息源
							</p>
						</motion.div>

						<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
							<motion.div className="lg:col-span-2" variants={itemVariants}>
								<Card>
									<CardHeader className="bg-gradient-to-r from-primary-50/50 to-transparent border-b border-primary-100/30">
										<CardTitle className="flex items-center gap-2">
											<motion.div
												whileHover={{ scale: 1.1, rotate: 10 }}
												className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-100"
											>
												<MessageSquarePlus className="h-4 w-4 text-primary-600" />
											</motion.div>
											提交反馈
										</CardTitle>
										<CardDescription>
											选择反馈类型并填写详细信息
										</CardDescription>
									</CardHeader>
									<CardContent className="pt-6">
										<AnimatePresence mode="wait">
											{submitted ? (
												<motion.div
													key="success"
													initial={{ opacity: 0, scale: 0.9 }}
													animate={{ opacity: 1, scale: 1 }}
													exit={{ opacity: 0, scale: 0.9 }}
													className="flex flex-col items-center justify-center py-12 text-center"
												>
													<motion.div
														className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-green-100 to-emerald-100"
														initial={{ scale: 0 }}
														animate={{ scale: 1 }}
														transition={{ type: "spring", delay: 0.1 }}
													>
														<motion.div
															initial={{ scale: 0 }}
															animate={{ scale: 1 }}
															transition={{ delay: 0.3 }}
														>
															<CheckCircle2 className="h-10 w-10 text-green-600" />
														</motion.div>
													</motion.div>
													<motion.h3
														className="text-xl font-semibold text-neutral-900"
														initial={{ opacity: 0, y: 10 }}
														animate={{ opacity: 1, y: 0 }}
														transition={{ delay: 0.4 }}
													>
														提交成功！
													</motion.h3>
													<motion.p
														className="mt-2 text-sm text-neutral-500"
														initial={{ opacity: 0 }}
														animate={{ opacity: 1 }}
														transition={{ delay: 0.5 }}
													>
														感谢您的反馈，我们会尽快处理
													</motion.p>
													<motion.div
														initial={{ opacity: 0, y: 10 }}
														animate={{ opacity: 1, y: 0 }}
														transition={{ delay: 0.6 }}
													>
														<Button
															variant="outline"
															className="mt-6"
															onClick={() => setSubmitted(false)}
														>
															继续提交
														</Button>
													</motion.div>
												</motion.div>
											) : (
												<motion.form
													key="form"
													onSubmit={handleSubmit}
													className="space-y-6"
													initial={{ opacity: 0 }}
													animate={{ opacity: 1 }}
													exit={{ opacity: 0 }}
												>
													<fieldset>
														<legend className="mb-3 block text-sm font-medium text-neutral-700">
															反馈类型
														</legend>
														<div
															className="grid grid-cols-2 gap-3 sm:grid-cols-4"
															role="radiogroup"
															aria-label="反馈类型"
														>
															{feedbackTypes.map((type, index) => (
																<motion.label
																	key={type.value}
																	className={`group relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all duration-200 ${
																		selectedType === type.value
																			? "border-primary-500 bg-primary-50 shadow-md"
																			: "border-neutral-200 bg-white hover:border-primary-200 hover:bg-neutral-50"
																	}`}
																	initial={{ opacity: 0, y: 20 }}
																	animate={{ opacity: 1, y: 0 }}
																	transition={{ delay: index * 0.05 }}
																	whileHover={{ scale: 1.03, y: -2 }}
																	whileTap={{ scale: 0.97 }}
																>
																	<input
																		type="radio"
																		name="feedback-type"
																		value={type.value}
																		checked={selectedType === type.value}
																		onChange={() => setSelectedType(type.value)}
																		className="sr-only"
																	/>
																	{selectedType === type.value && (
																		<motion.div
																			className="absolute inset-0 rounded-xl bg-primary-100/50"
																			layoutId="selectedType"
																			transition={{
																				type: "spring",
																				stiffness: 300,
																				damping: 30,
																			}}
																		/>
																	)}
																	<motion.div
																		className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${type.color}`}
																		whileHover={{ rotate: 10 }}
																	>
																		<type.icon className="h-5 w-5" />
																	</motion.div>
																	<span className="relative z-10 text-xs font-medium text-neutral-700">
																		{type.label}
																	</span>
																</motion.label>
															))}
														</div>
													</fieldset>

													<AnimatePresence>
														{selectedType && (
															<motion.div
																initial={{ opacity: 0, height: 0 }}
																animate={{ opacity: 1, height: "auto" }}
																exit={{ opacity: 0, height: 0 }}
																className="space-y-6 overflow-hidden"
															>
																{selectedType === "source_suggestion" && (
																	<motion.div
																		className="grid grid-cols-1 gap-4 sm:grid-cols-2"
																		initial={{ opacity: 0, y: 10 }}
																		animate={{ opacity: 1, y: 0 }}
																	>
																		<div>
																			<label
																				htmlFor="feedback-source-name"
																				className="mb-1 block text-sm font-medium text-neutral-700"
																			>
																				信息源名称
																			</label>
																			<Input
																				id="feedback-source-name"
																				placeholder="例如：最高人民法院官网"
																				value={formData.source_name}
																				onChange={(e) =>
																					setFormData({
																						...formData,
																						source_name: e.target.value,
																					})
																				}
																			/>
																		</div>
																		<div>
																			<label
																				htmlFor="feedback-source-url"
																				className="mb-1 block text-sm font-medium text-neutral-700"
																			>
																				信息源地址
																			</label>
																			<Input
																				id="feedback-source-url"
																				placeholder="https://..."
																				value={formData.source_url}
																				onChange={(e) =>
																					setFormData({
																						...formData,
																						source_url: e.target.value,
																					})
																				}
																			/>
																		</div>
																	</motion.div>
																)}

																<motion.div
																	initial={{ opacity: 0, y: 10 }}
																	animate={{ opacity: 1, y: 0 }}
																	transition={{ delay: 0.1 }}
																>
																	<label
																		htmlFor="feedback-title"
																		className="mb-1 block text-sm font-medium text-neutral-700"
																	>
																		标题 <span className="text-red-500">*</span>
																	</label>
																	<Input
																		id="feedback-title"
																		placeholder="简要描述您的反馈"
																		value={formData.title}
																		onChange={(e) =>
																			setFormData({
																				...formData,
																				title: e.target.value,
																			})
																		}
																		required
																	/>
																</motion.div>

																<motion.div
																	initial={{ opacity: 0, y: 10 }}
																	animate={{ opacity: 1, y: 0 }}
																	transition={{ delay: 0.15 }}
																>
																	<label
																		htmlFor="feedback-content"
																		className="mb-1 block text-sm font-medium text-neutral-700"
																	>
																		详细描述{" "}
																		<span className="text-red-500">*</span>
																	</label>
																	<textarea
																		id="feedback-content"
																		className="min-h-[120px] w-full rounded-xl border-2 border-neutral-200 bg-neutral-50 px-4 py-3 text-sm transition-all focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
																		placeholder="请详细描述您的反馈内容..."
																		value={formData.content}
																		onChange={(e) =>
																			setFormData({
																				...formData,
																				content: e.target.value,
																			})
																		}
																		required
																	/>
																</motion.div>

																<motion.div
																	initial={{ opacity: 0, y: 10 }}
																	animate={{ opacity: 1, y: 0 }}
																	transition={{ delay: 0.2 }}
																>
																	<label
																		htmlFor="feedback-contact-email"
																		className="mb-1 block text-sm font-medium text-neutral-700"
																	>
																		联系邮箱（选填）
																	</label>
																	<Input
																		id="feedback-contact-email"
																		type="email"
																		placeholder="方便我们与您联系"
																		value={formData.contact_email}
																		onChange={(e) =>
																			setFormData({
																				...formData,
																				contact_email: e.target.value,
																			})
																		}
																	/>
																</motion.div>

																<motion.div
																	className="flex items-center justify-end gap-3 pt-2"
																	initial={{ opacity: 0 }}
																	animate={{ opacity: 1 }}
																	transition={{ delay: 0.25 }}
																>
																	<Button
																		type="button"
																		variant="outline"
																		onClick={resetForm}
																	>
																		取消
																	</Button>
																	<Button
																		type="submit"
																		disabled={
																			createFeedback.isPending ||
																			!formData.title ||
																			!formData.content
																		}
																	>
																		{createFeedback.isPending ? (
																			<>
																				<Loader2 className="mr-2 h-4 w-4 animate-spin" />
																				提交中...
																			</>
																		) : (
																			<>
																				<Send className="mr-2 h-4 w-4" />
																				提交反馈
																			</>
																		)}
																	</Button>
																</motion.div>
															</motion.div>
														)}
													</AnimatePresence>
												</motion.form>
											)}
										</AnimatePresence>
									</CardContent>
								</Card>
							</motion.div>

							<motion.div className="lg:col-span-1" variants={itemVariants}>
								<Card>
									<CardHeader>
										<CardTitle className="text-base">我的反馈</CardTitle>
										<CardDescription>查看您提交的反馈状态</CardDescription>
									</CardHeader>
									<CardContent>
										{feedbacksLoading ? (
											<div className="space-y-3">
												{[1, 2, 3].map((i) => (
													<motion.div
														key={i}
														className="h-16 rounded-xl bg-gradient-to-r from-neutral-100 to-neutral-50"
														animate={{ opacity: [0.5, 1, 0.5] }}
														transition={{
															duration: 1.5,
															repeat: Number.POSITIVE_INFINITY,
															delay: i * 0.2,
														}}
													/>
												))}
											</div>
										) : !myFeedbacks || myFeedbacks.length === 0 ? (
											<motion.div
												className="py-8 text-center"
												initial={{ opacity: 0 }}
												animate={{ opacity: 1 }}
											>
												<motion.div
													animate={{ y: [0, -5, 0] }}
													transition={{
														duration: 2,
														repeat: Number.POSITIVE_INFINITY,
													}}
												>
													<MessageSquarePlus className="mx-auto h-12 w-12 text-neutral-200" />
												</motion.div>
												<p className="mt-3 text-sm text-neutral-500">
													暂无反馈记录
												</p>
												<p className="mt-1 text-xs text-neutral-400">
													提交您的第一条反馈吧
												</p>
											</motion.div>
										) : (
											<div className="space-y-3">
												{myFeedbacks.slice(0, 5).map((feedback, index) => {
													const status = statusConfig[feedback.status];
													const StatusIcon = status.icon;
													return (
														<motion.div
															key={feedback.id}
															className="rounded-xl border border-neutral-100 p-3 transition-all hover:border-primary-200 hover:bg-primary-50/30 hover:shadow-sm"
															initial={{ opacity: 0, x: -20 }}
															animate={{ opacity: 1, x: 0 }}
															transition={{ delay: index * 0.05 }}
															whileHover={{ x: 4 }}
														>
															<div className="mb-2 flex items-start justify-between">
																<h4 className="text-sm font-medium text-neutral-900 line-clamp-1">
																	{feedback.title}
																</h4>
																<Badge
																	className={`ml-2 shrink-0 ${status.color}`}
																>
																	<StatusIcon className="mr-1 h-3 w-3" />
																	{status.label}
																</Badge>
															</div>
															<p className="text-xs text-neutral-500">
																{formatTime(feedback.created_at)}
															</p>
															{feedback.admin_response && (
																<motion.div
																	className="mt-2 rounded-lg bg-gradient-to-r from-neutral-50 to-neutral-100/50 p-2 border border-neutral-100"
																	initial={{ opacity: 0 }}
																	animate={{ opacity: 1 }}
																>
																	<p className="text-xs text-neutral-600">
																		<span className="font-medium text-primary-600">
																			回复：
																		</span>
																		{feedback.admin_response}
																	</p>
																</motion.div>
															)}
														</motion.div>
													);
												})}
											</div>
										)}
									</CardContent>
								</Card>
							</motion.div>
						</div>
					</motion.div>
				</MainContent>
			</div>
		</ProtectedRoute>
	);
}
