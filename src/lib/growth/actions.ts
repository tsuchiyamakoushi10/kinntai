"use server";

/**
 * 育成面談・人事考課の保存・削除。docs/growth-review.md
 *
 * どの Action も入口で権限を確かめる (URL / fetch 直打ちで担当外を触れないように)。
 * 画面側は src/components/growth/growth-form.tsx から FormData で呼ぶ。
 */
import { Prisma, type EvalRank, type GrowthStep } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { parseDateInputValue } from "@/lib/format";

import { checkStaffAccess, getGrowthActor } from "./access";
import {
  BONUS_REASON_OPTIONS,
  DEVELOPMENT_RANK_OPTIONS,
  EXPECTATION_LEVEL_OPTIONS,
  EXPECTED_ROLE_OPTIONS,
  HR_ITEMS,
  NEXT_ASSIGNMENT_OPTIONS,
  SALARY_REASON_OPTIONS,
  SHEET_FIELDS,
  TALENT_POTENTIAL_OPTIONS,
} from "./constants";
import {
  canEditAssessment,
  canEditSheet,
  checkAssessmentSubmit,
  checkFinalConfirm,
  checkPeriod,
  parseRank,
  parseStep,
  parseYen,
  pickOption,
  pickOptions,
  type Ranks,
} from "./logic";

export type GrowthActionResult = { ok: true; message?: string } | { ok: false; error: string };

const NO_ACCESS: GrowthActionResult = {
  ok: false,
  error: "この職員の記録は開けません。画面を開き直してください。",
};

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function ranksFrom(fd: FormData): Ranks {
  return Object.fromEntries(HR_ITEMS.map((i) => [i.key, parseRank(fd.get(i.key))])) as Ranks;
}

function refresh(): void {
  revalidatePath("/me", "layout");
  revalidatePath("/admin/growth", "layout");
}

async function periodExists(periodId: string): Promise<boolean> {
  if (!periodId) return false;
  return (await prisma.evaluationPeriod.count({ where: { id: periodId } })) > 0;
}

// ---------------------------------------------------------------------------
// 面談シート (職員本人)
// ---------------------------------------------------------------------------

export async function saveMySheet(fd: FormData): Promise<GrowthActionResult> {
  const actor = await getGrowthActor();
  if (!actor?.employeeId) return { ok: false, error: "ログインし直してください。" };
  const employeeId = actor.employeeId;
  const periodId = str(fd, "periodId");
  if (!(await periodExists(periodId))) return { ok: false, error: "期間が見つかりません。" };
  const submit = str(fd, "intent") === "submit";

  const record = await prisma.interviewRecord.findUnique({
    where: { employeeId_periodId: { employeeId, periodId } },
    select: { status: true },
  });
  if (!canEditSheet(record?.status)) {
    return {
      ok: false,
      error: "面談が終わったため、もう直せません。直したいときは担当者に伝えてください。",
    };
  }

  const values = Object.fromEntries(SHEET_FIELDS.map((f) => [f.key, str(fd, f.key)])) as Record<
    (typeof SHEET_FIELDS)[number]["key"],
    string
  >;
  if (submit && SHEET_FIELDS.every((f) => values[f.key] === "")) {
    return { ok: false, error: "1つ以上書いてから出してください。" };
  }
  const existing = await prisma.interviewSheet.findUnique({
    where: { employeeId_periodId: { employeeId, periodId } },
    select: { submittedAt: true },
  });
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { officeId: true },
  });
  const submittedAt = submit ? new Date() : (existing?.submittedAt ?? null);
  await prisma.interviewSheet.upsert({
    where: { employeeId_periodId: { employeeId, periodId } },
    create: { employeeId, periodId, officeId: employee?.officeId ?? null, ...values, submittedAt },
    update: { ...values, submittedAt },
  });
  refresh();
  return { ok: true, message: submit ? "面談シートを出しました。" : "書きかけを保存しました。" };
}

/** 面談シートを消す (担当者・社長) */
export async function deleteSheet(
  employeeId: string,
  periodId: string,
): Promise<GrowthActionResult> {
  if (!(await checkStaffAccess(employeeId))) return NO_ACCESS;
  await prisma.interviewSheet.deleteMany({ where: { employeeId, periodId } });
  refresh();
  return { ok: true, message: "面談シートを消しました。" };
}

