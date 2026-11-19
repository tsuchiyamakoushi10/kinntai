"use client";

interface Props {
  label: string;
  variant?: "done" | "progress" | "pending" | "neutral" | "warning";
}

export default function StatusBadge({ label, variant = "neutral" }: Props) {
  const styles: Record<string, string> = {
    done: "bg-sage-100 text-sage-600",
    progress: "bg-warm-100 text-warm-600",
    pending: "bg-cream-200 text-ink-600",
    neutral: "bg-cream-100 text-ink-600",
    warning: "bg-orange-100 text-orange-700",
  };
  return <span className={`chip ${styles[variant]}`}>{label}</span>;
}
