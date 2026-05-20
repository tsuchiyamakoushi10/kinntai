"use server";

import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { clearTabletOffice, setTabletOffice } from "@/lib/tablet/session";

/**
 * 拠点を選んで端末を登録する（S-T-01）。
 *
 * 管理者ログイン状態が前提（middleware 経由 + サーバ側 requireAdmin で 2 重ガード）。
 * 拠点 ID の妥当性は DB で確認する。完了後は /tablet (S-T-02) へ自動遷移。
 */
export async function registerTabletOffice(formData: FormData): Promise<void> {
  await requireAdmin();
  const officeId = String(formData.get("officeId") ?? "").trim();
  if (!officeId) {
    redirect("/tablet/setup?err=" + encodeURIComponent("拠点を選択してください。"));
  }

  const office = await prisma.office.findUnique({
    where: { id: officeId },
    select: { id: true, isActive: true },
  });
  if (!office || !office.isActive) {
    redirect("/tablet/setup?err=" + encodeURIComponent("選択した拠点が見つかりませんでした。"));
  }

  await setTabletOffice(office.id);
  redirect("/tablet");
}

/** 登録を解除して setup に戻す。タブレットの拠点を変えるとき用。 */
export async function resetTabletOffice(): Promise<void> {
  await requireAdmin();
  await clearTabletOffice();
  redirect("/tablet/setup");
}