/** 本人が出した面談シートを書きかけに戻す (担当者・社長)。本人がもう一度直せるようにする */
export async function reopenSheet(
  employeeId: string,
  periodId: string,
): Promise<GrowthActionResult> {
  if (!(await checkStaffAccess(employeeId))) return NO_ACCESS;
  await prisma.interviewSheet.updateMany({
    where: { employeeId, periodId },
    data: { submittedAt: null },
  });
  refresh();
  return { ok: true, message: "面談シートを書きかけに戻しました。" };
}

// ---------------------------------------------------------------------------
// STEP・期待目標 (担当者・社長)
// ---------------------------------------------------------------------------

/** いまの STEP = いちばん新しい履歴。履歴が無ければ未設定 */
async function syncCurrentStep(tx: Prisma.TransactionClient, employeeId: string): Promise<void> {
  const latest = await tx.growthStepHistory.findFirst({
    where: { employeeId },
    orderBy: [{ changedOn: "desc" }, { createdAt: "desc" }],
    select: { step: true },
  });
  const growthStep: GrowthStep | null = latest?.step ?? null;
  await tx.growthProfile.upsert({
    where: { employeeId },
    create: { employeeId, growthStep },
    update: { growthStep },
  });
}

export async function saveStepHistory(fd: FormData): Promise<GrowthActionResult> {
  const employeeId = str(fd, "employeeId");
  if (!(await checkStaffAccess(employeeId))) return NO_ACCESS;
  const step = parseStep(fd.get("step"));
  const changedOn = parseDateInputValue(str(fd, "changedOn"));
  if (!step) return { ok: false, error: "STEP を選んでください。" };
  if (!changedOn) return { ok: false, error: "日付を入れてください。" };
  const note = str(fd, "note") || null;
  const historyId = str(fd, "historyId");

  await prisma.$transaction(async (tx) => {
    if (historyId) {
      await tx.growthStepHistory.updateMany({
        where: { id: historyId, employeeId },
        data: { step, changedOn, note },
      });
    } else {
      await tx.growthStepHistory.create({ data: { employeeId, step, changedOn, note } });
    }
    await syncCurrentStep(tx, employeeId);
  });
  refresh();
  return { ok: true, message: historyId ? "STEP の記録を直しました。" : "STEP を記録しました。" };
}

export async function deleteStepHistory(
  employeeId: string,
  historyId: string,
): Promise<GrowthActionResult> {
  if (!(await checkStaffAccess(employeeId))) return NO_ACCESS;
  await prisma.$transaction(async (tx) => {
    await tx.growthStepHistory.deleteMany({ where: { id: historyId, employeeId } });
    await syncCurrentStep(tx, employeeId);
  });
  refresh();
  return { ok: true, message: "STEP の記録を消しました。" };
}

/** 今期の期待目標。空で保存すると消す */
export async function saveExpectation(fd: FormData): Promise<GrowthActionResult> {
  const employeeId = str(fd, "employeeId");
  const periodId = str(fd, "periodId");
  if (!(await checkStaffAccess(employeeId))) return NO_ACCESS;
  if (!(await periodExists(periodId))) return { ok: false, error: "期間が見つかりません。" };
  const content = str(fd, "content");
  const key = { employeeId_periodId: { employeeId, periodId } };
  if (content === "") {
    await prisma.growthExpectation.deleteMany({ where: { employeeId, periodId } });
    refresh();
    return { ok: true, message: "期待目標を消しました。" };
  }
  await prisma.growthExpectation.upsert({
    where: key,
    create: { employeeId, periodId, content },
    update: { content },
  });
  refresh();
  return { ok: true, message: "期待目標を保存しました。" };
}

// ---------------------------------------------------------------------------
// 面談記録 (担当者・社長)
// ---------------------------------------------------------------------------

