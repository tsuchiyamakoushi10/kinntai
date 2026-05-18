import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";

import { updateOffice } from "../../actions";
import { OfficeForm } from "../../office-form";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditOfficePage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;

  const office = await prisma.office.findUnique({ where: { id } });
  if (!office) notFound();

  const action = updateOffice.bind(null, id);

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="ぱんくず" className="text-sm text-slate-500">
        <Link href="/admin/offices" className="hover:underline">
          拠点設定
        </Link>
        <span className="mx-1">/</span>
        <span className="text-slate-700">{office.name}</span>
      </nav>
      <h1 className="text-2xl font-bold text-slate-900">拠点を編集</h1>
      <OfficeForm
        action={action}
        initial={{
          code: office.code,
          name: office.name,
          address: office.address ?? "",
          isActive: office.isActive,
        }}
        submitLabel="保存する"
      />
    </div>
  );
}
