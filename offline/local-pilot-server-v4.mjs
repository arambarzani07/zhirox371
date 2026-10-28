import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createLocalAuthV3 } from "./local-auth-v3.mjs";
import { createLocalPosHandlerV3 } from "./local-pos-api-v3.mjs";

// V4 development pilot: only binds 127.0.0.1. Not ready for cash register LAN.
const pilotPath = fileURLToPath(new URL("./local-cashier-v4.html", import.meta.url));
function json(res, code, payload) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(JSON.stringify(payload));
}
export function createLocalPilotHandler({ pool, secret, clock }) {
  const v3 = createLocalPosHandlerV3({ pool, secret, clock });
  const auth = createLocalAuthV3({ pool, secret, clock });
  return async (req, res) => {
    const pathname = new URL(req.url || "/", "http://localhost").pathname;
    if (pathname === "/pilot" && req.method === "GET") {
      try {
        const html = await readFile(pilotPath);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; connect-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" });
        res.end(html);
      } catch {json(res, 503, {error:"pilot_unavailable"});}
      return;
    }
    if (pathname === "/api/local/v4/barcode" && req.method === "GET") {
      const authHeader = /^Bearer (\S+)$/.exec(req.headers.authorization || "");
      const principal = authHeader ? await auth.authorize(authHeader[1]).catch(()=>null) : null;
      if (!principal) return json(res,401,{error:"invalid_session"});
      const code = new URL(req.url,"http://localhost").searchParams.get("code");
      if (!code || !/^[0-9A-Za-z._-]{4,80}$/.test(code))
        return json(res,400,{error:"invalid_barcode"});
      try {
        const result = await pool.query(
          "SELECT p.id AS product_id,p.name,p.price_minor,p.stock_base_units,b.quantity_base_units FROM zhirox_local.barcodes b JOIN zhirox_local.products p ON p.store_id=b.store_id AND p.id=b.product_id WHERE b.store_id=$1 AND b.code=$2 AND b.active=true AND p.active=true LIMIT 1",
          [principal.store_id,code]
        );
        const item = result.rows[0];
        if (!item) return json(res,404,{error:"barcode_not_found"});
        // Pack price, scale/weight, and discounts are NOT supported by the V1 core.
        if (Number(item.quantity_base_units)!==1)
          return json(res,409,{error:"package_checkout_not_supported"});
        return json(res,200,{ok:true,product:{
          id:item.product_id,name:item.name,price_minor:String(item.price_minor),
          stock_base_units:String(item.stock_base_units),barcode:code
        }});
      } catch {return json(res,503,{error:"local_database_unavailable"});}
    }
    return v3(req,res);
  };
}
export async function startLocalPilotServer(){
  const {Pool}=await import("pg");
  if(!process.env.ZHIROX_LOCAL_DB_URL || !process.env.ZHIROX_LOCAL_SESSION_SECRET)
    throw Error("isolated local DB URL and session secret required");
  const pool=new Pool({connectionString:process.env.ZHIROX_LOCAL_DB_URL,max:5,connectionTimeoutMillis:2000});
  const server=http.createServer(createLocalPilotHandler({pool,secret:process.env.ZHIROX_LOCAL_SESSION_SECRET}));
  server.listen(3304,"127.0.0.1");
  return server;
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]){
  startLocalPilotServer().catch(err=>{console.error(err.message);process.exitCode=1;});
}
