/**
 * 名簿の印刷画面。GET /admin/employees/roster/print?<名簿作成画面と同じ条件>
 *
 * 帳票 HTML を返し、開いたタブで印刷画面を出す (PDF 保存も可)。
 */
import { requireAdmin } from "@/lib/auth-guard";
import { printHtmlResponse } from "@/lib/print-html";
import { renderRosterHtml } from "@/lib/roster/html";
import { loadRoster } from "@/lib/roster/load";
import { parseRosterQuery, todayJst, type RawParams } from "@/lib/roster/query";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  await requireAdmin();
  const url = new URL(request.url);
  const sp: RawParams = {};
  for (const key of new Set(url.searchParams.keys())) sp[key] = url.searchParams.getAll(key);

  const today = todayJst();
  const query = parseRosterQuery(sp, today);
  const { result, conditionText } = await loadRoster(query);
  return printHtmlResponse(
    renderRosterHtml({ query, rows: result.rows, conditionText, createdOn: today }),
  );
}
