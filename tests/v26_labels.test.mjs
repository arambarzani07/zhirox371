import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
import '../label-tools.js';const tools=globalThis.RetailLabelTools;
const row={name:'Milk',code:'001234',priceMinor:1500,copies:1};
test('label plan preserves leading zeros and rejects guessed money, invalid quantities and excessive batches',()=>{
 assert.equal(tools.plan([row])[0].code,'001234');
 for(const patch of [{priceMinor:null},{priceMinor:1.5},{code:''},{copies:0},{copies:51}])assert.throws(()=>tools.plan([{...row,...patch}]));
 assert.throws(()=>tools.plan(Array.from({length:5},()=>({...row,copies:50}))));
});
test('every queued barcode is resolved against current server price and unknown/error rows fail the batch',async()=>{
 const db={rpc:async(name,args)=>({data:{found:true,code:args.p_code,product_name:'Fresh',price_minor:1750,unit_type:'unit'},error:null})};
 assert.equal((await tools.confirm(db,'store',[row]))[0].priceMinor,1750);
 await assert.rejects(()=>tools.confirm({rpc:async()=>({data:{found:false}})},'store',[row]));
 await assert.rejects(()=>tools.confirm({rpc:async()=>({data:null,error:Error('denied')})},'store',[row]));
});
test('vendored Code128 encoder matches the independent start/data/checksum/stop pattern for ABC',()=>{
 const ctx={window:{}};vm.runInNewContext(readFileSync('vendor/JsBarcode-3.12.1.min.js','utf8'),ctx);const out={};ctx.window.JsBarcode(out,'ABC',{format:'CODE128B'});
 const widths=['211214','111323','131123','131321','222122','2331112'];
 const bits=widths.map(w=>[...w].map((n,i)=>(i%2?'0':'1').repeat(Number(n))).join('')).join('');
 assert.equal(out.encodings.map(x=>x.data).join(''),bits);
});
