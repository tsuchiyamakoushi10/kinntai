"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";

export type OfficeFormState = {
  error?: string;
  values?: {
    code: string;
    name: string;
    address: string;
    isActive: boolean;
  };
};

// 拠点コードは seed の "NRS-CENTER" のように英大文字・数字・ハイフン・アンダースコア。
const CODE_PATTERN = /^[A-Z0-9_-]+$/;

function parse(formData: FormData): NonNullable<OfficeFormState["values"]> {
  return {
    code: String(formData.get("code") ?? "")
      .trim()
      .toUpperCase(),
    name: String(formData.get("name") ?? "").trim(),
    address: String(formData.get("address") ?? "").trim(),
    isActive: formData.get("isActive") === "on",
  };
}

function validate(v: NonNullable<OfficeFormState["values"]>): string | null {
  if (!v.code) return "拠点コードを入力してください。";
  if (v.code.length > 32) return "拠点コードは 32 文字以内で入力してください。";
  if (!CODE_PATTERN.test(v.code)) {
    return "拠点コードは英大文字・数字・ハイフン・アンダースコアのみ使えます（例: NRS-CENTER）。";
  }
  if (!v.name) return "名称を入力してください。";
  if (v.name.length > 100) return "名称は 100 文字以内で入力してください。";
  if (v.address.length > 200) return "住所は 200 文字以内で入力してください。";
  return null;
}

export async function createOffice(
  _prev: OfficeFormState,
  formData: FormData,
): Promise<OfficeFormState> {
  await requireAdmin();
  const v = parse(formData);
  const err = validate(v);
  if (err) return { error: err, values: v };

  try {
    await prisma.office.create({
      data: {
        code: v.code,
        name: v.name,
        address: v.address || null,
        isActive: v.isActive,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "この拠点コードはすでに使われています。", values: v };
    }
    throw e;
  }

  revalidatePath("/admin/offices");
  redirect("/admin/offices");
}

export async function updateOffice(
  id: string,
  _prev: OfficeFormState,
  formData: FormData,
): Promise<OfficeFormState> {
  await requireAdmin();
  const v = parse(formData);
  const err = validate(v);
  if (err) return { error: err, values: v };

  try {
    await prisma.office.update({
      where: { id },
      data: {
        code: v.code,
        name: v.name,
        address: v.address || null,
        isActive: v.isActive,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") {
        return { error: "この拠点コードはすでに使われています。", values: v };
      }
      if (e.code === "P2025") {
        return { error: "対象の拠点が見つかりませんでした。", values: v };
      }
    }
    throw e;
  }

  revalidatePath("/admin/offices");
  revalidatePath(`/admin/offices/${id}/edit`);
  redirect("/admin/offices");
}
