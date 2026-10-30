// V69: actual isolated Docker bridge HTTPS gateway; no host port exposed.
// One PostgreSQL 16 container and five separately namespaced cashier containers.
// NOT Windows or a physical network card.
import {Pool} from "pg";
import {readFile} from "node:fs/promises";
import {createServer} from "node:https";
import {createV33LanHandler,createV33ClientLimiter,parseV33Peers} from "../lan-gateway-v33.mjs";
import {createLocalShiftHandlerV37} from "../local-shifts-v37.mjs";
if(process.env.ZHIROX_V69_ISOLATED_BRIDGE!=="true"||
 process.env.ZHIROX_V63_DB_ACTOR_PROOF!=="true"||
 process.env.ZHIROX_V64_AUTH_GATE_ENABLED!=="true"||
 process.env.PGHOST!=="v69db"||
 process.env.PGDATABASE!=="zhirox_v59_ci_test"||
 process.env.PGUSER!=="zhirox_v60_api_ci"||
 process.env.PGPASSWORD!=="V60-SYNTHETIC-CI-ONLY-DO-NOT-REUSE"||
 process.env.ZHIROX_RELEASE_MODE==="official")
 throw Error("V69 refuses non-isolated DB/unsafe environment");
const peers=parseV33Peers(process.env.ZHIROX_V69_ALLOWED_PEERS);
if(peers.size!==5)throw Error("five explicit LAN peers required");
const [cert,key]=await Promise.all([
 readFile("/v69-private/cert.pem"),
 readFile("/v69-private/key.pem")]);
const pool=new Pool({host:process.env.PGHOST,user:process.env.PGUSER,
 password:process.env.PGPASSWORD,database:process.env.PGDATABASE,
 port:5432,max:12,connectionTimeoutMillis:4000});
const secret="v69-test-only-local-session-key-".repeat(3);
const localHandler=createLocalShiftHandlerV37({pool,secret});
const handler=createV33LanHandler({pool,secret,peers,
 v64Protected:true,localHandler,limiter:createV33ClientLimiter({limit:150})});
const server=createServer({cert,key,minVersion:"TLSv1.2"},handler);
server.on("error",e=>{console.error("V69_GATEWAY_FAILED",e.code);process.exitCode=1;});
server.listen(3443,"0.0.0.0",()=>console.log("V69 LAN GATEWAY READY: 3443, 5 trusted peers, db v69db"));
for(const sig of ["SIGTERM","SIGINT"]){
 process.once(sig,()=>server.close(()=>pool.end().finally(()=>process.exit(0))));
}
