import Link from "next/link";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";

import { createShiftPattern } from "../actions";
import { ShiftPatternForm } from "../shift-pattern-form";

export const dynamic = "force-dynamic";

export default async function NewShiftPatternPage() {
  await requireAdmin();
  const offices = await prisma.office.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="ぱんくず" className="text-sm text-slate-500">
        <Link href="/admin/shift-patterns" className="hover:underline">
          シフトパターン
        </Link>
        <span className="mx-1">/</span>
        <span className="text-slate-700">新規追加</span>
      </nav>
      <h1 className="text-2xl font-bold text-slate-900">シフトパターンを新規追加</h1>
      <ShiftPatternForm
        action={createShiftPattern}
        offices={offices}
        initial={{
          code: "",
          name: "",
          officeId: "",
          shiftKind: "WORK",
          startTime: "",
          endTime: "",
          crossesMidnight: false,
          breakMinutes: "0",
          paidLeaveUnits: "0",
          color: "#888888",
          sortOrder: "0",
          isActive: true,
        }}
        submitLabel="追加する"
      />
    </div>
  );
}
