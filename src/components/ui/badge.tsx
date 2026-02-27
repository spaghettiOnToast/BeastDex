import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30 focus:ring-offset-2 focus:ring-offset-surface",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-accent/15 text-accent hover:bg-accent/25",
        secondary:
          "border-transparent bg-white/[0.06] text-zinc-300 hover:bg-white/[0.10]",
        destructive:
          "border-transparent bg-red-500/15 text-red-400 hover:bg-red-500/25",
        outline: "text-zinc-300 border-white/[0.10]",
        success:
          "border-transparent bg-green-500/15 text-green-400 hover:bg-green-500/25",
        warning:
          "border-transparent bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }