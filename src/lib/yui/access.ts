/**
 * 結いナビの「だれが何を見て / 直してよいか」。docs/growth-review.md §2
 * DB に触らない純粋な関数だけを置く (テスト: access.test.ts)。
 *
 * - 社長 (president = admin): 全職員・全記録
 * - 管理者 (manager): 担当 (職員の managerId が自分) の職員と、その記録。社長の確認 (処遇) は見られない
 * - 職員 (staff): 自分の分だけ。社長の確認は本人向けの項目 (育成方針・社長コメント 等) だけ
 */
import type { PresidentReview, Staff } from "@/yui/types";

import type { YuiActor, YuiKind, YuiSnapshot } from "./types";

/** 担当者名の表示などに使う、他人の最小限の情報 */
export function publicStaff(s: Staff): Staff {
  return {
    id: s.id,
    name: s.name,
    department: s.department,
    jobType: s.jobType,
    titleLabel: s.titleLabel,
    joinedAt: "",
    employmentType: s.employmentType,
    employmentStatus: s.employmentStatus,
    role: s.role,
    managerId: null,
    active: s.active,
  };
}

/** 管理者の部署 (主所属 + 兼務) */
export function managerDepartments(m: Staff | null | undefined): string[] {
  if (!m) return [];
  return [m.department, ...(m.secondaryDepartments ?? [])];
}

/**
 * 管理者が「職員追加 → クロスシフトの職員から選ぶ」で自分の担当にできる人:
 * 同じ部署の在籍中の職員で、まだ担当管理者が決まっていない人
 */
export function isClaimable(manager: Staff | null | undefined, s: Staff): boolean {
  return (
    s.role === "staff" &&
    s.active &&
    !s.managerId &&
    managerDepartments(manager).includes(s.department)
  );
}

/** 選ぶ欄に出す情報 (メモ・担当などは渡さない) */
export function claimableStaff(s: Staff): Staff {
  return {
    ...publicStaff(s),
    furigana: s.furigana,
    kinjiroCode: s.kinjiroCode,
    secondaryDepartments: s.secondaryDepartments,
    position: s.position,
    joinedAt: s.joinedAt,
    returnDate: s.returnDate,
    retirementDate: s.retirementDate,
    qualifications: s.qualifications,
    growthStep: s.growthStep,
  };
}

/** 職員本人に見せる社長の確認 (処遇・メモは渡さない) */
export function reviewForStaff(r: PresidentReview): PresidentReview {
  return {
    id: r.id,
    staffId: r.staffId,
    period: r.period,
    reviewedAt: r.reviewedAt,
    presidentMemo: "",
    finalNote: "",
    compensationNote: "",
    status: r.status,
    talentPotential: r.talentPotential,
    nextAssignmentTags: r.nextAssignmentTags,
    developmentPolicy: r.developmentPolicy,
    presidentMessage: r.presidentMessage,
  };
}

/** 全データから、その人が見てよい範囲だけを切り出す */
export function scopeSnapshot(actor: YuiActor, all: YuiSnapshot): YuiSnapshot {
  if (actor.role === "president") return { ...all, meId: actor.staffId };

  const me = all.staff.find((s) => s.id === actor.staffId);
  const visible = new Set<string>([actor.staffId]);
  if (actor.role === "manager") {
    for (const s of all.staff) if (s.managerId === actor.staffId) visible.add(s.id);
  }
  const mine = <T extends { staffId: string }>(list: T[]) =>
    list.filter((x) => visible.has(x.staffId));

  const staff: Staff[] = [];
  for (const s of all.staff) {
    if (visible.has(s.id)) staff.push(s);
    else if (actor.role === "manager" && isClaimable(me, s)) staff.push(claimableStaff(s));
    else if (
      // 担当者名・担当者の選択肢に出す人
      s.role !== "staff" ||
      (me?.managerId && s.id === me.managerId)
    )
      staff.push(publicStaff(s));
  }

  return {
    meId: actor.staffId,
    staff,
    staffInterviews: mine(all.staffInterviews),
    managerInterviews: mine(all.managerInterviews),
    presidentReviews: actor.role === "staff" ? mine(all.presidentReviews).map(reviewForStaff) : [],
    periods: all.periods,
    growthExpectations: mine(all.growthExpectations),
    growthPaths: mine(all.growthPaths),
    hrAssessments: mine(all.hrAssessments),
  };
}

export interface WriteContext {
  /** 保存しようとしている記録の対象職員 (DB 上の今の値)。新しい職員なら null */
  target: Staff | null;
  /** 同じ ID の記録が DB にあればその対象職員 ID と種類 */
  existing: { kind: string; staffId: string | null } | null;
  /** (職員, 期間) の管理者面談がすでにあるか */
  managerInterviewExists?: boolean;
  /** 保存する人 (管理者のときだけ。部署の確認に使う) */
  actorStaff?: Staff | null;
}

/** 保存してよいか。だめなら理由 (画面に出す) を返す */
export function checkWrite(
  actor: YuiActor,
  kind: YuiKind,
  item: { id: string; staffId?: string } & Record<string, unknown>,
  ctx: WriteContext,
): string | null {
  const deny = "この職員の記録を保存する権限がありません";
  const staffId = kind === "staff" ? item.id : (item.staffId ?? null);

  // 別の人・別の種類の記録を ID で上書きさせない
  if (ctx.existing) {
    if (ctx.existing.kind !== kind) return deny;
    if (kind !== "staff" && kind !== "period" && ctx.existing.staffId !== staffId) return deny;
  }

  if (actor.role === "president") return null;

  if (kind === "period" || kind === "presidentReview") return deny;

  if (actor.role === "staff") {
    if (staffId !== actor.staffId) return deny;
    if (kind === "staffInterview") return null;
    // 面談シートを出したときに、担当管理者の面談の空の枠だけ作れる (結いナビの動き)
    if (kind === "managerInterview") {
      if (ctx.existing || ctx.managerInterviewExists) return deny;
      const empty = ["strength", "issue", "expectation", "followUp"].every((k) => !item[k]);
      if (!empty || item.status === "done" || item.interviewedAt) return deny;
      if (!ctx.target?.managerId || item.managerId !== ctx.target.managerId) return deny;
      return null;
    }
    return deny;
  }

  // 管理者
  if (kind === "staff") {
    if (ctx.target) {
      // 同じ部署で担当が決まっていない職員を、自分の担当にする (職員追加 → クロスシフトの職員から選ぶ)
      const claiming = ctx.target.managerId == null && isClaimable(ctx.actorStaff, ctx.target);
      if (claiming) {
        if (item.role !== "staff" || item.managerId !== actor.staffId) return deny;
        return null;
      }
      if (ctx.target.managerId !== actor.staffId) return deny;
      if (ctx.target.role !== "staff" || item.role !== "staff") return deny;
      return null;
    }
    // 職員追加: 自分の担当として登録するときだけ
    if (item.role !== "staff" || item.managerId !== actor.staffId) return deny;
    return null;
  }
  if (kind === "staffInterview") return deny;
  if (!ctx.target || ctx.target.managerId !== actor.staffId) return deny;
  return null;
}
