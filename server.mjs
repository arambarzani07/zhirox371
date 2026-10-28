import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const portArg=process.argv.indexOf("--port");
const PORT = Number(portArg>=0?process.argv[portArg+1]:(process.env.PORT||3000));
if(!Number.isInteger(PORT)||PORT<0||PORT>65535)throw new Error("Invalid server port");
const HOST = "0.0.0.0";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".sql": "text/plain; charset=utf-8"
};

const server = http.createServer((req, res) => {
  let pathname;
  try{pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);}
  catch(_e){res.writeHead(400);res.end("Bad request");return;}
  if(pathname==="/")pathname="/index.html";
  const segments=pathname.split("/").filter(Boolean);
  if(segments.some(x=>x.startsWith(".")||x.includes("\\"))||
    ["node_modules","db","tests","supabase","scripts"].includes(segments[0])||
    segments[0]==="server.mjs"||segments[0]?.startsWith("package")){
    res.writeHead(404);res.end("Not found");return;
  }
  let filePath=path.resolve(__dirname,"."+pathname);
  if(!filePath.startsWith(__dirname+path.sep)){res.writeHead(404);res.end("Not found");return;}
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(`404 Not Found: ${pathname}`);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.statusCode = 200;
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-cache");
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Retail OS PC running on http://${HOST}:${server.address().port}`);
});
