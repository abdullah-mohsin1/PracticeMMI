// Serves out/ the way a static host would, for browser tests. No server logic.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = join(process.cwd(), "out");
const port = Number(process.env.PORT ?? 8788);
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".txt": "text/plain", ".ico": "image/x-icon", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

createServer((request, response) => {
  const pathname = normalize(decodeURIComponent(new URL(request.url, "http://x").pathname));
  let file = join(root, pathname);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  const found = file.startsWith(root) && existsSync(file);
  if (!found) file = join(root, "404.html");
  response.writeHead(found ? 200 : 404, { "content-type": types[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(response);
}).listen(port, "127.0.0.1");
