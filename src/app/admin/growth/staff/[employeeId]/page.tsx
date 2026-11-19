import { StaffPage } from "@/components/growth/staff-page";
import { StaffChartScreen } from "@/components/growth/staff-screens";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ period?: string }>;
};

/** S-E-16 職員カルテ (社長) */
export default async function Page({ params, searchParams }: Props) {
  const [{ employeeId }, sp] = await Promise.all([params, searchParams]);
  return (
    <StaffPage
      employeeId={employeeId}
      periodParam={sp.period}
      tab="chart"
      render={(p) => <StaffChartScreen {...p} />}
    />
  );
}
