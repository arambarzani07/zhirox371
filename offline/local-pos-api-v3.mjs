import http from "node:http";
import { fileURLToPath } from "node:url";
import { createLocalAuthV3 } from "./local-auth-v3.mjs";

// Test-only server. Loopback interface, not a public/LAN service.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(data));
}
async function parseBody(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] || ""))
    return { error: "json_required", status: 415 };
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 65536) return { error: "payload_too_large", status: 413 };
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || Array.isArray(value) || typeof value !== "object")
      return { error: "invalid_json", status: 400 };
    return { value };
  } catch {
    return { error: "invalid_json", status: 400 };
  }
}

export function createLocalPosHandlerV3({ pool, secret, clock }){
  const auth = createLocalAuthV3({ pool, secret, clock });
  return async (req, res) => {
    if (req.method === "GET" && req.url === "/health")
      return send(res, 200, { status: "alive", scope: "offline-auth-v3-test" });
    if (req.method !== "POST" ||
      !["/api/local/v3/login", "/api/local/v3/checkout", "/api/local/v25/checkout", "/api/local/v26/checkout"].includes(req.url))
      return send(res, 404, { error: "not_found" });
    // V63 trial forbids every legacy checkout URI; cash writes must use
    // proof-gated V31 durable prepare/commit/cancel, not direct V1/V25/V26.
    if(process.env.ZHIROX_V63_DB_ACTOR_PROOF==="true" &&
       req.url!=="/api/local/v3/login")
      return send(res,410,{error:"legacy_checkout_disabled_use_v31"});
    const parsed = await parseBody(req);
    if (parsed.error) return send(res, parsed.status, { error: parsed.error });
    const input = parsed.value;
    try {
      if (req.url === "/api/local/v3/login") {
        const session = await auth.login(input);
        return session ? send(res, 200, { ok: true, ...session }) :
          send(res, 401, { error: "invalid_credentials" });
      }
      const header = req.headers.authorization || "";
      const match = /^Bearer (\S+)$/.exec(header);
      const principal = match ? await auth.authorize(match[1]) : null;
      if (!principal) return send(res, 401, { error: "invalid_session" });
      if ("cashier_id" in input || "store_id" in input)
        return send(res, 400, { error: "caller_must_not_supply_identity" });
      const packsV26 = req.url === "/api/local/v26/checkout";
      if (!UUID.test(input.request_id || "") ||
          !Array.isArray(input.lines) || input.lines.length === 0 || input.lines.length > 100 ||
          !input.lines.every(line => line && Number.isSafeInteger(line.qty) &&
            line.qty > 0 && line.qty <= 100 && (packsV26 ?
              typeof line.barcode==="string" && /^[A-Za-z0-9._-]{4,80}$/.test(line.barcode):
              UUID.test(line.product_id || ""))))
        return send(res, 400, { error: "invalid_checkout" });
      const lockedPrice = req.url === "/api/local/v25/checkout" || packsV26;
      if (lockedPrice && (!Number.isSafeInteger(input.expected_total_minor) ||
            input.expected_total_minor < 0 || input.expected_total_minor > 9999999999999))
        return send(res,400,{error:"invalid_expected_total"});
      const client = await pool.connect();
      try {
        const result = packsV26 ? await client.query(
            "SELECT * FROM zhirox_local.checkout_packs_scale_v26($1::uuid,$2::uuid,$3::uuid,$4::jsonb,$5::bigint)",
            [principal.store_id, principal.user_id, input.request_id, JSON.stringify(input.lines), input.expected_total_minor]
          ) : lockedPrice
          ? await client.query(
            "SELECT * FROM zhirox_local.checkout_cash_v25($1::uuid,$2::uuid,$3::uuid,$4::jsonb,$5::bigint)",
            [principal.store_id, principal.user_id, input.request_id, JSON.stringify(input.lines), input.expected_total_minor]
          ) : await client.query(
            "SELECT * FROM zhirox_local.checkout_cash_v1($1::uuid,$2::uuid,$3::uuid,$4::jsonb)",
            [principal.store_id, principal.user_id, input.request_id, JSON.stringify(input.lines)]
          );
        return send(res, 200, { ok: true, receipt: result.rows[0] });
      } catch (error) {
        const status = error.code === "P2501" ? 409 :
          ["23505","23514"].includes(error.code) ? 409 :
          ["22023","22003"].includes(error.code) ? 400 : 503;
        return send(res, status, { error: error.code === "P2501" ? "price_changed" :
          status === 409 ? "checkout_conflict" :
          status === 400 ? "invalid_checkout" : "local_database_unavailable" });
      } finally {
        client.release();
      }
    } catch {
      return send(res, 503, { error: "local_database_unavailable" });
    }
  };
}

export async function startLocalTestServerV3(){
  const { Pool } = await import("pg");
  const connectionString = process.env.ZHIROX_LOCAL_DB_URL;
  const secret = process.env.ZHIROX_LOCAL_SESSION_SECRET;
  if (!connectionString || !secret)
    throw new Error("Test-only local database and session secret required");
  const pool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 2000 });
  const server = http.createServer(createLocalPosHandlerV3({ pool, secret }));
  server.listen(3302, "127.0.0.1");
  return server;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startLocalTestServerV3().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
