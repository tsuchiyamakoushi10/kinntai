import { StaffPage } from "@/components/growth/staff-page";
import { GrowthReviewScreen } from "@/components/growth/president-screens";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ period?: string }>;
};

/** S-A-45 面談確認・処遇 (社長) */
export default async function Page({ params, searchParams }: Props) {
  const [{ employeeId }, sp] = await Promise.all([params, searchParams]);
  return (
    <StaffPage
      employeeId={employeeId}
      periodParam={sp.period}
      tab="review"
      presidentOnly
      render={(p) => <GrowthReviewScreen {...p} />}
    />
  );
}
