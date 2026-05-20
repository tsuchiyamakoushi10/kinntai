import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { getTabletOfficeId } from "@/lib/tablet/session";

import { verifyTabletPin } from "./actions";
import { PinKeypad } from "./keypad";

type PageProps = {
  searchParams: Promise<{ eid?: string; err?: string }>;
};

/**
 * S-T-03 暗証番号入力。
 *
 * 名前選択画面 (S-T-02) から ?eid=<employeeId> で遷移してくる前提。
 * 4 桁入力時点で keypad が自動 submit し、Server Action `verifyTabletPin` が
 * 検証 → 打刻メニュー (S-T-04) へ遷移させる。
 */
export default async function TabletPinPage({ searchParams }: PageProps) {
  const officeId = await getTabletOfficeId();
  if (!officeId) redirect("/tablet/setup");

  const { eid, err } = await searchParams;
  if (!eid) redirect("/tablet");

  const employee = await prisma.employee.findUnique({
    where: { id: eid },
    select: {
      id: true,
      lastName: true,
      firstName: true,
      officeId: true,
      retiredAt: true,
    },
  });
  if (!employee || employee.officeId !== officeId || employee.retiredAt) {
    redirect("/tablet");
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center gap-6 p-6">
      <header className="w-full">
        <Link
          href="/tablet"
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <span aria-hidden>←</span> 名前を選び直す
        </Link>
      </header>

      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-sm text-slate-500">暗証番号を入力してください</p>
        <p className="text-2xl font-bold text-slate-900">
          {employee.lastName} {employee.firstName} さん
        </p>
      </div>

      {err && (
        <p
          role="alert"
          className="w-full max-w-md rounded-md bg-red-50 px-3 py-2 text-center text-sm font-medium text-red-700"
        >
          {err}
        </p>
      )}

      <PinKeypad action={verifyTabletPin} eid={employee.id} />
    </div>
  );
}
