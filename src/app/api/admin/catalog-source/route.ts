import { revalidatePath } from "next/cache";
import { guardAdminPost } from "@/lib/server/admin-auth";
import { back } from "@/lib/server/admin-redirect";
import { writeSourceOverride } from "@/lib/server/catalog-source";
import { serverEnv } from "@/lib/server/env";
import type { CatalogMode } from "@/lib/types";

export const runtime = "nodejs";

const LABEL: Record<CatalogMode, string> = { sample: "Test mode (DummyJSON sample API)", live: "Real feed mode (Awin)", demo: "Built-in fictional demo" };

/** Admin switch between DEMO API (test) mode, the built-in demo and authorised REAL FEED mode. */
export async function POST(req: Request) {
  const denied = await guardAdminPost(req);
  if (denied) return denied;
  const v = String((await req.formData()).get("source") ?? "");
  if (v !== "sample" && v !== "live" && v !== "demo" && v !== "env") return new Response("Bad source", { status: 400 });
  if (v === "live" && (!serverEnv.supabaseUrl || !serverEnv.supabaseAnonKey))
    return back(req, "/admin", "Real feed mode needs Supabase configured first (NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY).", false);
  try {
    writeSourceOverride(v === "env" ? null : v);
    revalidatePath("/", "layout"); // drop cached pages built from the previous source
  } catch {
    return back(req, "/admin", "Could not save the switch on this server (read-only file system). Set CATALOG_SOURCE in your hosting environment instead.", false);
  }
  return back(req, "/admin", v === "env" ? "Switch cleared — using CATALOG_SOURCE from the environment." : `Catalogue source set to: ${LABEL[v]}.`);
}
