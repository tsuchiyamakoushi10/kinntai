"use server";

import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { isValidPinFormat, verifyPin } from "@/lib/pin";
import { getTabletOfficeId, setTabletPinSession } from "@/lib/tablet/session";

/**
 * S-T-03 暗証番号を検証して S-T-04 へ進む。
 *
 * - 端末の拠点 cookie が無ければセットアップへ。
 * - 選んだ従業員が拠点に在籍していなければエラー（応援勤務は MVP 範囲外）。
 * - PIN ハッシュ未設定の従業員はタブレット打刻不可。
 *
 * TODO(security): 同一従業員 ID への連続失敗回数が一定を超えたら一時的に
 * 拒否するレート制御を追加する。MVP では未実装。
 */
export async function verifyTabletPin(formData: FormData): Promise<void> {
  const officeId = await getTabletOfficeId();
  if (!officeId) redirect("/tablet/setup");

  const employeeId = String(formData.get("eid") ?? "").trim();
  const pin = String(formData.get("pin") ?? "").trim();

  if (!employeeId) redirect("/tablet");

  function backToPin(msg: string): never {
    redirect(`/tablet/pin?eid=${employeeId}&err=${encodeURIComponent(msg)}`);
  }

  if (!isValidPinFormat(pin)) backToPin("暗証番号は 4 桁の数字で入力してください。");

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      officeId: true,
      retiredAt: true,
      user: { select: { isActive: true, pinCodeHash: true } },
    },
  });
  if (!employee) backToPin("従業員情報が見つかりませんでした。");
  if (employee.officeId !== officeId) backToPin("この拠点では打刻できません。");
  if (employee.retiredAt) backToPin("退職処理済みのため打刻できません。");
  if (!employee.user || !employee.user.isActive) {
    backToPin("アカウントが無効になっています。管理者へ連絡してください。");
  }

  const ok = await verifyPin(pin, employee.user.pinCodeHash);
  if (!ok) backToPin("暗証番号が違います。");

  await setTabletPinSession(employee.id);
  redirect("/tablet/punch");
}