export async function saveInterviewRecord(fd: FormData): Promise<GrowthActionResult> {
  const employeeId = str(fd, "employeeId");
  const periodId = str(fd, "periodId");
  const access = await checkStaffAccess(employeeId);
  if (!access) return NO_ACCESS;
  if (!(await periodExists(periodId))) return { ok: false, error: "期間が見つかりません。" };
  const done = str(fd, "intent") === "done";
  const interviewedOnRaw = str(fd, "interviewedOn");
  const interviewedOn = interviewedOnRaw ? parseDateInputValue(interviewedOnRaw) : null;
  if (interviewedOnRaw && !interviewedOn) return { ok: false, error: "面談日を読み取れません。" };
  if (done && !interviewedOn) return { ok: false, error: "完了にするには面談日を入れてください。" };

  const data = {
    interviewedOn,
    strength: str(fd, "strength"),
    issue: str(fd, "issue"),
    expectation: str(fd, "expectation"),
    followUp: str(fd, "followUp"),
    expectedRoles: pickOptions(fd.getAll("expectedRoles"), EXPECTED_ROLE_OPTIONS),
    supportPlan: str(fd, "supportPlan"),
    currentStep: parseStep(fd.get("currentStep")),
    nextStep: parseStep(fd.get("nextStep")),
    status: done ? ("DONE" as const) : ("IN_PROGRESS" as const),
    interviewerId: access.actor.userId,
  };
  await prisma.interviewRecord.upsert({
    where: { employeeId_periodId: { employeeId, periodId } },
    create: { employeeId, periodId, officeId: access.officeId, ...data },
    update: data,
  });
  refresh();
  return { ok: true, message: done ? "面談記録を完了にしました。" : "面談記録を保存しました。" };
}

export async function deleteInterviewRecord(
  employeeId: string,
  periodId: string,
): Promise<GrowthActionResult> {
  if (!(await checkStaffAccess(employeeId))) return NO_ACCESS;
  await prisma.interviewRecord.deleteMany({ where: { employeeId, periodId } });
  refresh();
  return { ok: true, message: "面談記録を消しました。" };
}

// ---------------------------------------------------------------------------
// 一次考課 (担当者・社長)
// ---------------------------------------------------------------------------

async function finalStatusOf(employeeId: string, periodId: string) {
  return (
    await prisma.hrFinalAssessment.findUnique({
      where: { employeeId_periodId: { employeeId, periodId } },
      select: { status: true },
    })
  )?.status;
}

export async function saveAssessment(fd: FormData): Promise<GrowthActionResult> {
  const employeeId = str(fd, "employeeId");
  const periodId = str(fd, "periodId");
  const access = await checkStaffAccess(employeeId);
  if (!access) return NO_ACCESS;
  if (!(await periodExists(periodId))) return { ok: false, error: "期間が見つかりません。" };
  if (!canEditAssessment(await finalStatusOf(employeeId, periodId))) {
    return { ok: false, error: "社長の最終考課が確定しているため直せません。" };
  }
  const submit = str(fd, "intent") === "submit";
  const ranks = ranksFrom(fd);
  if (submit) {
    const errors = checkAssessmentSubmit(ranks);
    if (errors.length > 0) return { ok: false, error: errors.join("／") };
  }
  const data = {
    ...ranks,
    userCenteredActionEvidence: str(fd, "userCenteredActionEvidence"),
    respectfulInteractionEvidence: str(fd, "respectfulInteractionEvidence"),
    teamworkEvidence: str(fd, "teamworkEvidence"),
    initiativeImprovementEvidence: str(fd, "initiativeImprovementEvidence"),
    responsibilityEvidence: str(fd, "responsibilityEvidence"),
    overallComment: str(fd, "overallComment"),
    status: submit ? ("SUBMITTED" as const) : ("DRAFT" as const),
    submittedAt: submit ? new Date() : null,
    assessorId: access.actor.userId,
  };
  await prisma.hrAssessment.upsert({
    where: { employeeId_periodId: { employeeId, periodId } },
    create: { employeeId, periodId, officeId: access.officeId, ...data },
    update: data,
  });
  refresh();
  return { ok: true, message: submit ? "社長へ提出しました。" : "下書きを保存しました。" };
}

