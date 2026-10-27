import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import vm from "node:vm";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const js=readFileSync(resolve(root,"operations.js"),"utf8");
const html=readFileSync(resolve(root,"operations.html"),"utf8");
const start=js.indexOf("function renderCart(){");
const end=js.indexOf("async function refreshStaff()",start);
assert.ok(start>=0&&end>start,"Basket renderer must exist");
const renderer=js.slice(start,end);

class FakeNode {
 constructor(tag){
  this.tagName=tag;
  this.children=[];this.textContent="";this.dataset={};this.style={};
  this.disabled=false;this.className="";this.value="";
  this.attrs={};this.id="";
 }
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=[...children];}
 setAttribute(name,value){this.attrs[name]=String(value);}
}
function drawBasket(cart,paid=0,discount=0){
 const nodes={total:new FakeNode("div"),cash:new FakeNode("input"),
   change:new FakeNode("div"),"cart-list":new FakeNode("div")};
 nodes.cash.value=String(paid);
 const total= Math.max(0,cart.reduce((n,it)=>n+it.qty*it.price,0)-discount);
 const ctx=vm.createContext({
  cart,document:{createElement:tag=>new FakeNode(tag)},
  $:key=>nodes[key],cartNetTotal:()=>total,
  money:n=>Number(n).toLocaleString("en-US")+" IQD",
 });
 vm.runInContext(renderer,ctx);
 ctx.renderCart();
 return {nodes,total,table:nodes["cart-list"].children[0]};
}
function cells(row){return row.children.map(cell=>cell.textContent);}
const labels=["ژمارە","ناوی کاڵا","یەکە","نرخ","بڕ","کۆ"];

test("Six solid-bordered cashier basket columns share receipt order",()=>{
 assert.match(html,/#cart-list \.cash-basket-grid\{[^}]*border:1px solid #334155/);
 assert.match(html,/#cart-list \.cash-basket-grid th,#cart-list \.cash-basket-grid td\{[^}]*border:1px solid #334155/);
 assert.match(html,/table-layout:fixed;direction:rtl/);
 assert.match(html,/#cart-list \.cash-basket-grid \.basket-quantity-actions button/);
 assert.match(html,/\.desktop\{min-width:1020px/);
});
test("0.245 kg scale tomato shows price per kg, kg quantity and correct IQD line sum",()=>{
 const {nodes,table}=drawBasket([{
  id:"tomato",name:"تەماتە",qty:1,units:0.245,price:306,
  unitKgPrice:1250,scaleGrams:245,isScale:true,mode:"unit"
 }],306);
 assert.equal(nodes.total.textContent,"306 IQD");
 assert.equal(table.tagName,"table");
 assert.equal(table.className,"cash-basket-grid");
 assert.deepEqual(table.children[1].children[0].children.map(th=>th.textContent),labels);
 const row=table.children[2].children[0];
 assert.deepEqual(cells(row).slice(0,4),["1","تەماتە","کیلۆگرام","1,250"]);
 assert.equal(row.children[5].textContent,"306");
 const quantity=row.children[4].children[0];
 assert.equal(quantity.children[0].textContent,"0.245");
 const actions=quantity.children[1].children;
 assert.equal(actions[0].dataset.delta,"-1");
 assert.equal(actions[0].dataset.line,0);
 assert.equal(actions[1].disabled,true);
});
test("Carton and unit rows are numbered, have pack prices and keep live buttons",()=>{
 const {table,nodes}=drawBasket([
  {id:"water",name:"ئاو",qty:2,price:11000,mode:"carton",units:12,isScale:false},
  {id:"apple",name:"سێو",qty:3,price:500,mode:"unit",units:1,isScale:false}
 ],24000);
 const rows=table.children[2].children;
 assert.equal(rows.length,2);
 assert.deepEqual(cells(rows[0]).slice(0,4),["1","ئاو","کارتۆن","11,000"]);
 assert.equal(rows[0].children[5].textContent,"22,000");
 assert.equal(rows[0].children[4].children[0].children[0].textContent,"2");
 assert.equal(rows[0].children[4].children[0].children[1].children[1].disabled,false);
 assert.deepEqual(cells(rows[1]).slice(0,4),["2","سێو","دانە","500"]);
 assert.equal(rows[1].children[5].textContent,"1,500");
 assert.equal(rows[1].children[4].children[0].children[1].children[0].dataset.line,1);
 assert.equal(nodes.total.textContent,"23,500 IQD");
});
test("An empty basket still displays its original empty state",()=>{
 const {nodes}=drawBasket([]);
 const blank=nodes["cart-list"].children[0];
 assert.equal(blank.className,"blank");
 assert.equal(blank.textContent,"سەبەتە بەتاڵە");
});
test("Quantity handler still uses data-line/delta and checks stock",()=>{
 assert.match(js,/closest\("\[data-line\]"\)/);
 assert.match(js,/if\(line\.isScale&&Number\(btn\.dataset\.delta\)>0\)return/);
 assert.match(js,/stockUsed\(line\.id,i\)/);
 assert.match(js,/cartChanged\(\);focusScanner\(\);/);
});