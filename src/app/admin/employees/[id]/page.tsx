import { EmploymentStatus, Prisma } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { toJstYmd } from "@/lib/attendance/business-date";
import {
  judgeRetirementAllowance,
  type RetirementAllowanceJudgment,
} from "@/lib/contract/retirement-allowance";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import {
  DOCUMENT_TYPE_LABELS,
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  JOB_CATEGORY_LABELS,
  QUALIFICATION_TYPE_LABELS,
  TRAINING_TYPE_LABELS,
  WAGE_TYPE_LABELS,
} from "@/lib/employee-labels";
import { ATTENDANCE_ENABLED } from "@/lib/feature-flags";
import { formatDate, formatYen } from "@/lib/format";
import { projectAnnualIncome, type IncomeProjectionResult } from "@/lib/shift/income-projection";
import { createSignedToken } from "@/lib/storage";

import {
  clearEmployeeTabletPin,
  setEmployeeTabletPin,
  unretireEmployee,
  type TabletPinFormState,
} from "../actions";
import { DEFAULT_INITIAL_PASSWORD } from "../constants";
import { upsertShiftConstraint } from "./constraints/actions";
import { ConstraintForm } from "./constraints/constraint-form";
import { deleteEmployeeDocument, uploadEmployeeDocument } from "./documents/actions";
import { DocumentUploadForm } from "./documents/upload-form";
import { TabletPinForm } from "./tablet-pin-form";
import { createTrainingRecord, deleteTrainingRecord } from "./trainings/actions";
import { TrainingForm } from "./trainings/training-form";

export const dynamic = "force-dynamic";

type Tab = "basic" | "contracts" | "documents" | "trainings" | "constraints";
const TABS: { value: Tab; label: string }[] = [
  { value: "basic", label: "基本情報" },
  { value: "contracts", label: "雇用契約" },
  { value: "documents", label: "書類" },
  { value: "trainings", label: "研修" },
  { value: "constraints", label: "制約・希望" },
];

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; tab?: string }>;
};

