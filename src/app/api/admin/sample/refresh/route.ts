import { revalidatePath } from "next/cache";
import { guardAdminPost } from "@/lib/server/admin-auth";
import { back } from "@/lib/server/admin-redirect";
import { getSampleCatalog } from "@/lib/sample/loader";

export const runtime = "nodejs";

/** Re-fetch DummyJSON products and re-import the sample offers CSV now. */
export async function POST(req: Request) {
  const denied = await guardAdminPost(req);
  if (denied) return denied;
  const c = await getSampleCatalog({ force: true });
  const s = c.status;
  revalidatePath("/", "layout");
  if (!s.ok) return back(req, "/admin/sample", s.error ?? "Sample data could not be loaded.", false);
  return back(
    req,
    "/admin/sample",
    `Loaded ${s.productCount} sample products (${s.source === "api" ? "from the API" : "from the saved copy — API unreachable"}); ${s.offers?.imported ?? 0} sample offers imported, ${s.offers?.issues.length ?? 0} CSV rows rejected.`,
    s.source === "api",
  );
}
