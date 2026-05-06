"use client";

import { CategoryPageContent } from "@/components/category/category-page-content";
import { UserShell } from "@/components/layout/user-shell";

export default function CategoryPage() {
	return (
		<UserShell widthVariant="default">
			<CategoryPageContent />
		</UserShell>
	);
}
