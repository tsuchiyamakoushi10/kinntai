/**
 * マニュアルの画面写真・動画を撮るための練習データを、ローカル DB に用意する。
 *
 * 実行: pnpm manual:prepare (先に pnpm db:seed && pnpm db:seed:demo)
 *
 * - 名前・住所はすべて架空 (seed のデータ)。実在の職員は使わない。
 * - ローカル (localhost) の DB 以外では動かない。本番やステージングで絶対に実行しないこと。
 * - 通知書・研修アンケートはいったん全部消して、見本だけを作り直す (毎回同じ画面にするため)。
 */
import { PrismaClient } from "@prisma/client";

import { hashPassword } from "../../src/lib/password";

import { FIRST_LOGIN_STAFF, MANUAL_ADMIN, MANUAL_STAFF } from "./accounts";

const prisma = new PrismaClient();

function assertLocalDb(): void {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error(`ローカルの DB だけで実行できます (いまの接続先: ${url.hostname})`);
  }
}

const MANAGER_NAMES = [
  "管理者　見本 一郎",
  "管理者　見本 花子",
  "管理者　見本 次郎",
  "管理者　見本 和子",
  "管理者　見本 三郎",
];

async function main(): Promise<void> {
  assertLocalDb();

  // ログインしてすぐ使えるよう、初期パスワード変更を済ませた扱いにする
  await prisma.user.updateMany({
    where: {
      email: {
        in: [
          MANUAL_ADMIN.identifier,
          MANUAL_STAFF.identifier,
          "e0002@kinntai.local",
          "e0003@kinntai.local",
        ],
      },
    },
    data: { mustChangePassword: false },
  });

  // 拠点に相談窓口 (架空の管理者名) を入れる
  const offices = await prisma.office.findMany({ orderBy: { code: "asc" } });
  for (const [i, o] of offices.entries()) {
    await prisma.office.update({
      where: { id: o.id },
      data: { managerName: MANAGER_NAMES[i % MANAGER_NAMES.length], phone: "0495-00-0000" },
    });
  }
  // 代表者・相談窓口の氏名は見本にする (実在の人名を画面・動画に映さない)
  await prisma.companyProfile.updateMany({
    data: {
      employeeCount: 45,
      variableHoursAgreementCoversNight: true,
      representativeName: "見本 太郎",
      contactPersonName: "見本 太郎",
    },
  });

  // 「はじめてのログイン」動画用に、初期パスワードのままの職員を 1 人用意する
  const firstLogin = await prisma.user.findFirst({
    where: { email: FIRST_LOGIN_STAFF.identifier },
  });
  if (firstLogin) {
    await prisma.user.update({
      where: { id: firstLogin.id },
      data: {
        mustChangePassword: true,
        passwordHash: await hashPassword(FIRST_LOGIN_STAFF.password),
      },
    });
  }

  // 通知書・アンケートは見本だけにする
  await prisma.trainingSurvey.deleteMany({});
  await prisma.trainingSurveyTemplate.deleteMany({});
  await prisma.laborNotice.deleteMany({});
  await prisma.trainingRecord.deleteMany({
    where: { notes: "研修アンケートの回答から自動で作成" },
  });
  await prisma.laborNoticePreset.deleteMany({});
  await prisma.laborNoticeWorkPattern.deleteMany({});
  await prisma.minWage.deleteMany({});

  // 勤務表の動画: 翌月のデイサービスを空にして、自動生成から見せる。今月は職員側の動画用に公開しておく
  const jstNow = new Date(Date.now() + 9 * 3600_000);
  const thisMonth = new Date(Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth() + 1, 1));
  const monthAfter = new Date(Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth() + 2, 1));
  const day = offices.find((o) => o.code === "DAY-CENTER");
  if (day) {
    await prisma.shift.deleteMany({
      where: { officeId: day.id, workDate: { gte: nextMonth, lt: monthAfter } },
    });
    await prisma.shiftGenerationRun.deleteMany({
      where: { officeId: day.id, targetMonth: nextMonth },
    });
    await prisma.shiftPublication.deleteMany({
      where: { officeId: day.id, targetMonth: nextMonth },
    });
  }
  // 練習データには配置基準がないため、勤務表の自動生成が公休ばかりになる。デイに見本の基準を入れる
  if (day) {
    const demands = [
      { dayKind: "WEEKDAY" as const, amRequired: 6, pmRequired: 6, earlyAmRequired: 2 },
      { dayKind: "SATURDAY" as const, amRequired: 5, pmRequired: 5, earlyAmRequired: 2 },
      { dayKind: "SUNDAY_HOLIDAY" as const, amRequired: 0, pmRequired: 0, earlyAmRequired: 0 },
      { dayKind: "HOLIDAY" as const, amRequired: 5, pmRequired: 5, earlyAmRequired: 2 },
    ];
    for (const d of demands) {
      await prisma.officeCoverageDemand.upsert({
        where: { officeId_dayKind: { officeId: day.id, dayKind: d.dayKind } },
        create: { officeId: day.id, ...d },
        update: d,
      });
    }
  }
  const adminUser = await prisma.user.findFirstOrThrow({
    where: { email: MANUAL_ADMIN.identifier },
  });
  for (const o of offices) {
    await prisma.shiftPublication.upsert({
      where: { officeId_targetMonth: { officeId: o.id, targetMonth: thisMonth } },
      create: { officeId: o.id, targetMonth: thisMonth, publishedById: adminUser.id },
      update: {},
    });
  }

  // 従業員登録の動画で作る見本の職員を消しておく
  const sample = await prisma.employee.findMany({
    where: { lastName: "見本", firstName: "さくら" },
  });
  for (const e of sample) {
    await prisma.user.deleteMany({ where: { employeeId: e.id } });
    await prisma.employee.delete({ where: { id: e.id } });
  }

  // 職員の希望の動画で使う日を空けておく
  const staffEmployee = await prisma.user.findFirst({
    where: { email: MANUAL_STAFF.identifier },
    select: { employeeId: true },
  });
  if (staffEmployee?.employeeId) {
    await prisma.shiftPreference.deleteMany({ where: { employeeId: staffEmployee.employeeId } });
  }

  // 結果画面の説明用に、回答が集まった研修アンケートを 1 つ作る
  const admin = adminUser;
  const nh = offices.find((o) => o.name.includes("ナーシング")) ?? offices[0]!;
  const staff = await prisma.employee.findMany({
    where: { officeId: nh.id, employmentStatus: { not: "RETIRED" } },
    orderBy: { employeeCode: "asc" },
    take: 10,
  });
  const survey = await prisma.trainingSurvey.create({
    data: {
      title: "感染症対策の研修",
      description: "研修おつかれさまでした。今後の研修づくりの参考にします。",
      trainedOn: new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), 1)),
      status: "OPEN",
      openedAt: new Date(),
      officeId: nh.id,
      createdById: admin.id,
      questions: {
        create: [
          {
            sortOrder: 0,
            kind: "SECTION",
            label: "研修の内容について",
            options: [],
            required: false,
          },
          {
            sortOrder: 1,
            kind: "SCALE",
            label: "研修の内容はわかりやすかったですか？",
            options: [],
            config: {
              min: 1,
              max: 5,
              minLabel: "わかりにくかった",
              maxLabel: "とてもわかりやすかった",
            },
          },
          {
            sortOrder: 2,
            kind: "MULTI_CHOICE",
            label: "明日から実践したいことはどれですか？",
            options: ["手指消毒のタイミング", "ガウンの着脱", "嘔吐物の処理", "換気"],
            config: { allowOther: true },
          },
          {
            sortOrder: 3,
            kind: "GRID",
            label: "講師の評価",
            options: ["よい", "ふつう", "よくない"],
            config: { rows: ["話し方", "資料", "時間配分"] },
          },
          {
            sortOrder: 4,
            kind: "TEXT",
            label: "感想・質問があれば書いてください",
            options: [],
            required: false,
          },
        ],
      },
      targets: { create: staff.map((e) => ({ employeeId: e.id })) },
    },
    include: { questions: { orderBy: { sortOrder: "asc" } } },
  });
  const [, q1, q2, q3, q4] = survey.questions;
  const samples = [
    {
      s: 5,
      c: ["手指消毒のタイミング", "嘔吐物の処理"],
      g: ["よい", "よい", "ふつう"],
      t: "嘔吐物の処理を実際にやってみてよくわかりました。",
    },
    { s: 4, c: ["ガウンの着脱"], g: ["よい", "ふつう", "ふつう"], t: "" },
    {
      s: 4,
      c: ["手指消毒のタイミング", "換気"],
      g: ["ふつう", "よい", "よい"],
      t: "夜勤のときの換気の目安が知りたいです。",
    },
    {
      s: 3,
      c: ["嘔吐物の処理"],
      g: ["ふつう", "ふつう", "よくない"],
      t: "もう少し時間がほしかった。",
    },
    {
      s: 5,
      c: ["手指消毒のタイミング", "ガウンの着脱", "嘔吐物の処理"],
      g: ["よい", "よい", "よい"],
      t: "",
    },
    {
      s: 4,
      c: ["__other__"],
      other: "利用者さんへの声かけ",
      g: ["よい", "ふつう", "ふつう"],
      t: "",
    },
  ];
  // 先頭の 1 人 (動画で回答する職員) は未回答のまま残す
  for (const [i, e] of staff.slice(1, 1 + samples.length).entries()) {
    const a = samples[i]!;
    const record = await prisma.trainingRecord.create({
      data: {
        employeeId: e.id,
        trainingName: survey.title,
        trainingType: "COMPANY_PAID",
        trainedOn: survey.trainedOn,
        notes: "研修アンケートの回答から自動で作成",
      },
    });
    await prisma.trainingSurveyResponse.create({
      data: {
        surveyId: survey.id,
        employeeId: e.id,
        trainingRecordId: record.id,
        answers: {
          [q1!.id]: a.s,
          [q2!.id]: a.c,
          ...(a.other ? { [`${q2!.id}.other`]: a.other } : {}),
          [q3!.id]: { 話し方: a.g[0]!, 資料: a.g[1]!, 時間配分: a.g[2]! },
          ...(a.t ? { [q4!.id]: a.t } : {}),
        },
      },
    });
  }

  console.log(
    `準備できました: 拠点 ${offices.length} / 見本アンケート回答 ${samples.length}件 (対象 ${staff.length}人)`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
