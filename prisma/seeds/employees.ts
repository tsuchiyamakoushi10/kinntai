/**
 * 架空の従業員 55 名を投入する。
 *
 * docs/shift-patterns.md §1 の人数内訳を満たしつつ、現場のリアルさが
 * 出るように雇用形態（正社員 / パート）と職種（介護職員 / 看護職員 /
 * 生活相談員 / ケアマネ / 厨房職）の組み合わせを散らしてある。
 *
 * すべて `employee_code` を一意キーにした upsert なので、何度流しても
 * 重複は出ない。
 */
import { PrismaClient, EmploymentType, JobCategory, WageType } from "@prisma/client";

// =============================================================================
// 名前プール（架空）
// =============================================================================

const LAST_NAMES: ReadonlyArray<readonly [string, string]> = [
  ["山田", "ヤマダ"],
  ["田中", "タナカ"],
  ["佐藤", "サトウ"],
  ["鈴木", "スズキ"],
  ["高橋", "タカハシ"],
  ["伊藤", "イトウ"],
  ["渡辺", "ワタナベ"],
  ["中村", "ナカムラ"],
  ["小林", "コバヤシ"],
  ["加藤", "カトウ"],
  ["吉田", "ヨシダ"],
  ["山本", "ヤマモト"],
  ["松本", "マツモト"],
  ["井上", "イノウエ"],
  ["木村", "キムラ"],
  ["林", "ハヤシ"],
  ["清水", "シミズ"],
  ["山口", "ヤマグチ"],
  ["池田", "イケダ"],
  ["阿部", "アベ"],
  ["橋本", "ハシモト"],
  ["石川", "イシカワ"],
  ["森", "モリ"],
  ["長谷川", "ハセガワ"],
  ["岡田", "オカダ"],
  ["近藤", "コンドウ"],
  ["坂本", "サカモト"],
  ["藤田", "フジタ"],
  ["青木", "アオキ"],
  ["福田", "フクダ"],
];

const FIRST_NAMES: ReadonlyArray<readonly [string, string]> = [
  ["花子", "ハナコ"],
  ["太郎", "タロウ"],
  ["美咲", "ミサキ"],
  ["健太", "ケンタ"],
  ["陽子", "ヨウコ"],
  ["翔", "ショウ"],
  ["千夏", "チナツ"],
  ["雄一", "ユウイチ"],
  ["優子", "ユウコ"],
  ["誠", "マコト"],
  ["由美", "ユミ"],
  ["剛", "ツヨシ"],
  ["彩", "アヤ"],
  ["健", "ケン"],
  ["麻衣", "マイ"],
  ["隆", "タカシ"],
  ["明日香", "アスカ"],
  ["博", "ヒロシ"],
  ["桃子", "モモコ"],
  ["和也", "カズヤ"],
  ["智子", "トモコ"],
  ["大輔", "ダイスケ"],
  ["香織", "カオリ"],
  ["悟", "サトル"],
  ["真理", "マリ"],
  ["亮", "リョウ"],
  ["奈々", "ナナ"],
  ["徹", "トオル"],
  ["美和", "ミワ"],
  ["宏", "ヒロ"],
];

// =============================================================================
// 拠点ごとの人員配分（docs/shift-patterns.md §1 準拠）
// =============================================================================

type Allocation = {
  officeCode: string;
  fullTime: Partial<Record<JobCategory, number>>;
  partTime: Partial<Record<JobCategory, number>>;
};

const ALLOCATIONS: ReadonlyArray<Allocation> = [
  // ナーシング: 24h、介護中心 + 看護 1
  {
    officeCode: "NRS-CENTER",
    fullTime: { CARE_WORKER: 4, NURSE: 1 },
    partTime: { CARE_WORKER: 4, LIFE_COUNSELOR: 1 },
  },
  // デイ（結いの心）: 相談員配置
  {
    officeCode: "DAY-CENTER",
    fullTime: { CARE_WORKER: 3, LIFE_COUNSELOR: 1, NURSE: 1 },
    partTime: { CARE_WORKER: 5 },
  },
  // ショート: 24h、ケアマネ常駐
  {
    officeCode: "SHO-CENTER",
    fullTime: { CARE_WORKER: 7, NURSE: 1, LIFE_COUNSELOR: 1, CARE_MANAGER: 1 },
    partTime: { CARE_WORKER: 5 },
  },
  // デイ（梨花）: 構成はデイ結いと同等
  {
    officeCode: "DAY-RIKKA",
    fullTime: { CARE_WORKER: 3, LIFE_COUNSELOR: 1, NURSE: 1 },
    partTime: { CARE_WORKER: 5 },
  },
  // 厨房: 全員 OTHER（厨房職員）
  {
    officeCode: "KITCHEN",
    fullTime: { OTHER: 5 },
    partTime: { OTHER: 5 },
  },
];

// =============================================================================
// 値の決定ロジック
// =============================================================================

// 正社員の月給目安（円）。職種 × 雇用形態で固定。
const MONTHLY_WAGE: Record<JobCategory, number> = {
  CARE_WORKER: 230_000,
  NURSE: 320_000,
  LIFE_COUNSELOR: 270_000,
  CARE_MANAGER: 290_000,
  OFFICE_STAFF: 240_000,
  OTHER: 220_000,
};

