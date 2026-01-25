import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "法眼 | Law Eye",
		short_name: "法眼",
		description:
			'数字时代法律赛道的"参考消息" - 聚合多渠道法律资讯，构建权威信息仓库',
		start_url: "/",
		scope: "/",
		display: "standalone",
		background_color: "#0b0f1a",
		theme_color: "#0b0f1a",
		lang: "zh-CN",
		orientation: "portrait",
		icons: [
			{
				src: "/icon.svg",
				sizes: "any",
				type: "image/svg+xml",
			},
		],
	};
}

