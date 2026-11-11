import { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  canDecideStockApproval045, disconnectedStockApprovalFeed045,
  filterStockApproval045, type ApprovalFilter045
} from '../utils/stockApproval045';
import { CanvaStockFrame, CanvaStockTable } from './CanvaStockFrame';

const columns = ['کاڵا / شوێن','ناسنامە','جۆری کردار','داواکار','بەروار','دۆخ'];
const filters:readonly {key:ApprovalFilter045;label:string}[] = [
 {key:'pending',label:'چاوەڕوان'},
 {key:'approved',label:'پەسەندکراو'},
 {key:'rejected',label:'ڕەتکراوە'}
];

/** Canva 045 inventory action approval UI.
 * No request submission, authoritative feed, or manager authentication yet.
 * All decisions are fail-closed; no stock or receipts are touched.
 */
export function CanvaStockApprovals045() {
  const {navigateTo}=useApp();
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState<ApprovalFilter045>('pending');
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const feed=disconnectedStockApprovalFeed045();
  const rows=filterStockApproval045(feed,query,filter);
  const selected=rows.find(x=>x.id===selectedId);
  const authorized=canDecideStockApproval045();
  return <CanvaStockFrame number="045" title="پەسەندکردنی کردارەکانی کۆگا"
    listTitle="داواکارییەکانی کۆگا"
    summaryTitle="وردەکاری و بڕیاری بەڕێوەبەر"
    onHome={()=>navigateTo('home')}
    filters={<div className="stock-workflow-filters stock-approval-filters">
      <label>گەڕان
        <input type="search" value={query}
          onChange={event=>{setQuery(event.target.value);setSelectedId(null);}}
          placeholder="ناسنامەی داواکاری، کاڵا یان کارمەند"/>
      </label>
      <div className="stock-workflow-tabs" role="group" aria-label="پاڵاوتنی دۆخی داواکاری">
        {filters.map(item=><button type="button" key={item.key}
          aria-pressed={filter===item.key}
          onClick={()=>{setFilter(item.key);setSelectedId(null);}}>
          {item.label}
        </button>)}
      </div>
      <p className="stock-approval-unavailable" role="status">
        سەرچاوەی داواکارییە پەسەندکراوەکانی کۆگا هێشتا پەیوەست نییە؛
        هیچ داواکارییەکی ڕاستەقینە لێرە پشتڕاست ناکرێتەوە.
      </p>
    </div>}
    summary={<dl>
      <div><dt>داواکاریی چاوەڕوان</dt><dd>{feed.connected ? rows.filter(x=>x.status==='pending').length:'—'}</dd></div>
      <div><dt>جۆری کردار</dt><dd>{selected?.action??'—'}</dd></div>
      <div><dt>هۆکاری داواکاری</dt><dd>{selected?.reason??'—'}</dd></div>
    </dl>}
    actions={<>
      <div className="stock-approval-decision">
        <button className="stock-036-primary" type="button" disabled={!authorized||!selected}
          title="پەسەندکردنی ڕاستەقینە پێویستی بە سێرڤەری پشتڕاستکراو هەیە">
          پەسەندکردن
        </button>
        <button type="button" disabled={!authorized||!selected}
          title="ڕەتکردنەوەی ڕاستەقینە پێویستی بە سێرڤەری پشتڕاستکراو هەیە">
          ڕەتکردنەوە
        </button>
      </div>
      <button type="button" onClick={()=>navigateTo('stock','overview','stock-stack')}>
        گەڕانەوە بۆ کۆگا
      </button>
    </>}
    note="پەسەندی داواکاری دەبێت بە ناسنامەی بەڕێوەبەر و بەروار تۆمار بکرێت؛ لەم Demo ـیە ئەو کارە ناچالاکە.">
    <CanvaStockTable columns={columns}>
      {rows.map(row=><tr key={row.id}
        className={selected?.id===row.id?'stock-workflow-selected':undefined}>
        <td><button type="button" className="stock-036-product"
          aria-pressed={selectedId===row.id}
          onClick={()=>setSelectedId(row.id)}>{row.subject}</button></td>
        <td><bdi>{row.id}</bdi></td><td>{row.action}</td>
        <td>{row.requestedBy}</td><td><bdi>{row.requestedAt}</bdi></td>
        <td>{row.status==='pending'?'چاوەڕوان':row.status==='approved'?'پەسەندکراو':'ڕەتکراوە'}</td>
      </tr>)}
      {!rows.length&&Array.from({length:4},(_,index)=><tr
        key={index} aria-hidden="true" data-approval-placeholder="true">
        {columns.map(column=><td key={column}>—</td>)}
      </tr>)}
    </CanvaStockTable>
  </CanvaStockFrame>;
}
