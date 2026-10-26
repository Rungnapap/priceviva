import type { Metadata } from "next";
import { LoginForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Log in", robots: { index: false } };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.slice(0, 300);

export default async function LoginPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  return <LoginForm next={one(sp.next)} notice={one(sp.notice)} />;
}
