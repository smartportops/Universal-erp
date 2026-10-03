"use client";

import { useFormStatus } from "react-dom";
import { useTx } from "@/lib/i18n-client";
import { buttonClass, type ButtonVariant } from "@/components/ui";

export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  pendingLabel = "Saving",
  className,
}: {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const tx = useTx();
  return (
    <button className={`${buttonClass(variant, size)} ${className ?? ""}`} disabled={pending} type="submit">
      {pending ? tx(pendingLabel) : children}
    </button>
  );
}
