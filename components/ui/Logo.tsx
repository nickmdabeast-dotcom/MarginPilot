import Link from "next/link";
import { cn } from "@/lib/utils";

interface LogoProps {
  /** If provided, wraps the logo in a Next.js Link. */
  href?: string;
  size?: "sm" | "md";
  /**
   * "dark"  — white brand text, for use on dark/gradient backgrounds.
   * "light" — gray-900 brand text, for use on white/light backgrounds.
   */
  variant?: "dark" | "light";
  className?: string;
}

const sizeMap = {
  sm: { icon: "h-7 w-7", text: "text-sm font-semibold" },
  md: { icon: "h-8 w-8", text: "text-xl font-bold" },
};

export function Logo({
  href,
  size = "md",
  variant = "dark",
  className,
}: LogoProps) {
  const { icon, text } = sizeMap[size];
  const textColor = variant === "dark" ? "text-white" : "text-gray-900";

  const inner = (
    <div className={cn("flex items-center space-x-2", className)}>
      <div
        className={cn(
          "flex items-center justify-center rounded-md bg-gradient-to-br from-blue-500 to-purple-600",
          icon
        )}
      >
        <svg
          className="h-4 w-4 text-white"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 12l9-9 9 9M4 10v10a1 1 0 001 1h5v-6h4v6h5a1 1 0 001-1V10"
          />
        </svg>
      </div>
      <span className={cn(text, textColor)}>HVAC Revenue OS</span>
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}
