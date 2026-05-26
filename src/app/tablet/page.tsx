import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { getTabletOfficeId } from "@/lib/tablet/session";

/**
 * S-T-02 本人選択。
 *
 * 拠点 cookie が無ければセットアップ画面へ。登録済みなら、当該拠点の
 * 在籍従業員（退職者除く）を 50 音グループでフィルタしながら選ぶ。
 *
 * 規模感（最大 1 拠点 20 名程度）を踏まえ、ページャは付けず全件をその場で
 * 描画する。50 音タブは URL クエリ `?row=` で持ち、SSR で完結させる。
 */

const ROWS = [
  { key: "ALL", label: "全員" },
  { key: "あ", label: "あ" },
  { key: "か", label: "か" },
  { key: "さ", label: "さ" },
  { key: "た", label: "た" },
  { key: "な", label: "な" },
  { key: "は", label: "は" },
  { key: "ま", label: "ま" },
  { key: "や", label: "や" },
  { key: "ら", label: "ら" },
  { key: "わ", label: "わ" },
] as const;

type RowKey = (typeof ROWS)[number]["key"];

const ROW_RANGES: Record<Exclude<RowKey, "ALL">, ReadonlyArray<[string, string]>> = {
  あ: [["ア", "オ"]],
  か: [["カ", "ゴ"]],
  さ: [["サ", "ゾ"]],
  た: [
    ["タ", "ド"],
    ["ッ", "ッ"],
  ],
  な: [["ナ", "ノ"]],
  は: [["ハ", "ポ"]],
  ま: [["マ", "モ"]],
  や: [
    ["ヤ", "ヨ"],
    ["ャ", "ョ"],
  ],
  ら: [["ラ", "ロ"]],
  わ: [
    ["ワ", "ン"],
    ["ヲ", "ヲ"],
  ],
};

function isRowKey(v: string | undefined): v is RowKey {
  return !!v && ROWS.some((r) => r.key === v);
}

function inRow(firstChar: string, row: Exclude<RowKey, "ALL">): boolean {
  if (!firstChar) return false;
  return ROW_RANGES[row].some(([from, to]) => firstChar >= from && firstChar <= to);
}

type PageProps = {
  searchParams: Promise<{ row?: string }>;
};

export default async function TabletHomePage({ searchParams }: PageProps) {
  const officeId = await getTabletOfficeId();
  if (!officeId) redirect("/tablet/setup");

  const { row: rawRow } = await searchParams;
  const row: RowKey = isRowKey(rawRow) ? rawRow : "ALL";

  const office = await prisma.office.findUnique({
    where: { id: officeId },
    select: { id: true, name: true },
  });
  if (!office) redirect("/tablet/setup");

  const employees = await prisma.employee.findMany({
    where: {
      officeId,
      retiredAt: null,
      user: { isActive: true, pinCodeHash: { not: null } },
    },
    orderBy: [{ lastNameKana: "asc" }, { firstNameKana: "asc" }],
    select: {
      id: true,
      lastName: true,
      firstName: true,
      lastNameKana: true,
    },
  });

  const filtered =
    row === "ALL"
      ? employees
      : employees.filter((e) => inRow((e.lastNameKana ?? "").charAt(0), row));

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-5 p-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wider text-slate-500">打刻</p>
          <h1 className="text-2xl font-bold text-slate-900">{office.name}</h1>
          <p className="text-sm text-slate-600">自分の名前を選んでください</p>
        </div>
        <Link
          href="/tablet/setup"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
        >
          設定
        </Link>
      </header>

      <nav aria-label="50音フィルタ" className="flex flex-wrap gap-2">
        {ROWS.map((r) => {
          const active = r.key === row;
          const href = r.key === "ALL" ? "/tablet" : `/tablet?row=${encodeURIComponent(r.key)}`;
          return (
            <Link
              key={r.key}
              href={href}
              className={
                active
                  ? "rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                  : "rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              }
            >
              {r.label}
            </Link>
          );
        })}
      </nav>

      {filtered.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-center text-sm text-slate-600 shadow-sm">
          該当する従業員がいません。
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {filtered.map((e) => (
            <li key={e.id}>
              <Link
                href={`/tablet/pin?eid=${e.id}`}
                className="flex h-full flex-col items-center justify-center gap-1 rounded-2xl bg-white px-3 py-6 text-center shadow-sm transition hover:bg-blue-50 active:scale-[0.98]"
              >
                <span className="text-xl font-bold text-slate-900">
                  {e.lastName} {e.firstName}
                </span>
                <span className="text-xs text-slate-500">{e.lastNameKana}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
