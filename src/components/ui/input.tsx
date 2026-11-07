import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-11 w-full rounded-lg border border-[rgba(90,58,32,0.28)] bg-[rgba(255,252,246,0.72)] px-3 py-2 text-[var(--ink)]",
        className,
      )}
      {...props}
    />
  );
}
