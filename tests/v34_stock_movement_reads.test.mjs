import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
const window={};for(const f of ['receipt-history.js','stock-movement-reads.js'])runInNewContext(readFileSync(f,'utf8'),{window,Date});const api=window.RetailStockMovementReads;
const event={id:'event',store_id:'shop',product_id:'unit',delta:2,reason:'purchase',created_at:'2026-10-29T08:00:00Z',product:{id:'unit',store_id:'shop',name:'Item',base_unit:'unit'}};
function mock(reply={data:[event],count:1}){const calls=[],q={};for(const m of ['select','eq','order','range','gte','lte','gt','lt','in'])q[m]=(...args)=>{calls.push([m,...args]);return q;};q.then=(yes,no)=>Promise.resolve(reply).then(yes,no);return {calls,db:{from(table){calls.push(['from',table]);return q;}}};}
test('canonical stock pages have stable store-scoped ordering and product metadata without a separate audit or bounded catalog',async()=>{
 const f=mock({data:[event],count:251}),r=await api.read({db:f.db,store:'shop',offset:250});assert.equal(r.total,251);assert.equal(r.rows[0].product.name,'Item');
 assert.deepEqual(f.calls.find(c=>c[0]==='range'),['range',250,299]);assert.deepEqual(f.calls.filter(c=>c[0]==='order').map(c=>c[1]),['created_at','id']);assert.deepEqual(f.calls.filter(c=>c[0]==='from').map(c=>c[1]),['retail_stock_events']);
 assert.ok(f.calls.some(c=>c[0]==='eq'&&c[1]==='store_id'&&c[2]==='shop'));assert.equal(f.calls.find(c=>c[0]==='select')[2].count,'exact');assert.match(f.calls.find(c=>c[0]==='select')[1],/product:retail_products\(id,store_id,name,base_unit\)/);
});
test('denied, incomplete, foreign, duplicate and invalid stock or product replies fail closed',async()=>{
 for(const reply of [{error:Error('denied')},{data:[],count:null},{data:[event],count:251},{data:[event,event],count:2},...[{store_id:'other'},{delta:null},{created_at:'wrong'},{product:undefined},{product:{...event.product,store_id:'other'}},{product:{...event.product,id:'other'}}].map(patch=>({data:[{...event,...patch}],count:1}))])await assert.rejects(()=>api.read({db:mock(reply).db,store:'shop'}));
 assert.equal((await api.read({db:mock({data:[{...event,product:null}],count:1}).db,store:'shop'})).rows[0].product,null);
 for(const offset of [-1,1,1.5,NaN])await assert.rejects(()=>api.read({db:mock().db,store:'shop',offset}));
});
test('stock totals keep kilograms separate from pieces and exclude unknown products',()=>{
 const t=api.totals([{product_id:'unit',delta:3},{product_id:'unit',delta:-1},{product_id:'kg',delta:0.2},{product_id:'kg',delta:0.1},{product_id:'kg',delta:-0.15},{product_id:'missing',delta:900}], [{id:'unit',base_unit:'unit'},{id:'kg',base_unit:'kg'}]);
 assert.equal(t.unit.net,2);assert.equal(t.kg.in,0.3);assert.equal(t.kg.net,0.15);assert.equal(t.unknown,1);
 assert.equal(api.totals([{...event,product:{...event.product,base_unit:'kg'}}],[]).kg.in,2);
 assert.equal(api.totals([{...event,product:null}],[event.product]).unknown,1);
 for(const v of [null,'',true,Infinity,'wrong',0.0001])assert.throws(()=>api.quantity(v));
});
// Exercise the actual async UI controller independently from fixture data.
function ui(read){
 const source=readFileSync('operations.js','utf8'),body=source.slice(source.indexOf('async function refreshStockMovementsView('),source.indexOf('function invalidateMovementFilters(')),nodes=new Map();
 const ctx={window:{RetailStockMovementReads:{criteria:api.criteria,read}},db:{},store:{id:'shop'},user:{id:'actor'},movementsReadToken:0,movementsReady:true,movementsLoading:false,movementsOffset:0,movementsTotal:1,movementsFilters:null,movementsTimer:null,stockMovementsLedger:[event],$:id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:''});return nodes.get(id);},clearTimeout(){},msg(){},safe:String,populateStockSelectors(){},renderStockMovementsView(){},syncMovementPager(){}};
 ctx.$('movements-type-filter').value='all';ctx.$('movements-date-filter').value='all';runInNewContext(body+';this.refresh=refreshStockMovementsView;',ctx);return ctx;
}
test('obsolete stock reads after logout or newer filter refresh cannot replace newer rows',async()=>{
 const pending=[];const ctx=ui(()=>new Promise(resolve=>pending.push(resolve)));const first=ctx.refresh(),second=ctx.refresh();assert.equal(ctx.movementsReady,false);assert.equal(ctx.stockMovementsLedger.length,0);
 pending[1]({rows:[{...event,id:'new'}],total:1});await second;pending[0]({rows:[{...event,id:'old'}],total:1});await first;assert.equal(ctx.stockMovementsLedger[0].id,'new');
 const third=ctx.refresh();ctx.movementsReadToken++;ctx.user=null;pending[2]({rows:[event],total:1});await third;assert.equal(ctx.movementsReady,false);assert.equal(ctx.stockMovementsLedger.length,0);
});
test('stock refresh clears errors, uses canonical rows once, recovers shrinking final pages and retains frozen filters',async()=>{
 const calls=[];let fail=false;const ctx=ui(async args=>{calls.push(args);if(fail)throw Error('denied');return args.offset===250?{rows:[],total:201}:{rows:[event],total:201};});
 ctx.movementsOffset=250;ctx.movementsFilters=api.criteria();const frozen=ctx.movementsFilters;await ctx.refresh(false);assert.equal(ctx.movementsReady,true);assert.equal(ctx.stockMovementsLedger.length,1);assert.equal(ctx.movementsOffset,200);assert.equal(calls.length,2);assert.equal(calls[0].filters,frozen);assert.equal(calls[1].filters,frozen);
 fail=true;await ctx.refresh();assert.equal(ctx.movementsReady,false);assert.equal(ctx.stockMovementsLedger.length,0);assert.equal(ctx.movementsTotal,0);assert.equal(ctx.movementsLoading,false);
});
