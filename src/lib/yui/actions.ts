"use server";

/**
 * 結いナビの保存 (画面のメモリを書き換えたあと、裏で呼ばれる)。docs/growth-review.md
 * 画面から来た値は信用せず、ログイン中の人・DB 上の担当関係で毎回確かめる。
 */
import { Prisma } from "@prisma/client";

import { signOut } from "@/auth";
import { prisma } from "@/lib/db";
import type { Staff } from "@/yui/types";

import { checkWrite } from "./access";
import {
  defaultManagerId,
  employeeToStaff,
  employmentTypeToDb,
  jobCategoryFromJobType,
  officeIdForDepartment,
  profileFromStaff,
  splitName,
  statusToDb,
  type StaffProfileData,
} from "./mapping";
import { getYuiActor, loadAllStaff, loadStaff, todayJst, toEmployeeRow } from "./server";
import { YUI_RECORD_KINDS, type SaveResult, type YuiKind, type YuiRecordKind } from "./types";

type Item = { id: string; staffId?: string } & Record<string, unknown>;

function isItem(v: unknown): v is Item {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Item).id === "string" &&
    (v as Item).id.length > 0
  );
}

export async function yuiLogout(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

export async function saveYuiItem(kind: YuiKind, raw: unknown): Promise<SaveResult> {
  try {
    const actor = await getYuiActor();
    if (!actor) return { ok: false, error: "ログインし直してください" };
    if (kind !== "staff" && !(YUI_RECORD_KINDS as readonly string[]).includes(kind)) {
      return { ok: false, error: "保存できない種類です" };
    }
    if (!isItem(raw)) return { ok: false, error: "入力内容が正しくありません" };
    const item = raw;

    const targetId =
      kind === "staff" ? item.id : typeof item.staffId === "string" ? item.staffId : null;
    if (kind !== "period" && !targetId) return { ok: false, error: "職員が指定されていません" };
    const target = targetId ? await loadStaff(targetId) : null;
    if (kind !== "period" && kind !== "staff" && !target)
      return { ok: false, error: "職員が見つかりません" };

    let existing: { kind: string; staffId: string | null } | null = null;
    let managerInterviewExists = false;
    if (kind === "staff") {
      existing = target ? { kind: "staff", staffId: target.id } : null;
    } else {
      const row = await prisma.yuiRecord.findUnique({
        where: { id: item.id },
        select: { kind: true, staffId: true },
      });
      existing = row;
      if (kind === "managerInterview" && typeof item.period === "string" && targetId) {
        managerInterviewExists =
          (await prisma.yuiRecord.count({
            where: { kind: "managerInterview", staffId: targetId, period: item.period },
          })) > 0;
      }
    }

    const actorStaff = actor.role === "manager" ? await loadStaff(actor.staffId) : null;
    const denied = checkWrite(actor, kind, item, {
      target,
      existing,
      managerInterviewExists,
      actorStaff,
    });
    if (denied) return { ok: false, error: denied };

    if (kind === "staff") {
      // 管理者が担当未定の職員を自分の担当にするときは、画面に渡していない項目 (メモ等) を消さない
      const claiming = actor.role === "manager" && !!target && !target.managerId;
      return await saveStaff(item as unknown as Staff, target, claiming);
    }
    return await saveRecord(kind, item, target);
  } catch (e) {
    // 個人情報を出さないよう、エラーの種類だけ記録する
    console.error("[yui] save failed", kind, e instanceof Error ? e.name : typeof e);
    return { ok: false, error: "保存中にエラーが起きました" };
  }
}

async function saveRecord(
  kind: YuiRecordKind,
  item: Item,
  target: Staff | null,
): Promise<SaveResult> {
  let officeId: string | null = null;
  if (target) {
    const emp = await prisma.employee.findUnique({
      where: { id: target.id },
      select: { officeId: true },
    });
    officeId = emp?.officeId ?? null;
  }
  const data = item as unknown as Prisma.InputJsonValue;
  const period = typeof item.period === "string" ? item.period : null;
  await prisma.$transaction(async (tx) => {
    // 「いまの期間」は 1 つだけ
    if (kind === "period" && item.active === true) {
      const others = await tx.yuiRecord.findMany({
        where: { kind: "period", NOT: { id: item.id } },
      });
      for (const o of others) {
        const d = o.data as Record<string, unknown>;
        if (d.active) {
          await tx.yuiRecord.update({
            where: { id: o.id },
            data: { data: { ...d, active: false } },
          });
        }
      }
    }
    await tx.yuiRecord.upsert({
      where: { id: item.id },
      create: { id: item.id, kind, staffId: target?.id ?? null, period, officeId, data },
      update: { staffId: target?.id ?? null, period, officeId, data },
    });
  });
  return { ok: true };
}

/** クロスシフトの従業員画面と同じ採番 (E + 4 桁の連番) */
async function nextEmployeeCode(tx: Prisma.TransactionClient): Promise<string> {
  const last = await tx.employee.findFirst({
    where: { employeeCode: { startsWith: "E" } },
    orderBy: { employeeCode: "desc" },
    select: { employeeCode: true },
  });
  const lastNum = last ? Number.parseInt(last.employeeCode.slice(1), 10) : 0;
  const next = Number.isFinite(lastNum) ? lastNum + 1 : 1;
  return `E${String(next).padStart(4, "0")}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 職員の保存。氏名・フリガナ・入社日・在籍は従業員マスタへ書き戻し、
 * それ以外は yui_staff_profiles に入れる。従業員マスタから作れる初期値と同じ項目は保存しない
 * (クロスシフト側で直したときに追従させるため)。
 */
async function saveStaff(
  input: Staff,
  current: Staff | null,
  keepHidden = false,
): Promise<SaveResult> {
  // 管理者マスターで「無効」にした管理者は、管理者から外す (職員に戻す)
  const s: Staff =
    input.role === "manager" && input.active === false
      ? { ...input, role: "staff", active: current?.active ?? true }
      : input;
  if (typeof s.name !== "string" || !s.name.trim())
    return { ok: false, error: "氏名を入力してください" };

  // 従業員に紐づかない社長アカウント
  if (current && current.role === "president") {
    const isEmployee = await prisma.employee.count({ where: { id: s.id } });
    if (!isEmployee) {
      const profile = profileFromStaff(s, true);
      await prisma.yuiStaffProfile.upsert({
        where: { id: s.id },
        create: { id: s.id, data: profile as Prisma.InputJsonValue },
        update: { data: profile as Prisma.InputJsonValue },
      });
      return { ok: true };
    }
  }

  const [last, first] = splitName(s.name);
  const [lastKana, firstKana] = s.furigana?.trim() ? splitName(s.furigana) : [null, null];
  const joinedAt = s.joinedAt ? new Date(`${s.joinedAt}T00:00:00Z`) : null;
  const status = statusToDb(s.employmentStatus, s.retirementDate);

  const allStaff = await loadAllStaff();

  await prisma.$transaction(async (tx) => {
    if (current) {
      await tx.employee.update({
        where: { id: s.id },
        data: {
          lastName: last,
          firstName: first,
          lastNameKana: lastKana,
          firstNameKana: firstKana,
          ...(joinedAt ? { joinedAt } : {}),
          employmentStatus: status.employmentStatus,
          retiredAt: status.retiredAt,
        },
      });
    } else {
      // 新しい職員: クロスシフトの「従業員の新規登録」と同じ形で作る
      // (社員番号は E0001 形式で自動採番、主所属の拠点配属も作る。ログイン ID は従業員画面で発行)
      if (!UUID_RE.test(s.id)) throw new Error("bad id");
      const offices = await tx.office.findMany({ select: { id: true, name: true } });
      const officeId = officeIdForDepartment(s.department, offices);
      const type = employmentTypeToDb(s.employmentType);
      await tx.employee.create({
        data: {
          id: s.id,
          employeeCode: await nextEmployeeCode(tx),
          lastName: last,
          firstName: first,
          lastNameKana: lastKana,
          firstNameKana: firstKana,
          joinedAt,
          officeId,
          jobCategory: jobCategoryFromJobType(s.jobType),
          employmentType: type.employmentType,
          nightShiftOnly: type.nightShiftOnly,
          employmentStatus: status.employmentStatus,
          retiredAt: status.retiredAt,
          notes: "結いナビの職員追加で登録",
        },
      });
      if (officeId) {
        await tx.employeeOfficeAssignment.create({
          data: { employeeId: s.id, officeId, role: "PRIMARY" },
        });
      }
    }

    // 管理者にする / 外す (社長だけが通る。access.ts)。
    // ログイン権限と、従業員マスタの「管理者」チェック (シフト用) を両方そろえる
    const user = await tx.user.findUnique({
      where: { employeeId: s.id },
      select: { id: true, role: true },
    });
    if (user?.role !== "ADMIN" && s.role !== "president") {
      const isMgr = s.role === "manager";
      if (user) {
        const role = isMgr ? "MANAGER" : "EMPLOYEE";
        if (user.role !== role) await tx.user.update({ where: { id: user.id }, data: { role } });
      }
      await tx.employee.update({ where: { id: s.id }, data: { isManager: isMgr } });
    }

    // 従業員マスタから作れる値と同じものは保存しない
    const emp = await tx.employee.findUniqueOrThrow({
      where: { id: s.id },
      select: {
        id: true,
        employeeCode: true,
        lastName: true,
        firstName: true,
        lastNameKana: true,
        firstNameKana: true,
        jobCategory: true,
        employmentType: true,
        nightShiftOnly: true,
        isManager: true,
        joinedAt: true,
        employmentStatus: true,
        retiredAt: true,
        office: { select: { name: true } },
        user: { select: { role: true, email: true, isActive: true } },
      },
    });
    const base = employeeToStaff(toEmployeeRow(emp), {}, todayJst());
    const profile: StaffProfileData = profileFromStaff(s, false);
    if (keepHidden) {
      const prev = await tx.yuiStaffProfile.findUnique({ where: { id: s.id } });
      const p = (prev?.data ?? {}) as StaffProfileData;
      if (p.managerMemo && !profile.managerMemo) profile.managerMemo = p.managerMemo;
      if (p.email && !profile.email) profile.email = p.email;
    }
    if (profile.department === base.department) delete profile.department;
    if (profile.jobType === base.jobType) delete profile.jobType;
    if (profile.employmentType === base.employmentType) delete profile.employmentType;
    if (profile.email && profile.email === base.email) delete profile.email;
    // 担当管理者が「同じ部署の管理者」(初期値) と同じなら保存しない (部署や管理者が変わったら追従させる)
    if (
      (profile.managerId ?? null) ===
      defaultManagerId(
        s,
        allStaff.map((x) => (x.id === s.id ? s : x)),
      )
    ) {
      delete profile.managerId;
    }
    await tx.yuiStaffProfile.upsert({
      where: { id: s.id },
      create: { id: s.id, data: profile as Prisma.InputJsonValue },
      update: { data: profile as Prisma.InputJsonValue },
    });
  });
  return { ok: true };
}
