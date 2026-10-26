import type { Metadata } from "next";
import { ResetForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default function ResetPasswordPage() {
  return <ResetForm />;
}
