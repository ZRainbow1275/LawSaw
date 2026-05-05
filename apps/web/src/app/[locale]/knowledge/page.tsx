"use client";

import { KnowledgePageContent } from "@/components/knowledge/prototype/knowledge-page-content";
import { UserShell } from "@/components/layout/user-shell";

export default function KnowledgePage() {
	return (
		<UserShell widthVariant="wide">
			<KnowledgePageContent />
		</UserShell>
	);
}
