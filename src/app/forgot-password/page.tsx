import type { Metadata } from "next";
import { ForgotForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false } };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.slice(0, 40);

export default async function ForgotPasswordPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  return <ForgotForm notice={one(sp.notice)} />;
}
