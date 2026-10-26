import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const dir = path.resolve(process.argv[2]); const port = Number(process.argv[3] || 4321);
const types = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".webp": "image/webp", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json" };
http.createServer((req, res) => {
  const p = path.join(dir, decodeURIComponent(new URL(req.url, "http://x").pathname));
  const file = p.startsWith(dir) && fs.existsSync(p) && fs.statSync(p).isFile() ? p : path.join(dir, "index.html");
  res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" }); fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log("serving on", port));
