import http from "node:http";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {createLocalAuthV3} from "./local-auth-v3.mjs";
import {createLocalPilotHandler} from "./local-pilot-server-v4.mjs";

// Standalone V5 pilot; never bind to LAN until authorization/TLS provisioning is ready.
const uiPath=fileURLToPath(new URL("./local-catalog-v5.html",import.meta.url));
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const respond=(res,status,data)=>{res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(data));};
function parseCursor(raw){
 if(!raw)return null;
 if(raw.length>2000 || !/^[A-Za-z0-9_-]+$/.test(raw))throw Error("bad_cursor");
 let value;
 try{value=JSON.parse(Buffer.from(raw,"base64url").toString("utf8"));}catch{throw Error("bad_cursor")}
 if(!value || typeof value.name!=="string" || value.name.length>500 || !UUID.test(value.id||""))
   throw Error("bad_cursor");
 return value;
}
const makeCursor=row=>Buffer.from(JSON.stringify({name:row.name,id:row.id})).toString("base64url");
export function createLocalCatalogHandlerV5({pool,secret,clock}){
 const auth=createLocalAuthV3({pool,secret,clock});
 const v4=createLocalPilotHandler({pool,secret,clock});
 return async(req,res)=>{
  const url=new URL(req.url||"/","http://localhost");
  if(req.method==="GET" && url.pathname==="/catalog"){
    try{
      const html=await readFile(uiPath);
      res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store",
      "X-Content-Type-Options":"nosniff",
      "Content-Security-Policy":"default-src 'none'; connect-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"});
      return res.end(html);
    }catch{return respond(res,503,{error:"catalog_ui_unavailable"})}
  }
  if(url.pathname!=="/api/local/v5/products" || req.method!=="GET")return v4(req,res);
  const match=/^Bearer (\S+)$/.exec(req.headers.authorization||"");
  const principal=match?await auth.authorize(match[1]).catch(()=>null):null;
  if(!principal)return respond(res,401,{error:"invalid_session"});
  const search=(url.searchParams.get("search")||"").trim();
  const limitText=url.searchParams.get("limit")||"20";
  const limit=Number(limitText);
  if(search.length>80 || !Number.isSafeInteger(limit) || limit<1 || limit>50)
    return respond(res,400,{error:"invalid_pagination"});
  let cursor;
  try{cursor=parseCursor(url.searchParams.get("cursor"))}catch{return respond(res,400,{error:"invalid_cursor"})}
  try {
    const result=await pool.query(`
      SELECT p.id,p.name,p.price_minor::text AS price_minor,
             p.stock_base_units::text AS stock_base_units,p.version::text AS version,
             COALESCE((
               SELECT jsonb_agg(jsonb_build_object('code',b.code,'quantity_base_units',b.quantity_base_units)
                                ORDER BY b.code)
               FROM zhirox_local.barcodes b
               WHERE b.store_id=p.store_id AND b.product_id=p.id AND b.active
             ),'[]'::jsonb) AS barcodes
      FROM zhirox_local.products p
      WHERE p.store_id=$1 AND p.active=true
        AND ($2::text='' OR starts_with(lower(p.name),lower($2))
             OR EXISTS(SELECT 1 FROM zhirox_local.barcodes bx
                 WHERE bx.store_id=p.store_id AND bx.product_id=p.id AND bx.active AND bx.code=$2))
        AND ($3::text IS NULL OR (p.name,p.id)>($3::text,$4::uuid))
      ORDER BY p.name,p.id LIMIT $5`,
      [principal.store_id,search,cursor?.name??null,cursor?.id??null,limit+1]
    );
    const rows=result.rows||[],more=rows.length>limit,items=rows.slice(0,limit);
    return respond(res,200,{ok:true,items,next_cursor:more?makeCursor(items.at(-1)):null});
  }catch{return respond(res,503,{error:"local_database_unavailable"})}
 };
}
export async function startCatalogPilotV5(){
 const {Pool}=await import("pg");
 if(!process.env.ZHIROX_LOCAL_DB_URL||!process.env.ZHIROX_LOCAL_SESSION_SECRET)
   throw Error("isolated local DB URL and session secret required");
 const pool=new Pool({connectionString:process.env.ZHIROX_LOCAL_DB_URL,max:5,connectionTimeoutMillis:2000});
 const server=http.createServer(createLocalCatalogHandlerV5({pool,secret:process.env.ZHIROX_LOCAL_SESSION_SECRET}));
 server.listen(3305,"127.0.0.1");
 return server;
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]){
 startCatalogPilotV5().catch(e=>{console.error(e.message);process.exitCode=1;});
}
