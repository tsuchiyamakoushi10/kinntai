/**
 * 1 か月運用シミュレーション用のデモデータ生成。
 *
 * - 対象月の全平日 (土日除く) に各従業員のシフトを割り当てる
 *   - 週所定 5 日以上のフルタイム → DAY (08:15-17:15)
 *   - 週所定 3〜4 日のパート → HALF_D (08:15-12:00)、稼働日は週前半に詰める
 *   - 土日は OFF
 * - asOf より過去日付の出勤シフトには、定時 ± 3 分の打刻と 12:00-13:00 の
 *   休憩 1 件 (DAY のみ) を生成する
 * - 雇い入れ日から asOf までに付与されるべき有給を、既存と重複しないよう前倒し
 *
 * 冪等性:
 *  - shifts / attendance_records は @@unique(employeeId, workDate) に対する
 *    upsert なので、再実行で重複しない
 *  - PaidLeaveGrant は planGrantsForEmployee が既存付与日を除外するので安全
 *
 * 決定的乱数:
 *  - 打刻のジッタは `${employeeCode}:${ymd}` をシードにした mulberry32 で生成。
 *    同じシード環境なら何度走らせても同じ値になる。
 */
import { Prisma, PrismaClient } from "@prisma/client";

import {
  currentJstYm,
  fromJstYmd,
  monthRange,
  toJstYmd,
  todayJstYmd,
} from "../../src/lib/attendance/business-date";
import { planGrantsForEmployee, type EmployeeContext } from "../../src/lib/leave/grant-apply";

export type DemoStats = {
  ym: string;
  employeesProcessed: number;
  shiftsUpserted: number;
  attendanceUpserted: number;
  breakRecordsCreated: number;
  leaveGrantsCreated: number;
};

// ---- 決定的乱数 (mulberry32) -------------------------------------------------

function rng32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---- 時刻計算ヘルパ ----------------------------------------------------------

/**
 * JST "ymd HH:MM" 相当の UTC Date を返す。シフトパターンの TIME 列は
 * 1970-01-01 上の UTC 時刻として返ってくる (getUTCHours / Minutes が JST 時間)。
 * 例: HH=06, ymd=2026-05-19 → JST 2026-05-19 06:00 = UTC 2026-05-18 21:00
 */
function jstClockOn(ymd: string, h: number, m: number): Date {
  const [yStr, monStr, dStr] = ymd.split("-");
  return new Date(Date.UTC(Number(yStr), Number(monStr) - 1, Number(dStr), h - 9, m));
}

// ---- メイン ------------------------------------------------------------------