export async function deleteAssessment(
  employeeId: string,
  periodId: string,
): Promise<GrowthActionResult> {
  if (!(await checkStaffAccess(employeeId))) return NO_ACCESS;
  if (!canEditAssessment(await finalStatusOf(employeeId, periodId))) {
    return { ok: false, error: "社長の最終考課が確定しているため消せません。" };
  }
  await prisma.hrAssessment.deleteMany({ where: { employeeId, periodId } });
  refresh();
  return { ok: true, message: "一次考課を消しました。" };
}

// ---------------------------------------------------------------------------
// 最終考課・面談確認 (社長のみ)
// ---------------------------------------------------------------------------

async function presidentAccess(employeeId: string) {
  const access = await checkStaffAccess(employeeId);
  return access && access.actor.role === "ADMIN" ? access : null;
}

export async function saveFinalAssessment(fd: FormData): Promise<GrowthActionResult> {
  const employeeId = str(fd, "employeeId");
  const periodId = str(fd, "periodId");
  const access = await presidentAccess(employeeId);
  if (!access) return NO_ACCESS;
  if (!(await periodExists(periodId))) return { ok: false, error: "期間が見つかりません。" };
  const intent = str(fd, "intent");

  if (intent === "reopen") {
    await prisma.hrFinalAssessment.updateMany({
      where: { employeeId, periodId },
      data: { status: "DRAFT", confirmedAt: null },
    });
    refresh();
    return { ok: true, message: "確定を取り消しました。一次考課も直せるようになります。" };
  }

  const ranks = ranksFrom(fd);
  const overallRank: EvalRank | null = parseRank(fd.get("overallRank"));
  const changeReason = str(fd, "changeReason");
  const confirm = intent === "confirm";
  if (confirm) {
    const primary = await prisma.hrAssessment.findUnique({
      where: { employeeId_periodId: { employeeId, periodId } },
    });
    const primaryRanks = primary
      ? (Object.fromEntries(HR_ITEMS.map((i) => [i.key, primary[i.key]])) as Ranks)
      : null;
    const errors = checkFinalConfirm(primaryRanks, ranks, overallRank, changeReason);
    if (errors.length > 0) return { ok: false, error: errors.join("／") };
  }
  const data = {
    ...ranks,
    overallRank,
    changeReason,
    comment: str(fd, "comment"),
    status: confirm ? ("CONFIRMED" as const) : ("DRAFT" as const),
    confirmedAt: confirm ? new Date() : null,
  };
  await prisma.hrFinalAssessment.upsert({
    where: { employeeId_periodId: { employeeId, periodId } },
    create: { employeeId, periodId, officeId: access.officeId, ...data },
    update: data,
  });
  refresh();
  return { ok: true, message: confirm ? "最終考課を確定しました。" : "下書きを保存しました。" };
}

export async function deleteFinalAssessment(
  employeeId: string,
  periodId: string,
): Promise<GrowthActionResult> {
  if (!(await presidentAccess(employeeId))) return NO_ACCESS;
  await prisma.hrFinalAssessment.deleteMany({ where: { employeeId, periodId } });
  refresh();
  return { ok: true, message: "最終考課を消しました。" };
}

