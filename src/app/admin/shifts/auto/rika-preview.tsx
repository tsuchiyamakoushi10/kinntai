import type { RikaCoverageSummary } from "@/lib/shift/rika/proposals";

type Props = {
  summary: RikaCoverageSummary;
  /** DB に解決できなかった職員名 (氏名不一致・同名複数)。 */
  skipped: ReadonlyArray<string>;
};

/** 梨花 (午前/午後モデル) の dry-run プレビュー。デイ/ショートと同じ並びの配置サマリ。 */
export function RikaPreview({ summary, skipped }: Props) {
  return (
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
          value={`${summary.understaffedDays.length} 日`}
          tone={summary.understaffedDays.length === 0 ? "ok" : "bad"}
        />
        <Stat
          label="相談員不在の日"
          value={`${summary.counselorMissingDays.length} 日`}
          tone={summary.counselorMissingDays.length === 0 ? "ok" : "warn"}
        />
      </dl>

      {summary.understaffedDays.length > 0 && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          人数が足りない営業日: {summary.understaffedDays.map(shortDate).join("、")}
        </p>
      )}
      {summary.targetUnreachedCount > 0 && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          目安の勤務日数に届かない人が {summary.targetUnreachedCount} 名います
          (手修正で調整してください)。
        </p>
      )}
      {skipped.length > 0 && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">
          従業員マスターと突き合わせできず配置から外れた職員: {skipped.join("、")}
          。氏名がマスターと一致しているか確認してください。
        </p>
      )}
    </section>
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
