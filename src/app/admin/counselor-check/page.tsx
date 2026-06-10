import { EmploymentStatus, JobCategory } from "@prisma/client";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { KITCHEN_OFFICE_CODES } from "@/lib/shift/office-generator";
import { RIKA_COUNSELOR_REQUIRED, RIKA_OFFICE_CODE } from "@/lib/shift/rika/config";
import {
  countAttentionOffices,
  evaluateCounselorChecks,
  type CounselorCheckInput,
  type CounselorCheckStatus,
} from "@/lib/shift/counselor-check";

export const dynamic = "force-dynamic";

// 状態ごとの表示メタ (色・ラベル・説明)。専門用語を避け、現場が読める日本語にする。
const STATUS_META: Record<CounselorCheckStatus, { label: string; badge: string; note: string }> = {
  shortage: {
    label: "不足",
    badge: "bg-red-100 text-red-700 border-red-200",
    note: "配置基準では相談員が必要ですが、相談員に設定された職員が足りません。",
  },
  unexpected: {
    label: "要確認",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
    note: "配置基準では相談員が不要なのに、相談員に設定された職員がいます。職種の付け間違いの可能性があります。",
  },
  ok: {
    label: "充足",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
    note: "相談員が必要数そろっています。",
  },
  not_required: {
    label: "—",
    badge: "bg-slate-100 text-slate-500 border-slate-200",
    note: "この拠点は相談員を配置基準で求めていません。",
  },
};

export default async function CounselorCheckPage() {
  await requireAdmin();

  const offices = await prisma.office.findMany({
    // 厨房は相談員を配置しない拠点なのでチェック対象から外す。
    where: { isActive: true, code: { notIn: [...KITCHEN_OFFICE_CODES] } },
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      coverageDemands: {
        select: { counselorAmRequired: true, counselorPmRequired: true },
      },
      employees: {
        where: {
          employmentStatus: EmploymentStatus.ACTIVE,
          jobCategory: JobCategory.LIFE_COUNSELOR,
        },
        orderBy: { employeeCode: "asc" },
        select: { id: true, employeeCode: true, lastName: true, firstName: true },
      },
    },
  });

  // 氏名は表示にだけ使い、突き合わせロジック (純粋層) には渡さない。
  const nameById = new Map<string, string>();
  for (const o of offices) {
    for (const e of o.employees) {
      nameById.set(e.id, `${e.lastName} ${e.firstName}`);
    }
  }

  const inputs: CounselorCheckInput[] = offices.map((o) => ({
    officeId: o.id,
    officeName: o.name,
    officeCode: o.code,
    // 必要相談員数 = 日種をまたいだ「午前/午後で必要な相談員」の最大。
    // 梨花は専用ロジックのため office_coverage_demands を持たず、相談員必要数はハードコード
    // (RIKA_COUNSELOR_REQUIRED) にある。これを使わないと相談員登録が「要確認」と誤判定される。
    requiredCounselors:
      o.code === RIKA_OFFICE_CODE
        ? RIKA_COUNSELOR_REQUIRED
        : o.coverageDemands.reduce(
            (max, d) => Math.max(max, d.counselorAmRequired, d.counselorPmRequired),
            0,
          ),
    counselors: o.employees.map((e) => ({ employeeId: e.id, employeeCode: e.employeeCode })),
  }));

  const results = evaluateCounselorChecks(inputs);
  const attention = countAttentionOffices(results);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">相談員チェック</h1>
        <p className="mt-1 text-sm text-slate-500">
          拠点ごとに、配置基準で必要な生活相談員の数と、実際に「生活相談員」に設定された職員の数を
          突き合わせます。ズレがある拠点は、職員の職種を見直してください。
        </p>
      </header>

      <div
        className={
          attention > 0
            ? "rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
            : "rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
        }
      >
        {attention > 0
          ? `確認が必要な拠点が ${attention} 件あります（不足 または 要確認）。`
          : "すべての拠点で相談員の設定に問題はありません。"}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              <th className="px-4 py-3">拠点</th>
              <th className="px-4 py-3">必要な相談員</th>
              <th className="px-4 py-3">設定済みの相談員</th>
              <th className="px-4 py-3">状態</th>
              <th className="px-4 py-3">対応</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {results.map((r) => {
              const meta = STATUS_META[r.status];
              return (
                <tr key={r.officeId} className="align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{r.officeName}</div>
                    <div className="text-xs text-slate-400">{r.officeCode}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {r.requiredCounselors > 0 ? `${r.requiredCounselors} 名` : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {r.actualCounselors} 名
                    {r.counselors.length > 0 && (
                      <ul className="mt-1 flex flex-col gap-0.5">
                        {r.counselors.map((c) => (
                          <li key={c.employeeId}>
                            <Link
                              href={`/admin/employees/${c.employeeId}`}
                              className="text-slate-600 hover:underline"
                            >
                              {nameById.get(c.employeeId) ?? c.employeeCode}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-md border px-2 py-0.5 text-xs font-semibold ${meta.badge}`}
                    >
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-slate-500">{meta.note}</p>
                    {r.status === "shortage" && (
                      <Link
                        href={`/admin/employees?officeId=${r.officeId}`}
                        className="mt-1 inline-block text-xs font-medium text-slate-700 hover:underline"
                      >
                        この拠点の職員を見て相談員を設定する →
                      </Link>
                    )}
                    {r.status === "unexpected" && r.counselors[0] && (
                      <Link
                        href={`/admin/employees/${r.counselors[0].employeeId}/edit`}
                        className="mt-1 inline-block text-xs font-medium text-slate-700 hover:underline"
                      >
                        職種を見直す →
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        ※ 相談員の職種設定は、各職員の「職種」を「生活相談員」にすると反映されます。自動作成では
        相談員の配置を強制せず、ここで設定された職種をもとに過不足を表示します。
      </p>
    </div>
  );
}