export async function saveGrowthReview(fd: FormData): Promise<GrowthActionResult> {
  const employeeId = str(fd, "employeeId");
  const periodId = str(fd, "periodId");
  const access = await presidentAccess(employeeId);
  if (!access) return NO_ACCESS;
  if (!(await periodExists(periodId))) return { ok: false, error: "期間が見つかりません。" };
  const intent = str(fd, "intent");

  if (intent === "reopen") {
    await prisma.growthReview.updateMany({
      where: { employeeId, periodId },
      data: { status: "DRAFT", confirmedAt: null },
    });
    refresh();
    return { ok: true, message: "確定を取り消しました。" };
  }

  const yen: Record<string, number | null> = {};
  for (const [key, label] of [
    ["prevBaseSalary", "前期の基本給"],
    ["currentBaseSalary", "今期の基本給"],
    ["prevBonus", "前期の賞与"],
    ["currentBonus", "今期の賞与"],
  ] as const) {
    const v = parseYen(fd.get(key));
    if (v === undefined) return { ok: false, error: `${label}は数字で入れてください。` };
    yen[key] = v;
  }
  const needsFollowUp = fd.get("needsFollowUp") === "on";
  const followUpReason = str(fd, "followUpReason");
  const confirm = intent === "confirm";
  if (confirm && needsFollowUp && followUpReason === "") {
    return { ok: false, error: "フォローが必要な理由を書いてください。" };
  }
  const data = {
    presidentMemo: str(fd, "presidentMemo"),
    needsFollowUp,
    followUpReason,
    expectationLevel: pickOption(fd.get("expectationLevel"), EXPECTATION_LEVEL_OPTIONS),
    developmentRank: pickOption(fd.get("developmentRank"), DEVELOPMENT_RANK_OPTIONS),
    talentPotential: pickOption(fd.get("talentPotential"), TALENT_POTENTIAL_OPTIONS),
    futureRole: str(fd, "futureRole"),
    lackingSkills: str(fd, "lackingSkills"),
    nextAssignmentTags: pickOptions(fd.getAll("nextAssignmentTags"), NEXT_ASSIGNMENT_OPTIONS),
    nextAssignments: str(fd, "nextAssignments"),
    developmentPolicy: str(fd, "developmentPolicy"),
    prevBaseSalary: yen.prevBaseSalary,
    currentBaseSalary: yen.currentBaseSalary,
    prevBonus: yen.prevBonus,
    currentBonus: yen.currentBonus,
    salaryReasons: pickOptions(fd.getAll("salaryReasons"), SALARY_REASON_OPTIONS),
    bonusReasons: pickOptions(fd.getAll("bonusReasons"), BONUS_REASON_OPTIONS),
    compensationReason: str(fd, "compensationReason"),
    presidentMessage: str(fd, "presidentMessage"),
    status: confirm ? ("CONFIRMED" as const) : ("DRAFT" as const),
    confirmedAt: confirm ? new Date() : null,
  };
  await prisma.growthReview.upsert({
    where: { employeeId_periodId: { employeeId, periodId } },
    create: { employeeId, periodId, officeId: access.officeId, ...data },
    update: data,
  });
  refresh();
  return { ok: true, message: confirm ? "面談確認を確定しました。" : "下書きを保存しました。" };
}

export async function deleteGrowthReview(
  employeeId: string,
  periodId: string,
): Promise<GrowthActionResult> {
  if (!(await presidentAccess(employeeId))) return NO_ACCESS;
  await prisma.growthReview.deleteMany({ where: { employeeId, periodId } });
  refresh();
  return { ok: true, message: "面談確認を消しました。" };
}

// ---------------------------------------------------------------------------
// 設定 (社長のみ): 評価期間・部署の管理者・担当の割り当て
// ---------------------------------------------------------------------------

async function isPresident(): Promise<boolean> {
  return (await getGrowthActor())?.role === "ADMIN";
}

const NOT_PRESIDENT: GrowthActionResult = {
  ok: false,
  error: "社長 (管理者) だけが変えられます。",
};

export async function savePeriod(fd: FormData): Promise<GrowthActionResult> {
  if (!(await isPresident())) return NOT_PRESIDENT;
  const input = { name: str(fd, "name"), startOn: str(fd, "startOn"), endOn: str(fd, "endOn") };
  const errors = checkPeriod(input);
  if (errors.length > 0) return { ok: false, error: errors.join("／") };
  const startOn = parseDateInputValue(input.startOn)!;
  const endOn = parseDateInputValue(input.endOn)!;
  const periodId = str(fd, "periodId");
  const makeCurrent = fd.get("isCurrent") === "on";

  await prisma.$transaction(async (tx) => {
    const isFirst = (await tx.evaluationPeriod.count()) === 0;
    if (makeCurrent) {
      await tx.evaluationPeriod.updateMany({
        where: { isCurrent: true },
        data: { isCurrent: false },
      });
    }
    if (periodId) {
      await tx.evaluationPeriod.update({
        where: { id: periodId },
        data: { name: input.name, startOn, endOn, ...(makeCurrent ? { isCurrent: true } : {}) },
      });
    } else {
      await tx.evaluationPeriod.create({
        data: { name: input.name, startOn, endOn, isCurrent: makeCurrent || isFirst },
      });
    }
  });
  refresh();
  return { ok: true, message: periodId ? "期間を直しました。" : "期間を追加しました。" };
}

