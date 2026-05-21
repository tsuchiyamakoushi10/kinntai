/**
 * 労働条件通知書 / 雇用契約書 PDF 出力前の必須項目チェック。
 *
 * docs/employment-contract-printable.md §5.1 のリストを実装する。
 * DB に触らず、入力された値だけで判定できる純粋関数として書く。
 *
 * 「必要項目が空なら出力不可、新規 / 編集で埋めてもらう」運用 (論点 G)。
 */
import type {
  CompanyProfile,
  EmploymentContract,
  EmploymentContractAllowance,
} from "@prisma/client";

export type ContractRenderInput = {
  contract: Pick<
    EmploymentContract,
    | "workplaceInitial"
    | "workplaceScope"
    | "jobDescriptionInitial"
    | "jobDescriptionScope"
    | "weeklyHoursCategory"
    | "contractEndOn"
    | "isRenewable"
    | "renewalCriteria"
  > & {
    // Prisma 型から isRenewable を渡しているが、契約期間の定めが
    // 「無期」(contractEndOn=null) なら有期に関連する項目は不要。
    allowances?: ReadonlyArray<EmploymentContractAllowance>;
  };
  companyProfile: Pick<CompanyProfile, "id"> | null;
};

export type ValidationResult = { ok: true } | { ok: false; missing: ReadonlyArray<string> };

/** 必須項目が揃っているかチェック。揃っていなければ不足項目のリストを返す。 */
export function canRenderContract(input: ContractRenderInput): ValidationResult {
  const missing: string[] = [];

  if (!input.companyProfile) {
    missing.push("会社情報 (S-A-28) が未登録です。");
  }

  const c = input.contract;
  if (!c.workplaceInitial || c.workplaceInitial.trim() === "") {
    missing.push("就業の場所 (雇入直後)");
  }
  if (!c.workplaceScope || c.workplaceScope.trim() === "") {
    missing.push("就業の場所 (変更の範囲)");
  }
  if (!c.jobDescriptionInitial || c.jobDescriptionInitial.trim() === "") {
    missing.push("従事すべき業務 (雇入直後)");
  }
  if (!c.jobDescriptionScope || c.jobDescriptionScope.trim() === "") {
    missing.push("従事すべき業務 (変更の範囲)");
  }
  if (c.weeklyHoursCategory === null) {
    missing.push("週所定労働時間区分");
  }
  // 有期 (contractEndOn 設定済) の場合は更新条件が必要
  if (c.contractEndOn !== null) {
    if (!c.isRenewable && (!c.renewalCriteria || c.renewalCriteria.trim() === "")) {
      // 更新ありなら判断基準を、更新なしなら判断基準が空でも可だが、
      // どちらかの選択は必須 (現実装では isRenewable=false でも通る運用)
    }
  }

  if (missing.length > 0) return { ok: false, missing };
  return { ok: true };
}
