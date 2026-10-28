import test from "node:test";
import assert from "node:assert/strict";
import {makeLocalSessionCodec} from "../local-session.mjs";
const ids=["10000000-0000-0000-0000-000000000001","20000000-0000-0000-0000-000000000002"];
const secret="local-test-secret-".repeat(3);
test("offline session roundtrip and store binding",()=>{
 const codec=makeLocalSessionCodec(secret,()=>1000);
 const token=codec.issue({user_id:ids[0],store_id:ids[1],role:"cashier"},10000);
 assert.equal(codec.verify(token,ids[1],["cashier"]).role,"cashier");
 assert.equal(codec.verify(token,ids[0]),null);
 assert.equal(codec.verify(token,ids[1],["owner"]),null);
 assert.equal(makeLocalSessionCodec(secret,()=>11000).verify(token,ids[1]),null);
});
test("session rejects tampering or alternate signer",()=>{
 const codec=makeLocalSessionCodec(secret,()=>1000);
 const token=codec.issue({user_id:ids[0],store_id:ids[1],role:"owner"});
 assert.equal(codec.verify(token+"x",ids[1]),null);
 assert.equal(makeLocalSessionCodec("another-test-secret-".repeat(3),()=>1000).verify(token,ids[1]),null);
 assert.throws(()=>codec.issue({user_id:ids[0],store_id:ids[1],role:"admin"}));
});
