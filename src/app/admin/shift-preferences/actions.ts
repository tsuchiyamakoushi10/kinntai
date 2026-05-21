"use server";

import { ShiftPreferenceStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";

async function updateStatus(preferenceId: string, next: ShiftPreferenceStatus): Promise<void> {
  const session = await requireAdmin();
  const userId = session.user.id;

  await prisma.shiftPreference.update({
    where: { id: preferenceId },
    data: {
      status: next,
      reviewedById: userId,
      reviewedAt: new Date(),
    },
  });

  revalidatePath("/admin/shift-preferences");
}

export async function acceptShiftPreference(preferenceId: string): Promise<void> {
  await updateStatus(preferenceId, ShiftPreferenceStatus.ACCEPTED);
}

export async function rejectShiftPreference(preferenceId: string): Promise<void> {
  await updateStatus(preferenceId, ShiftPreferenceStatus.REJECTED);
}

export async function resetShiftPreference(preferenceId: string): Promise<void> {
  await updateStatus(preferenceId, ShiftPreferenceStatus.PENDING);
}
