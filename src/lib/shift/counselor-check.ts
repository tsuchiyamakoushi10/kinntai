/**
 * 拠点別 生活相談員チェック (配置基準 vs 在籍相談員の突き合わせ)。
 *
 * デイサービス等は配置基準で生活相談員 (午前/午後 各 N 名) を要求するが、職員の職種
 * (job_category) は取り込み時に「推定」値が入っており、相談員が別拠点に誤って割り当てられて
 * いることがある (例: 相談員が厨房に、デイが相談員 0 名)。自動生成では相談員配置を強制せず
 * 「不足」を警告で可視化する方針 (docs/auto-shift-design-v2.md §10) なので、オーナーが
 * 拠点ごとの過不足を一目で確認して職種を直せるよう、ここで突き合わせる。
 *
 * DB に触れない純粋関数。配置基準 (office_coverage_demands) と在籍相談員はサーバ側で読んで渡す。
 */

/** 在籍中の生活相談員 1 名 (表示・編集導線用。氏名はこの層では扱わない)。 */
export type CounselorRef = {
  employeeId: string;
  employeeCode: string;
};

/** 1 拠点ぶんのチェック入力。 */
export type CounselorCheckInput = {
  officeId: string;
  officeName: string;
  officeCode: string;
  /**
   * 配置基準で必要な相談員数 (日種をまたいだ最大)。0 = 配置基準では相談員を要求しない。
   * 呼び出し側で office_coverage_demands の counselorAm/PmRequired から算出する。
   */
  requiredCounselors: number;
  /** その拠点に在籍する生活相談員 (job_category = LIFE_COUNSELOR)。 */
  counselors: ReadonlyArray<CounselorRef>;
};

/**
 * - `ok`: 相談員が必要で、必要数を満たしている。
 * - `shortage`: 相談員が必要なのに足りない (0 名含む)。← 最重要。デイが相談員 0 名等。
 * - `unexpected`: 配置基準では相談員不要なのに在籍している。← 誤った職種付けの疑い (厨房に相談員等)。
 * - `not_required`: 相談員不要で在籍もいない (正常)。
 */
export type CounselorCheckStatus = "ok" | "shortage" | "unexpected" | "not_required";

export type CounselorCheckResult = CounselorCheckInput & {
  actualCounselors: number;
  status: CounselorCheckStatus;
  /** 不足数 (shortage のときのみ正、それ以外 0)。 */
  shortfall: number;
};

/** 1 拠点を評価する。 */
export function evaluateCounselorCheck(office: CounselorCheckInput): CounselorCheckResult {
  const required = Math.max(0, office.requiredCounselors);
  const actual = office.counselors.length;

  let status: CounselorCheckStatus;
  if (required > 0) {
    status = actual >= required ? "ok" : "shortage";
  } else {
    status = actual > 0 ? "unexpected" : "not_required";
  }

  return {
    ...office,
    actualCounselors: actual,
    status,
    shortfall: status === "shortage" ? required - actual : 0,
  };
}

/** 複数拠点をまとめて評価する (拠点コード順で安定)。 */
export function evaluateCounselorChecks(
  offices: ReadonlyArray<CounselorCheckInput>,
): CounselorCheckResult[] {
  return [...offices]
    .sort((a, b) => a.officeCode.localeCompare(b.officeCode))
    .map(evaluateCounselorCheck);
}

/** 注意が要る拠点 (shortage または unexpected) だけ数える。画面の要約バッジ用。 */
export function countAttentionOffices(results: ReadonlyArray<CounselorCheckResult>): number {
  return results.filter((r) => r.status === "shortage" || r.status === "unexpected").length;
}
