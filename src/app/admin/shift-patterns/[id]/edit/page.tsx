import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";

import { updateShiftPattern } from "../../actions";
import { ShiftPatternForm } from "../../shift-pattern-form";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = {
  params: Promise<{ id: string }>;
};

const HM_UTC = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "UTC",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** `@db.Time(0)` の Date は 1970-01-01 の UTC 時刻成分のみ持つ。 */
function toHhmm(d: Date | null): string {
  if (!d) return "";
  const parts = HM_UTC.formatToParts(d);
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h}:${m}`;
}

export default async function EditShiftPatternPage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const [pattern, offices] = await Promise.all([
    prisma.shiftPattern.findUnique({ where: { id } }),
    prisma.office.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  if (!pattern) notFound();

  const action = updateShiftPattern.bind(null, id);

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="ぱんくず" className="text-sm text-slate-500">
        <Link href="/admin/shift-patterns" className="hover:underline">
          シフトパターン
        </Link>
        <span className="mx-1">/</span>
        <span className="text-slate-700">{pattern.name}</span>
      </nav>
      <h1 className="text-2xl font-bold text-slate-900">シフトパターンを編集</h1>
      <ShiftPatternForm
        action={action}
        offices={offices}
        initial={{
          code: pattern.code,
          name: pattern.name,
          officeId: pattern.officeId ?? "",
          shiftKind: pattern.shiftKind,
          startTime: toHhmm(pattern.startTime),
          endTime: toHhmm(pattern.endTime),
          crossesMidnight: pattern.crossesMidnight,
          breakMinutes: String(pattern.breakMinutes),
          paidLeaveUnits: pattern.paidLeaveUnits.toString(),
          color: pattern.color,
          sortOrder: String(pattern.sortOrder),
          isActive: pattern.isActive,
        }}
        submitLabel="保存する"
      />
    </div>
  );
}
