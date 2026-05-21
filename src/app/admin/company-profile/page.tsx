import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";

import { CompanyProfileForm } from "./company-profile-form";

export const dynamic = "force-dynamic";

export default async function AdminCompanyProfilePage() {
  await requireAdmin();
  const profile = await prisma.companyProfile.findFirst();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">会社情報</h1>
        <p className="mt-1 text-sm text-slate-500">
          労働条件通知書 / 雇用契約書 PDF
          に出力される全契約共通の条項です。社労士確認に耐える内容を入力してください。
        </p>
      </header>
      <CompanyProfileForm initial={profile} />
    </div>
  );
}
