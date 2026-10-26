// Sandbox preview build: esbuild bundle + Tailwind v4 compile (no Next.js needed).
import { build } from "/opt/npm-tools/node_modules/esbuild/lib/main.js";
import { compile } from "/opt/npm-tools/node_modules/tailwindcss/dist/lib.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const MODE = process.env.PREVIEW_MODE ?? "demo"; // demo | sample | live
const out = path.join(root, MODE === "demo" ? ".preview-dist" : `.preview-dist-${MODE}`);
fs.mkdirSync(out, { recursive: true });
const NM = "/opt/npm-tools/node_modules";

await build({
  entryPoints: [path.join(here, "entry.tsx")],
  bundle: true, format: "esm", outfile: path.join(out, "app.js"), jsx: "automatic", minify: false, sourcemap: false,
  // Sandbox env for the browser bundle. PREVIEW_MODE=live points the app at the local PostgREST stand-in.
  // Sample and live previews also get accounts (the Supabase stand-in on :54400); the demo preview has none, so
  // the "accounts not switched on" path stays covered.
  banner: { js: `globalThis.process = { cwd: () => "/", env: ${JSON.stringify(MODE === "demo" ? { NODE_ENV: "development", CATALOG_SOURCE: "demo" } : {
    NODE_ENV: "development", CATALOG_SOURCE: MODE, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54400",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key-000" })} };` },
  plugins: [{
    name: "sandbox-shims",
    setup(b) {
      // Server-only file access is replaced in the browser preview.
      b.onResolve({ filter: /(^|\/)(io|catalog-source|http)$/ }, (a) => {
        const target = path.resolve(a.resolveDir, a.path.replace(/^@\//, path.join(root, "src") + "/"));
        if (target.endsWith(path.join("src/lib/sample/io"))) return { path: path.join(here, "shims/sample-io.ts") };
        if (target.endsWith(path.join("src/lib/server/catalog-source"))) return { path: path.join(here, "shims/catalog-source.ts") };
        if (target.endsWith(path.join("src/lib/server/auth/http"))) return { path: path.join(here, "shims/auth-http.ts") };
        return undefined;
      });
    },
  }],
  target: "es2022",
  nodePaths: [NM],
  alias: {
    "@": path.join(root, "src"),
    "next/link": path.join(here, "shims/next-link.tsx"),
    "next/navigation": path.join(here, "shims/next-navigation.ts"),
    "next/font/google": path.join(here, "shims/next-font.ts"),
    "lucide-react": path.join(here, "shims/lucide-react.tsx"),
    "next/server": path.join(here, "shims/next-server.ts"),
    "next/image": path.join(here, "shims/next-image.tsx"),
    "next/headers": path.join(here, "shims/next-headers.ts"),
  },
  loader: { ".css": "empty" },
  logLevel: "warning",
});

// Tailwind: scan source files for candidate class names.
const files = [];
const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); f.isDirectory() ? walk(p) : /\.(tsx?|ts)$/.test(f.name) && files.push(p); } };
walk(path.join(root, "src"));
const candidates = new Set();
for (const f of files) for (const m of fs.readFileSync(f, "utf8").matchAll(/[^\s"'`{}<>]+/g)) candidates.add(m[0]);
const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");
const compiler = await compile(css, {
  base: root,
  loadStylesheet: async (id, base) => {
    const p = id === "tailwindcss" ? path.join(NM, "tailwindcss/index.css") : path.resolve(base, id);
    return { path: p, base: path.dirname(p), content: fs.readFileSync(p, "utf8") };
  },
});
fs.writeFileSync(path.join(out, "app.css"), compiler.build([...candidates]));

const { themeScript } = { themeScript: fs.readFileSync(path.join(root, "src/components/app-shell.tsx"), "utf8").match(/themeScript = `([^`]+)`/)[1] };
fs.cpSync(path.join(root, "public"), out, { recursive: true });
fs.mkdirSync(path.join(out, "data"), { recursive: true });
fs.copyFileSync(path.join(root, "data/sample-offers.csv"), path.join(out, "data/sample-offers.csv"));
fs.writeFileSync(path.join(out, "index.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PriceViva (sandbox preview)</title><script>${themeScript}</script><link rel="stylesheet" href="/app.css"></head><body class="min-h-screen antialiased"><div id="root"></div><script type="module" src="/app.js"></script></body></html>`);
console.log("preview built:", out, `(${candidates.size} class candidates scanned)`);
