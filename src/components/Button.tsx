import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "../lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline";
  size?: "default" | "lg";
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
          variant === "default" && "bg-purple-500 text-white shadow hover:bg-purple-600",
          variant === "outline" && "border border-gray-300 bg-white hover:bg-gray-100",
          size === "default" && "h-9 px-4 py-2",
          size === "lg" && "h-12 px-8",
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

export { Button };