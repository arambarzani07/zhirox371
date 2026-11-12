import {useState} from 'react';
import {useApp} from '../context/AppContext';
import {
  disconnectedPurchaseApproval054,visiblePurchaseApprovals054,
  pendingPurchaseApprovals054,canDecidePurchaseApproval054,
  type PurchaseApprovalState054
} from '../utils/purchaseApprovals054';
import {CanvaStockFrame,CanvaStockTable} from './CanvaStockFrame';
import './canvaPurchaseApprovals054.css';

const tabs:readonly {id:PurchaseApprovalState054;label:string}[]=[
 {id:'pending',label:'چاوەڕوان'},
 {id:'approved',label:'پەسەندکراو'},
 {id:'rejected',label:'ڕەتکراوە'}
];
const iqd=(v:number|null)=>v===null?'—':v.toLocaleString('en-US')+' IQD';

/** Authentic Canva 054 layout with safe read-only request review.
 * No submitted backend requests are available. The 047/048 drafts MUST NOT
 * be relabeled as pending, approved or rejected procurement events.
 */
export function CanvaPurchaseApprovals054(){
 const {navigateTo}=useApp();
 const [status,setStatus]=useState<PurchaseApprovalState054>('pending');
 const [search,setSearch]=useState('');
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const feed=disconnectedPurchaseApproval054();
 const rows=visiblePurchaseApprovals054(feed,status,search);
 const selected=rows.find(row=>row.id===selectedId)||null;
 const pending=pendingPurchaseApprovals054(feed);
 const canDecide=canDecidePurchaseApproval054();
 const back=()=>navigateTo('suppliers','order','purchase-order');
 return <div className="ws-stack stock-036-shell canva-purchase-approvals-054" data-demo-only="true">
  <CanvaStockFrame number="054" category="کڕین و دابینکەران"
   title="پەسەندکردنی داواکارییەکانی کڕین"
   listTitle="داواکاریی کڕین و گۆڕانکاریی چاوەڕوان"
   summaryTitle="پوختەی پەسەندکردن"
   onHome={()=>navigateTo('home')}
   filters={<div className="purchase-approval-filters054">
    <label htmlFor="canva-054-search">گەڕان لە داواکارییەکان
     <input id="canva-054-search" type="search" autoComplete="off"
      value={search} placeholder="ناسنامە، دابینکەر یان جۆری داواکاری"
      onChange={event=>{setSearch(event.target.value);setSelectedId(null);}}/>
    </label>
    <div className="purchase-approval-tabs054" role="group" aria-label="دۆخی داواکاری">
     {tabs.map(tab=><button key={tab.id} type="button"
      aria-pressed={status===tab.id}
      onClick={()=>{setStatus(tab.id);setSelectedId(null);}}>
      {tab.label}
     </button>)}
    </div>
    <p role="status" className="purchase-approval-unavailable054">
     سەرچاوەی داواکاریی کڕینی پەسەندکراو لە سێرڤەر پەیوەست نییە؛
     هیچ داواکارییەکی ڕاستەقینە لێرە پشتڕاست ناکرێتەوە.
    </p>
   </div>}
   summary={<dl>
    <div><dt>داواکاریی چاوەڕوان</dt>
     <dd>{pending===null?'—':pending}</dd></div>
    <div><dt>جۆری دەسەڵات</dt>
     <dd>بەڕێوەبەر — پشتڕاست نەکراوە</dd></div>
    <div><dt>داواکاریی هەڵبژێردراو</dt>
     <dd><bdi>{selected?.id||'—'}</bdi></dd></div>
   </dl>}
   actions={<>
    <button type="button" className="stock-036-primary"
     disabled={!selected||!canDecide}
     title="پەسەندکردن تەنها بە ناسنامە و مۆڵەتی پشتڕاستکراوی سێرڤەر">
      پەسەندکردنی داواکاری
    </button>
    <button type="button" disabled={!selected||!canDecide}
     title="ڕەتکردنەوە تەنها بە مۆڵەتی سێرڤەر و هۆکاری تۆمارکراو">
      ڕەتکردنەوە بە هۆکار
    </button>
    <button type="button" className="purchase-approval-return054" onClick={back}>
      گەڕانەوە بۆ فەرمانی کڕین
    </button>
   </>}
   note={<span className="purchase-approval-note054">
    {selected
      ?'نرخی پێشوو و نوێ تەنها لە تۆماری پەسەندکردنی پشتڕاستکراو وەردەگیرێن.'
      :'داواکارییەک هەڵبژێرە بۆ بینینی نرخی پێشوو و نوێ'}
    <span className="purchase-approval-permissions054">
     تەنها بەڕێوەبەری پشتڕاستکراو دەتوانێت داواکاریی کڕین پەسەند یان ڕەت بکاتەوە.
    </span>
   </span>}>
   <CanvaStockTable columns={['جۆری داواکاری','داواکار','بەروار','بڕ','دۆخ']}>
    {rows.length?rows.map(row=><tr key={row.id}
     className={row.id===selectedId?'purchase-approval-selected054':undefined}>
     <td><button type="button" aria-pressed={row.id===selectedId}
      onClick={()=>setSelectedId(row.id)}>{row.requestType} — {row.supplier}</button></td>
     <td>{row.requester}</td><td><bdi>{row.requestedAt}</bdi></td>
     <td><bdi>{iqd(row.amountIqd)}</bdi></td>
     <td>{row.status==='pending'?'چاوەڕوان':row.status==='approved'?'پەسەندکراو':'ڕەتکراوە'}</td>
    </tr>):Array.from({length:4},(_,i)=><tr key={i}
     data-approval054-placeholder="true" aria-hidden="true">
     <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
    </tr>)}
   </CanvaStockTable>
  </CanvaStockFrame>
 </div>;
}
