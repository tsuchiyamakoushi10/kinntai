"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { todayJstDate } from "@/lib/attendance/business-date";
import { findRelevantAttendance, type RelevantAttendance } from "@/lib/attendance/lookup";
import {
  canPunch,
  deriveState,
  isDebouncing,
  type PunchAction,
  type PunchState,
} from "@/lib/attendance/punch";
import { requireSession } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";

const PUNCH_ACTIONS = ["CLOCK_IN", "CLOCK_OUT", "BREAK_START", "BREAK_END"] as const;

function isPunchAction(v: unknown): v is PunchAction {
  return typeof v === "string" && (PUNCH_ACTIONS as readonly string[]).includes(v);
}

/** /me?err=... に error メッセージを載せて戻す。redirect は内部で throw する。 */
function fail(message: string): never {
  redirect(`/me?err=${encodeURIComponent(message)}`);
}

/**
 * 打刻 Server Action。`<form action={punch}>` から hidden の "action" で
 * 種別を受け取り、状態マシン (deriveState/canPunch) と連打防止を経て DB を更新する。
 *
 * 1 タップ完結が要件なので確認ダイアログは出さない。不整合は赤バナーで返す。
 */
export async function punch(formData: FormData): Promise<void> {
  // ---- Phase 1: 入力 + 認証 + 状態取得（ここでは DB への書き込みはしない） ----
  const rawAction = formData.get("action");
  if (!isPunchAction(rawAction)) fail("不明な打刻種別です。");
  const action: PunchAction = rawAction;

  const session = await requireSession();
  const employeeId = session.user.employeeId;
  if (!employeeId) fail("従業員情報が紐づいていないため打刻できません。");

  const now = new Date();
  const todayDate = todayJstDate(now);

  const attendance = await findRelevantAttendance(employeeId, todayDate);
  const state = deriveState(attendance, attendance?.breakRecords ?? []);
  if (!canPunch(state, action)) fail(stateMismatchMessage(state, action));

  const lastSame = lastSameKindAt(attendance, action);
  if (lastSame && isDebouncing({ lastPunchAt: lastSame, lastSameKindAt: lastSame }, now)) {
    fail("直前の打刻から少し時間を置いてください。");
  }

  // CLOCK_IN だけは employee の office / 退職状態を取り直す必要がある。
  let officeId: string | null = null;
  if (action === "CLOCK_IN") {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { officeId: true, retiredAt: true },
    });
    if (!employee) fail("従業員情報が見つかりませんでした。");
    if (employee.retiredAt) fail("退職処理済のため打刻できません。");
    officeId = employee.officeId;
  }

  // BREAK_END の対象 break_record は事前に確定させる（try 内で fail を投げないため）。
  let openBreakId: string | null = null;
  if (action === "BREAK_END" && attendance) {
    const openBreak = attendance.breakRecords.find((b) => b.breakEndAt === null);
    if (!openBreak) fail("進行中の休憩が見つかりませんでした。");
    openBreakId = openBreak.id;
  }

  // ---- Phase 2: DB 書き込み。redirect を投げると catch されるので fail は使わない ----
  let duplicate = false;
  try {
    if (action === "CLOCK_IN") {
      await prisma.attendanceRecord.create({
        data: {
          employeeId,
          // CLOCK_IN ブランチで officeId は必ず設定済。
          officeId: officeId as string,
          workDate: todayDate,
          clockInAt: now,
        },
      });
    } else if (attendance) {
      if (action === "CLOCK_OUT") {
        await prisma.attendanceRecord.update({
          where: { id: attendance.id },
          data: { clockOutAt: now },
        });
      } else if (action === "BREAK_START") {
        await prisma.breakRecord.create({
          data: { attendanceRecordId: attendance.id, breakStartAt: now },
        });
      } else {
        // BREAK_END
        await prisma.breakRecord.update({
          where: { id: openBreakId as string },
          data: { breakEndAt: now },
        });
      }
    }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      duplicate = true;
    } else {
      throw e;
    }
  }

  if (duplicate) fail("今日の出勤打刻はすでに登録されています。");

  revalidatePath("/me");
}

/**
 * 状態と希望アクションが合わない場合の現場向け文言。
 * 専門用語を避け、次にすべき操作のヒントを混ぜる。
 */
function stateMismatchMessage(state: PunchState, action: PunchAction): string {
  if (action === "CLOCK_IN") {
    if (state === "WORKING") return "すでに出勤打刻されています。";
    if (state === "ON_BREAK") return "休憩中です。先に「休憩終了」を押してください。";
    if (state === "FINISHED") {
      return "今日はすでに退勤打刻されています。修正は管理者へ連絡してください。";
    }
  }
  if (action === "CLOCK_OUT") {
    if (state === "NONE") return "まだ出勤打刻がありません。";
    if (state === "ON_BREAK") return "休憩中です。先に「休憩終了」を押してください。";
    if (state === "FINISHED") return "すでに退勤打刻されています。";
  }
  if (action === "BREAK_START" && state !== "WORKING") {
    return "勤務中ではないので休憩を開始できません。";
  }
  if (action === "BREAK_END" && state !== "ON_BREAK") {
    return "休憩中ではありません。";
  }
  return "今は打刻できません。";
}

/**
 * 同種打刻の直近時刻。debounce 判定に渡す。BREAK_END は「休憩終了の時刻」、
 * BREAK_START は「直近の休憩開始時刻」を返す。
 */
function lastSameKindAt(attendance: RelevantAttendance, action: PunchAction): Date | null {
  if (!attendance) return null;
  switch (action) {
    case "CLOCK_IN":
      return attendance.clockInAt;
    case "CLOCK_OUT":
      return attendance.clockOutAt;
    case "BREAK_START": {
      const last = attendance.breakRecords.at(-1);
      return last?.breakStartAt ?? null;
    }
    case "BREAK_END": {
      // 後ろから走査して直近の「終了済み」休憩を拾う
      for (let i = attendance.breakRecords.length - 1; i >= 0; i--) {
        const b = attendance.breakRecords[i];
        if (b?.breakEndAt) return b.breakEndAt;
      }
      return null;
    }
  }
}
