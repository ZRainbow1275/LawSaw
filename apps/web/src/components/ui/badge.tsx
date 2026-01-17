import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default:
          "bg-primary-500 text-white",
        secondary:
          "bg-neutral-100 text-neutral-700",
        destructive:
          "bg-error text-white",
        outline:
          "border border-neutral-200 text-neutral-700",
        success:
          "bg-success-light text-success",
        warning:
          "bg-warning-light text-neutral-800",
        info:
          "bg-info-light text-info",
        legislation:
          "bg-legislation/10 text-legislation border border-legislation/20",
        regulation:
          "bg-regulation/10 text-regulation border border-regulation/20",
        enforcement:
          "bg-enforcement/10 text-enforcement border border-enforcement/20",
        industry:
          "bg-industry/10 text-industry border border-industry/20",
        compliance:
          "bg-compliance/10 text-compliance border border-compliance/20",
        data:
          "bg-data/10 text-data border border-data/20",
        security:
          "bg-security/10 text-security border border-security/20",
        academic:
          "bg-academic/10 text-academic border border-academic/20",
        events:
          "bg-events/10 text-events border border-events/20",
        international:
          "bg-international/10 text-international border border-international/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
