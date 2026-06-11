import { describe, expect, it } from "vitest";

import {
  generateInitialPassword,
  loginIdFromEmployeeCode,
  resolveUniqueLoginId,
} from "@/lib/login-credentials";

describe("loginIdFromEmployeeCode", () => {
  it("従業員コードを小文字化して返す", () => {
    expect(loginIdFromEmployeeCode("E0001")).toBe("e0001");
  });

  it("前後空白と英数字以外を除去する", () => {
    expect(loginIdFromEmployeeCode("  E-00 12 ")).toBe("e0012");
  });

  it("英数字が無い場合は user にフォールバックする", () => {
    expect(loginIdFromEmployeeCode("###")).toBe("user");
  });
});

describe("resolveUniqueLoginId", () => {
  it("未使用ならそのまま返す", async () => {
    const id = await resolveUniqueLoginId("e0001", async () => false);
    expect(id).toBe("e0001");
  });

  it("衝突したら連番を付けて空きを探す", async () => {
    const taken = new Set(["e0001", "e0001-2", "e0001-3"]);
    const id = await resolveUniqueLoginId("e0001", async (c) => taken.has(c));
    expect(id).toBe("e0001-4");
  });
});

describe("generateInitialPassword", () => {
  it("既定で 8 桁を返す", () => {
    expect(generateInitialPassword()).toHaveLength(8);
  });

  it("長さ指定が効く", () => {
    expect(generateInitialPassword(12)).toHaveLength(12);
  });

  it("紛らわしい文字 (0 O 1 l I) を含まない", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateInitialPassword()).not.toMatch(/[0O1lI]/);
    }
  });

  it("英小文字と 2-9 の数字のみで構成される", () => {
    expect(generateInitialPassword(40)).toMatch(/^[a-z2-9]+$/);
  });
});
