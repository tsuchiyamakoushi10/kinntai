/**
 * 研修資料を開く。docs/training-survey.md §2.2
 *
 * - ログイン必須。管理者はいつでも開ける (見た記録は付けない)。
 * - 職員は、配信済みでそのアンケートの対象になっているときだけ開ける。
 * - 職員がファイル / YouTube 以外のリンクを開いたら「見た」を記録する。
 *   YouTube は回答画面で最後まで再生したときに記録する (`recordMaterialView`)。
 * - ファイルは 5 分だけ有効な署名つき URL へ転送する。固定 URL は画面に出さない。
 */
import { type NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getObjectStorage, SIGNED_URL_TTL_SECONDS } from "@/lib/storage";
import { opensInline, youTubeId } from "@/lib/training-survey/materials";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user) return NextResponse.redirect(new URL("/login", req.url));
  const { id } = await params;
  const isAdmin = session.user.role === "ADMIN";
  const employeeId = session.user.employeeId;

  const material = await prisma.trainingSurveyMaterial.findFirst({
    where: isAdmin
      ? { id }
      : {
          id,
          survey: {
            status: { not: "DRAFT" },
            targets: { some: { employeeId: employeeId ?? "__none__" } },
          },
        },
  });
  if (!material) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (!isAdmin && employeeId && !(material.kind === "LINK" && youTubeId(material.url ?? ""))) {
    await prisma.trainingSurveyMaterialView.createMany({
      data: [{ materialId: material.id, employeeId }],
      skipDuplicates: true,
    });
  }

  if (material.kind === "LINK") {
    return NextResponse.redirect(material.url!, { headers: { "Cache-Control": "no-store" } });
  }

  const url = await getObjectStorage().createDownloadUrl(material.storageKey!, {
    fileName: material.fileName!,
    inline: opensInline(material.mimeType ?? ""),
    ttlSeconds: SIGNED_URL_TTL_SECONDS,
  });
  return NextResponse.redirect(new URL(url, req.url), { headers: { "Cache-Control": "no-store" } });
}
