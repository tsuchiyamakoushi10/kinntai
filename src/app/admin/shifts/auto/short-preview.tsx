import { DAY_KIND_LABELS } from "@/lib/shift/coverage-demand";
import type { ShortDayResult } from "@/lib/shift/short/generate";
import type { ShortCoverageSummary } from "@/lib/shift/short/proposals";

type Props = {
  days: ReadonlyArray<ShortDayResult>;
  summary: ShortCoverageSummary;
};

/** ショート (午前/午後モデル + 夜勤先取り) の dry-run プレビュー。日ごとの充足を色で示す。 */
export function ShortPreview({ days, summary }: Props) {
  return (
    <>
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">配置サマリ (dry-run)</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="営業日" value={`${summary.operatingDays} 日`} />
          <Stat
            label="充足日"
            value={`${summary.filledDays} / ${summary.operatingDays} 日`}
            tone={summary.filledDays === summary.operatingDays ? "ok" : "warn"}
          />
          <Stat
            label="人数不足の日"
            value={`${summary.amPmShortfallDays.length} 日`}
            tone={summary.amPmShortfallDays.length === 0 ? "ok" : "bad"}
          />
          <Stat
            label="夜勤を置けない日"
            value={`${summary.unfilledNightDays.length} 日`}
            tone={summary.unfilledNightDays.length === 0 ? "ok" : "bad"}
          />
        </dl>
        {summary.unfilledNightDays.length > 0 && (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">
            夜入を 1 名も置けない日があります。夜勤に入れる職員が足りていません
            (夜勤上限・希望休を確認)。
          </p>
        )}
        {summary.counselorShortDays.length > 0 && (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            相談員 (生活相談員) が午前/午後の必要数に届かない日があります (
            {summary.counselorShortDays.length}
            日)。該当者の職種が「生活相談員」に設定されているか確認してください
            (自動配置では強制しません)。
          </p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">日別の過不足</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-2 py-1">日付</th>
                <th className="px-2 py-1">種別</th>
                <th className="px-2 py-1 text-center">午前 (present/要)</th>
                <th className="px-2 py-1 text-center">午後 (present/要)</th>
                <th className="px-2 py-1 text-center">相談員 午前/午後</th>
                <th className="px-2 py-1 text-center">夜勤</th>
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

function DayRow({ day }: { day: ShortDayResult }) {
  if (!day.operating || !day.coverage) {
    return (
      <tr className="border-t border-slate-100 text-slate-400">
        <td className="px-2 py-1">{shortDate(day.date)}</td>
        <td className="px-2 py-1">{DAY_KIND_LABELS[day.dayKind]}</td>
        <td className="px-2 py-1 text-center" colSpan={4}>
          休業
        </td>
      </tr>
    );
  }
  const c = day.coverage;
  const amReq = c.presence.am + c.amShortfall;
  const pmReq = c.presence.pm + c.pmShortfall;
  return (
    <tr className="border-t border-slate-100">
      <td className="px-2 py-1 text-slate-700">{shortDate(day.date)}</td>
      <td className="px-2 py-1 text-slate-500">{DAY_KIND_LABELS[day.dayKind]}</td>
      <Cell ok={c.amShortfall === 0} value={`${c.presence.am}/${amReq}`} />
      <Cell ok={c.pmShortfall === 0} value={`${c.presence.pm}/${pmReq}`} />
      <td className="px-2 py-1 text-center">
        <span className={c.counselorAmShort ? "text-red-600" : "text-emerald-700"}>
          {c.counselorAmShort ? "✗" : "○"}
        </span>
        {" / "}
        <span className={c.counselorPmShort ? "text-red-600" : "text-emerald-700"}>
          {c.counselorPmShort ? "✗" : "○"}
        </span>
      </td>
      <td className="px-2 py-1 text-center">
        <span className={day.nightFilled ? "text-emerald-700" : "font-semibold text-red-600"}>
          {day.nightFilled ? "○" : "✗"}
        </span>
      </td>
    </tr>
  );
}

function Cell({ ok, value }: { ok: boolean; value: string }) {
  return (
    <td className="px-2 py-1 text-center">
      <span
        className={
          ok
            ? "rounded bg-emerald-100 px-2 py-0.5 text-emerald-800"
            : "rounded bg-red-100 px-2 py-0.5 font-semibold text-red-800"
        }
      >
        {value}
      </span>
    </td>
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