export async function setCurrentPeriod(periodId: string): Promise<GrowthActionResult> {
  if (!(await isPresident())) return NOT_PRESIDENT;
  if (!(await periodExists(periodId))) return { ok: false, error: "期間が見つかりません。" };
  await prisma.$transaction([
    prisma.evaluationPeriod.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } }),
    prisma.evaluationPeriod.update({ where: { id: periodId }, data: { isCurrent: true } }),
  ]);
  refresh();
  return { ok: true, message: "いまの期間を切り替えました。" };
}

export async function deletePeriod(periodId: string): Promise<GrowthActionResult> {
  if (!(await isPresident())) return NOT_PRESIDENT;
  const where = { periodId };
  const counts = await Promise.all([
    prisma.growthExpectation.count({ where }),
    prisma.interviewSheet.count({ where }),
    prisma.interviewRecord.count({ where }),
    prisma.hrAssessment.count({ where }),
    prisma.hrFinalAssessment.count({ where }),
    prisma.growthReview.count({ where }),
  ]);
  const total = counts.reduce((a, b) => a + b, 0);
  if (total > 0) {
    return {
      ok: false,
      error: `この期間には記録が ${total} 件あるため消せません。先に記録を消してください。`,
    };
  }
  await prisma.evaluationPeriod.deleteMany({ where: { id: periodId } });
  refresh();
  return { ok: true, message: "期間を消しました。" };
}

/** 部署の管理者にする / 職員に戻す。戻すときは担当の割り当ても外す */
export async function setManagerRole(
  employeeId: string,
  makeManager: boolean,
): Promise<GrowthActionResult> {
  if (!(await isPresident())) return NOT_PRESIDENT;
  const user = await prisma.user.findUnique({
    where: { employeeId },
    select: { id: true, role: true },
  });
  if (!user) {
    return {
      ok: false,
      error:
        "この人にはログインがありません。従業員の画面でログインを発行してから設定してください。",
    };
  }
  if (user.role === "ADMIN")
    return { ok: false, error: "管理者 (社長) のアカウントは変えられません。" };
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { role: makeManager ? "MANAGER" : "EMPLOYEE" },
    });
    if (!makeManager) {
      await tx.growthProfile.updateMany({
        where: { managerEmployeeId: employeeId },
        data: { managerEmployeeId: null },
      });
    }
  });
  refresh();
  return {
    ok: true,
    message: makeManager ? "部署の管理者にしました。" : "職員に戻し、担当の割り当てを外しました。",
  };
}

/** 担当の割り当てをまとめて保存。フォームは manager:<職員ID> = <管理者の従業員ID or 空> */
export async function saveAssignments(fd: FormData): Promise<GrowthActionResult> {
  if (!(await isPresident())) return NOT_PRESIDENT;
  const managers = new Set(
    (
      await prisma.user.findMany({
        where: { role: "MANAGER", employeeId: { not: null } },
        select: { employeeId: true },
      })
    ).map((u) => u.employeeId as string),
  );
  const rows: { employeeId: string; managerEmployeeId: string | null }[] = [];
  for (const [key, value] of fd.entries()) {
    if (!key.startsWith("manager:") || typeof value !== "string") continue;
    const employeeId = key.slice("manager:".length);
    const managerEmployeeId = value === "" ? null : value;
    if (managerEmployeeId && !managers.has(managerEmployeeId)) {
      return {
        ok: false,
        error: "部署の管理者ではない人が選ばれています。画面を開き直してください。",
      };
    }
    if (managerEmployeeId === employeeId) {
      return { ok: false, error: "自分自身を担当にはできません。" };
    }
    rows.push({ employeeId, managerEmployeeId });
  }
  try {
    await prisma.$transaction(
      rows.map((r) =>
        prisma.growthProfile.upsert({
          where: { employeeId: r.employeeId },
          create: r,
          update: { managerEmployeeId: r.managerEmployeeId },
        }),
      ),
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return { ok: false, error: "見つからない職員が含まれています。画面を開き直してください。" };
    }
    throw e;
  }
  refresh();
  return { ok: true, message: "担当の割り当てを保存しました。" };
}
