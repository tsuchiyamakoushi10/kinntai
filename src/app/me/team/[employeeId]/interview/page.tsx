import { StaffPage } from "@/components/growth/staff-page";
import { InterviewRecordScreen } from "@/components/growth/staff-screens";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ period?: string }>;
};

/** S-E-17 面談記録 (部署の管理者) */
export default async function Page({ params, searchParams }: Props) {
  const [{ employeeId }, sp] = await Promise.all([params, searchParams]);
  return (
    <StaffPage
      employeeId={employeeId}
      periodParam={sp.period}
      tab="interview"
      render={(p) => <InterviewRecordScreen {...p} />}
    />
  );
}
