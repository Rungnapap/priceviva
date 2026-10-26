import { guardAdminPost } from "@/lib/server/admin-auth";
import { rpc } from "@/lib/server/supabase-rpc";
import { back } from "@/lib/server/admin-redirect";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardAdminPost(req);
  if (denied) return denied;
  const { id } = await params;
  const status = String((await req.formData()).get("status") ?? "");
  if (!["resolved", "dismissed"].includes(status)) return new Response("Bad status", { status: 400 });
  await rpc("pa_admin_review_set", { id, status }, { role: "service" });
  return back(req, "/admin/issues?kind=reviews", `Review marked ${status}.`);
}
