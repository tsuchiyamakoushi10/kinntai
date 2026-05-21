/**
 * 会社マスタ (company_profile) のシード。
 *
 * 株式会社クロスハート (現運用先) の労働条件通知書サンプル 2 件
 * (大川理恵 / 須賀みどり) から読み取れる「全契約共通の条項」を
 * 単一行で投入する。
 *
 * シングルトン制約は app レベルで担保 (id を固定 UUID にして upsert)。
 * 数値・テキストは現運用の実値。値の変更は S-A-28 (Phase 1-I 後で実装)
 * から行う想定で、再シードで上書きしないよう create のみで動くようにする。
 *
 * docs/employment-contract-printable.md §2.1 参照。
 */
import { PrismaClient } from "@prisma/client";

/** シングルトン用の固定 UUID。再シードで一意に追従できる。 */
const SINGLETON_ID = "c0000000-0000-0000-0000-000000000001";

/** サンプル書式 2 件から抽出した既定値。 */
const DEFAULTS = {
  legalName: "株式会社クロスハート",
  address: "児玉郡神川町新里2022-135",
  phone: "0495-71-8531",
  representativeTitle: "代表取締役",
  representativeName: "木下 美由紀",
  retirementAge: 60,
  continuedEmploymentAge: 65,
  resignNoticeDays: 30,
  wageCutoffDay: "毎月末日",
  wagePaymentDay: "翌月20日",
  wagePaymentMethod: "本人の金融機関口座への振込を原則とする",
  salaryRaisePeriod: "毎年6月に行う場合がある",
  overtimeRateUnder60h: 25,
  overtimeRateOver60h: 25,
  overtimeRateWithin: 0,
  holidayLegalRate: 35,
  nightRate: 25,
  breakRuleText:
    "1日6時間を超える勤務の場合には45分、1日8時間を超える勤務の場合には60分を、途中で与える。",
  workRulesName: "就業規則",
  partTimeWorkRulesName: "パート職員賃金規程",
  contactDepartment: "本部",
  contactPersonTitle: "代表取締役",
  contactPersonName: "木下 美由紀",
  contactPhone: "0495-71-8531",
} as const;

export async function seedCompanyProfile(prisma: PrismaClient): Promise<boolean> {
  // 既に行があれば触らない (S-A-28 で編集された内容を再シードで戻さない)
  const existing = await prisma.companyProfile.findFirst({ select: { id: true } });
  if (existing) return false;

  await prisma.companyProfile.create({
    data: { id: SINGLETON_ID, ...DEFAULTS },
  });
  return true;
}
