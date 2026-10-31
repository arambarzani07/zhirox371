import assert from "node:assert/strict";
import {Pool} from "pg";
import {createLocalAuthV3} from "../local-auth-v3.mjs";
import {TEST_MARKET} from "../test-market-v80.mjs";
const db=process.env.ZHIROX_LOCAL_DB_URL;
const ownerPassword=process.env.ZHIROX_TEST_OWNER_PASSWORD;
const cashierPassword=process.env.ZHIROX_TEST_CASHIER_PASSWORD;
if(!db||!ownerPassword||!cashierPassword)throw Error("isolated credentials missing");
const pool=new Pool({connectionString:db,max:2});
try{
 const auth=createLocalAuthV3({pool,secret:"V80-isolated-authentication-secret-"+"x".repeat(40)});
 const owner=await auth.login({store_id:TEST_MARKET.store,username:TEST_MARKET.ownerUsername,password:ownerPassword});
 assert.equal(owner?.role,"owner","test market owner login must genuinely work");
 const cashier=await auth.login({store_id:TEST_MARKET.store,username:TEST_MARKET.cashierUsername,password:cashierPassword});
 assert.equal(cashier?.role,"cashier","test market cashier login must genuinely work");
 const bad=await auth.login({store_id:TEST_MARKET.store,username:TEST_MARKET.ownerUsername,password:"unrelated-password-0001"});
 assert.equal(bad,null,"invalid password must not authenticate");
 const principal=await auth.authorize(owner.token);
 assert.equal(principal?.store_id,TEST_MARKET.store);
 assert.equal(principal?.user_id,TEST_MARKET.owner);
 console.log("PASS: hashed owner/cashier accounts authenticate in actual isolated PostgreSQL; no passwords printed");
}finally{await pool.end();}
