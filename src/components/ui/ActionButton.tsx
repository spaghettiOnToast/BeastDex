import { type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "./button";
import { cn } from "../../lib/utils";

type ActionButtonProps = Omit<ButtonProps, 'size' | 'variant'> & {
  children: ReactNode;
  loading?: boolean;
  variant?: "default" | "outline";
  size?: "sm" | "md" | "lg";
};

export function ActionButton({
  children,
  loading = false,
  variant = "default",
  size = "md",
  className,
  disabled,
  ...props
}: ActionButtonProps) {
  const shadcnSize = size === "md" ? "default" : size;
  const shadcnVariant = variant === "default" ? "default" : "outline";

  const actionButtonClasses = cn(
    "font-semibold uppercase tracking-wide",
    variant === "default" && "bg-lsGold text-black hover:bg-lsGold/80",
    variant === "outline" && "border-lsGold text-lsGold hover:bg-gray-900 hover:text-lsGold",
    size === "sm" && "text-[10px]",
    size === "md" && "text-xs",
    size === "lg" && "text-sm",
    className
  );

  return (
    <Button
      variant={shadcnVariant}
      size={shadcnSize}
      disabled={disabled || loading}
      className={actionButtonClasses}
      {...props}
    >
      {loading && <Loader2 className="h-3 w-3 animate-spin" />}
      {children}
    </Button>
  );
}

export default ActionButton;