import { cn } from "@/lib/utils";
import { type VariantProps, cva } from "class-variance-authority";
import * as React from "react";

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 disabled:pointer-events-none disabled:opacity-50",
	{
		variants: {
			variant: {
				default:
					"bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-brand hover:shadow-brand-lg hover:scale-105 active:scale-95",
				destructive:
					"bg-error text-white shadow-sm hover:bg-error/90 active:scale-95",
				outline:
					"border-2 border-neutral-200 bg-white text-neutral-700 hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-neutral-200 dark:hover:border-primary-400/40 dark:hover:bg-primary-500/10 dark:hover:text-primary-300",
				secondary:
					"bg-neutral-600 text-white shadow-sm hover:bg-neutral-700 active:scale-95 dark:bg-neutral-700 dark:hover:bg-neutral-600",
				ghost:
					"text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-200 dark:hover:bg-white/10 dark:hover:text-white",
				link: "text-primary-500 underline-offset-4 hover:underline hover:text-primary-600 dark:text-primary-300 dark:hover:text-primary-200",
			},
			size: {
				default: "h-9 px-4 py-2",
				sm: "h-8 px-3 text-xs",
				lg: "h-12 px-8 text-base",
				icon: "h-9 w-9",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	({ className, variant, size, ...props }, ref) => {
		return (
			<button
				className={cn(buttonVariants({ variant, size, className }))}
				ref={ref}
				{...props}
			/>
		);
	},
);
Button.displayName = "Button";

export { Button, buttonVariants };
