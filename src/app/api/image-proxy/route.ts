import { checkProxyUrl, proxyRateOk } from "@/lib/server/image-proxy";

export const dynamic = "force-dynamic";
const MAX_BYTES = 3 * 1024 * 1024;

/** GET /api/image-proxy?url=https://cdn.dummyjson.com/... — see src/lib/server/image-proxy.ts for the rules. */
export async function GET(req: Request) {
  const url = checkProxyUrl(new URL(req.url).searchParams.get("url"));
  if (!url) return new Response("Image host not allowed", { status: 400 });
  const client = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "local";
  if (!proxyRateOk(client)) return new Response("Too many image requests", { status: 429 });
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000), redirect: "error", headers: { Accept: "image/*" } });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/^image\/(jpeg|png|webp|gif|avif)/.test(type)) return new Response("Not an image", { status: 502 });
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return new Response("Image too large", { status: 502 });
    return new Response(buf, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response("Image unavailable", { status: 502 });
  }
}
