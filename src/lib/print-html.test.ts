import { describe, expect, it } from "vitest";

import { withAutoPrint } from "./print-html";

describe("withAutoPrint", () => {
  it("</body> の直前に印刷スクリプトを入れる", () => {
    const out = withAutoPrint("<html><body><p>x</p></body></html>");
    expect(out).toMatch(/<p>x<\/p><script>.*window\.print\(\).*<\/script><\/body><\/html>$/);
  });

  it("</body> が無ければ末尾に足す", () => {
    expect(withAutoPrint("<p>x</p>")).toMatch(/^<p>x<\/p><script>/);
  });
});