export default async function EmployeeDetailPage({ params, searchParams }: Props) {
  await requireAdmin();
  const { id } = await params;
  const { created, tab: tabRaw } = await searchParams;
  const tab: Tab =
    tabRaw === "contracts"
      ? "contracts"
      : tabRaw === "documents"
        ? "documents"
        : tabRaw === "trainings"
          ? "trainings"
          : tabRaw === "constraints"
            ? "constraints"
            : "basic";

  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      office: { select: { id: true, code: true, name: true } },
      user: { select: { email: true, pinCodeHash: true } },
      qualifications: { orderBy: { acquiredOn: "asc" } },
      employmentContracts: { orderBy: { contractStartOn: "desc" } },
      documents: {
        where: { deletedAt: null },
        orderBy: { uploadedAt: "desc" },
      },
      trainingRecords: {
        orderBy: { trainedOn: "desc" },
        include: {
          documents: {
            where: { deletedAt: null },
            select: { id: true, title: true, fileName: true, mimeType: true },
          },
        },
      },
      shiftConstraint: true,
    },
  });
  if (!employee) notFound();

  // 制約タブで使う見込み年収算出用に、今年分のシフト + 現在の時給契約を取得する。
  const currentYear = new Date().getFullYear();
  const yearStart = new Date(Date.UTC(currentYear, 0, 1));
  const yearEnd = new Date(Date.UTC(currentYear + 1, 0, 1));
  const [yearShifts, currentContract] = await Promise.all([
    prisma.shift.findMany({
      where: {
        employeeId: id,
        workDate: { gte: yearStart, lt: yearEnd },
      },
      select: {
        workDate: true,
        shiftPattern: {
          select: {
            startTime: true,
            endTime: true,
            crossesMidnight: true,
            breakMinutes: true,
          },
        },
      },
    }),
    prisma.employmentContract.findFirst({
      where: {
        employeeId: id,
        contractStartOn: { lte: new Date() },
        OR: [{ contractEndOn: null }, { contractEndOn: { gte: new Date() } }],
      },
      orderBy: { contractStartOn: "desc" },
      select: { id: true, wageType: true, wageAmount: true },
    }),
  ]);

  const projection = projectAnnualIncome({
    year: currentYear,
    hourlyWageYen: currentContract?.wageType === "HOURLY" ? currentContract.wageAmount : null,
    capYen: employee.shiftConstraint?.annualIncomeCapYen ?? null,
    shifts: yearShifts.map((s) => ({
      workDate: toJstYmd(s.workDate),
      pattern: {
        startTime: dateToHm(s.shiftPattern.startTime),
        endTime: dateToHm(s.shiftPattern.endTime),
        crossesMidnight: s.shiftPattern.crossesMidnight,
        breakMinutes: s.shiftPattern.breakMinutes,
      },
    })),
  });

  const fullName = `${employee.lastName} ${employee.firstName}`;
  const fullKana = `${employee.lastNameKana} ${employee.firstNameKana}`;
  const isRetired = employee.employmentStatus === EmploymentStatus.RETIRED;
  const unretireAction = unretireEmployee.bind(null, employee.id);

  const retirementJudgment = judgeRetirementAllowance(
    employee.employmentContracts.map((c) => ({
      employmentType: c.employmentType,
      contractStartOn: c.contractStartOn,
      contractEndOn: c.contractEndOn,
      retirementAllowanceEligible: c.retirementAllowanceEligible,
    })),
  );

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="ぱんくず" className="text-sm text-slate-500">
        <Link href="/admin/employees" className="hover:underline">
          従業員
        </Link>
        <span className="mx-1">/</span>
        <span className="text-slate-700">{fullName}</span>
      </nav>

      {created === "1" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <p className="font-semibold">登録が完了しました。</p>
          <p className="mt-1">
            初期パスワードは <span className="font-mono">{DEFAULT_INITIAL_PASSWORD}</span>{" "}
            です。本人にメールアドレスと合わせて伝え、初回ログイン後に変更してもらってください。
          </p>
        </div>
      )}

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{fullName}</h1>
            <StatusChip status={employee.employmentStatus} />
          </div>
          <p className="text-sm text-slate-500">
            {fullKana}
            <span className="ml-3 font-mono text-xs text-slate-400">{employee.employeeCode}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isRetired && (
            <Link
              href={`/admin/employees/${employee.id}/retire`}
              className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
            >
              退職処理
            </Link>
          )}
          {isRetired && (
            <form action={unretireAction}>
              <button
                type="submit"
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
              >
                復職する
              </button>
            </form>
          )}
          <Link
            href={`/admin/employees/${employee.id}/edit`}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
          >
            編集
          </Link>
        </div>
      </header>

      <nav aria-label="詳細タブ" className="border-b border-slate-200">
        <ul className="-mb-px flex gap-1">
          {TABS.map((t) => {
            const active = t.value === tab;
            return (
              <li key={t.value}>
                <Link
                  href={`/admin/employees/${employee.id}?tab=${t.value}`}
                  className={
                    active
                      ? "inline-block border-b-2 border-slate-900 px-4 py-2 text-sm font-semibold text-slate-900"
                      : "inline-block border-b-2 border-transparent px-4 py-2 text-sm text-slate-500 hover:text-slate-700"
                  }
                >
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {tab === "basic" && (
        <BasicTab
          employee={employee}
          isRetired={isRetired}
          setPinAction={setEmployeeTabletPin.bind(null, employee.id)}
          clearPinAction={clearEmployeeTabletPin.bind(null, employee.id)}
        />
      )}

      {tab === "contracts" && (
        <ContractsTab
          employeeId={employee.id}
          contracts={employee.employmentContracts}
          judgment={retirementJudgment}
        />
      )}

      {tab === "documents" && (
        <DocumentsTab
          employeeId={employee.id}
          documents={employee.documents}
          trainingOptions={employee.trainingRecords.map((t) => ({
            id: t.id,
            label: `${formatDate(t.trainedOn)} ${t.trainingName}`,
          }))}
        />
      )}

      {tab === "trainings" && (
        <TrainingsTab employeeId={employee.id} trainings={employee.trainingRecords} />
      )}

      {tab === "constraints" && (
        <ConstraintsTab
          employeeId={employee.id}
          constraint={employee.shiftConstraint}
          desiredNightShiftsPerMonth={employee.desiredNightShiftsPerMonth}
          projection={projection}
          hasHourlyContract={currentContract?.wageType === "HOURLY"}
        />
      )}
    </div>
  );
}

type EmployeeWithRelations = Prisma.EmployeeGetPayload<{
  include: {
    office: { select: { id: true; code: true; name: true } };
    user: { select: { email: true; pinCodeHash: true } };
    qualifications: true;
    employmentContracts: true;
    documents: true;
    trainingRecords: {
      include: {
        documents: { select: { id: true; title: true; fileName: true; mimeType: true } };
      };
    };
    shiftConstraint: true;
  };
}>;

type DocumentRow = EmployeeWithRelations["documents"][number];
type TrainingRow = EmployeeWithRelations["trainingRecords"][number];

function BasicTab({
  employee,
  isRetired,
  setPinAction,
  clearPinAction,
}: {
  employee: EmployeeWithRelations;
  isRetired: boolean;
  setPinAction: (state: TabletPinFormState, formData: FormData) => Promise<TabletPinFormState>;
  clearPinAction: () => Promise<void>;
}) {
  const fullName = `${employee.lastName} ${employee.firstName}`;
  const fullKana = `${employee.lastNameKana} ${employee.firstNameKana}`;
  const weeklyTotal =
    employee.weeklyWorkDays !== null && employee.dailyWorkHours !== null
      ? Math.round(Number(employee.weeklyWorkDays) * Number(employee.dailyWorkHours) * 10) / 10
      : 0;
  const hasTabletPin = !!employee.user?.pinCodeHash;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="基本情報">
        <InfoRow label="氏名" value={fullName} />
        <InfoRow label="フリガナ" value={fullKana} />
        <InfoRow label="生年月日" value={formatDate(employee.birthDate)} />
      </Card>

      <Card title="連絡先">
        <InfoRow label="メール" value={employee.user?.email ?? "—"} />
        <InfoRow label="電話" value={employee.phone ?? "—"} />
      </Card>

      <Card title="所属">
        <InfoRow
          label="拠点"
          value={
            employee.office ? (
              <span>
                {employee.office.name}
                <span className="ml-2 font-mono text-xs text-slate-500">
                  {employee.office.code}
                </span>
              </span>
            ) : (
              <span className="text-slate-400">未設定</span>
            )
          }
        />
        <InfoRow
          label="職種"
          value={employee.jobCategory ? JOB_CATEGORY_LABELS[employee.jobCategory] : "未設定"}
        />
        <InfoRow
          label="雇用形態"
          value={
            employee.employmentType ? EMPLOYMENT_TYPE_LABELS[employee.employmentType] : "未設定"
          }
        />
      </Card>

      <Card title="現在の雇用条件">
        <InfoRow label="入社日" value={formatDate(employee.joinedAt)} />
        <InfoRow label="雇い入れ日" value={formatDate(employee.hiredAt)} />
        {isRetired && (
          <>
            <InfoRow label="退職日" value={formatDate(employee.retiredAt)} />
            <InfoRow label="退職理由" value={employee.retirementReason ?? "—"} />
          </>
        )}
        <InfoRow
          label="勤務条件"
          value={
            employee.weeklyWorkDays !== null && employee.dailyWorkHours !== null
              ? `週 ${Number(employee.weeklyWorkDays)} 日 × 1 日 ${Number(employee.dailyWorkHours)} 時間（週合計 約 ${weeklyTotal} 時間）`
              : "未設定"
          }
        />
      </Card>

      <Card title="給与">
        <InfoRow
          label="給与形態"
          value={employee.baseWageType ? WAGE_TYPE_LABELS[employee.baseWageType] : "未設定"}
        />
        <InfoRow
          label="基本給"
          value={employee.baseWageAmount !== null ? formatYen(employee.baseWageAmount) : "未設定"}
        />
      </Card>

      <Card title="保有資格">
        {employee.qualifications.length === 0 ? (
          <p className="text-sm text-slate-500">登録された資格はありません。</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {employee.qualifications.map((q) => (
              <li key={q.id} className="flex items-center justify-between">
                <span>{QUALIFICATION_TYPE_LABELS[q.qualificationType]}</span>
                <span className="text-xs text-slate-500">取得 {formatDate(q.acquiredOn)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {ATTENDANCE_ENABLED && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-800">共有タブレット打刻</h2>
          <div className="mt-3">
            <TabletPinForm
              hasPin={hasTabletPin}
              setAction={setPinAction}
              clearAction={clearPinAction}
            />
          </div>
        </section>
      )}
    </div>
  );
}

function ContractsTab({
  employeeId,
  contracts,
  judgment,
}: {
  employeeId: string;
  contracts: ContractRow[];
  judgment: RetirementAllowanceJudgment;
}) {
  const today = new Date();
  const current = contracts.find(
    (c) =>
      c.contractStartOn !== null &&
      c.contractStartOn.getTime() <= today.getTime() &&
      (c.contractEndOn === null || c.contractEndOn.getTime() >= today.getTime()),
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">雇用契約履歴</h2>
        <Link
          href={`/admin/employees/${employeeId}/contracts/new`}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          ＋ 新規契約
        </Link>
      </header>

      {current && (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <h3 className="text-sm font-semibold text-emerald-900">現在有効な契約</h3>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <InfoRow
              label="契約期間"
              value={`${formatDate(current.contractStartOn)} 〜 ${
                current.contractEndOn ? formatDate(current.contractEndOn) : "無期"
              }`}
            />
            <InfoRow
              label="雇用形態"
              value={
                current.employmentType ? EMPLOYMENT_TYPE_LABELS[current.employmentType] : "未設定"
              }
            />
            <InfoRow
              label="勤務条件"
              value={
                current.workingDaysPerWeek !== null && current.workingHoursPerDay !== null
                  ? `週 ${Number(current.workingDaysPerWeek)} 日 × ${Number(current.workingHoursPerDay)} 時間`
                  : "未設定"
              }
            />
            <InfoRow
              label="賃金"
              value={
                current.wageType && current.wageAmount !== null
                  ? `${WAGE_TYPE_LABELS[current.wageType]} ${formatYen(current.wageAmount)}`
                  : "未設定"
              }
            />
            <InfoRow
              label="保険"
              value={
                [
                  current.hasEmploymentInsurance ? "雇用保険" : null,
                  current.hasSocialInsurance ? "社会保険" : null,
                ]
                  .filter(Boolean)
                  .join(" / ") || "—"
              }
            />
            <InfoRow
              label="更新"
              value={
                current.isRenewable
                  ? `更新あり (既往 ${current.renewalCount} 回${
                      current.hasRenewalLimit ? ` / 上限 ${current.renewalLimitCount} 回` : ""
                    })`
                  : "更新なし"
              }
            />
          </dl>
        </section>
      )}

      <RetirementAllowanceCard judgment={judgment} />

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">契約期間</th>
              <th className="px-4 py-3 font-medium">雇用形態</th>
              <th className="px-4 py-3 font-medium">勤務条件</th>
              <th className="px-4 py-3 font-medium">賃金</th>
              <th className="px-4 py-3 font-medium">退職金</th>
              <th className="px-4 py-3 font-medium">助成金</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {contracts.map((c) => (
              <tr key={c.id} className="text-slate-700">
                <td className="px-4 py-3">
                  <div>{formatDate(c.contractStartOn)} 〜</div>
                  <div className="text-xs text-slate-500">
                    {c.contractEndOn ? formatDate(c.contractEndOn) : "無期"}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {c.employmentType ? EMPLOYMENT_TYPE_LABELS[c.employmentType] : "—"}
                </td>
                <td className="px-4 py-3 text-xs">
                  {c.workingDaysPerWeek !== null && c.workingHoursPerDay !== null
                    ? `週 ${Number(c.workingDaysPerWeek)} 日 × ${Number(c.workingHoursPerDay)} 時間`
                    : "—"}
                </td>
                <td className="px-4 py-3 text-xs">
                  {c.wageType && c.wageAmount !== null
                    ? `${WAGE_TYPE_LABELS[c.wageType]} ${formatYen(c.wageAmount)}`
                    : "—"}
                </td>
                <td className="px-4 py-3 text-xs">
                  {c.retirementAllowanceEligible === null
                    ? "自動判定"
                    : c.retirementAllowanceEligible
                      ? "対象"
                      : "対象外"}
                </td>
                <td className="px-4 py-3 text-xs">
                  {c.careerSubsidyTarget ? "対象として記録" : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <a
                      href={`/admin/employees/${employeeId}/contracts/${c.id}/pdf?type=notice`}
                      target="_blank"
                      rel="noopener"
                      className="text-sm text-slate-700 hover:underline"
                    >
                      通知書 PDF
                    </a>
                    <Link
                      href={`/admin/employees/${employeeId}/contracts/${c.id}/edit`}
                      className="text-sm text-slate-700 hover:underline"
                    >
                      編集
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {contracts.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  まだ雇用契約が登録されていません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function RetirementAllowanceCard({ judgment }: { judgment: RetirementAllowanceJudgment }) {
  const years = Math.floor(judgment.fullTimeTotalDays / 365);
  const remainder = judgment.fullTimeTotalDays - years * 365;
  const finalLabel = judgment.finalEligible ? "対象" : "対象外";
  const tone = judgment.finalEligible ? "emerald" : "slate";

  return (
    <section
      className={
        tone === "emerald"
          ? "rounded-xl border border-emerald-200 bg-emerald-50 p-5"
          : "rounded-xl border border-slate-200 bg-slate-50 p-5"
      }
    >
      <h3 className="text-sm font-semibold text-slate-900">退職金 通算判定</h3>
      <p className="mt-1 text-xs text-slate-600">
        正社員として通算 3 年 (1095 日) で対象になります。判定値は最新契約の手動設定が優先されます。
      </p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <InfoRow
          label="正社員通算"
          value={`${judgment.fullTimeTotalDays} 日（約 ${years} 年 ${remainder} 日）`}
        />
        <InfoRow label="自動判定" value={judgment.autoEligible ? "対象" : "対象外"} />
        <InfoRow
          label="手動上書き"
          value={
            judgment.manualOverride === null
              ? "なし"
              : judgment.manualOverride
                ? "対象に確定"
                : "対象外に確定"
          }
        />
        <InfoRow label="最終判定" value={finalLabel} />
      </dl>
    </section>
  );
}

/**
 * Prisma の `@db.Time(0)` カラムは JS では 1970-01-01 を起点とした Date になる。
 * 130 万見込み計算は "HH:MM" 文字列を期待するため、UTC ベースで取り出して整形する。
 */
function dateToHm(d: Date | null): string | null {
  if (!d) return null;
  const hh = d.getUTCHours().toString().padStart(2, "0");
  const mm = d.getUTCMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      <dl className="mt-3 flex flex-col gap-2 text-sm">{children}</dl>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right text-slate-900">{value}</dd>
    </div>
  );
}

function StatusChip({ status }: { status: EmploymentStatus }) {
  const cls = "rounded-full px-2 py-0.5 text-xs";
  if (status === EmploymentStatus.ACTIVE) {
    return (
      <span className={`${cls} bg-emerald-50 text-emerald-700`}>
        {EMPLOYMENT_STATUS_LABELS[status]}
      </span>
    );
  }
  if (status === EmploymentStatus.ON_LEAVE) {
    return (
      <span className={`${cls} bg-amber-50 text-amber-700`}>
        {EMPLOYMENT_STATUS_LABELS[status]}
      </span>
    );
  }
  return (
    <span className={`${cls} bg-slate-100 text-slate-600`}>{EMPLOYMENT_STATUS_LABELS[status]}</span>
  );
}

type ContractRow = EmployeeWithRelations["employmentContracts"][number];

const DOC_EXPIRY_WARN_DAYS = 30;

function DocumentsTab({
  employeeId,
  documents,
  trainingOptions,
}: {
  employeeId: string;
  documents: DocumentRow[];
  trainingOptions: ReadonlyArray<{ id: string; label: string }>;
}) {
  // Server Action を Client Component に渡すときは `.bind` または直接参照のみ。
  // アロー関数のラッパは Next.js から「ただの関数」と判定されエラーになる。
  const uploadAction = uploadEmployeeDocument.bind(null, employeeId);

  const today = new Date();
  const warnBefore = new Date(today);
  warnBefore.setDate(warnBefore.getDate() + DOC_EXPIRY_WARN_DAYS);

  return (
    <div className="flex flex-col gap-6">
      <DocumentUploadForm action={uploadAction} trainingOptions={trainingOptions} />

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">登録済み書類</h3>
          <span className="text-xs text-slate-500">{documents.length} 件</span>
        </header>

        {documents.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            まだ書類が登録されていません。上のフォームからアップロードしてください。
          </p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">種別 / 名称</th>
                <th className="px-4 py-3 font-medium">ファイル</th>
                <th className="px-4 py-3 font-medium">有効期限</th>
                <th className="px-4 py-3 font-medium">登録</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {documents.map((d) => {
                // 署名 URL は描画のたびに再発行する (HTML に残っても 5 分で失効)
                const token = createSignedToken(d.id);
                const href = `/api/employee-documents/${d.id}/download?token=${encodeURIComponent(token)}`;
                const expiresSoon =
                  d.expiresOn !== null && d.expiresOn.getTime() <= warnBefore.getTime();
                const expired = d.expiresOn !== null && d.expiresOn.getTime() < today.getTime();
                const deleteAction = deleteEmployeeDocument.bind(null, employeeId, d.id);

                return (
                  <tr key={d.id} className="text-slate-700">
                    <td className="px-4 py-3">
                      <div className="text-xs text-slate-500">
                        {DOCUMENT_TYPE_LABELS[d.documentType]}
                      </div>
                      <div className="font-medium">{d.title}</div>
                      {d.notes && <div className="mt-1 text-xs text-slate-500">{d.notes}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      <div className="break-all">{d.fileName}</div>
                      <div className="text-slate-400">
                        {Math.round(d.fileSize / 1024).toLocaleString()} KB
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {d.expiresOn ? (
                        <span
                          className={
                            expired
                              ? "rounded-full bg-red-50 px-2 py-0.5 text-red-700"
                              : expiresSoon
                                ? "rounded-full bg-amber-50 px-2 py-0.5 text-amber-700"
                                : "text-slate-700"
                          }
                        >
                          {formatDate(d.expiresOn)}
                          {expired && " (期限切れ)"}
                          {!expired && expiresSoon && " (まもなく期限)"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDate(d.uploadedAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <a href={href} className="text-sm text-slate-700 hover:underline">
                          ダウンロード
                        </a>
                        <form action={deleteAction}>
                          <button type="submit" className="text-sm text-red-600 hover:underline">
                            削除
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <p className="text-xs text-slate-500">
        ダウンロード操作は監査ログ (document_access_logs) に記録されます。署名 URL は 5
        分で失効します。
      </p>
    </div>
  );
}

const EMPTY_TRAINING_VALUES = {
  trainingName: "",
  trainingType: "PAID_SELF",
  costYen: "",
  trainedOn: "",
  notes: "",
} as const;

function TrainingsTab({ employeeId, trainings }: { employeeId: string; trainings: TrainingRow[] }) {
  const createAction = createTrainingRecord.bind(null, employeeId);
  const totalCost = trainings.reduce((acc, t) => acc + (t.costYen ?? 0), 0);
  const selfPaidCost = trainings
    .filter((t) => t.trainingType === "PAID_SELF")
    .reduce((acc, t) => acc + (t.costYen ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-slate-800">研修記録を追加する</h3>
        <TrainingForm
          action={createAction}
          initial={EMPTY_TRAINING_VALUES}
          submitLabel="登録する"
          resetOnSuccess
        />
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">研修記録</h3>
          <div className="flex gap-4 text-xs text-slate-500">
            <span>
              合計 <span className="font-mono text-slate-700">{trainings.length}</span> 件
            </span>
            <span>
              費用合計 <span className="font-mono text-slate-700">{formatYen(totalCost)}</span>
            </span>
            <span>
              本人負担 <span className="font-mono text-slate-700">{formatYen(selfPaidCost)}</span>
            </span>
          </div>
        </header>

        {trainings.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            まだ研修記録が登録されていません。上のフォームから登録してください。
          </p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">研修日</th>
                <th className="px-4 py-3 font-medium">研修名</th>
                <th className="px-4 py-3 font-medium">種別</th>
                <th className="px-4 py-3 font-medium">費用</th>
                <th className="px-4 py-3 font-medium">修了証</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {trainings.map((t) => {
                const deleteAction = deleteTrainingRecord.bind(null, employeeId, t.id);
                return (
                  <tr key={t.id} className="text-slate-700">
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDate(t.trainedOn)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{t.trainingName}</div>
                      {t.notes && <div className="mt-1 text-xs text-slate-500">{t.notes}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs">{TRAINING_TYPE_LABELS[t.trainingType]}</td>
                    <td className="px-4 py-3 text-xs tabular-nums">
                      {t.costYen === null ? "—" : formatYen(t.costYen)}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {t.documents.length === 0 ? (
                        <span className="text-slate-400">未登録</span>
                      ) : (
                        <ul className="flex flex-col gap-1">
                          {t.documents.map((d) => (
                            <li key={d.id} className="text-slate-700">
                              {d.title}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          href={`/admin/employees/${employeeId}/trainings/${t.id}/edit`}
                          className="text-sm text-slate-700 hover:underline"
                        >
                          編集
                        </Link>
                        <form action={deleteAction}>
                          <button type="submit" className="text-sm text-red-600 hover:underline">
                            削除
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <p className="text-xs text-slate-500">
        修了証ファイルは「書類」タブで TRAINING_CERT 種別としてアップロードし、研修記録と連携します
        (連携機能は今後拡張)。
      </p>
    </div>
  );
}

type ShiftConstraintRow = NonNullable<EmployeeWithRelations["shiftConstraint"]>;

function ConstraintsTab({
  employeeId,
  constraint,
  desiredNightShiftsPerMonth,
  projection,
  hasHourlyContract,
}: {
  employeeId: string;
  constraint: ShiftConstraintRow | null;
  desiredNightShiftsPerMonth: number | null;
  projection: IncomeProjectionResult;
  hasHourlyContract: boolean;
}) {
  const action = upsertShiftConstraint.bind(null, employeeId);
  const initial = {
    maxMonthlyWorkHours: minutesToHours(constraint?.maxMonthlyWorkMinutes ?? null),
    maxDailyWorkHours: minutesToHours(constraint?.maxDailyWorkMinutes ?? null),
    maxNightShiftsPerMonth: constraint?.maxNightShiftsPerMonth?.toString() ?? "",
    desiredNightShiftsPerMonth: desiredNightShiftsPerMonth?.toString() ?? "",
    allowNightShiftOverride: constraint ? (constraint.allowNightShiftOverride ? "on" : "") : "on",
    targetMonthlyWorkDays: constraint?.targetMonthlyWorkDays?.toString() ?? "",
    annualIncomeCapYen: constraint?.annualIncomeCapYen?.toString() ?? "",
    unavailableDaysOfWeek: (constraint?.unavailableDaysOfWeek ?? []).join(","),
    notes: constraint?.notes ?? "",
  };

  return (
    <div className="flex flex-col gap-6">
      <IncomeProjectionCard projection={projection} hasHourlyContract={hasHourlyContract} />
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-800">個人別シフト制約</h2>
        <ConstraintForm action={action} initial={initial} />
      </section>
    </div>
  );
}

function minutesToHours(minutes: number | null): string {
  if (minutes === null) return "";
  return String(Math.round((minutes / 60) * 10) / 10);
}

function IncomeProjectionCard({
  projection,
  hasHourlyContract,
}: {
  projection: IncomeProjectionResult;
  hasHourlyContract: boolean;
}) {
  if (!hasHourlyContract || projection.projectedIncomeYen === null) {
    return (
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
        <h3 className="text-sm font-semibold text-slate-900">年収見込み ({projection.year} 年)</h3>
        <p className="mt-1 text-xs text-slate-600">
          時給契約ではないため見込み計算をスキップしています。
        </p>
      </section>
    );
  }
  const ratioPct = Math.round((projection.ratio ?? 0) * 100);
  const tone =
    projection.severity === "exceeded"
      ? "rose"
      : projection.severity === "warn"
        ? "amber"
        : "emerald";
  const palette: Record<typeof tone, string> = {
    rose: "border-rose-200 bg-rose-50 text-rose-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
  };
  const label =
    projection.severity === "exceeded"
      ? "上限超過"
      : projection.severity === "warn"
        ? "上限の 80% 超過"
        : "余裕あり";

  return (
    <section className={`rounded-xl border p-5 ${palette[tone]}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">年収見込み ({projection.year} 年)</h3>
        <span className="rounded-full bg-white/60 px-2 py-0.5 text-xs">{label}</span>
      </div>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <InfoRow label="見込み年収" value={formatYen(projection.projectedIncomeYen)} />
        <InfoRow label="年収上限" value={formatYen(projection.effectiveCapYen)} />
        <InfoRow
          label="想定労働時間"
          value={`${Math.round(projection.totalWorkMinutes / 60)} 時間`}
        />
        <InfoRow label="達成率" value={`${ratioPct} %`} />
      </dl>
      <p className="mt-3 text-xs text-slate-700">
        ※ 今年に割当てられたシフト × シフトパターンの労働時間 × 時給で算出。
        未来分のシフトも含まれます。実労働ベースの再計算は Phase 2 で対応します。
      </p>
    </section>
  );
}
