/**
 * 帳票 HTML をブラウザの印刷画面で出すためのヘルパー。
 *
 * サーバーで Chromium を起動して PDF を作る方式は Vercel で動かなかったため、
 * 帳票 HTML をそのまま返し、開いたタブで印刷画面を自動で出す。
 * 印刷画面の送り先を「PDF に保存」にすれば PDF にもできる。
 */

// Web フォントの読み込みを待ってから印刷画面を出す (待たないと文字が別フォントで刷られる)
const AUTO_PRINT_SCRIPT =
  "<script>window.addEventListener('load',function(){document.fonts.ready.then(function(){window.print();});});</script>";

/** 完全な HTML 文書に、開いたら印刷画面を出すスクリプトを差し込む。 */
export function withAutoPrint(html: string): string {
  const i = html.lastIndexOf("</body>");
  return i === -1 ? html + AUTO_PRINT_SCRIPT : html.slice(0, i) + AUTO_PRINT_SCRIPT + html.slice(i);
}

/** 印刷用 HTML のレスポンス。 */
export function printHtmlResponse(html: string): Response {
  return new Response(withAutoPrint(html), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
