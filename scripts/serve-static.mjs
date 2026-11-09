// Serves the static export under the GitHub Pages sub-path, for browser tests.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const BASE = "/PracticeMMI";
const ROOT = join(process.cwd(), "out");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".txt": "text/plain" };

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const relative = pathname === BASE || pathname.startsWith(`${BASE}/`) ? pathname.slice(BASE.length) || "/" : null;
  let file = relative === null ? null : join(ROOT, normalize(relative));
  if (file && existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  const found = file?.startsWith(ROOT) && existsSync(file);
  response.writeHead(found ? 200 : 404, { "content-type": found ? (TYPES[extname(file)] ?? "application/octet-stream") : "text/html" });
  createReadStream(found ? file : join(ROOT, "404.html")).pipe(response);
}).listen(4173, "127.0.0.1");
