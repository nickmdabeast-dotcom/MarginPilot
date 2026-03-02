"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.HTMLAttributes<HTMLElement> {
  variant?: "default" | "outline";
  size?: "sm" | "lg";
  asChild?: boolean;
  type?: React.ButtonHTMLAttributes<HTMLButtonElement>["type"];
}

export function Button({
  className,
  variant = "default",
  size = "sm",
  asChild = false,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center rounded-xl font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none";

  const variants = {
    default: "bg-blue-600 text-white hover:bg-blue-700",
    outline: "border border-white/20 text-white hover:bg-white/10",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-sm",
    lg: "px-6 py-3 text-lg",
  };

  const classes = cn(base, variants[variant], sizes[size], className);

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ className?: string }>, {
      className: cn(classes, (children as React.ReactElement<{ className?: string }>).props.className),
      ...(props as object),
    });
  }

  return (
    <button className={classes} type={type} {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  );
}
