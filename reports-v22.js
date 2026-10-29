/* Server-authoritative reports. No totals are calculated from browser catalog/receipt caches. */
"use strict";
(() => {
 const $=id=>document.getElementById(id),state=new Map();let hooks={};
 const ids={sales:{root:'rep-sales-main-table',search:'rep-sales-search',date:'rep-sales-date-filter',msg:'rep-sales-msg'},profit:{root:'rep-profit-list',search:'rep-profit-search',date:'rep-profit-date-filter',filter:'rep-profit-filter',msg:'rep-profit-msg'},inventory:{root:'rep-inv-list',search:'rep-inv-search',filter:'rep-inv-filter',sort:'rep-inv-sort',msg:'rep-inv-msg'},insights:{root:'rep-ins-abc-list',search:'rep-ins-search',filter:'rep-ins-filter',msg:'rep-ins-msg'}};
 const money=n=>n===null||n===undefined?'—':Number(n).toLocaleString('en-US')+' IQD';
 const number=n=>Number(n||0).toLocaleString('en-US',{maximumFractionDigits:3});
 const put=(id,text)=>{if($(id))$(id).textContent=text;};
 function baghdadDay(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Baghdad',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
 function shiftDay(day,delta){return new Date(Date.parse(day+'T12:00:00Z')+delta*86400000).toISOString().slice(0,10);}
 function dates(kind){
  const mode=$(ids[kind].date)?.value||'all',today=baghdadDay();let from=null,to=null;
  if(mode==='today'){from=today;to=shiftDay(today,1);}
  if(mode==='yesterday'){from=shiftDay(today,-1);to=today;}
  if(mode==='7d'||mode==='30d'){from=shiftDay(today,mode==='7d'?-6:-29);to=shiftDay(today,1);}
  if(mode==='custom'){from=$('rep-sales-from')?.value||null;const end=$('rep-sales-to')?.value;to=end?shiftDay(end,1):null;}
  if(kind==='sales'){if($('rep-sales-from-wrap'))$('rep-sales-from-wrap').hidden=mode!=='custom';if($('rep-sales-to-wrap'))$('rep-sales-to-wrap').hidden=mode!=='custom';}
  return {p_from:from?from+'T00:00:00+03:00':null,p_to:to?to+'T00:00:00+03:00':null};
 }
 function tabulate(kind,data,group){
  const s=data.summary,inventory=data.inventory;
  const columns=kind==='sales'&&group!=='products'?['بابەت / ماوە','ژمارەی فرۆشتن','ژمارەی گەڕاندنەوە','فرۆشتن','گەڕاوە','پوختە']:kind==='inventory'?['کاڵا','یەکە','بڕی کۆگا','تێچووی ئێستا','بەهای کۆگا','بەسەرچوون']:kind==='insights'?['کاڵا','پۆلی ABC','پوختەی فرۆشتن','بڕی کۆگا','کۆگای کەم','قازانج']:['کاڵا','یەکە','بڕی پوختە','پوختەی فرۆشتن','تێچووی تۆمارکراوی فرۆشتن','قازانج'];
  const rows=data.items.map(r=>kind==='sales'&&group!=='products'?[r.receipt_no?'#'+String(r.receipt_no).padStart(6,'0'):r.label,number(r.sale_count),number(r.refund_count),money(r.sales_minor),money(r.refund_minor),money(r.net_minor)]:kind==='inventory'?[r.name,r.base_unit==='kg'?'kg':'دانە',number(r.stock_quantity),money(r.current_unit_cost),money(r.inventory_value_minor),r.expiry_risk?'هەیە':'—']:kind==='insights'?[r.name,r.abc,money(r.net_revenue_minor),number(r.stock_quantity),r.stock_quantity<=r.min_stock?'بەڵێ':'—',money(r.profit_minor)]:[r.name,r.base_unit==='kg'?'kg':'دانە',number(r.net_quantity),money(r.net_revenue_minor),money(r.cost_minor),money(r.profit_minor)]);
  return {columns,rows};
 }
 function kpis(kind,data){
  const s=data.summary,i=data.inventory;
  if(kind==='sales'){
   put('rep-sales-kpi-net',money(s.net_minor));put('rep-sales-kpi-count',number(s.sale_count)+' پسووڵە');
   put('rep-sales-kpi-discounts','داشکاندن: '+money(s.discount_minor)+' | گەڕاوە: '+money(s.refund_minor));
   put('rep-sales-kpi-mix',money(s.cash_sales_minor)+' نەقد / '+money(s.credit_sales_minor)+' قەرز');
   $('rep-sales-secondary-table')?.replaceChildren();
  }
  if(kind==='profit'){
   put('rep-profit-kpi-revenue',money(s.net_minor===null?null:Number(s.net_minor)+Number(s.other_revenue_minor)));put('rep-profit-kpi-cogs',money(s.cost_minor));
   put('rep-profit-kpi-gross',money(s.gross_profit_minor));put('rep-profit-kpi-net',money(s.net_profit_minor));
   put('rep-profit-pnl-card','فرۆشتن: '+money(s.net_minor)+' | داهاتی تر: '+money(s.other_revenue_minor)+' | خەرجی: '+money(s.expense_minor));
  }
  if(kind==='inventory'){
   put('rep-inv-kpi-cost-val',money(i.value_minor));put('rep-inv-kpi-retail-val',money(i.sale_value_minor));
   put('rep-inv-kpi-expected-profit',i.value_minor===null?'—':money(Number(i.sale_value_minor)-Number(i.value_minor)));
   put('rep-inv-kpi-health',number(i.low_count)+' کەمبوو / '+number(i.out_count)+' تەواوبوو');
  }
  if(kind==='insights'){
   put('rep-ins-kpi-score',number(i.low_count));put('rep-ins-kpi-class-a',number(data.abc.class_a)+' کاڵا');
   put('rep-ins-kpi-reorder',number(i.out_count)+' کاڵا');put('rep-ins-kpi-risk',money(i.overdue_customer_debt_minor));$('rep-ins-cards')?.replaceChildren();
  }
 }
 function buildTable(container,columns,rows){
  container.replaceChildren();
  if(!rows.length){const empty=document.createElement('div');empty.className='blank';empty.textContent='هیچ تۆمارێک لەم پاڵاوتنەدا نییە';container.append(empty);return;}
  const table=document.createElement('table'),head=document.createElement('thead'),tr=document.createElement('tr');
  for(const title of columns){const th=document.createElement('th');th.textContent=title;tr.append(th);}head.append(tr);table.append(head);
  const body=document.createElement('tbody');for(const row of rows){const tr=document.createElement('tr');for(const value of row){const td=document.createElement('td');td.textContent=String(value??'—');tr.append(td);}body.append(tr);}table.append(body);container.append(table);
 }
 async function render(kind,offset){
  const config=ids[kind],client=hooks.getClient?.(),store=hooks.getStore?.();if(!config||!client||!store)return;
  let current=state.get(kind)||{token:0,offset:0};const args={p_store:store.id,p_kind:kind,...dates(kind),p_group:kind==='sales'?($('rep-sales-group-mode')?.value||'products'):'products',p_search:$(config.search)?.value.trim()||'',p_filter:$(config.filter)?.value||'all',p_sort:$(config.sort)?.value||'default',p_limit:50};
  const signature=JSON.stringify(args);if(current.signature!==signature)current.offset=0;if(offset!==undefined)current.offset=offset;args.p_offset=current.offset;
  current={...current,args,signature,token:current.token+1,data:null,table:null};state.set(kind,current);const token=current.token;
  put(config.msg,'');if(kind==='profit')put('rep-profit-pnl-card','');const root=$(config.root);if(!root)return;root.replaceChildren();
  // Clear totals while a new request is unresolved; stale data must not look current.
  document.querySelectorAll(`#rep-${kind==='inventory'?'inv':kind==='insights'?'ins':kind}-kpi-bar strong`).forEach(el=>el.textContent='—');
  try{
   const {data,error}=await client.rpc('retail_report_v22',args);if(state.get(kind).token!==token)return;if(error)throw error;
   if(!data?.summary||!Array.isArray(data.items))throw new Error('وەڵامی ڕاپۆرتی سێرڤەر تەواو نییە');
   current.data=data;current.table=tabulate(kind,data,args.p_group);kpis(kind,data);buildTable(root,current.table.columns,current.table.rows);
   const pager=document.createElement('div');pager.className='pager';
   const previous=document.createElement('button'),next=document.createElement('button'),range=document.createElement('span');previous.type=next.type='button';previous.className=next.className='secondary';
   previous.textContent='پێشوو';next.textContent='دواتر';previous.disabled=data.offset===0;next.disabled=data.offset+data.items.length>=data.total_count;
   range.textContent=(data.total_count?data.offset+1:0)+'–'+(data.offset+data.items.length)+' / '+data.total_count;
   previous.addEventListener('click',()=>void render(kind,Math.max(0,data.offset-50)));next.addEventListener('click',()=>void render(kind,data.offset+50));pager.append(previous,range,next);root.append(pager);
   const warnings=[];if(data.summary.unknown_cost_lines&&['sales','profit'].includes(kind))warnings.push('تێچووی '+data.summary.unknown_cost_lines+' ڕیزی مێژوویی نادیارە؛ قازانجی تەواو حساب نەکراوە');
   if(data.summary.unknown_refund_dates)warnings.push('بەرواری '+data.summary.unknown_refund_dates+' گەڕاندنەوەی کۆن پێویستی بە پشتڕاستکردنەوە هەیە');
   if(data.inventory.unknown_cost_products&&kind==='inventory')warnings.push('تێچووی '+data.inventory.unknown_cost_products+' کاڵای کۆگا تۆمار نەکراوە');
   put(config.msg,warnings.join(' — '));
  }catch(error){if(state.get(kind).token!==token)return;current.data=null;current.table=null;root.replaceChildren();put(config.msg,hooks.safe?.(error)||error.message||'ڕاپۆرت بار نەکرا');}
 }
 function incompletePeriod(current){return current.data.summary.unknown_refund_dates&&(current.args.p_from||current.args.p_to||['daily','hourly'].includes(current.args.p_group));}
 function print(kind){const current=state.get(kind);if(!current?.data)return;if(incompletePeriod(current)){put(ids[kind].msg,'بەرواری گەڕاندنەوە کۆنەکان پشتڕاست بکەرەوە پێش چاپکردنی ڕاپۆرتی ماوە');return;}const box=$(`rep-${kind==='inventory'?'inv':kind==='insights'?'ins':kind}-print-box`);if(!box)return;
  buildTable(box,current.table.columns,current.table.rows);box.hidden=false;const title=document.createElement('h3');title.textContent='ڕاپۆرتی پەڕەی ئێستا — '+current.data.generated_at;box.prepend(title);
  const summary=document.createElement('p');summary.textContent='پوختەی گشتی: '+money(current.data.summary.net_minor);box.prepend(summary);window.print();}
 function exportPage(kind){const current=state.get(kind);if(!current?.table)return;if(incompletePeriod(current)){put(ids[kind].msg,'بەرواری گەڕاندنەوە کۆنەکان پشتڕاست بکەرەوە پێش هەناردەی ڕاپۆرتی ماوە');return;}hooks.exportCsv?.('report_'+kind+'_page_'+(current.offset/50+1)+'.csv',current.table.columns,current.table.rows);}
 window.RetailReportsV22={configure:value=>hooks=value,render,print,exportPage};
})();
