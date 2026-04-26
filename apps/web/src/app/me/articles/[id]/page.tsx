"use client";

import { ReaderPage } from "@/components/user/reader-page";
import { useParams } from "next/navigation";

export default function MeArticleDetailPage() {
	const params = useParams<{ id: string }>();
	const id = typeof params?.id === "string" ? params.id : "";
	if (!id) return null;
	return <ReaderPage articleId={id} />;
}
