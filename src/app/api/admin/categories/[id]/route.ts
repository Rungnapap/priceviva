import { departments } from "@/data/departments";
import { guardAdminPost } from "@/lib/server/admin-auth";
import { rpc } from "@/lib/server/supabase-rpc";
import { back } from "@/lib/server/admin-redirect";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardAdminPost(req);
  if (denied) return denied;
  const { id } = await params;
  const f = await req.formData();
  const [dept = "", sub = ""] = String(f.get("target") ?? "").split("/");
  const d = departments.find((x) => x.slug === dept);
  if (dept && !d) return back(req, "/admin/issues?kind=categories", "Unknown department.", false);
  if (sub && !d?.subcategories.some((s) => s.slug === sub)) return back(req, "/admin/issues?kind=categories", "Unknown subcategory.", false);
  await rpc("pa_admin_category_set", { id, department_slug: dept, subcategory_slug: sub }, { role: "service" });
  return back(req, "/admin/issues?kind=categories", "Mapping saved and applied to existing products.");
}
