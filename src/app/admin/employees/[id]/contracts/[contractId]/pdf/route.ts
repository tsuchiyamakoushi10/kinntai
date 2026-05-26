/**
 * 労働条件通知書 / 雇用契約書 PDF 出力エンドポイント。
 *
 * GET /admin/employees/[id]/contracts/[contractId]/pdf?type=notice|contract
 *
 * - 管理者ガード必須
 * - クエリ `type` でタイトルだけ切り替え (notice = 労働条件通知書、contract = 雇用契約書)
 * - 必須項目が未入力なら 422 + JSON で missing items を返す
 * - ファイル名: 労働条件通知書_{employee_code}_{contract_start_on}.pdf
 */
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { loadContractViewModel } from "@/lib/employment-contract/data";
import { renderContractPdf } from "@/lib/employment-contract/pdf";
import { canRenderContract } from "@/lib/employment-contract/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { id: string; contractId: string };

export async function GET(
  request: Request,
  { params }: { params: Promise<Params> },
): Promise<Response> {
  await requireAdmin();
  const { id, contractId } = await params;
  const url = new URL(request.url);
  const type = url.searchParams.get("type") === "contract" ? "contract" : "notice";
  const documentTitle =
    type === "contract" ? "雇用契約書 兼 労働条件通知書" : "労働条件通知書 兼 雇用契約書";

  // 必須項目チェック (DB から最小情報で取得)
  const [contract, company] = await Promise.all([
    prisma.employmentContract.findUnique({
      where: { id: contractId },
      select: {
        employeeId: true,
        workplaceInitial: true,
        workplaceScope: true,
        jobDescriptionInitial: true,
        jobDescriptionScope: true,
        weeklyHoursCategory: true,
        contractEndOn: true,
        isRenewable: true,
        renewalCriteria: true,
      },
    }),
    prisma.companyProfile.findFirst({ select: { id: true } }),
  ]);
  if (!contract || contract.employeeId !== id) {
    return NextResponse.json({ error: "契約が見つかりません。" }, { status: 404 });
  }

  const validation = canRenderContract({
    contract: {
      workplaceInitial: contract.workplaceInitial,
      workplaceScope: contract.workplaceScope,
      jobDescriptionInitial: contract.jobDescriptionInitial,
      jobDescriptionScope: contract.jobDescriptionScope,
      weeklyHoursCategory: contract.weeklyHoursCategory,
      contractEndOn: contract.contractEndOn,
      isRenewable: contract.isRenewable,
      renewalCriteria: contract.renewalCriteria,
    },
    companyProfile: company,
  });
  if (!validation.ok) {
    return NextResponse.json(
      { error: "PDF を出力できません。", missing: validation.missing },
      { status: 422 },
    );
  }

  const vm = await loadContractViewModel(contractId, documentTitle);
  if (!vm) {
    return NextResponse.json({ error: "契約情報の取得に失敗しました。" }, { status: 500 });
  }

  const pdf = await renderContractPdf(vm);

  // ファイル名: 労働条件通知書_E0001_2026-06-01.pdf
  const employee = await prisma.employee.findUnique({
    where: { id },
    select: { employeeCode: true },
  });
  const stamp =
    vm.contract.contractStartOn !== null
      ? vm.contract.contractStartOn.toISOString().slice(0, 10)
      : "no-date";
  const baseName = type === "contract" ? "雇用契約書" : "労働条件通知書";
  const filename = `${baseName}_${employee?.employeeCode ?? id}_${stamp}.pdf`;

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
