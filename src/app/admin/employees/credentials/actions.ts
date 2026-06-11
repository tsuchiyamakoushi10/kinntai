"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth-guard";
import { issueCredentialForEmployee, type IssuedCredential } from "@/lib/issue-login-credential";

export type IssueCredentialsState = {
  error?: string;
  /** 発行結果。平文の初期パスワードを含むため、この一度きりの表示に使う。 */
  results?: IssuedCredential[];
};

/**
 * 選択した職員にログインID / 初期パスワードを一括発行する。
 *
 * 既存アカウントは上書き（パスワード再生成）。loginId は既存があれば維持する。
 * 発行した平文パスワードは state.results で返し、画面で一度だけ表示する。
 */
export async function issueCredentials(
  _prev: IssueCredentialsState,
  formData: FormData,
): Promise<IssueCredentialsState> {
  await requireAdmin();

  const employeeIds = formData
    .getAll("employeeId")
    .map((v) => String(v))
    .filter(Boolean);

  if (employeeIds.length === 0) {
    return { error: "発行する職員を選択してください。" };
  }

  // 同一バッチ内の loginId 衝突を避けるため Set を共有して順次発行する。
  const reserved = new Set<string>();
  const results: IssuedCredential[] = [];
  for (const id of employeeIds) {
    results.push(await issueCredentialForEmployee(id, reserved));
  }

  revalidatePath("/admin/employees/credentials");
  return { results };
}
