import type { ReactNode } from "react";

/**
 * `(shell-wide)` route group — pages that opt into the wide
 * `max-w-screen-2xl` container under the persistent user shell.
 *
 * Members: `knowledge/`, `reports/`.
 *
 * The locale-level `<PersistentUserShell>` already renders Sidebar + Header;
 * this layout only owns the content container width.
 */
export default function ShellWideLayout({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<main className="mx-auto w-full max-w-screen-2xl flex-1 px-4 py-6 md:px-6 md:py-8">
			{children}
		</main>
	);
}
