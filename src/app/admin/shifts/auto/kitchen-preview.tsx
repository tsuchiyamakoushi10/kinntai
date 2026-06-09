import { DAY_KIND_LABELS } from "@/lib/shift/coverage-demand";
import type { KitchenDayResult } from "@/lib/shift/kitchen/generate";
import type { KitchenCoverageSummary } from "@/lib/shift/kitchen/proposals";

type Props = {
  days: ReadonlyArray<KitchenDayResult>;
  summary: KitchenCoverageSummary;
};

/** 厨房 (固定ロスター) の dry-run プレビュー。日ごとの必要/配置を示す。 */
export function KitchenPreview({ days, summary }: Props) {
  return (
    <>
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">配置サマリ (dry-run)</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <Stat label="営業日" value={`${summary.operatingDays} 日`} />
          <Stat
            label="充足日"
            value={`${summary.filledDays} / ${summary.operatingDays} 日`}
            tone={summary.filledDays === summary.operatingDays ? "ok" : "warn"}
          />
          <Stat
            label="人数不足の日"
            value={`${summary.shortfallDays.length} 日`}
            tone={summary.shortfallDays.length === 0 ? "ok" : "bad"}
          />
        </dl>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">日別の過不足</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-2 py-1">日付</th>
                <th className="px-2 py-1">種別</th>
                <th className="px-2 py-1 text-center">配置 (人/要)</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <DayRow key={d.date} day={d} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function DayRow({ day }: { day: KitchenDayResult }) {
  if (!day.operating) {
    return (
      <tr className="border-t border-slate-100 text-slate-400">
        <td className="px-2 py-1">{shortDate(day.date)}</td>
        <td className="px-2 py-1">{DAY_KIND_LABELS[day.dayKind]}</td>
        <td className="px-2 py-1 text-center">休業</td>
      </tr>
    );
  }
  const ok = day.shortfall === 0;
  return (
    <tr className="border-t border-slate-100">
      <td className="px-2 py-1 text-slate-700">{shortDate(day.date)}</td>
      <td className="px-2 py-1 text-slate-500">{DAY_KIND_LABELS[day.dayKind]}</td>
      <td className="px-2 py-1 text-center">
        <span
          className={
            ok
              ? "rounded bg-emerald-100 px-2 py-0.5 text-emerald-800"
              : "rounded bg-red-100 px-2 py-0.5 font-semibold text-red-800"
          }
        >
          {day.filled}/{day.required}
        </span>
      </td>
    </tr>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "ok" | "warn" | "bad";
}) {
  const color =
    tone === "ok"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-amber-700"
        : tone === "bad"
          ? "text-red-700"
          : "text-slate-900";
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`text-lg font-semibold ${color}`}>{value}</dd>
    </div>
  );
}

function shortDate(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return `${Number(m)}/${Number(d)}`;
}
