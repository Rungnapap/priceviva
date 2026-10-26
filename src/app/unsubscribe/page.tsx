import type { Metadata } from "next";
import { UnsubscribeForm } from "@/components/unsubscribe-form";

export const metadata: Metadata = { title: "Stop price-alert e-mails", robots: { index: false } };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function UnsubscribePage({ searchParams }: { searchParams: SP }) {
  const t = (await searchParams).token;
  return <UnsubscribeForm token={(Array.isArray(t) ? t[0] : t)?.slice(0, 400) ?? ""} />;
}
