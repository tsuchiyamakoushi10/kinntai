import { StaffPage } from "@/components/growth/staff-page";
import { FinalAssessmentScreen } from "@/components/growth/president-screens";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ period?: string }>;
};

/** S-A-44 最終考課 (社長) */
export default async function Page({ params, searchParams }: Props) {
  const [{ employeeId }, sp] = await Promise.all([params, searchParams]);
  return (
    <StaffPage
      employeeId={employeeId}
      periodParam={sp.period}
      tab="final"
      presidentOnly
      render={(p) => <FinalAssessmentScreen {...p} />}
    />
  );
}
