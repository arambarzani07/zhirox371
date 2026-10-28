import http from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";

// Development-only isolated API. Do not expose to LAN or production until
// local user/role authentication, TLS and deployment hardening are implemented.
export function createLocalPosHandler({ pool, token }) {
  if (!pool || typeof pool.connect !== "function") throw new Error("database pool required");
  if (typeof token !== "string" || token.length < 32) throw new Error("32+ character local API token required");
  return async (req, res) => {
    const send = (status, value) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify(value));
    };
    if (req.url === "/health" && req.method === "GET") return send(200, { status: "alive", scope: "local-test" });
    if (req.url !== "/api/local/v1/checkout" || req.method !== "POST") return send(404, { error: "not_found" });
    const supplied = req.headers.authorization?.replace(/^Bearer /, "") || "";
    const a = Buffer.from(supplied), b = Buffer.from(token);
    if (a.length !== b.length || !timingSafeEqual(a,b)) return send(401, { error: "unauthorized" });
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] || "")) return send(415, { error: "json_required" });
    let raw = "";
    try {
      for await (const chunk of req) {
        raw += chunk.toString("utf8");
        if (Buffer.byteLength(raw) > 64 * 1024) return send(413, { error: "payload_too_large" });
      }
      const body = JSON.parse(raw);
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (![body.store_id,body.cashier_id,body.request_id].every(v => typeof v === "string" && uuid.test(v)) ||
          !Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > 100 ||
          !body.lines.every(x => x && uuid.test(x.product_id) && Number.isSafeInteger(x.qty) && x.qty > 0))
        return send(400, { error: "invalid_checkout" });
      const client = await pool.connect();
      try {
        // PostgreSQL function owns the atomic transaction: sales, stock, receipt, outbox.
        const result = await client.query(
          "SELECT * FROM zhirox_local.checkout_cash_v1($1::uuid,$2::uuid,$3::uuid,$4::jsonb)",
          [body.store_id,body.cashier_id,body.request_id,JSON.stringify(body.lines)]
        );
        return send(200,{ ok:true, receipt: result.rows[0] });
      } catch (e) {
        const mapped = e.code === "23514" ? 409 : e.code === "23505" ? 409 : e.code === "22023" ? 400 : 500;
        return send(mapped,{ error: mapped===500 ? "internal_error" : "checkout_rejected" });
      } finally { client.release(); }
    } catch (e) {
      return send(e instanceof SyntaxError ? 400 : 503, { error: e instanceof SyntaxError ? "invalid_json" : "local_database_unavailable" });
    }
  };
}
export async function startLocalTestServer() {
  const { Pool } = await import("pg");
  const connectionString = process.env.ZHIROX_LOCAL_DB_URL;
  const token = process.env.ZHIROX_LOCAL_TEST_TOKEN;
  if (!connectionString || !token) throw new Error("ZHIROX_LOCAL_DB_URL and ZHIROX_LOCAL_TEST_TOKEN required");
  const pool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 2000 });
  const server = http.createServer(createLocalPosHandler({pool,token}));
  server.listen(3301,"127.0.0.1");
  return server;
}
if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  startLocalTestServer().catch(e => { console.error(e.message); process.exitCode=1; });
}
