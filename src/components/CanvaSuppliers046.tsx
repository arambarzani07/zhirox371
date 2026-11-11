import {useMemo,useState} from 'react';
import {useApp} from '../context/AppContext';
import {supplierRows046,canWriteSupplier046,type SupplierFilter046} from '../utils/supplierDirectory046';
import './canvaSuppliers046.css';
const filters:readonly {value:SupplierFilter046;label:string}[]=[
 {value:'all',label:'هەموو'},{value:'active',label:'چالاک'},{value:'inactive',label:'ناچالاک'}
];
const fmt=(n:number|null)=>n===null?'—':n.toLocaleString('en-US')+' IQD';
/** Original 046 renders real local DEMO supplier records, no supplier writes. */
export function CanvaSuppliers046(){
 const {suppliers,navigateTo}=useApp();
 const [search,setSearch]=useState('');
 const [filter,setFilter]=useState<SupplierFilter046>('all');
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const [expanded,setExpanded]=useState(false);
 const rows=useMemo(()=>supplierRows046(suppliers,search,filter),[suppliers,search,filter]);
 const selected=rows.find(r=>r.supplier.id===selectedId)||null;
 const accounts=()=>navigateTo('suppliers','accounts','supplier-accounts');
 const clearSelection=()=>{setSelectedId(null);setExpanded(false);};
 return <section data-canva-screen="046" className="canva-suppliers-046" dir="rtl">
  <header className="canva-supplier-heading">
   <h1>دابینکەران و زانیارییان</h1>
   <nav aria-label="ڕێڕەوی دابینکەر">
    <button type="button" onClick={()=>navigateTo('home')}>ماڵەوە</button>
    <button type="button" onClick={()=>navigateTo('suppliers','directory')}>کڕین و دابینکەران</button>
   </nav>
  </header>
  <div className="canva-supplier-layout">
   <main className="canva-supplier-main">
    <h2>لیستی دابینکەران</h2>
    <label className="canva-supplier-search" htmlFor="supplier-046-search">گەڕان لە دابینکەران
     <input id="supplier-046-search" type="search" autoComplete="off"
      value={search} placeholder="ناو، ناسنامە یان ژمارەی تۆمار"
      onChange={e=>{setSearch(e.target.value);clearSelection();}}/>
    </label>
    <div className="canva-supplier-controls">
     <div className="canva-supplier-tabs" role="group" aria-label="دۆخی دابینکەر">
      {filters.map(f=><button type="button" key={f.value}
       aria-pressed={filter===f.value} onClick={()=>{setFilter(f.value);clearSelection();}}>{f.label}</button>)}
     </div>
     <button type="button" className="canva-supplier-add" disabled={!canWriteSupplier046()}
      title="تۆمارکردنی دابینکەر پێویستی بە مۆڵەتی پشتڕاستکراو هەیە">زیادکردنی دابینکەر</button>
    </div>
    <div className="canva-supplier-table-scroll" role="region" aria-label="لیستی دابینکەران" tabIndex={0}>
     <table className="canva-supplier-table"><thead><tr>
      <th>ناوی دابینکەر</th><th>ناسنامە</th>
      <th><button type="button" className="canva-supplier-debt-link" onClick={accounts}>کۆی قەرز</button></th>
      <th>دۆخ</th><th>کردار</th>
     </tr></thead><tbody>
      {rows.length?rows.map(row=><tr key={row.supplier.id} data-supplier-status={row.status}
       className={selectedId===row.supplier.id?'canva-supplier-selected':undefined}>
       <td><button type="button" className="canva-supplier-select"
        aria-pressed={selectedId===row.supplier.id}
        onClick={()=>{setSelectedId(row.supplier.id);setExpanded(false);}}>{row.supplier.name}</button></td>
       <td><bdi>{row.supplier.id}</bdi></td><td><bdi>{fmt(row.debt)}</bdi></td>
       <td>پشتڕاست نەکراوە</td><td>—</td>
      </tr>):Array.from({length:4},(_,i)=><tr key={i}
       data-supplier-placeholder="true" aria-hidden="true">
       <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
      </tr>)}
     </tbody></table>
    </div>
    <p className="canva-supplier-help" role="status">
     {filter==='all'?'دابینکەرێک هەڵبژێرە بۆ بینینی وردەکاری':
      'دۆخی چالاکی و ناچالاکی لە داتای Demo پشتڕاست نەکراوە'}
    </p>
    <p className="canva-supplier-rule">دەستکاری و تۆمارکردنی دابینکەر تەنها بە ڕێگەپێدان ئەنجام دەدرێت.</p>
   </main>
   <aside className="canva-supplier-aside" aria-label="وردەکاریی دابینکەر">
    <h2>وردەکاریی دابینکەر</h2>
    <dl>
     <div><dt>ناوی دابینکەر</dt><dd>{selected?.supplier.name??'—'}</dd></div>
     <div><dt>ناسنامەی دابینکەر</dt><dd><bdi>{selected?.supplier.id??'—'}</bdi></dd></div>
     <div><dt><button type="button" className="canva-supplier-debt-link"
      onClick={accounts}>پارەی ماوە</button></dt>
      <dd><bdi>{selected?fmt(selected.debt):'—'}</bdi></dd></div>
    </dl>
    <p className="canva-supplier-readonly">کاشێر: تەنها بینین</p>
    {expanded&&selected&&<div className="canva-supplier-contact" role="region" aria-label="زانیاری پەیوەندی">
     <dl>
      <div><dt>ژمارەی پەیوەندی</dt><dd dir="ltr">{selected.supplier.phone||'—'}</dd></div>
      <div><dt>ناونیشان</dt><dd>{selected.supplier.address||'—'}</dd></div>
     </dl>
    </div>}
    <button type="button" className="canva-supplier-details-button"
     disabled={!selected} aria-expanded={expanded&&!!selected}
     onClick={()=>setExpanded(v=>!v)}>بینینی وردەکاری</button>
   </aside>
  </div>
 </section>;
}