// パートの時給。インデックスで散らす（1100 / 1200 / 1300 / 1400 / 1500）。
const HOURLY_WAGES = [1100, 1200, 1300, 1400, 1500] as const;

// パートの週所定日数 / 1日所定時間（インデックスで散らす）。
const PART_WEEKLY_DAYS = [3.0, 3.5, 4.0, 4.5, 5.0] as const;
const PART_DAILY_HOURS = [4.0, 5.0, 6.0] as const;

// 入社年度のバリエーション（4/1 開始想定）。
const HIRE_YEARS = [2008, 2011, 2013, 2015, 2017, 2019, 2021, 2023, 2024] as const;

function pickHireDate(idx: number): Date {
  const y = HIRE_YEARS[idx % HIRE_YEARS.length]!;
  // 4/1 入社で揃えると有給付与の起点（hired_at + 6ヶ月）が同月に集中して
  // テストしにくいので、月をずらす。
  const month = (idx % 12) + 1;
  return new Date(Date.UTC(y, month - 1, 1));
}

function pickBirthDate(idx: number): Date {
  // 1960-1998 にゆるく散らす（28-66 歳）
  const y = 1960 + ((idx * 7) % 38);
  const m = ((idx * 11) % 12) + 1;
  const d = ((idx * 13) % 27) + 1;
  return new Date(Date.UTC(y, m - 1, d));
}

// =============================================================================
// 生成
// =============================================================================

type EmployeeSeed = {
  employeeCode: string;
  lastName: string;
  firstName: string;
  lastNameKana: string;
  firstNameKana: string;
  birthDate: Date;
  officeCode: string;
  jobCategory: JobCategory;
  employmentType: EmploymentType;
  joinedAt: Date;
  hiredAt: Date;
  weeklyWorkDays: number;
  dailyWorkHours: number;
  baseWageType: WageType;
  baseWageAmount: number;
};

function buildEmployees(): EmployeeSeed[] {
  const result: EmployeeSeed[] = [];
  let idx = 0;

  const push = (
    officeCode: string,
    employmentType: EmploymentType,
    jobCategory: JobCategory,
  ): void => {
    const last = LAST_NAMES[idx % LAST_NAMES.length]!;
    // 姓と名で違うインデックス係数を使うと同じ姓内で名のバリエーションが出る。
    const first = FIRST_NAMES[(idx * 7) % FIRST_NAMES.length]!;

    const isFullTime = employmentType === "FULL_TIME";
    const weeklyDays = isFullTime ? 5.0 : PART_WEEKLY_DAYS[idx % PART_WEEKLY_DAYS.length]!;
    const dailyHours = isFullTime ? 8.0 : PART_DAILY_HOURS[idx % PART_DAILY_HOURS.length]!;
    const wageType: WageType = isFullTime ? "MONTHLY" : "HOURLY";
    const wageAmount = isFullTime
      ? MONTHLY_WAGE[jobCategory]
      : HOURLY_WAGES[idx % HOURLY_WAGES.length]!;
    const hireDate = pickHireDate(idx);

    result.push({
      employeeCode: `E${String(idx + 1).padStart(4, "0")}`,
      lastName: last[0],
      firstName: first[0],
      lastNameKana: last[1],
      firstNameKana: first[1],
      birthDate: pickBirthDate(idx),
      officeCode,
      jobCategory,
      employmentType,
      joinedAt: hireDate,
      hiredAt: hireDate,
      weeklyWorkDays: weeklyDays,
      dailyWorkHours: dailyHours,
      baseWageType: wageType,
      baseWageAmount: wageAmount,
    });
    idx += 1;
  };

  for (const a of ALLOCATIONS) {
    for (const [jc, count] of Object.entries(a.fullTime) as Array<[JobCategory, number]>) {
      for (let i = 0; i < count; i++) push(a.officeCode, "FULL_TIME", jc);
    }
    for (const [jc, count] of Object.entries(a.partTime) as Array<[JobCategory, number]>) {
      for (let i = 0; i < count; i++) push(a.officeCode, "PART_TIME_UNINSURED", jc);
    }
  }

  return result;
}

// =============================================================================
// Upsert
// =============================================================================

export async function seedEmployees(
  prisma: PrismaClient,
  officeIds: Map<string, string>,
): Promise<number> {
  const employees = buildEmployees();
  for (const e of employees) {
    const officeId = officeIds.get(e.officeCode);
    if (!officeId) {
      throw new Error(`employee ${e.employeeCode} references unknown office ${e.officeCode}`);
    }

    const data = {
      employeeCode: e.employeeCode,
      lastName: e.lastName,
      firstName: e.firstName,
      lastNameKana: e.lastNameKana,
      firstNameKana: e.firstNameKana,
      birthDate: e.birthDate,
      officeId,
      jobCategory: e.jobCategory,
      employmentType: e.employmentType,
      joinedAt: e.joinedAt,
      hiredAt: e.hiredAt,
      weeklyWorkDays: e.weeklyWorkDays,
      dailyWorkHours: e.dailyWorkHours,
      baseWageType: e.baseWageType,
      baseWageAmount: e.baseWageAmount,
    };

    await prisma.employee.upsert({
      where: { employeeCode: e.employeeCode },
      update: data,
      create: data,
    });
  }
  return employees.length;
}
