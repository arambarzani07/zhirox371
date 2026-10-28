import test from "node:test";
import assert from "node:assert/strict";
import {hashLocalPassword,verifyLocalPassword} from "../local-password.mjs";
test("local password stored as salted verifier, no plaintext",async()=>{
 const h=await hashLocalPassword("A long sample password #123");
 assert.ok(h.startsWith("scrypt-v1:"));
 assert.ok(!h.includes("long sample"));
 assert.equal(await verifyLocalPassword("A long sample password #123",h),true);
 assert.equal(await verifyLocalPassword("wrong password",h),false);
 assert.equal(await verifyLocalPassword("test","malformed"),false);
});
