"use client";

import { useT } from "@/lib/i18n-client";
import type { AuthorityLevelCount } from "@/hooks/use-statistics";
import { AUTHORITY_LABELS } from "../constants";
import {
	Bar,
	BarChart,
	Cell,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

interface AuthorityChartProps {
	levels: AuthorityLevelCount[];
}

const AUTHORITY_COLORS = [
	"#dc2626", // 1 - 宪法
	"#ef4444", // 2 - 法律
	"#f97316", // 3 - 行政法规
	"#f59e0b", // 4 - 部门规章
	"#eab308", // 5 - 地方性法规
	"#84cc16", // 6 - 地方政府规章
	"#22c55e", // 7 - 司法解释
	"#14b8a6", // 8 - 规范性文件
	"#06b6d4", // 9 - 行业标准
	"#94a3b8", // 10 - 非正式
];

export function AuthorityChart({ levels }: AuthorityChartProps) {
	const t = useT();

	const chartData = levels.map((item) => ({
		name: AUTHORITY_LABELS[item.level] ?? item.label,
		count: item.count,
		percentage: item.percentage,
		fill: AUTHORITY_COLORS[(item.level - 1) % AUTHORITY_COLORS.length],
	}));

	return (
		<ResponsiveContainer width="100%" height={300}>
			<BarChart
				data={chartData}
				layout="vertical"
				margin={{ top: 8, right: 40, bottom: 8, left: 90 }}
			>
				<XAxis
					type="number"
					allowDecimals={false}
					tick={{ fontSize: 12 }}
					axisLine={false}
					tickLine={false}
				/>
				<YAxis
					type="category"
					dataKey="name"
					tick={{ fontSize: 11 }}
					axisLine={false}
					tickLine={false}
					width={90}
				/>
				<Tooltip
					formatter={(value) => [String(value), t("Articles")]}
					contentStyle={{
						borderRadius: "8px",
						border: "1px solid #e5e5e5",
						fontSize: "13px",
					}}
				/>
				<Bar dataKey="count" radius={[0, 4, 4, 0]}>
					{chartData.map((entry) => (
						<Cell key={entry.name} fill={entry.fill} />
					))}
				</Bar>
			</BarChart>
		</ResponsiveContainer>
	);
}
