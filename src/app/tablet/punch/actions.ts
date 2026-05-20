"use server";

import { Prisma } from "@prisma/client";
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
import { prisma } from "@/lib/db";
import {
  clearTabletPinSession,
  getTabletOfficeId,
  getTabletPinEmployeeId,
} from "@/lib/tablet/session";

const PUNCH_ACTIONS = ["CLOCK_IN", "CLOCK_OUT", "BREAK_START", "BREAK_END"] as const;

function isPunchAction(v: unknown): v is PunchAction {
  return typeof v === "string" && (PUNCH_ACTIONS as readonly string[]).includes(v);
}

/**
 * 共有タブレットから呼ばれる打刻 Server Action（S-T-04）。
 *
 * /me/actions.ts の `punch` と業務ロジックは同じ。違いは:
 *   - 認証元が Auth.js ではなく PIN cookie。
 *   - 拠点は端末登録 cookie 由来（応援勤務は MVP 範囲外）。
 *   - 成功時は /tablet/done に、失敗時は /tablet/punch?err= に飛ばす。
 *   - 打刻が終わったら PIN cookie を破棄して次の操作で再認証を要求する。
 *
 * TODO(refactor): 「状態確認 + DB 書き込み」のコアは /me 側と共通化したい。
 * 今は両者の遷移先や認可元が異なるため重複を許容している。
 */
export async function punchFromTablet(formData: FormData): Promise<void> {
  const officeId = await getTabletOfficeId();
  if (!officeId) redirect("/tablet/setup");

  const employeeId = await getTabletPinEmployeeId();
  if (!employeeId) {
    // PIN セッションが切れた / そもそも無い → 名前選択からやり直し
    redirect("/tablet");
  }

  const rawAction = formData.get("action");
  if (!isPunchAction(rawAction)) failPunch("不明な打刻種別です。");
  const action: PunchAction = rawAction;

  const now = new Date();
  const todayDate = todayJstDate(now);

  const attendance = await findRelevantAttendance(employeeId, todayDate);
  const state = deriveState(attendance, attendance?.breakRecords ?? []);
  if (!canPunch(state, action)) failPunch(stateMismatchMessage(state, action));

  const lastSame = lastSameKindAt(attendance, action);
  if (lastSame && isDebouncing({ lastPunchAt: lastSame, lastSameKindAt: lastSame }, now)) {
    failPunch("直前の打刻から少し時間を置いてください。");
  }

  // CLOCK_IN だけは従業員と拠点・退職状態の再確認が必要。
  if (action === "CLOCK_IN") {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { officeId: true, retiredAt: true },
    });
    if (!employee) failPunch("従業員情報が見つかりませんでした。");
    if (employee.retiredAt) failPunch("退職処理済のため打刻できません。");
    if (employee.officeId !== officeId) failPunch("この拠点では打刻できません。");
  }

  // BREAK_END の対象 break_record は事前に確定（catch 内で fail を投げないため）。
  let openBreakId: string | null = null;
  if (action === "BREAK_END" && attendance) {
    const openBreak = attendance.breakRecords.find((b) => b.breakEndAt === null);
    if (!openBreak) failPunch("進行中の休憩が見つかりませんでした。");
    openBreakId = openBreak.id;
  }

  let duplicate = false;
  try {
    if (action === "CLOCK_IN") {
      await prisma.attendanceRecord.create({
        data: {
          employeeId,
          officeId,
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

  if (duplicate) failPunch("今日の出勤打刻はすでに登録されています。");

  // 打刻完了。次の人が触る前に PIN セッションを破棄して、完了画面へ。
  await clearTabletPinSession();
  redirect(`/tablet/done?action=${encodeURIComponent(action)}`);
}

function failPunch(message: string): never {
  redirect(`/tablet/punch?err=${encodeURIComponent(message)}`);
}

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
      for (let i = attendance.breakRecords.length - 1; i >= 0; i--) {
        const b = attendance.breakRecords[i];
        if (b?.breakEndAt) return b.breakEndAt;
      }
      return null;
    }
  }
}
