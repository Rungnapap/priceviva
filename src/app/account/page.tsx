import type { Metadata } from "next";
import { AccountDashboard } from "@/components/account-dashboard";

export const metadata: Metadata = { title: "Account", robots: { index: false } };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function AccountPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  return <AccountDashboard welcome={sp.welcome === "1"} />;
}
