"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
	useAuthorityStats,
	useImportanceStats,
	useIssuerStats,
} from "@/hooks/use-statistics";
import { useT } from "@/lib/i18n-client";
import { BarChart3, Building2, Shield, Star } from "lucide-react";
import { IMPORTANCE_LABELS } from "../constants";
import { AuthorityChart } from "./authority-chart";
import { ImportanceBarChart } from "./importance-bar-chart";
import { IssuerRanking } from "./issuer-ranking";

export function ImportancePanel() {
	const t = useT();
	const {
		data: importanceData,
		isLoading: importanceLoading,
		isError: importanceError,
		error: importanceErr,
		refetch: refetchImportance,
	} = useImportanceStats();
	const {
		data: authorityData,
		isLoading: authorityLoading,
		isError: authorityError,
		error: authorityErr,
		refetch: refetchAuthority,
	} = useAuthorityStats();
	const {
		data: issuerData,
		isLoading: issuerLoading,
		isError: issuerError,
		error: issuerErr,
		refetch: refetchIssuer,
	} = useIssuerStats(20);

	const isLoading = importanceLoading || authorityLoading || issuerLoading;

	if (isLoading) {
		return (
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				{[0, 1, 2].map((i) => (
					<Card key={i} className={i === 2 ? "lg:col-span-2" : ""}>
						<CardContent className="p-6">
							<div className="flex h-[300px] items-center justify-center">
								<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
							</div>
						</CardContent>
					</Card>
				))}
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Summary cards */}
			{importanceData && (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
					<Card>
						<CardContent className="p-4">
							<div className="flex items-center gap-3">
								<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
									<Star
										className="h-5 w-5 text-amber-600"
										aria-hidden="true"
									/>
								</div>
								<div>
									<p className="text-2xl font-bold">
										{importanceData.average.toFixed(1)}
									</p>
									<p className="text-sm text-neutral-500">
										{t("Average Importance")}
									</p>
								</div>
							</div>
						</CardContent>
					</Card>
					<Card>
						<CardContent className="p-4">
							<div className="flex items-center gap-3">
								<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100">
									<BarChart3
										className="h-5 w-5 text-primary-600"
										aria-hidden="true"
									/>
								</div>
								<div>
									<p className="text-2xl font-bold">
										{importanceData.total}
									</p>
									<p className="text-sm text-neutral-500">
										{t("Articles Assessed")}
									</p>
								</div>
							</div>
						</CardContent>
					</Card>
					<Card>
						<CardContent className="p-4">
							<div className="flex items-center gap-3">
								<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
									<Shield
										className="h-5 w-5 text-emerald-600"
										aria-hidden="true"
									/>
								</div>
								<div>
									<p className="text-2xl font-bold">
										{(importanceData.coverage_rate * 100).toFixed(1)}%
									</p>
									<p className="text-sm text-neutral-500">
										{t("Coverage Rate")}
									</p>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			)}

			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				{/* Importance distribution */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Star
								className="h-5 w-5 text-primary-500"
								aria-hidden="true"
							/>
							{t("Importance Distribution")}
						</CardTitle>
					</CardHeader>
					<CardContent>
						{importanceError ? (
							<EmptyState
								variant="error"
								title={t("Failed to load importance data")}
								description={
									importanceErr instanceof Error
										? importanceErr.message
										: t("Unknown error")
								}
								action={{
									label: t("Retry"),
									onClick: () => refetchImportance(),
								}}
								className="py-10"
							/>
						) : !importanceData ? (
							<EmptyState
								title={t("No importance data")}
								className="py-10"
							/>
						) : (
							<ImportanceBarChart levels={importanceData.levels} />
						)}
					</CardContent>
				</Card>

				{/* Authority distribution */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Shield
								className="h-5 w-5 text-primary-500"
								aria-hidden="true"
							/>
							{t("Authority Level Distribution")}
						</CardTitle>
					</CardHeader>
					<CardContent>
						{authorityError ? (
							<EmptyState
								variant="error"
								title={t("Failed to load authority data")}
								description={
									authorityErr instanceof Error
										? authorityErr.message
										: t("Unknown error")
								}
								action={{
									label: t("Retry"),
									onClick: () => refetchAuthority(),
								}}
								className="py-10"
							/>
						) : !authorityData || authorityData.levels.length === 0 ? (
							<EmptyState
								title={t("No authority data")}
								className="py-10"
							/>
						) : (
							<AuthorityChart levels={authorityData.levels} />
						)}
					</CardContent>
				</Card>
			</div>

			{/* Issuer ranking */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Building2
							className="h-5 w-5 text-primary-500"
							aria-hidden="true"
						/>
						{t("Top Issuers")}
					</CardTitle>
				</CardHeader>
				<CardContent>
					{issuerError ? (
						<EmptyState
							variant="error"
							title={t("Failed to load issuer data")}
							description={
								issuerErr instanceof Error
									? issuerErr.message
									: t("Unknown error")
							}
							action={{
								label: t("Retry"),
								onClick: () => refetchIssuer(),
							}}
							className="py-10"
						/>
					) : !issuerData || issuerData.items.length === 0 ? (
						<EmptyState
							title={t("No issuer data")}
							className="py-10"
						/>
					) : (
						<div>
							<div className="mb-3 flex items-center gap-2 text-sm text-neutral-500">
								<span>
									{t("Total issuers")}: {issuerData.unique_issuers}
								</span>
								<span>|</span>
								<span>
									{t("Total articles")}: {issuerData.total}
								</span>
							</div>
							<div className="grid grid-cols-1 gap-x-8 lg:grid-cols-2">
								<IssuerRanking
									items={issuerData.items.slice(0, 10)}
								/>
								{issuerData.items.length > 10 && (
									<IssuerRanking
										items={issuerData.items.slice(10, 20)}
									/>
								)}
							</div>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
