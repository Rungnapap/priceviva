/**
 * TEST HELPER: a tiny stand-in for Supabase's PostgREST, backed by a real local PostgreSQL via psql.
 * Supports only what PriceAtlas uses: POST /rest/v1/rpc/<fn> with body {"p": …}.
 * Requests run as the database role matching the API key (anon / service_role), so function
 * grants are exercised exactly like on Supabase.
 */
import { createServer, type Server } from "node:http";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";

export interface PgConn {
  host: string;
  port: string;
  user: string;
  database: string;
}

export function psql(conn: PgConn, sql: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "psql",
      ["-h", conn.host, "-p", conn.port, "-U", conn.user, "-d", conn.database, "-v", "ON_ERROR_STOP=1", "-qAt", "-c", sql],
      { maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout)),
    );
  });
}

export async function startPostgrestMock(conn: PgConn, keys: { anon: string; service: string }, port = 0): Promise<{ url: string; server: Server; calls: string[] }> {
  const calls: string[] = [];
  const server = createServer((req, res) => {
    // CORS so the sandbox browser preview can call it directly (test helper only).
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "apikey, authorization, content-type, accept, content-profile, accept-profile");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      const m = req.url?.match(/^\/rest\/v1\/rpc\/(pa_[a-z_]+)$/);
      const key = req.headers["apikey"];
      const role = key === keys.service ? "service_role" : key === keys.anon ? "anon" : null;
      if (req.method !== "POST" || !m || !role) {
        res.writeHead(m ? 401 : 404, { "content-type": "application/json" });
        return res.end(JSON.stringify({ message: role ? "not found" : "Invalid API key" }));
      }
      calls.push(`${role}:${m[1]}`);
      try {
        const p = JSON.stringify((JSON.parse(body || "{}") as { p?: unknown }).p ?? {});
        const tag = `j${randomBytes(6).toString("hex")}`;
        const out = await psql(conn, `set role ${role}; select public.${m[1]}(p => $${tag}$${p}$${tag}$::jsonb);`);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(out.trim() === "" ? "null" : out.trim());
      } catch (e) {
        const msg = (e as Error).message.replace(/^psql:.*?ERROR:\s*/s, "");
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ message: msg.trim() }));
      }
    });
  });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  const addr = server.address();
  const bound = typeof addr === "object" && addr ? addr.port : 0;
  return { url: `http://127.0.0.1:${bound}`, server, calls };
}
