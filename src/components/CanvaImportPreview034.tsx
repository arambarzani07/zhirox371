import React,{useRef,useState} from 'react';
import type { Product } from '../types';
import { money } from '../utils/retailHelpers';
import { previewCsvProducts034,type ImportPreview034 } from '../utils/importPreview034';

interface Props {products:Product[];onHome:()=>void;onCatalog:()=>void;}
/** Canva 034 reads a local CSV for preview. Never creates/updates products,
 * uploads the selected file, or asserts that a server approved the import.
 */
export const CanvaImportPreview034:React.FC<Props>=({products,onHome,onCatalog})=>{
 const [fileName,setFileName]=useState('');
 const [sourceText,setSourceText]=useState('');
 const [report,setReport]=useState<ImportPreview034|null>(null);
 const [fileError,setFileError]=useState('');
 const fileSelection=useRef(0);
 const chooseFile=async (e:React.ChangeEvent<HTMLInputElement>)=>{
  const f=e.target.files?.[0];
  const current=++fileSelection.current;
  setReport(null);setSourceText('');setFileName('');setFileError('');
  if(!f)return;
  if(!f.name.toLowerCase().endsWith('.csv')){setFileError('تەنها فایلی CSV هەڵبژێرە');return;}
  if(f.size>5_000_000){setFileError('فایلەکە بۆ ئەم پێشبینینە زۆر گەورەیە');return;}
  try{
   const content=await f.text();
   if(current!==fileSelection.current)return;
   setSourceText(content);setFileName(f.name);
  }catch{if(current===fileSelection.current)setFileError('خوێندنەوەی فایلەکە سەرکەوتوو نەبوو');}
 };
 const check=()=>setReport(previewCsvProducts034(sourceText,products));
 return (
  <section className="canva-import-preview-034" data-canva-screen="034" dir="rtl">
   <header className="canva-catalog-page-heading canva-import-heading">
    <h1>پێشبینینی هاوردەکردنی کاڵاکان</h1>
    <nav className="canva-catalog-new-nav" aria-label="ڕێڕەوی پێشبینینی هاوردەکردن">
     <button type="button" className="canva-catalog-home" onClick={onHome}>ماڵەوە</button>
     <button type="button" className="secondary" onClick={onCatalog}>کاڵا و نرخ</button>
    </nav>
   </header>
   <div className="canva-import-layout">
    <main className="canva-import-main">
     <h2>پشکنینی داتاکان پێش هاوردەکردن</h2>
     <div className="canva-import-pick">
      <label htmlFor="canva-034-file">فایلی کاڵاکان</label>
      <input id="canva-034-file" type="file" accept=".csv,text/csv"
       onChange={chooseFile} aria-label="هەڵبژاردنی فایل CSV"/>
      <span className="canva-import-filename">{fileName||'هەڵبژاردنی فایل CSV'}</span>
     </div>
     <p className="canva-import-rule">تا پشکنین و پەسەندکردن تەواو نەبێت، هیچ کاڵایەک زیاد یان دەستکاری ناکرێت.</p>
     <div className="canva-import-table-scroll">
      <table className="canva-import-table">
       <thead><tr><th>ناوی کاڵا</th><th>بارکۆد</th><th>نرخ</th><th>هۆکاری هەڵە</th><th>دۆخ</th></tr></thead>
       <tbody>
        {report?.rows.length?report.rows.slice(0,100).map(row=>(
         <tr key={row.line} data-import-status={row.status}>
          <td>{row.name||'—'}</td><td dir="ltr">{row.barcode||'—'}</td>
          <td dir="ltr">{row.priceIqd===null?'—':money(row.priceIqd)}</td>
          <td>{row.issues.join('، ')||'—'}</td>
          <td>{row.status==='ready'?'ئامادە بۆ پێداچوونەوە':'هەڵە'}</td>
         </tr>
        )):Array.from({length:4},(_,i)=>(
         <tr key={i} aria-hidden="true"><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>
        ))}
       </tbody>
      </table>
     </div>
     <p className="canva-import-guidance">پشکنین: بارکۆدی دووبارە، ناوی کاڵا، جۆری یەکە، نرخی نادروست.</p>
     <p className="canva-import-result" role="status">
      {fileError||report?.warnings.join('، ')||
       (report ? 'پشکنین تەواو بوو — هیچ کاڵایەک هاوردە نەکراوە' :
        'فایلەکە تەنها لە ئامێرەکەت دەخوێندرێتەوە؛ هاوردەکردن ناچالاکە')}
     </p>
    </main>
    <aside className="canva-import-aside" aria-label="فایل و ئەنجامی پشکنین">
     <h2>فایل و ئەنجامی پشکنین</h2>
     <dl>
      <div><dt>کۆی ڕیزەکان</dt><dd>{report?.rows.length?report.total:'—'}</dd></div>
      <div><dt>ڕیزی ئامادە</dt><dd>{report?.rows.length?report.ready:'—'}</dd></div>
      <div><dt>هەڵە و ئاگاداری</dt><dd>{report?(report.errors+report.warnings.length):'—'}</dd></div>
     </dl>
     <button type="button" className="primary" onClick={check}
       disabled={!sourceText||!!fileError}>پشکنینی فایل</button>
     <button type="button" className="secondary" onClick={onCatalog}>گەڕانەوە</button>
    </aside>
   </div>
  </section>
 );
};
