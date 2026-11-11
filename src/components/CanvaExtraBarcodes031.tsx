import React,{useMemo,useState} from 'react';
import type {Product} from '../types';
import {matchesUnitPriceQuery027,resolveUnitByBarcode027} from '../utils/unitPrices027';
import {
  isConfigured031,labels031,listBarcodes031,prepareExtraAlias031,
  type BarcodeUnit031
} from '../utils/extraBarcodes031';

interface Props {
  products:Product[];
  initialProductId?:string|null;
  initialMode?:BarcodeUnit031;
  onHome:()=>void;
  onCatalog:()=>void;
  onBackToBarcodes:()=>void;
  onDuplicateAudit:()=>void;
  onSaveAlias:(id:string,updates:Partial<Product>)=>void;
}

/** Canva screen 031. Mutations are limited to existing local browser DEMO state.
 * Do not interpret this view as a server-verified manager authorization.
 */
export const CanvaExtraBarcodes031:React.FC<Props>=({
  products,initialProductId,initialMode='unit',onHome,onCatalog,onBackToBarcodes,
  onDuplicateAudit,onSaveAlias
})=>{
  const [search,setSearch]=useState('');
  const [selectedId,setSelectedId]=useState<string|null>(initialProductId??null);
  const [mode,setMode]=useState<BarcodeUnit031>(initialMode);
  const [entry,setEntry]=useState('');
  const [notice,setNotice]=useState<{text:string;error:boolean}|null>(null);
  const selected=products.find(x=>x.id===selectedId)||null;
  const suggestions=useMemo(()=>search.trim()&&search!==selected?.name
    ?products.filter(p=>matchesUnitPriceQuery027(p,search)).slice(0,8):[],
    [products,search,selected?.name]);
  const enabled=isConfigured031(selected,mode);
  const rows=listBarcodes031(selected,mode);
  const aliases=rows.filter(x=>!x.primary).length;
  const pick=(p:Product,term:string)=>{
    setSelectedId(p.id);
    setMode(resolveUnitByBarcode027(p,term)|| (p.base_unit==='kg'?'kg':'unit'));
    setSearch(p.name);setEntry('');setNotice(null);
  };
  const save=()=>{
    const candidate=prepareExtraAlias031(products,selectedId||'',mode,entry);
    if(!candidate.ok){setNotice({text:candidate.error,error:true});return;}
    onSaveAlias(selectedId!,candidate.updates);
    setEntry('');setNotice({text:'بارکۆدی هاوتای '+candidate.code+' تەنها لە Demo زیاد کرا',error:false});
  };
  return (
    <section className="canva-extra-barcodes-031" data-canva-screen="031" dir="rtl">
      <header className="canva-catalog-page-heading canva-extra-heading">
        <h1>بارکۆدە زیادەکانی هەر یەکە</h1>
        <nav className="canva-catalog-new-nav" aria-label="ڕێڕەوی بارکۆدە زیادەکان">
          <button type="button" className="canva-catalog-home" onClick={onHome}>ماڵەوە</button>
          <button type="button" className="secondary" onClick={onCatalog}>کاڵا و نرخ</button>
        </nav>
      </header>
      <div className="canva-extra-layout">
        <main className="canva-extra-main">
          <h2>بەڕێوەبردنی بارکۆدە زیادەکان</h2>
          <label className="canva-extra-product-search" htmlFor="canva-031-search">
            کاڵای هەڵبژێردراو
            <input id="canva-031-search" type="search"
              value={search} autoComplete="off"
              onChange={e=>{setSearch(e.target.value);setNotice(null);}}
              placeholder="کاڵا بە ناو یان بارکۆد هەڵبژێرە"/>
          </label>
          {suggestions.length>0 && (
            <div className="canva-extra-suggestions" aria-label="کاڵاکانی دۆزراوە">
              {suggestions.map(p=><button type="button" className="secondary" key={p.id}
                onClick={()=>pick(p,search)}>{p.name} — {p.unit_barcode}</button>)}
            </div>
          )}
          <h3>جۆری یەکە</h3>
          <div className="canva-extra-tabs" role="group" aria-label="جۆری یەکە">
            {(['unit','carton','bundle','set','kg'] as const).map(kind=>(
              <button type="button" key={kind} aria-pressed={mode===kind}
                className={mode===kind?'primary':'secondary'}
                disabled={!isConfigured031(selected,kind)}
                onClick={()=>{setMode(kind);setEntry('');setNotice(null);}}>{labels031[kind]}</button>
            ))}
          </div>
          <form className="canva-extra-add-form" onSubmit={e=>{e.preventDefault();save();}}>
            <label htmlFor="canva-031-new-code">
              زیادکردنی بارکۆد
              <input id="canva-031-new-code" dir="ltr" type="text" autoComplete="off"
                value={entry} maxLength={60}
                onChange={e=>{setEntry(e.target.value);setNotice(null);}}
                placeholder="بارکۆدی زیادە بنووسە یان سکان بکە"/>
            </label>
            <button type="submit" className="primary"
              disabled={!enabled||!entry.trim()||aliases>=30}>زیادکردن</button>
          </form>
          <div className="canva-extra-table-scroll">
            <table className="canva-extra-table">
              <thead><tr><th>بارکۆد</th><th>یەکە</th><th>جۆری بارکۆد</th><th>دۆخ</th><th>کردار</th></tr></thead>
              <tbody>
                {rows.length?rows.map((row,i)=>(
                  <tr key={row.code+'-'+i}>
                    <td dir="ltr">{row.code}</td><td>{labels031[row.mode]}</td>
                    <td>{row.primary?'سەرەکی':'هاوتا'}</td>
                    <td>چالاک (Demo)</td><td>—</td>
                  </tr>
                )):Array.from({length:2},(_,i)=>(
                  <tr key={i} aria-hidden="true">
                    <td>—</td><td>{i===0?'دانە':'—'}</td><td>—</td><td>—</td><td>—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="canva-extra-rule">بارکۆدی دووبارە ناتوانرێت بۆ کاڵا یان یەکەیەکی تر چالاک بکرێت.</p>
          <p className="canva-extra-feedback" role="status" aria-live="polite">
            {notice?.text||'هەموو گۆڕانکارییەکان تەنها بۆ کەتەلۆگی تاقیکردنەوەن؛ مۆڵەتی فەرمی پشتڕاست نەکراوە.'}
          </p>
        </main>
        <aside className="canva-extra-aside" aria-label="پشکنین و دەستکاریکردن">
          <h2>پشکنین و دەستکاریکردن</h2>
          <dl>
            <div><dt>یەکەی هەڵبژێردراو</dt><dd>{selected?labels031[mode]:'—'}</dd></div>
            <div><dt>بارکۆدی چالاک</dt><dd>{selected&&enabled?rows.length:'—'}</dd></div>
            <div><dt>زۆرترین بارکۆدی زیادە</dt><dd>30</dd></div>
          </dl>
          <button type="button" className="secondary" onClick={onDuplicateAudit}>پشکنینی دووبارەبوونەوە</button>
          <button type="button" className="secondary" onClick={onBackToBarcodes}>گەڕانەوە بۆ بارکۆدەکان</button>
          <button type="button" className="secondary" onClick={onCatalog}>گەڕانەوە بۆ کاڵاکان</button>
        </aside>
      </div>
    </section>
  );
};
