import { describe, expect, it } from "vitest";

import type { Staff } from "@/yui/types";

import { checkWrite, scopeSnapshot } from "./access";
import type { YuiActor, YuiSnapshot } from "./types";

const staff = (id: string, over: Partial<Staff> = {}): Staff => ({
  id,
  name: `職員${id}`,
  department: "デイサービス結いの心",
  jobType: "介護職員",
  joinedAt: "2024-04-01",
  employmentType: "正社員",
  role: "staff",
  managerId: null,
  active: true,
  managerMemo: "メモ",
  ...over,
});

const PRES: YuiActor = { userId: "u0", role: "president", staffId: "p" };
const MGR: YuiActor = { userId: "u1", role: "manager", staffId: "m" };
const STF: YuiActor = { userId: "u2", role: "staff", staffId: "a" };

const all: YuiSnapshot = {
  meId: "",
  staff: [
    staff("p", { role: "president" }),
    staff("m", { role: "manager" }),
    staff("m2", { role: "manager" }),
    staff("a", { managerId: "m" }),
    staff("b", { managerId: "m2" }),
  ],
  staffInterviews: [
    {
      id: "si-a",
      staffId: "a",
      period: "P",
      submittedAt: null,
      effort: "",
      trouble: "",
      growth: "",
      vision: "",
      proposal: "",
    },
    {
      id: "si-b",
      staffId: "b",
      period: "P",
      submittedAt: null,
      effort: "",
      trouble: "",
      growth: "",
      vision: "",
      proposal: "",
    },
  ],
  managerInterviews: [],
  presidentReviews: [
    {
      id: "pr-a",
      staffId: "a",
      period: "P",
      reviewedAt: null,
      presidentMemo: "社長メモ",
      finalNote: "",
      compensationNote: "昇給",
      currentBaseSalary: 250000,
      presidentMessage: "がんばって",
      status: "confirmed",
    },
  ],
  periods: [],
  growthExpectations: [],
  growthPaths: [],
  hrAssessments: [],
};

describe("scopeSnapshot", () => {
  it("社長はすべて見られる", () => {
    const s = scopeSnapshot(PRES, all);
    expect(s.staff).toHaveLength(5);
    expect(s.presidentReviews).toHaveLength(1);
    expect(s.meId).toBe("p");
  });

  it("管理者は担当の職員の記録だけ。社長の確認は見られない", () => {
    const s = scopeSnapshot(MGR, all);
    expect(s.staffInterviews.map((x) => x.id)).toEqual(["si-a"]);
    expect(s.presidentReviews).toHaveLength(0);
    // 担当外の一般職員は名簿にも出さない
    expect(s.staff.map((x) => x.id).sort()).toEqual(["a", "m", "m2", "p"]);
    // 他の管理者は名前などだけ (メモは渡さない)
    expect(s.staff.find((x) => x.id === "m2")?.managerMemo).toBeUndefined();
    expect(s.staff.find((x) => x.id === "a")?.managerMemo).toBe("メモ");
  });

  it("職員は自分の分だけ。社長の確認は本人向けの項目だけ", () => {
    const s = scopeSnapshot(STF, all);
    expect(s.staffInterviews.map((x) => x.id)).toEqual(["si-a"]);
    const r = s.presidentReviews[0];
    expect(r?.presidentMessage).toBe("がんばって");
    expect(r?.presidentMemo).toBe("");
    expect(r?.compensationNote).toBe("");
    expect(r?.currentBaseSalary).toBeUndefined();
    expect(s.staff.find((x) => x.id === "b")).toBeUndefined();
  });
});

describe("checkWrite", () => {
  const a = all.staff.find((x) => x.id === "a")!;
  const b = all.staff.find((x) => x.id === "b")!;

  it("社長はなんでも保存できる", () => {
    expect(
      checkWrite(PRES, "presidentReview", { id: "x", staffId: "a" }, { target: a, existing: null }),
    ).toBeNull();
    expect(checkWrite(PRES, "period", { id: "x" }, { target: null, existing: null })).toBeNull();
  });

  it("管理者は担当の職員の記録だけ", () => {
    expect(
      checkWrite(MGR, "hrAssessment", { id: "x", staffId: "a" }, { target: a, existing: null }),
    ).toBeNull();
    expect(
      checkWrite(MGR, "hrAssessment", { id: "x", staffId: "b" }, { target: b, existing: null }),
    ).not.toBeNull();
    expect(
      checkWrite(MGR, "presidentReview", { id: "x", staffId: "a" }, { target: a, existing: null }),
    ).not.toBeNull();
    expect(checkWrite(MGR, "period", { id: "x" }, { target: null, existing: null })).not.toBeNull();
  });

  it("管理者は職員を自分の担当として追加できるが、管理者にはできない", () => {
    expect(
      checkWrite(
        MGR,
        "staff",
        { id: "new", role: "staff", managerId: "m" },
        { target: null, existing: null },
      ),
    ).toBeNull();
    expect(
      checkWrite(
        MGR,
        "staff",
        { id: "new", role: "staff", managerId: "m2" },
        { target: null, existing: null },
      ),
    ).not.toBeNull();
    expect(
      checkWrite(
        MGR,
        "staff",
        { id: "a", role: "manager", managerId: "m" },
        { target: a, existing: { kind: "staff", staffId: "a" } },
      ),
    ).not.toBeNull();
  });

  it("別の職員の記録を ID で上書きできない", () => {
    expect(
      checkWrite(
        MGR,
        "hrAssessment",
        { id: "x", staffId: "a" },
        { target: a, existing: { kind: "hrAssessment", staffId: "b" } },
      ),
    ).not.toBeNull();
    expect(
      checkWrite(
        PRES,
        "hrAssessment",
        { id: "x", staffId: "a" },
        { target: a, existing: { kind: "staffInterview", staffId: "a" } },
      ),
    ).not.toBeNull();
  });

  it("職員は自分の面談シートだけ", () => {
    expect(
      checkWrite(STF, "staffInterview", { id: "x", staffId: "a" }, { target: a, existing: null }),
    ).toBeNull();
    expect(
      checkWrite(STF, "staffInterview", { id: "x", staffId: "b" }, { target: b, existing: null }),
    ).not.toBeNull();
    expect(
      checkWrite(STF, "hrAssessment", { id: "x", staffId: "a" }, { target: a, existing: null }),
    ).not.toBeNull();
    expect(
      checkWrite(STF, "staff", { id: "a", role: "staff" }, { target: a, existing: null }),
    ).not.toBeNull();
  });

  it("職員は面談シートを出すとき、担当管理者の面談の空の枠だけ作れる", () => {
    const blank = {
      id: "mi",
      staffId: "a",
      managerId: "m",
      status: "in_progress",
      interviewedAt: null,
      strength: "",
      issue: "",
      expectation: "",
      followUp: "",
    };
    expect(checkWrite(STF, "managerInterview", blank, { target: a, existing: null })).toBeNull();
    expect(
      checkWrite(
        STF,
        "managerInterview",
        { ...blank, strength: "自分で書いた" },
        { target: a, existing: null },
      ),
    ).not.toBeNull();
    expect(
      checkWrite(
        STF,
        "managerInterview",
        { ...blank, status: "done" },
        { target: a, existing: null },
      ),
    ).not.toBeNull();
    expect(
      checkWrite(STF, "managerInterview", blank, {
        target: a,
        existing: null,
        managerInterviewExists: true,
      }),
    ).not.toBeNull();
    expect(
      checkWrite(
        STF,
        "managerInterview",
        { ...blank, managerId: "m2" },
        { target: a, existing: null },
      ),
    ).not.toBeNull();
  });
});
