import test from "node:test";
import assert from "node:assert/strict";
import {createV64LoginLimiter,V64_CASH_API_ALLOWLIST} from "../lan-gateway-v33.mjs";

test("V64 login budget is per actual peer, bounded and time-windowed",()=>{
 let ms=1000;
 const allow=createV64LoginLimiter({now:()=>ms,windowMs:60000,limit:3,maxPeers:2});
 assert.equal(allow("127.0.0.1"),true);
 assert.equal(allow("127.0.0.1"),true);
 assert.equal(allow("127.0.0.1"),true);
 assert.equal(allow("127.0.0.1"),false);
 assert.equal(allow("192.168.1.23"),true,"peer 2 independent");
 assert.equal(allow("192.168.1.24"),false,"unknown peer is fail-closed at capacity");
 ms+=60_000;
 assert.equal(allow("127.0.0.1"),true,"window expired");
 assert.equal(allow("192.168.1.24"),true,"expired peer slots reclaimed");
});

test("V64 only explicitly reviewed V63 cash endpoints are reachable",()=>{
 for(const approved of [
 "/api/local/v3/login","/api/local/v26/scan",
 "/api/local/v31/prepare","/api/local/v31/commit","/api/local/v31/cancel",
 "/api/local/v34/receipt","/api/local/v35/print-jobs",
 "/api/local/v37/shift/open","/api/local/v37/shift/close"
 ]) assert.ok(V64_CASH_API_ALLOWLIST.has(approved),approved);
 for(const denied of [
 "/api/local/v39/refunds","/api/local/v40/partial-refund",
 "/api/local/v41/tender","/api/local/v42/settlement",
 "/api/local/v43/hold","/api/local/v44/reconcile",
 "/api/local/v45/audit","/api/local/v64/delete"
 ]) assert.equal(V64_CASH_API_ALLOWLIST.has(denied),false,denied);
});
