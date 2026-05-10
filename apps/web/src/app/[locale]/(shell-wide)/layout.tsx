import type { ReactNode } from "react";

/**
 * `(shell-wide)` route group — pages that opt into the wide
 * `max-w-screen-2xl` container under the persistent user shell.
 *
 * Members: `dashboard/`, `knowledge/`, `reports/`.
 *
 * The locale-level `<PersistentUserShell>` already renders Sidebar + Header;
 * this layout only owns the content container width.
 *
 * Padding note (wave 9 hot-fix #1): Reduced top padding from `py-6 md:py-8`
 * to `pt-4 md:pt-5 pb-6 md:pb-8`. The previous 32px gap stacked with each
 * page's `space-y-*` and motion `y: 16` enter offset, producing a visible
 * empty band above the dashboard orange hero card. The new padding keeps a
 * minimal 16-20px top breathing strip while letting hero/headline land near
 * the breadcrumb bar — matches `prototype/app.html` density.
 *
 * NOTE: Wrapping element is `<div>` (not `<main>`) because
 * `PersistentUserShellChrome` already renders a `<main>` element that owns
 * the page scroll region. Two `<main>`s would be invalid HTML and break
 * `#main-content` queries.
 */
export default function ShellWideLayout({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<div className="mx-auto flex h-full w-full max-w-screen-2xl flex-col px-4 pb-6 pt-4 md:px-6 md:pb-8 md:pt-5">
			{children}
		</div>
	);
}