export async function seedDemoMonth(
  prisma: PrismaClient,
  ym: string = currentJstYm(),
  asOf: string = todayJstYmd(),
): Promise<DemoStats> {
  const range = monthRange(ym);

  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });
  if (!admin)
    throw new Error("ADMIN ユーザーが見つかりません。先に `pnpm db:seed` を実行してください。");

  const employees = await prisma.employee.findMany({
    where: { retiredAt: null },
    orderBy: { employeeCode: "asc" },
    select: {
      id: true,
      employeeCode: true,
      officeId: true,
      weeklyWorkDays: true,
      dailyWorkHours: true,
      hiredAt: true,
      paidLeaveGrants: {
        where: { grantType: "STATUTORY" },
        select: { grantedOn: true },
      },
    },
  });

  const patterns = await prisma.shiftPattern.findMany({
    select: {
      id: true,
      code: true,
      officeId: true,
      shiftKind: true,
      startTime: true,
      endTime: true,
      breakMinutes: true,
    },
  });
  const commonByCode = (code: string) =>
    patterns.find((p) => p.code === code && p.officeId === null);

  type Pattern = (typeof patterns)[number];
  function mustPattern(code: string): Pattern {
    const p = commonByCode(code);
    if (!p) throw new Error(`共通シフトパターン (${code}) が seed されていません。`);
    return p;
  }
  const DAY = mustPattern("DAY");
  const HALF = mustPattern("HALF_D");
  const OFF = mustPattern("OFF");

  function pickPattern(weeklyWorkDays: number, dow: number): Pattern {
    // dow: 0=Sun, 1=Mon, ..., 6=Sat
    if (dow === 0 || dow === 6) return OFF;
    if (weeklyWorkDays >= 5) return DAY;
    // パート: 月曜から targetDays 日だけ稼働 (HALF_D)、それ以降は休み
    const targetDays = Math.max(1, Math.min(5, Math.floor(weeklyWorkDays)));
    return dow - 1 < targetDays ? HALF : OFF;
  }

  // ---- 1. 有給付与 ----------------------------------------------------------
  let leaveGrantsCreated = 0;
  for (const emp of employees) {
    const wkDays = emp.weeklyWorkDays.toNumber();
    const dailyHours = emp.dailyWorkHours.toNumber();
    const ctx: EmployeeContext = {
      id: emp.id,
      hiredOn: toJstYmd(emp.hiredAt),
      retiredOn: null,
      weeklyWorkDays: wkDays,
      weeklyWorkHours: wkDays * dailyHours,
    };
    const existing = emp.paidLeaveGrants.map((g) => toJstYmd(g.grantedOn));
    const plans = planGrantsForEmployee(ctx, asOf, existing);
    if (plans.length === 0) continue;
    await prisma.paidLeaveGrant.createMany({
      data: plans.map((p) => ({
        employeeId: p.employeeId,
        grantedOn: fromJstYmd(p.grantedOn),
        expiresOn: fromJstYmd(p.expiresOn),
        grantedDays: new Prisma.Decimal(p.grantedDays),
        grantType: "STATUTORY" as const,
      })),
    });
    leaveGrantsCreated += plans.length;
  }

  // ---- 2. シフト + 打刻 -----------------------------------------------------
  let shiftsUpserted = 0;
  let attendanceUpserted = 0;
  let breakRecordsCreated = 0;

  for (const emp of employees) {
    const wkDays = emp.weeklyWorkDays.toNumber();
    for (const ymd of range.days) {
      const date = fromJstYmd(ymd);
      const dow = date.getUTCDay();
      const pattern = pickPattern(wkDays, dow);

      await prisma.shift.upsert({
        where: { employeeId_workDate: { employeeId: emp.id, workDate: date } },
        create: {
          employeeId: emp.id,
          officeId: emp.officeId,
          workDate: date,
          shiftPatternId: pattern.id,
          createdBy: admin.id,
          updatedBy: admin.id,
        },
        update: {
          shiftPatternId: pattern.id,
          updatedBy: admin.id,
        },
      });
      shiftsUpserted++;

      if (ymd > asOf) continue;
      if (pattern.shiftKind !== "WORK") continue;
      if (!pattern.startTime || !pattern.endTime) continue;

      const isToday = ymd === asOf;

      const seed = hashStr(`${emp.employeeCode}:${ymd}`);
      const rnd = rng32(seed);
      const jitterIn = Math.floor((rnd() - 0.5) * 6); // ±3 分

      // 当日は打刻パターンを 3 通りに分岐させる: 退勤済 30% / 勤務中 50% / 未出勤 20%
      // (ダッシュボードの「勤務中 / 退勤済」表示を活かすため)
      type TodayState = "checked_out" | "working" | "not_started";
      const todayState: TodayState | null = isToday
        ? rnd() < 0.3
          ? "checked_out"
          : rnd() < 0.7
            ? "working"
            : "not_started"
        : null;
      if (todayState === "not_started") continue;

      const jitterOut = Math.floor((rnd() - 0.5) * 6);
      const clockIn = jstClockOn(
        ymd,
        pattern.startTime.getUTCHours(),
        pattern.startTime.getUTCMinutes() + jitterIn,
      );
      const includeClockOut = todayState !== "working";
      const clockOut = includeClockOut
        ? jstClockOn(
            ymd,
            pattern.endTime.getUTCHours(),
            pattern.endTime.getUTCMinutes() + jitterOut,
          )
        : null;

      const attendance = await prisma.attendanceRecord.upsert({
        where: { employeeId_workDate: { employeeId: emp.id, workDate: date } },
        create: {
          employeeId: emp.id,
          officeId: emp.officeId,
          workDate: date,
          shiftPatternId: pattern.id,
          clockInAt: clockIn,
          clockOutAt: clockOut,
          status: "OPEN",
        },
        update: {
          clockInAt: clockIn,
          clockOutAt: clockOut,
          shiftPatternId: pattern.id,
        },
        select: { id: true },
      });
      attendanceUpserted++;

      // 60 分以上の break_minutes を持つパターンには 12:00-13:00 の休憩を 1 件付与。
      // 退勤未済 (= 当日勤務中) には休憩を入れない。
      // 既存があれば触らない (= 親をたどって件数で判定)。
      if (pattern.breakMinutes >= 60 && includeClockOut) {
        const existing = await prisma.breakRecord.count({
          where: { attendanceRecordId: attendance.id },
        });
        if (existing === 0) {
          const breakStart = jstClockOn(ymd, 12, 0);
          const breakEnd = jstClockOn(ymd, 13, 0);
          await prisma.breakRecord.create({
            data: {
              attendanceRecordId: attendance.id,
              breakStartAt: breakStart,
              breakEndAt: breakEnd,
            },
          });
          breakRecordsCreated++;
        }
      }
    }
  }

  return {
    ym,
    employeesProcessed: employees.length,
    shiftsUpserted,
    attendanceUpserted,
    breakRecordsCreated,
    leaveGrantsCreated,
  };
}
