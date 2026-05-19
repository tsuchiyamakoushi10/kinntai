import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { currentJstYm, fromJstYmd, monthRange, toJstYmd } from "@/lib/attendance/business-date";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ ym?: string }>;
};

const YM_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const WEEKDAY = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  weekday: "short",
});

// JST 基準で "HH:mm" を作る。schema 上 start_time/end_time は @db.Time(0) で
// Prisma は 1970-01-01 の DateTime として返してくるため UTC で読む。
function formatTime(d: Date | null): string {
  if (!d) return "";
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatYmDisplay(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y}年${Number(m)}月`;
}

export default async function MyShiftsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const employeeId = session.user.employeeId;

  const params = await searchParams;
  const ymRaw = params.ym ?? "";
  const ym = YM_PATTERN.test(ymRaw) ? ymRaw : currentJstYm();
  const range = monthRange(ym);
  const todayYmd = toJstYmd(new Date());

  if (!employeeId) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 bg-slate-50 p-5">
        <Header ym={ym} prevYm={range.prevYm} nextYm={range.nextYm} />
        <p className="rounded-2xl bg-white p-5 text-sm text-slate-700 shadow-sm">
          このアカウントには従業員情報が紐づいていません。
        </p>
      </main>
    );
  }

  const shifts = await prisma.shift.findMany({
    where: {
      employeeId,
      workDate: { gte: range.start, lt: range.end },
    },
    include: {
      shiftPattern: {
        select: {
          code: true,
          name: true,
          shiftKind: true,
          color: true,
          startTime: true,
          endTime: true,
          crossesMidnight: true,
        },
      },
    },
    orderBy: { workDate: "asc" },
  });

  const byYmd = new Map<string, (typeof shifts)[number]>();
  for (const s of shifts) byYmd.set(toJstYmd(s.workDate), s);

  // 集計: 種別ごとの日数。WORK / NIGHT_IN / NIGHT_OUT は勤務系としてまとめる。
  // REQUESTED_OFF は予定としてはカウントしない (承認前の希望)。
  type Counter = { work: number; off: number; paid: number; absent: number };
  const counter: Counter = { work: 0, off: 0, paid: 0, absent: 0 };
  for (const s of shifts) {
    switch (s.shiftPattern.shiftKind) {
      case "WORK":
      case "NIGHT_IN":
      case "NIGHT_OUT":
        counter.work += 1;
        break;
      case "OFF":
        counter.off += 1;
        break;
      case "PAID_LEAVE":
        counter.paid += 1;
        break;
      case "ABSENCE":
        counter.absent += 1;
        break;
      case "REQUESTED_OFF":
        break;
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-5 bg-slate-50 p-5">
      <Header ym={ym} prevYm={range.prevYm} nextYm={range.nextYm} />

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          <dt className="text-slate-500">勤務予定</dt>
          <dd className="text-right text-slate-900 tabular-nums">{counter.work} 日</dd>
          <dt className="text-slate-500">公休</dt>
          <dd className="text-right text-slate-900 tabular-nums">{counter.off} 日</dd>
          <dt className="text-slate-500">有休</dt>
          <dd className="text-right text-slate-900 tabular-nums">{counter.paid} 日</dd>
          {counter.absent > 0 && (
            <>
              <dt className="text-slate-500">欠勤</dt>
              <dd className="text-right text-slate-900 tabular-nums">{counter.absent} 日</dd>
            </>
          )}
        </dl>
      </section>

      <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left font-medium">日付</th>
              <th className="px-2 py-2 text-left font-medium">シフト</th>
              <th className="px-3 py-2 text-right font-medium">時間</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {range.days.map((ymd) => {
              const s = byYmd.get(ymd);
              const dow = WEEKDAY.format(fromJstYmd(ymd));
              const day = Number(ymd.slice(-2));
              const isToday = ymd === todayYmd;
              const dayColor =
                dow === "日" ? "text-red-600" : dow === "土" ? "text-blue-600" : "text-slate-900";

              const start = s ? formatTime(s.shiftPattern.startTime) : "";
              const end = s ? formatTime(s.shiftPattern.endTime) : "";
              const timeLabel =
                start && end ? `${start}-${end}${s?.shiftPattern.crossesMidnight ? "+" : ""}` : "—";

              return (
                <tr key={ymd} className={isToday ? "bg-amber-50" : undefined}>
                  <td className="px-3 py-2">
                    <span className={`font-medium tabular-nums ${dayColor}`}>{day}</span>
                    <span className={`ml-1.5 text-xs ${dayColor}`}>({dow})</span>
                  </td>
                  <td className="px-2 py-2">
                    {s ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className="inline-block size-2.5 rounded-sm"
                          style={{ backgroundColor: s.shiftPattern.color }}
                        />
                        <span className="font-medium text-slate-900">{s.shiftPattern.name}</span>
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700 tabular-nums">{timeLabel}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <p className="text-center text-xs text-slate-400">
        ※ シフトの変更は管理者へ連絡してください。
      </p>
    </main>
  );
}

function Header({ ym, prevYm, nextYm }: { ym: string; prevYm: string; nextYm: string }) {
  return (
    <header className="flex items-center justify-between">
      <Link
        href="/me"
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
      >
        ← ホーム
      </Link>
      <div className="flex items-center gap-2">
        <Link
          href={`/me/shifts?ym=${prevYm}`}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50"
          aria-label="前の月"
        >
          ←
        </Link>
        <span className="min-w-24 text-center text-base font-bold text-slate-900">
          {formatYmDisplay(ym)}
        </span>
        <Link
          href={`/me/shifts?ym=${nextYm}`}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50"
          aria-label="次の月"
        >
          →
        </Link>
      </div>
    </header>
  );
}
