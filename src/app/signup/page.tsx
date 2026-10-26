import type { Metadata } from "next";
import { SignupForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Create an account", robots: { index: false } };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.slice(0, 300);

export default async function SignupPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  return <SignupForm next={one(sp.next)} />;
}
