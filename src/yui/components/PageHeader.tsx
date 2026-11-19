"use client";

interface Props {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, right }: Props) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-ink-800 text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        {subtitle && <p className="text-ink-400 mt-1 text-sm">{subtitle}</p>}
      </div>
      {right && <div>{right}</div>}
    </div>
  );
}
