import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

test("V95 is isolated, nonfinancial preflight and append-only audit",()=>{
 const sql=readFileSync("offline/migrations/040_v95_checkout_preflight_audit.sql","utf8");
 assert.match(sql,/current_database\(\)<>'zhirox_v80_disposable'/);
 assert.match(sql,/CREATE TABLE zhirox_local.checkout_intent_audit_v95/);
 assert.match(sql,/CREATE ROLE zhirox_v95_gate/);
 assert.match(sql,/SECURITY DEFINER/);
 assert.match(sql,/session_user<>'zhirox_v95_gate'/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION zhirox_local.preflight_checkout_v95/);
 assert.doesNotMatch(sql,/\b(?:INSERT INTO zhirox_local.sales|UPDATE zhirox_local.products|DELETE FROM zhirox_local.sales)\b/i);
});
