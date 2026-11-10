import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Product, SaleMode, BaseUnit, ExtraPackConfig } from '../types';
import { money, generateNextBarcode, parseCsvRows } from '../utils/retailHelpers';
import { KurdishVoiceAnnouncer } from '../utils/kurdishVoiceEngine';

type BarcodeCatalogMode = 'unit' | 'carton' | 'bundle' | 'set' | 'kg';
type ExtraPackDraft = {kind:'bundle'|'set'; name:string; barcode:string; aliases:string; units:string; buy:string; sell:string};
const emptyPackDrafts = ():ExtraPackDraft[] => [
 {kind:'bundle',name:'',barcode:'',aliases:'',units:'',buy:'',sell:''},
 {kind:'set',name:'',barcode:'',aliases:'',units:'',buy:'',sell:''}
];
const splitCodes = (value:string) => value.split(/[\n,،;]+/u).map(x=>x.trim()).filter(Boolean);
const safePrice = (value:string) => value.trim() === '' ? null : Number(value);

export const ProductCatalogView: React.FC = () => {
  const { products, addProduct, updateProduct, deleteProduct, subtab, activeSectionId, navigateTo } = useApp();

  const resolveInitialTab = (): 'new' | 'list' | 'prices' | 'barcodes' => {
    if (activeSectionId === 'add-box' || subtab === 'new') return 'new';
    if (activeSectionId === 'price-tags' || subtab === 'prices') return 'prices';
    if (activeSectionId === 'barcode-bars' || subtab === 'barcodes') return 'barcodes';
    return 'list';
  };

  const [activeTab, setActiveTab] = useState<'new' | 'list' | 'prices' | 'barcodes'>(resolveInitialTab);

  useEffect(() => {
    setActiveTab(resolveInitialTab());
  }, [subtab, activeSectionId]);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  // Canva 021: local selling-unit filter, no extra page or modal required.
  const [catalogUnitFilter, setCatalogUnitFilter] = useState<'all' | 'unit' | 'carton' | 'kg'>('all');
  const [selectedCatalogProductId, setSelectedCatalogProductId] = useState<string | null>(null);
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out' | 'expiry'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editProductSearch, setEditProductSearch] = useState('');

  // Form State
  const [name, setName] = useState('');
  const [category, setCategory] = useState('خۆراک');
  const [sku, setSku] = useState('');
  const [plu, setPlu] = useState('');
  const [saleMode, setSaleMode] = useState<SaleMode>('unit');
  const [baseUnit, setBaseUnit] = useState<BaseUnit>('unit');
  const [unitBarcode, setUnitBarcode] = useState(() => generateNextBarcode('20'));
  const [unitBuyPrice, setUnitBuyPrice] = useState<string>('');
  const [unitSellPrice, setUnitSellPrice] = useState<string>('');
  const [extraBarcodes, setExtraBarcodes] = useState('');

  // Carton fields
  const [cartonName, setCartonName] = useState('');
  const [cartonBarcode, setCartonBarcode] = useState('');
  const [unitsPerCarton, setUnitsPerCarton] = useState<string>('24');
  const [cartonBuyPrice, setCartonBuyPrice] = useState<string>('');
  const [cartonSellPrice, setCartonSellPrice] = useState<string>('');
  const [extraCartonBarcodes, setExtraCartonBarcodes] = useState('');

  const [extraPackDrafts, setExtraPackDrafts] = useState<ExtraPackDraft[]>(emptyPackDrafts);
  const editPack = (kind:ExtraPackDraft['kind'], patch:Partial<ExtraPackDraft>) => setExtraPackDrafts(prev => prev.map(d => d.kind===kind?{...d,...patch}:d));

  // Stock, min_stock, expiry_date
  const [initialStock, setInitialStock] = useState<string>('50');
  const [minStock, setMinStock] = useState<string>('10');
  const [expiryDate, setExpiryDate] = useState<string>('');

  // CSV Import state
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const importPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showImport) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (importPopoverRef.current && !importPopoverRef.current.contains(e.target as Node)) {
        setShowImport(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowImport(false);
    };
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showImport]);

  // Inline quick price edit in 'prices' tab
  const [quickPriceId, setQuickPriceId] = useState<string | null>(null);
  const [quickBuy, setQuickBuy] = useState<string>('');
  const [quickSell, setQuickSell] = useState<string>('');
  const [quickCartonSell, setQuickCartonSell] = useState<string>('');

  // Inline alias addition in 'barcodes' tab
  const [barcodeTestQuery, setBarcodeTestQuery] = useState('');
  const [barcodeCatalogSelectedId, setBarcodeCatalogSelectedId] = useState<string | null>(null);
  const [barcodeCatalogProductQuery, setBarcodeCatalogProductQuery] = useState('');
  const [barcodeCatalogMode, setBarcodeCatalogMode] = useState<BarcodeCatalogMode>('unit');
  const [barcodeCatalogAdding, setBarcodeCatalogAdding] = useState(false);
  const [newAliasCode, setNewAliasCode] = useState('');

  // Form message
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  // Label preview item
  const [selectedForLabel, setSelectedForLabel] = useState<Product | null>(null);

  const categories = Array.from(
    new Set(['خۆراک', 'خواردنەوە', 'شیرەمەنی', 'سەوزە و میوە', 'نانەوا', 'پاککەرەوە', 'گشتی', ...products.map(p => p.category || 'گشتی')])
  );

  const resetForm = () => {
    setEditingId(null);
    setEditProductSearch('');
    setName('');
    setCategory('خۆراک');
    setSku('');
    setPlu('');
    setSaleMode('unit');
    setBaseUnit('unit');
    setUnitBarcode(generateNextBarcode('20'));
    setUnitBuyPrice('');
    setUnitSellPrice('');
    setExtraBarcodes('');
    setCartonName('');
    setCartonBarcode('');
    setUnitsPerCarton('24');
    setCartonBuyPrice('');
    setCartonSellPrice('');
    setExtraCartonBarcodes('');
    setExtraPackDrafts(emptyPackDrafts());
    setInitialStock('50');
    setMinStock('10');
    setExpiryDate('');
    setMessage(null);
  };

  const handleStartEdit = (p: Product) => {
    setEditingId(p.id);
    setEditProductSearch(p.name);
    setName(p.name);
    setCategory(p.category || 'گشتی');
    setSku(p.sku || '');
    setPlu(p.plu || '');
    setSaleMode(p.sale_mode);
    setBaseUnit(p.base_unit);
    setUnitBarcode(p.unit_barcode);
    setUnitBuyPrice(p.unit_purchase_price_iqd !== null ? String(p.unit_purchase_price_iqd) : '');
    setUnitSellPrice(String(p.unit_sale_price_iqd));
    setExtraBarcodes(p.unit_alias_barcodes.join(', '));
    setExtraPackDrafts(emptyPackDrafts().map(d=>{const a=p.extra_packs?.find(x=>x.kind===d.kind);return a?{kind:a.kind,name:a.name,barcode:a.barcode,aliases:a.alias_barcodes.join(', '),units:String(a.units_per_pack),buy:a.purchase_price_iqd===null?'':String(a.purchase_price_iqd),sell:String(a.sale_price_iqd)}:d;}));
    setMinStock(String(p.min_stock ?? 10));
    setExpiryDate(p.expiry_date || '');

    if (p.carton) {
      setCartonName(p.carton.name || '');
      setCartonBarcode(p.carton.barcode);
      setUnitsPerCarton(String(p.carton.units_per_carton));
      setCartonBuyPrice(p.carton.purchase_price_iqd !== null ? String(p.carton.purchase_price_iqd) : '');
      setCartonSellPrice(String(p.carton.sale_price_iqd));
      setExtraCartonBarcodes(p.carton.alias_barcodes.join(', '));
    } else {
      setCartonName('');
      setCartonBarcode('');
      setUnitsPerCarton('24');
      setCartonBuyPrice('');
      setCartonSellPrice('');
      setExtraCartonBarcodes('');
    }

    setInitialStock(String(p.stock));
    setActiveTab('new');
    setMessage(null);
  };

  const findBarcodeOwner = (code: string, ignoreProductId: string | null): Product | undefined => {
    const clean = code.trim();
    if (!clean) return undefined;
    return products.find(p => {
      if (ignoreProductId && p.id === ignoreProductId) return false;
      if (p.unit_barcode === clean) return true;
      if (p.unit_alias_barcodes.includes(clean)) return true;
      if (p.carton && p.carton.barcode === clean) return true;
      if (p.carton && p.carton.alias_barcodes.includes(clean)) return true;
      if (p.extra_packs?.some(x=>x.barcode===clean||x.alias_barcodes.includes(clean))) return true;
      return false;
    });
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setMessage({ text: 'تکایە ناوی کاڵا بنووسە', error: true });
      return;
    }
    const sellPrice = parseInt(unitSellPrice, 10);
    if (!Number.isSafeInteger(sellPrice) || sellPrice <= 0) {
      setMessage({ text: 'نرخی فرۆشتن دەبێت ژمارەیەکی دروستی گەورەتر لە سفر بێت', error: true });
      return;
    }
    const trimmedUnitBarcode = unitBarcode.trim();
    if (!trimmedUnitBarcode) {
      setMessage({ text: 'بارکۆدی سەرەکی کاڵا پێویستە', error: true });
      return;
    }

    const ownerConflict = findBarcodeOwner(trimmedUnitBarcode, editingId);
    if (ownerConflict) {
      setMessage({
        text: `بارکۆدی (${trimmedUnitBarcode}) پێشتر بۆ کاڵای «${ownerConflict.name}» تۆمار کراوە`,
        error: true
      });
      return;
    }

    const buyPrice = unitBuyPrice.trim() ? Number(unitBuyPrice) : null;
    if(buyPrice!==null&&(!Number.isSafeInteger(buyPrice)||buyPrice<0)){setMessage({text:'نرخی کڕینی دانە نادروستە',error:true});return;}
    const aliases = splitCodes(extraBarcodes);

    for (const alias of aliases) {
      const aliasConflict = findBarcodeOwner(alias, editingId);
      if (aliasConflict) {
        setMessage({
          text: `بارکۆدی هاوتا (${alias}) پێشتر بۆ کاڵای «${aliasConflict.name}» بەکارهاتووە`,
          error: true
        });
        return;
      }
    }

    let cartonObj = null;
    if (saleMode === 'carton' || saleMode === 'both') {
      const trimmedCartonBarcode = cartonBarcode.trim();
      if (!trimmedCartonBarcode || !cartonSellPrice) {
        setMessage({ text: 'بارکۆد و نرخی فرۆشتنی کارتۆن پێویستە', error: true });
        return;
      }
      if (trimmedCartonBarcode === trimmedUnitBarcode || aliases.includes(trimmedCartonBarcode)) {
        setMessage({ text: 'نابێت بارکۆدی کارتۆن و بارکۆدی دانە یەک ژمارە بن', error: true });
        return;
      }
      const cartonConflict = findBarcodeOwner(trimmedCartonBarcode, editingId);
      if (cartonConflict) {
        setMessage({
          text: `بارکۆدی کارتۆن (${trimmedCartonBarcode}) پێشتر بۆ کاڵای «${cartonConflict.name}» تۆمار کراوە`,
          error: true
        });
        return;
      }
      const cartonAliases = splitCodes(extraCartonBarcodes);
      if(!Number.isSafeInteger(Number(unitsPerCarton))||Number(unitsPerCarton)<2||
        !Number.isSafeInteger(Number(cartonSellPrice))||Number(cartonSellPrice)<=0||
        (cartonBuyPrice.trim()!==''&&(!Number.isSafeInteger(Number(cartonBuyPrice))||Number(cartonBuyPrice)<0))){
        setMessage({text:'ژمارەی دانە یان نرخی کارتۆن نادروستە',error:true});return;
      }
      cartonObj = {
        name: cartonName.trim() || `کارتۆنی ${name.trim()}`,
        barcode: trimmedCartonBarcode,
        alias_barcodes: cartonAliases,
        units_per_carton: Number(unitsPerCarton),
        purchase_price_iqd: cartonBuyPrice ? parseInt(cartonBuyPrice, 10) : null,
        sale_price_iqd: Number(cartonSellPrice)
      };
    }

    // Reject duplicate definitions across ALL sale units, not just primary barcodes.
    // No silent deduplication: operator must correct the conflicting field.
    const cartonAliasCodes = splitCodes(extraCartonBarcodes);
    const allCodes = [trimmedUnitBarcode, ...splitCodes(extraBarcodes), ...(cartonObj?[cartonObj.barcode,...cartonAliasCodes]:[])];
    const extraPacks:ExtraPackConfig[] = [];
    for(const draft of extraPackDrafts){
      const used=[draft.name,draft.barcode,draft.aliases,draft.units,draft.buy,draft.sell].some(v=>v.trim()!=='');
      if(!used)continue;
      if(baseUnit==='kg'){
        setMessage({text:'دەستە و سێت بۆ کاڵای کیلۆیی پێویستیان بە یاسای کۆگای جیاواز هەیە',error:true});return;
      }
      if(saleMode==='carton'){
        setMessage({text:'دەستە و سێت لەگەڵ شێوازی تەنها کارتۆن چالاک ناکرێن',error:true});return;
      }
      const count=Number(draft.units),sale=safePrice(draft.sell),buy=safePrice(draft.buy);
      const codes=splitCodes(draft.aliases);
      if(!draft.barcode.trim()||!Number.isSafeInteger(count)||count<2||count>100000||
          sale===null||!Number.isSafeInteger(sale)||sale<=0||sale>999999999||
          (buy!==null&&(!Number.isSafeInteger(buy)||buy<0||buy>999999999))||
          codes.length>30){
        setMessage({text:'بارکۆد، بڕی ناو پاکەت و نرخی فرۆشتنی دەستە/سێت بە دروستی تۆمار بکە',error:true});return;
      }
      allCodes.push(draft.barcode.trim(),...codes);
      extraPacks.push({kind:draft.kind,name:draft.name.trim()|| (draft.kind==='bundle'?'دەستە':'سێت'),barcode:draft.barcode.trim(),alias_barcodes:codes,units_per_pack:count,purchase_price_iqd:buy,sale_price_iqd:sale});
    }
    if(allCodes.some(c=>!c||c.length>60||/[\s,،;]/u.test(c))||
       new Set(allCodes).size!==allCodes.length){
      setMessage({text:'بارکۆدەکان دەبێت جیاواز و دروست بن؛ دووبارەبوونەوە قەدەغەیە',error:true});return;
    }
    for(const code of allCodes){
      const owner=findBarcodeOwner(code,editingId);
      if(owner){setMessage({text:`بارکۆدی (${code}) پێشتر بۆ «${owner.name}» تۆمارکراوە`,error:true});return;}
    }

    const parsedMinStock = Number(minStock);
    if(!Number.isFinite(parsedMinStock)||parsedMinStock<0){setMessage({text:'کەمترین بڕی کۆگا نادروستە',error:true});return;}

    if (editingId) {
      updateProduct(editingId, {
        name: name.trim(),
        category: category.trim() || 'گشتی',
        sku: sku.trim() || null,
        plu: plu.trim() || null,
        sale_mode: saleMode,
        base_unit: baseUnit,
        unit_barcode: trimmedUnitBarcode,
        unit_purchase_price_iqd: buyPrice,
        unit_sale_price_iqd: sellPrice,
        unit_alias_barcodes: aliases,
        carton: cartonObj,
        extra_packs: extraPacks,
        min_stock: parsedMinStock,
        expiry_date: expiryDate.trim() || undefined,
        is_scale_product: baseUnit === 'kg' || Boolean(plu.trim())
      });
      setMessage({ text: `زانیارییەکانی «${name.trim()}» بە سەرکەوتوویی نوێکرایەوە`, error: false });
    } else {
      addProduct({
        name: name.trim(),
        category: category.trim() || 'گشتی',
        sku: sku.trim() || null,
        plu: plu.trim() || null,
        sale_mode: saleMode,
        base_unit: baseUnit,
        unit_barcode: trimmedUnitBarcode,
        unit_purchase_price_iqd: buyPrice,
        unit_sale_price_iqd: sellPrice,
        unit_alias_barcodes: aliases,
        carton: cartonObj,
        extra_packs: extraPacks,
        stock: Math.max(0, parseFloat(initialStock) || 0),
        min_stock: parsedMinStock,
        expiry_date: expiryDate.trim() || undefined,
        is_scale_product: baseUnit === 'kg' || Boolean(plu.trim())
      });
      const addedName = name.trim();
      resetForm();
      KurdishVoiceAnnouncer.announceProductAdded(addedName);
      setMessage({ text: `کاڵای نوێ «${addedName}» بە سەرکەوتوویی تۆمارکرا`, error: false });
    }
  };

  // CSV Export
  const handleExportCsv = () => {
    const headers = ['ناوی کاڵا', 'پۆل', 'بارکۆد', 'نرخی فرۆشتن (IQD)', 'نرخی کڕین (IQD)', 'کۆگا', 'یەکە'];
    const rows = products.map(p => [
      `"${p.name.replace(/"/g, '""')}"`,
      `"${(p.category || 'گشتی').replace(/"/g, '""')}"`,
      `"${p.unit_barcode}"`,
      p.unit_sale_price_iqd,
      p.unit_purchase_price_iqd || '',
      p.stock,
      p.base_unit
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `KaniChnar_Products_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // CSV Import execution with duplicate barcode protection
  const handleImportSubmit = () => {
    if (!importText.trim()) return;
    const parsed = parseCsvRows(importText);
    const dataRows=importText.split(/\r?\n/).map(line=>line.trim()).filter(line=>
      line&&!line.startsWith('#')&&!line.startsWith('نام')&&
      !line.toLowerCase().startsWith('name'));
    const barcodes=parsed.map(item=>item.barcode);
    if(!parsed.length||parsed.length!==dataRows.length||
       new Set(barcodes).size!==barcodes.length){
      setMessage({
        text:'CSV ـەکە نرخێکی ون، بارکۆدی دووبارە یان ڕیزی نادروستی تێدایە؛ هیچ کاڵایەک نەگۆڕدرا',
        error:true
      });
      return;
    }
    let addedCount = 0;
    let updatedCount = 0;
    parsed.forEach(item => {
      const existing = findBarcodeOwner(item.barcode, null);
      if (existing) {
        updateProduct(existing.id, {
          name: item.name,
          unit_sale_price_iqd: item.price
        });
        updatedCount++;
      } else {
        addProduct({
          name: item.name,
          sku: null,
          plu: null,
          sale_mode: 'unit',
          base_unit: 'unit',
          unit_barcode: item.barcode,
          unit_purchase_price_iqd: 0, // UNKNOWN until entered and verified by operator
          unit_sale_price_iqd: item.price,
          unit_alias_barcodes: [],
          carton: null,
          stock: 0, // UNKNOWN; never invent 50 units of available stock
          min_stock: 10,
          category: 'هاوردەکراو'
        });
        addedCount++;
      }
    });
    setImportText('');
    setShowImport(false);
    setMessage({
      text: `CSV ـی Demo: ${addedCount} کاڵای نوێ و ${updatedCount} نوێکردنەوە؛ بڕی کۆگا و نرخی کڕینی کاڵای نوێ نادیارن (0 تا پشتڕاستکردنەوە)`,
      error: false
    });
  };

  const handleStartQuickPrice = (p: Product) => {
    setQuickPriceId(p.id);
    setQuickBuy(String(p.unit_purchase_price_iqd ?? 0));
    setQuickSell(String(p.unit_sale_price_iqd));
    setQuickCartonSell(p.carton ? String(p.carton.sale_price_iqd) : '');
  };

  const handleSaveQuickPrice = (p: Product) => {
    const nextSell = parseInt(quickSell, 10);
    const nextBuy = parseInt(quickBuy, 10);
    if (!Number.isSafeInteger(nextSell) || nextSell <= 0) {
      setMessage({ text: 'نرخی فرۆشتن دەبێت گەورەتر لە سفر بێت', error: true });
      return;
    }
    const updatedCarton = p.carton
      ? {
          ...p.carton,
          sale_price_iqd: Math.max(0, parseInt(quickCartonSell, 10) || p.carton.sale_price_iqd)
        }
      : null;

    updateProduct(p.id, {
      unit_purchase_price_iqd: Number.isSafeInteger(nextBuy) && nextBuy >= 0 ? nextBuy : p.unit_purchase_price_iqd,
      unit_sale_price_iqd: nextSell,
      carton: updatedCarton
    });
    setQuickPriceId(null);
    setMessage({ text: `نرخی «${p.name}» بە سەرکەوتوویی نوێکرایەوە بۆ ${money(nextSell)}`, error: false });
  };

  const handleSaveBarcodeAlias = (p: Product, mode: BarcodeCatalogMode) => {
    const clean = newAliasCode.trim();
    if (!clean || clean.length > 60 || /[\s,،;]/u.test(clean)) {
      setMessage({ text: 'بارکۆدەکە دەبێت پیت و ژمارەی دروست بێت و بۆشایی تێدا نەبێت', error: true });
      return;
    }
    const owner = findBarcodeOwner(clean, null);
    if (owner) {
      setMessage({ text: 'بارکۆدی (' + clean + ') پێشتر بۆ «' + owner.name + '» تۆمار کراوە', error: true });
      return;
    }
    if (mode === 'kg' || mode === 'unit') {
      if ((mode === 'kg') !== (p.base_unit === 'kg')) {
        setMessage({ text: 'یەکەی هەڵبژێردراو لەگەڵ ئەم کاڵایە ناگونجێت', error: true });
        return;
      }
      if (p.unit_alias_barcodes.length >= 30) {
        setMessage({ text: 'سنووری 30 بارکۆدی هاوتا بۆ ئەم یەکەیە پڕبووە', error: true });
        return;
      }
      updateProduct(p.id, { unit_alias_barcodes: [...p.unit_alias_barcodes, clean] });
    } else if (mode === 'carton' && p.carton) {
      if (p.carton.alias_barcodes.length >= 30) {
        setMessage({ text: 'سنووری 30 بارکۆدی کارتۆن پڕبووە', error: true });
        return;
      }
      updateProduct(p.id, { carton: { ...p.carton, alias_barcodes: [...p.carton.alias_barcodes, clean] } });
    } else if (mode === 'bundle' || mode === 'set') {
      const pack = p.extra_packs?.find(x => x.kind === mode);
      if (!pack) {
        setMessage({ text: 'ئەم جۆرە یەکەیە بۆ کاڵاکە تۆمار نەکراوە', error: true });
        return;
      }
      if (pack.alias_barcodes.length >= 30) {
        setMessage({ text: 'سنووری 30 بارکۆدی ئەم یەکەیە پڕبووە', error: true });
        return;
      }
      updateProduct(p.id, { extra_packs: p.extra_packs?.map(x =>
        x.kind === mode ? { ...x, alias_barcodes: [...x.alias_barcodes, clean] } : x
      ) });
    } else {
      setMessage({ text: 'ئەم جۆرە یەکەیە بۆ کاڵاکە تۆمار نەکراوە', error: true });
      return;
    }
    setBarcodeCatalogAdding(false);
    setNewAliasCode('');
    setMessage({ text: 'بارکۆدی هاوتای (' + clean + ') زیادکرا بۆ «' + p.name + '»', error: false });
  };

  const filteredProducts = products.filter(p => {
    const q = searchTerm.toLowerCase();
    const matchSearch =
      searchTerm === '' ||
      p.name.toLowerCase().includes(q) ||
      p.unit_barcode.includes(searchTerm) ||
      p.unit_alias_barcodes.some(a => a.includes(searchTerm)) ||
      (p.sku && p.sku.toLowerCase().includes(q)) ||
      (p.plu && p.plu.includes(searchTerm)) ||
      (p.carton && p.carton.barcode.includes(searchTerm)) ||
      (p.extra_packs?.some(x=>x.barcode.includes(searchTerm)||x.alias_barcodes.some(b=>b.includes(searchTerm)))??false);

    if (!matchSearch) return false;
    if (catalogUnitFilter === 'carton' && !p.carton) return false;
    if (catalogUnitFilter === 'kg' && p.base_unit !== 'kg' && !p.plu) return false;
    if (catalogUnitFilter === 'unit' && (p.base_unit === 'kg' || Boolean(p.plu))) return false;
    if (categoryFilter !== 'all' && (p.category || 'گشتی') !== categoryFilter) return false;
    if (stockFilter === 'low') return p.stock <= (p.min_stock || 10) && p.stock > 0;
    if (stockFilter === 'out') return p.stock <= 0;
    if (stockFilter === 'expiry') {
      if (!p.expiry_date) return false;
      const days = Math.ceil((new Date(p.expiry_date).getTime() - Date.now()) / (1000 * 3600 * 24));
      return days <= 30;
    }
    return true;
  });

  const sellNum = parseInt(unitSellPrice, 10) || 0;
  const buyNum = parseInt(unitBuyPrice, 10) || 0;
  const unitProfitIqd = sellNum - buyNum;
  const unitProfitMargin = buyNum > 0 ? ((unitProfitIqd / buyNum) * 100).toFixed(1) : null;

  const lowStockCount = products.filter(p => p.stock <= (p.min_stock || 10)).length;
  const expiringCount = products.filter(p => {
    if (!p.expiry_date) return false;
    const days = Math.ceil((new Date(p.expiry_date).getTime() - Date.now()) / (1000 * 3600 * 24));
    return days <= 30;
  }).length;
  const cartonProductsCount = products.filter(p => Boolean(p.carton)).length;
  const scaleProductsCount = products.filter(p => p.base_unit === 'kg' || Boolean(p.plu)).length;
  const totalAliasCount = products.reduce(
    (sum, p) => sum + p.unit_alias_barcodes.length + (p.carton ? 1 + p.carton.alias_barcodes.length : 0) + (p.extra_packs?.reduce((count,pack)=>count+1+pack.alias_barcodes.length,0)??0),
    0
  );

  const totalRetailStockValue = products.reduce((sum, p) => sum + p.stock * p.unit_sale_price_iqd, 0);
  const totalCostStockValue = products.reduce(
    (sum, p) => sum + p.stock * (p.unit_purchase_price_iqd || 0),
    0
  );
  const avgMarginPct =
    products.length > 0
      ? (
          products.reduce((acc, p) => {
            const b = p.unit_purchase_price_iqd || 0;
            return acc + (b > 0 ? ((p.unit_sale_price_iqd - b) / b) * 100 : 25);
          }, 0) / products.length
        ).toFixed(1)
      : '0.0';

  const matchedBarcodeProduct = barcodeTestQuery.trim()
    ? findBarcodeOwner(barcodeTestQuery.trim(), null) ||
      products.find(p => p.plu === barcodeTestQuery.trim() || p.sku === barcodeTestQuery.trim())
    : undefined;

  const barcodeCatalogProduct = products.find(p => p.id === barcodeCatalogSelectedId) || null;
  const barcodeCatalogQuery = barcodeCatalogProductQuery.trim().toLowerCase();
  const barcodeCatalogMatches = barcodeCatalogQuery
    ? products.filter(p => p.name.toLowerCase().includes(barcodeCatalogQuery)
      || p.unit_barcode.includes(barcodeCatalogQuery)
      || p.unit_alias_barcodes.some(x => x.includes(barcodeCatalogQuery))
      || Boolean(p.carton && (p.carton.barcode.includes(barcodeCatalogQuery)
        || p.carton.alias_barcodes.some(x => x.includes(barcodeCatalogQuery))))
      || Boolean(p.extra_packs?.some(x => x.barcode.includes(barcodeCatalogQuery)
        || x.alias_barcodes.some(a => a.includes(barcodeCatalogQuery))))).slice(0, 8)
    : [];
  const barcodeCatalogPack = barcodeCatalogProduct?.extra_packs?.find(x => x.kind === barcodeCatalogMode);
  const barcodeCatalogEnabled = Boolean(barcodeCatalogProduct && (
    barcodeCatalogMode === 'kg' ? barcodeCatalogProduct.base_unit === 'kg'
      : barcodeCatalogMode === 'unit' ? barcodeCatalogProduct.base_unit !== 'kg'
      : barcodeCatalogMode === 'carton' ? Boolean(barcodeCatalogProduct.carton)
      : Boolean(barcodeCatalogPack)
  ));
  const barcodeCatalogPrimaryCode = barcodeCatalogProduct && barcodeCatalogEnabled
    ? (barcodeCatalogMode === 'unit' || barcodeCatalogMode === 'kg'
      ? barcodeCatalogProduct.unit_barcode
      : barcodeCatalogMode === 'carton'
        ? barcodeCatalogProduct.carton?.barcode
        : barcodeCatalogPack?.barcode) || ''
    : '';
  const barcodeCatalogAliases = barcodeCatalogProduct && barcodeCatalogEnabled
    ? (barcodeCatalogMode === 'unit' || barcodeCatalogMode === 'kg'
      ? barcodeCatalogProduct.unit_alias_barcodes
      : barcodeCatalogMode === 'carton'
        ? barcodeCatalogProduct.carton?.alias_barcodes || []
        : barcodeCatalogPack?.alias_barcodes || [])
    : [];
  const barcodeCatalogRows = [
    ...(barcodeCatalogPrimaryCode ? [{ code: barcodeCatalogPrimaryCode, primary: true }] : []),
    ...barcodeCatalogAliases.map(code => ({ code, primary: false }))
  ];
  const barcodeCatalogTotalCount = barcodeCatalogProduct ? (
    1 + barcodeCatalogProduct.unit_alias_barcodes.length
    + (barcodeCatalogProduct.carton ? 1 + barcodeCatalogProduct.carton.alias_barcodes.length : 0)
    + (barcodeCatalogProduct.extra_packs?.reduce((count, pack) =>
      count + 1 + pack.alias_barcodes.length, 0) || 0)
  ) : 0;

  const selectedCatalogProduct = products.find(p => p.id === selectedCatalogProductId) || null;
  const editingProduct = products.find(p => p.id === editingId) || null;
  const editSearchMatches = editProductSearch.trim().toLowerCase()
    ? products.filter(p => p.name.toLowerCase().includes(editProductSearch.trim().toLowerCase())
        || p.unit_barcode.includes(editProductSearch.trim())
        || Boolean(p.carton?.barcode.includes(editProductSearch.trim()))).slice(0, 6)
    : [];

  return (
    <div className="ws-stack canva-catalog-021" data-canva-screen="021">
      {message && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '10px',
            background: message.error ? '#fef2f2' : '#f0fdf4',
            border: `1px solid ${message.error ? '#fca5a5' : '#bbf7d0'}`,
            color: message.error ? '#991b1b' : '#166534',
            fontWeight: 800,
            fontSize: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span>{message.text}</span>
          <button
            type="button"
            className="secondary"
            onClick={() => setMessage(null)}
            style={{ minHeight: '24px', padding: '0 8px', fontSize: '11px' }}
          >
            داخستن
          </button>
        </div>
      )}

      {/* 1. NEW / EDIT PRODUCT SUBMODULE */}
      {activeTab === 'new' && (
        <>
          <div className="canva-catalog-page-heading canva-catalog-new-heading" data-canva-screen={editingId ? '023' : '022'}>
            <h1>{editingId ? 'دەستکاریکردنی کاڵا و نرخ' : 'تۆمارکردنی کاڵای نوێ'}</h1>
            <nav className="canva-catalog-new-nav" aria-label="ڕێڕەوی کاڵا">
              <button type="button" className="canva-catalog-home" onClick={() => navigateTo('home')}>ماڵەوە</button>
              <button type="button" className="secondary" onClick={() => { resetForm(); setActiveTab('list'); }}>کاڵا و نرخ</button>
            </nav>
          </div>
          <div className="ws-kpi-grid">
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">کۆی کاڵاکانی ناو کەتەلۆگ</span>
              <span className="ws-kpi-value">{products.length}</span>
              <span className="ws-kpi-sub">ئامادە بۆ فرۆشتن و سکانی بارکۆد</span>
            </div>
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">کاڵای بەردەست بە کارتۆن</span>
              <span className="ws-kpi-value positive">{cartonProductsCount}</span>
              <span className="ws-kpi-sub">فرۆشتنی تاک و کۆ (دانە + کارتۆن)</span>
            </div>
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">کاڵای تەرازوو و کێشان (PLU/kg)</span>
              <span className="ws-kpi-value">{scaleProductsCount}</span>
              <span className="ws-kpi-sub">پشتگیری بارکۆدی کێش و نرخی تەرازوو</span>
            </div>
          </div>

          <div className={editingId ? 'canva-catalog-new-layout canva-catalog-edit-023' : 'canva-catalog-new-layout'}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.25fr) minmax(320px, 1fr)',
              gap: '10px',
              flex: '1 1 0%',
              minHeight: 0,
              overflow: 'hidden'
            }}
          >
            <div className="ws-panel" style={{ overflowY: 'auto', minHeight: 0 }}>
              <div className="ws-toolbar">
                <h2 className="ws-panel-title" style={{ margin: 0 }}>
                  {editingId ? 'دەستکاریکردنی زانیاری و نرخ' : 'زانیاریی بنەڕەتی کاڵا'}
                </h2>
                {editingId && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      resetForm();
                      setActiveTab('list');
                    }}
                  >
                    گەڕانەوە بۆ لیستی کاڵا
                  </button>
                )}
              </div>

              {editingId && (
                <div className="canva-catalog-edit-search">
                  <label htmlFor="canva-edit-023-search">کاڵای هەڵبژێردراو</label>
                  <input
                    id="canva-edit-023-search"
                    type="search"
                    value={editProductSearch}
                    onChange={e => setEditProductSearch(e.target.value)}
                    placeholder="گەڕان بە بارکۆد یان ناوی کاڵا"
                    autoComplete="off"
                  />
                  {editProductSearch.trim() && editProductSearch.trim() !== editingProduct?.name && editSearchMatches.length > 0 && (
                    <div className="canva-catalog-edit-search-results" aria-label="ئەنجامی گەڕانی کاڵا">
                      {editSearchMatches.map(p => (
                        <button key={p.id} type="button" className="secondary"
                          onClick={() => handleStartEdit(p)}>
                          {p.name} — {p.unit_barcode}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <form onSubmit={handleSaveProduct} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div className="canva-catalog-product-fields"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                    gap: '8px',
                    alignItems: 'end'
                  }}
                >
                  <label className="form-col">
                    ناوی کاڵا *
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      required
                      placeholder="نموونە: ئاوی کانی چنار 500ml"
                    />
                  </label>

                  <label className="form-col">
                    پۆلی کاڵا
                    <select value={category} onChange={e => setCategory(e.target.value)}>
                      {categories.map(cat => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="form-col">
                    <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>بارکۆدی سەرەکی *</span>
                      <button
                        type="button"
                        onClick={() => setUnitBarcode(generateNextBarcode('20'))}
                        className="secondary"
                        style={{ height: '20px', padding: '0 6px', fontSize: '10px' }}
                      >
                        خۆکار
                      </button>
                    </span>
                    <input
                      type="text"
                      value={unitBarcode}
                      onChange={e => setUnitBarcode(e.target.value)}
                      dir="ltr"
                      required
                      placeholder="2000000000000"
                    />
                  </label>

                  <label className="form-col">
                    نرخی کڕین (IQD)
                    <input
                      type="number"
                      min="0"
                      value={unitBuyPrice}
                      onChange={e => setUnitBuyPrice(e.target.value)}
                      placeholder="2000"
                    />
                  </label>

                  <label className="form-col">
                    نرخی فرۆشتن (IQD) *
                    <input
                      type="number"
                      min="1"
                      value={unitSellPrice}
                      onChange={e => setUnitSellPrice(e.target.value)}
                      required
                      placeholder="2500"
                    />
                  </label>

                  <label className="form-col">
                    یەکەی بنەڕەتی
                    <select value={baseUnit} onChange={e => setBaseUnit(e.target.value as BaseUnit)}>
                      <option value="unit">دانە (Piece)</option>
                      <option value="kg">کیلۆگرام (kg)</option>
                    </select>
                  </label>

                  <label className="form-col">
                    شێوازی فرۆشتن
                    <select value={saleMode} onChange={e => setSaleMode(e.target.value as SaleMode)}>
                      <option value="unit">تەنها بە دانە</option>
                      <option value="carton">تەنها بە کارتۆن</option>
                      <option value="both">دانە و کارتۆن بەیەکەوە</option>
                    </select>
                  </label>

                  <label className="form-col">
                    کۆدی ناوخۆیی (SKU)
                    <input
                      type="text"
                      value={sku}
                      onChange={e => setSku(e.target.value)}
                      dir="ltr"
                      placeholder="WTR-500"
                    />
                  </label>

                  <label className="form-col">
                    کۆدی تەرازوو (PLU)
                    <input
                      type="text"
                      value={plu}
                      onChange={e => setPlu(e.target.value)}
                      dir="ltr"
                      placeholder="101"
                    />
                  </label>

                  {!editingId && (
                    <label className="form-col">
                      کۆگای سەرەتایی
                      <input
                        type="number"
                        min="0"
                        value={initialStock}
                        onChange={e => setInitialStock(e.target.value)}
                      />
                    </label>
                  )}

                  <label className="form-col">
                    کەمترین بڕی ئاگادارکردنەوە
                    <input
                      type="number"
                      min="0"
                      value={minStock}
                      onChange={e => setMinStock(e.target.value)}
                      placeholder="10"
                    />
                  </label>

                  <label className="form-col">
                    بەرواری بەسەرچوون
                    <input
                      type="date"
                      value={expiryDate}
                      onChange={e => setExpiryDate(e.target.value)}
                      dir="ltr"
                    />
                  </label>

                  <label className="form-col" style={{ gridColumn: editingId ? 'span 1' : 'span 3' }}>
                    بارکۆدی هاوتای زیادە (بە کۆما جیاکراوە)
                    <input
                      type="text"
                      value={extraBarcodes}
                      onChange={e => setExtraBarcodes(e.target.value)}
                      dir="ltr"
                      placeholder="8690001, 8690002"
                    />
                  </label>
                </div>

                {(saleMode === 'carton' || saleMode === 'both') && (
                  <div
                    style={{
                      borderTop: '1px solid #e2e9f1',
                      paddingTop: '8px'
                    }}
                  >
                    <div className="ws-panel-title">زانیارییەکانی کارتۆن / بەستە</div>
                    <div className="ws-form-grid">
                      <label className="form-col">
                        ناوی کارتۆن
                        <input
                          type="text"
                          value={cartonName}
                          onChange={e => setCartonName(e.target.value)}
                          placeholder="کارتۆنی 24 دانەیی"
                        />
                      </label>
                      <label className="form-col">
                        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>بارکۆدی کارتۆن *</span>
                          <button
                            type="button"
                            onClick={() => setCartonBarcode(generateNextBarcode('21'))}
                            className="secondary"
                            style={{ height: '20px', padding: '0 6px', fontSize: '10px' }}
                          >
                            خۆکار
                          </button>
                        </span>
                        <input
                          type="text"
                          value={cartonBarcode}
                          onChange={e => setCartonBarcode(e.target.value)}
                          dir="ltr"
                          placeholder="بارکۆدی کارتۆن"
                        />
                      </label>
                      <label className="form-col">
                        ژمارەی دانە لە کارتۆندا *
                        <input
                          type="number"
                          min="2"
                          value={unitsPerCarton}
                          onChange={e => setUnitsPerCarton(e.target.value)}
                        />
                      </label>
                      <label className="form-col">
                        نرخی کڕینی کارتۆن (IQD)
                        <input
                          type="number"
                          min="0"
                          value={cartonBuyPrice}
                          onChange={e => setCartonBuyPrice(e.target.value)}
                        />
                      </label>
                      <label className="form-col">
                        نرخی فرۆشتنی کارتۆن (IQD) *
                        <input
                          type="number"
                          min="1"
                          value={cartonSellPrice}
                          onChange={e => setCartonSellPrice(e.target.value)}
                        />
                      </label>
                      <label className="form-col">
                        بارکۆدی هاوتای کارتۆن
                        <input
                          type="text"
                          value={extraCartonBarcodes}
                          onChange={e => setExtraCartonBarcodes(e.target.value)}
                          dir="ltr"
                          placeholder="2100001, 2100002"
                        />
                      </label>
                    </div>
                  </div>
                )}

                <div style={{borderTop:'1px solid #e2e9f1',paddingTop:10}}>
                  <div className="ws-panel-title">یەکەکانی زیادە — دەستە و سێت</div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:12}}>
                    {extraPackDrafts.map(d=>(
                      <div key={d.kind} style={{padding:12,border:'1px solid #dfe6ed',borderRadius:10,background:'#fff'}}>
                        <strong style={{color:'#172b45',fontSize:14}}>{d.kind==='bundle'?'دەستە':'سێت'}</strong>
                        <div className="ws-form-grid" style={{marginTop:9}}>
                          <label className="form-col">ناوی یەکە
                            <input value={d.name} onChange={e=>editPack(d.kind,{name:e.target.value})}/>
                          </label>
                          <label className="form-col">بارکۆد
                            <input dir="ltr" value={d.barcode} onChange={e=>editPack(d.kind,{barcode:e.target.value})}/>
                          </label>
                          <label className="form-col">ژمارەی دانە لە ناو یەکە
                            <input type="number" min="2" max="100000" step="1" value={d.units} onChange={e=>editPack(d.kind,{units:e.target.value})}/>
                          </label>
                          <label className="form-col">نرخی فرۆشتن (IQD)
                            <input type="number" min="1" step="1" value={d.sell} onChange={e=>editPack(d.kind,{sell:e.target.value})}/>
                          </label>
                          <label className="form-col">نرخی کڕین (IQD)
                            <input type="number" min="0" step="1" value={d.buy} onChange={e=>editPack(d.kind,{buy:e.target.value})}/>
                          </label>
                          <label className="form-col">بارکۆدە هاوتاکان
                            <input dir="ltr" value={d.aliases} onChange={e=>editPack(d.kind,{aliases:e.target.value})}/>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="ws-toolbar" style={{ marginBottom: 0, paddingTop: '4px' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button type="submit" className="primary">
                      {editingId ? 'پاشەکەوتکردنی گۆڕانکارییەکان' : 'پاشەکەوتکردنی کاڵا'}
                    </button>
                    <button type="button" className="secondary" onClick={resetForm}>
                      پاککردنەوەی خانەکان
                    </button>
                  </div>
                  {buyNum > 0 && sellNum > 0 && (
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 900,
                        color: unitProfitIqd >= 0 ? '#15803d' : '#b91c1c'
                      }}
                    >
                      {unitProfitIqd < 0
                        ? `ئاگاداری: نرخی فرۆشتن بە زیانە (${money(unitProfitIqd)})`
                        : `قازانجی یەکە: ${money(unitProfitIqd)} (${unitProfitMargin}%)`}
                    </span>
                  )}
                </div>
              </form>
            </div>

            {editingId ? (
              <aside className="canva-catalog-new-summary canva-catalog-edit-permission" data-canva-inline-permission="true" aria-label="دەسەڵات و پشتڕاستکردنەوە">
                <h2>دەسەڵات و پشتڕاستکردنەوە</h2>
                <dl>
                  <div><dt>دۆخی دەستگەیشتن</dt><dd>پشتڕاست نەکراوە</dd></div>
                  <div><dt>نرخی ئێستا</dt><dd>{editingProduct ? money(editingProduct.unit_sale_price_iqd) : '— IQD'}</dd></div>
                  <div><dt>نرخی پێشوو</dt><dd>— IQD</dd></div>
                </dl>
                <button type="button" className="secondary" disabled title="پشتڕاستکردنەوەی دەسەڵاتی گۆڕانکاری لەم ڕووکاری Demo ـەدا بەردەست نییە">
                  داواکردنی گۆڕانکاری
                </button>
                <button type="button" className="secondary" onClick={() => { resetForm(); setActiveTab('list'); }}>گەڕانەوە</button>
              </aside>
            ) : (
              <aside className="canva-catalog-new-summary" data-canva-inline-summary="true" aria-label="پوختەی تۆمارکردن">
              <h2>پوختەی تۆمارکردن</h2>
              <dl>
                <div><dt>دۆخی تۆمار</dt><dd>{editingId ? 'دەستکاری' : 'نوێ'}</dd></div>
                <div><dt>ناوی کاڵا</dt><dd>{name.trim() || '—'}</dd></div>
                <div><dt>یەکەی سەرەکی</dt><dd>{baseUnit === 'kg' ? 'کیلۆ' : 'دانە'}</dd></div>
                <div><dt>بارکۆد</dt><dd dir="ltr">{unitBarcode.trim() || '—'}</dd></div>
                <div><dt>نرخی فرۆشتنی دانە</dt><dd>{unitSellPrice.trim() ? unitSellPrice + ' IQD' : '0 IQD'}</dd></div>
              </dl>
              <button type="button" className="secondary" onClick={() => { resetForm(); setActiveTab('list'); }}>هەڵوەشاندنەوە</button>
              </aside>
            )}
          </div>
        </>
      )}

      {/* 2. PRODUCT LIST SUBMODULE */}
      {activeTab === 'list' && (
        <>
          <div className="canva-catalog-page-heading">
            <h1>لیستی کاڵا و نرخ</h1>
            <button type="button" className="canva-catalog-home" onClick={() => navigateTo('home')}>ماڵەوە</button>
          </div>
          <div className="canva-catalog-section-heading">
            <h2>لیستی کاڵاکان</h2>
            <button type="button" className="primary" onClick={() => setActiveTab('new')}>کاڵای نوێ</button>
          </div>
          <div className="canva-catalog-unit-filters" role="group" aria-label="فلتەری یەکەی فرۆشتن">
            {([
              ['all', 'هەموو'],
              ['unit', 'دانە'],
              ['carton', 'کارتۆن'],
              ['kg', 'کیلۆ']
            ] as const).map(([key, label]) => (
              <button key={key} type="button" aria-pressed={catalogUnitFilter === key}
                className={catalogUnitFilter === key ? 'primary' : 'secondary'}
                onClick={() => setCatalogUnitFilter(key)}>{label}</button>
            ))}
          </div>
          <div className="canva-catalog-layout">
            <div className="canva-catalog-primary">
          <div className="ws-kpi-grid">
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">کۆی کاڵاکانی ناو کەتەلۆگ</span>
              <span className="ws-kpi-value">{products.length}</span>
              <span className="ws-kpi-sub">ئامادە بۆ سکانی بارکۆد و فرۆشتن</span>
            </div>
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">کاڵای کەمبوو لە کۆگا</span>
              <span className={`ws-kpi-value ${lowStockCount > 0 ? 'negative' : 'positive'}`}>
                {lowStockCount}
              </span>
              <span className="ws-kpi-sub">کەمتر لە سنووری ئاگادارکردنەوە</span>
            </div>
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">کاڵای بەردەست بە کارتۆن</span>
              <span className="ws-kpi-value">{cartonProductsCount}</span>
              <span className="ws-kpi-sub">فرۆشتنی تاک و کۆ (دانە + کارتۆن)</span>
            </div>
          </div>

          <div ref={importPopoverRef} className="ws-panel" style={{ position: 'relative' }}>
            <div className="ws-toolbar" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="text"
                  className="input-search"
                  placeholder="گەڕان بە ناو، بارکۆد، SKU، PLU..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
                <select
                  className="input-search"
                  style={{ width: '155px' }}
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                >
                  <option value="all">هەموو پۆلەکان</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <select
                  className="input-search"
                  style={{ width: '185px' }}
                  value={stockFilter}
                  onChange={e => setStockFilter(e.target.value as 'all' | 'low' | 'out' | 'expiry')}
                >
                  <option value="all">هەموو کۆگا ({products.length})</option>
                  <option value="low">کەمبووە لە کۆگا ({lowStockCount})</option>
                  <option value="expiry">نزیک لە بەسەرچوون ({expiringCount})</option>
                  <option value="out">تەواوبوو (0)</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  className={showImport ? 'primary' : 'secondary'}
                  onClick={() => setShowImport(!showImport)}
                >
                  {showImport ? 'داخستنی هاوردەکردن ▲' : 'هاوردەکردنی CSV ▼'}
                </button>
                <button type="button" className="secondary" onClick={handleExportCsv}>
                  هەناردەکردنی CSV
                </button>
              </div>
            </div>

            {showImport && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  insetInline: 0,
                  zIndex: 40,
                  background: '#ffffff',
                  border: '2px solid #203e66',
                  borderRadius: '11px',
                  padding: '12px 14px',
                  boxShadow: '0 14px 32px rgba(15, 23, 42, 0.18)'
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 800, marginBottom: '6px', color: '#1d3450' }}>
                  هاوردەکردنی کاڵا بە CSV (شێواز: ناوی کاڵا, بارکۆد, نرخی فرۆشتن — بارکۆدی دووبارە ڕاستەوخۆ نوێ دەکرێتەوە)
                </div>
                <textarea
                  rows={3}
                  value={importText}
                  onChange={e => setImportText(e.target.value)}
                  placeholder={'ئاوی کانی چنار 500ml, 2000000000018, 250\nڕۆنی زەیتی زێڕین, 8690504100234, 3250'}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    padding: '8px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px'
                  }}
                />
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button type="button" className="primary" onClick={handleImportSubmit}>
                    دەستپێکردنی هاوردەکردن
                  </button>
                  <button type="button" className="secondary" onClick={() => setShowImport(false)}>
                    داخستن
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="section-workspace__table">
            <strong className="section-workspace__metric">
              لیستی کاڵاکان ({filteredProducts.length} لە {products.length} کاڵا)
            </strong>
            <table>
              <thead>
                <tr>
                  <th>ناوی کاڵا</th>
                  <th>پۆل</th>
                  <th>بارکۆد</th>
                  <th>یەکە</th>
                  <th>نرخی فرۆشتن</th>
                  <th>نرخی کڕین</th>
                  <th>کۆگا</th>
                  <th>کارتۆن</th>
                  <th>کردارەکان</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td className="section-workspace__empty" colSpan={9}>
                      هیچ کاڵایەک نەدۆزرایەوە بەپێی ئەم گەڕانە
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map(p => (
                    <tr key={p.id}>
                      <td>
                        <button type="button" className="canva-catalog-pick"
                          aria-label={`هەڵبژاردنی ${p.name}`}
                          aria-pressed={selectedCatalogProductId === p.id}
                          onClick={() => setSelectedCatalogProductId(p.id)}>{p.name}</button>
                        {p.sku && (
                          <span style={{ fontSize: '11px', color: '#64748b', marginRight: '6px' }}>
                            ({p.sku})
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="ws-badge">{p.category || 'گشتی'}</span>
                      </td>
                      <td style={{ direction: 'ltr', fontWeight: 800 }}>{p.unit_barcode}</td>
                      <td>{p.base_unit === 'kg' ? 'کیلۆگرام' : 'دانە'}</td>
                      <td style={{ direction: 'ltr', fontWeight: 900 }}>{money(p.unit_sale_price_iqd)}</td>
                      <td style={{ direction: 'ltr', color: '#64748b' }}>
                        {p.unit_purchase_price_iqd ? money(p.unit_purchase_price_iqd) : '—'}
                      </td>
                      <td
                        style={{
                          fontWeight: 900,
                          color: p.stock <= 0 ? '#b91c1c' : p.stock <= (p.min_stock || 10) ? '#b45309' : '#15803d'
                        }}
                      >
                        <div>{p.stock} {p.base_unit === 'kg' ? 'kg' : 'دانە'}</div>
                        <div style={{ display: 'flex', gap: '4px', marginTop: '2px', flexWrap: 'wrap' }}>
                          {p.stock <= (p.min_stock || 10) && (
                            <span style={{ fontSize: '10px', background: '#fef3c7', color: '#92400e', padding: '1px 5px', borderRadius: '4px', fontWeight: 800 }}>
                              کەمبووە
                            </span>
                          )}
                          {(() => {
                            if (!p.expiry_date) return null;
                            const days = Math.ceil((new Date(p.expiry_date).getTime() - Date.now()) / (1000 * 3600 * 24));
                            if (days <= 0) {
                              return <span style={{ fontSize: '10px', background: '#fee2e2', color: '#991b1b', padding: '1px 5px', borderRadius: '4px', fontWeight: 800 }}>بەسەرچووە</span>;
                            }
                            if (days <= 30) {
                              return <span style={{ fontSize: '10px', background: '#fef3c7', color: '#b45309', padding: '1px 5px', borderRadius: '4px', fontWeight: 800 }}>{days} ڕۆژ ماوە</span>;
                            }
                            return null;
                          })()}
                        </div>
                      </td>
                      <td>
                        {p.carton
                          ? `${p.carton.units_per_carton} دانە (${money(p.carton.sale_price_iqd)})`
                          : '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button type="button" className="secondary" onClick={() => handleStartEdit(p)}>
                            دەستکاری
                          </button>
                          <button type="button" className="secondary" onClick={() => setSelectedForLabel(p)}>
                            لیبڵ
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => deleteProduct(p.id)}
                            style={{ color: '#b91c1c' }}
                          >
                            سڕینەوە
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

          </div>
            </div>
            <aside className="canva-catalog-aside" data-canva-inline-details="true" aria-label="وردەکاری و دەسەڵات">
              <h2>وردەکاری و دەسەڵات</h2>
              <dl>
                <div><dt>کاڵای هەڵبژێردراو</dt><dd>{selectedCatalogProduct?.name || '—'}</dd></div>
                <div><dt>نرخی فرۆشتن</dt><dd>{selectedCatalogProduct ? money(selectedCatalogProduct.unit_sale_price_iqd) : '— IQD'}</dd></div>
                <div><dt>بارکۆدی سەرەکی</dt><dd dir="ltr">{selectedCatalogProduct?.unit_barcode || '—'}</dd></div>
              </dl>
              <p>کاشێر: تەنها بینین</p>
              <button type="button" className="secondary" disabled={!selectedCatalogProduct}
                onClick={() => selectedCatalogProduct && handleStartEdit(selectedCatalogProduct)}>
                بینینی وردەکاری
              </button>
            </aside>
          </div>
        </>
      )}

      {/* 3. PRICES & MARGINS SUBMODULE */}
      {activeTab === 'prices' && (
        <>
          <div className="ws-kpi-grid">
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">بەهای گشتیی کۆگا بە نرخی فرۆشتن</span>
              <span className="ws-kpi-value positive">{money(totalRetailStockValue)}</span>
              <span className="ws-kpi-sub">کۆی بەهای کاڵاکانی ناو ڕەفە و کۆگا</span>
            </div>
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">بەهای گشتیی کۆگا بە نرخی کڕین</span>
              <span className="ws-kpi-value">{money(totalCostStockValue)}</span>
              <span className="ws-kpi-sub">تێچووی سەرمایەی خەوێنراو لە کاڵادا</span>
            </div>
            <div className="ws-kpi-card">
              <span className="ws-kpi-label">تێکڕای ڕێژەی قازانجی کەتەلۆگ</span>
              <span className="ws-kpi-value positive">{avgMarginPct}%</span>
              <span className="ws-kpi-sub">لەسەر کۆی {products.length} کاڵای چالاک</span>
            </div>
          </div>

          <div className="ws-panel">
            <div className="ws-toolbar" style={{ marginBottom: 0 }}>
              <input
                type="text"
                className="input-search"
                placeholder="گەڕان لە نرخەکان بەپێی ناوی کاڵا یان بارکۆد..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#536c85' }}>
                کلیک لەسەر «گۆڕینی خێرای نرخ» بکە بۆ نوێکردنەوەی دەستبەجێی نرخی تاک و کارتۆن
              </span>
            </div>
          </div>

          <div className="section-workspace__table">
            <strong className="section-workspace__metric">
              خشتەی نرخ و قازانجی کاڵاکان ({filteredProducts.length} کاڵا)
            </strong>
            <table>
              <thead>
                <tr>
                  <th>ناوی کاڵا</th>
                  <th>نرخی کڕین (تێچوو)</th>
                  <th>نرخی فرۆشتنی تاک</th>
                  <th>قازانجی یەکە (IQD)</th>
                  <th>ڕێژەی قازانج (%)</th>
                  <th>نرخی فرۆشتنی کارتۆن</th>
                  <th>کردار</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map(p => {
                  const isEditingThis = quickPriceId === p.id;
                  const buy = p.unit_purchase_price_iqd || 0;
                  const sell = p.unit_sale_price_iqd;
                  const profit = sell - buy;
                  const margin = buy > 0 ? ((profit / buy) * 100).toFixed(1) : '100';

                  return (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.name}</strong>
                      </td>
                      <td style={{ direction: 'ltr' }}>
                        {isEditingThis ? (
                          <input
                            type="number"
                            min="0"
                            value={quickBuy}
                            onChange={e => setQuickBuy(e.target.value)}
                            style={{ width: '95px', padding: '4px 6px' }}
                          />
                        ) : buy > 0 ? (
                          money(buy)
                        ) : (
                          '—'
                        )}
                      </td>
                      <td style={{ direction: 'ltr', fontWeight: 900 }}>
                        {isEditingThis ? (
                          <input
                            type="number"
                            min="1"
                            value={quickSell}
                            onChange={e => setQuickSell(e.target.value)}
                            style={{ width: '95px', padding: '4px 6px' }}
                          />
                        ) : (
                          money(sell)
                        )}
                      </td>
                      <td style={{ direction: 'ltr', fontWeight: 900, color: profit >= 0 ? '#15803d' : '#b91c1c' }}>
                        {money(profit)}
                      </td>
                      <td style={{ direction: 'ltr', fontWeight: 800 }}>{margin}%</td>
                      <td style={{ direction: 'ltr' }}>
                        {isEditingThis && p.carton ? (
                          <input
                            type="number"
                            min="1"
                            value={quickCartonSell}
                            onChange={e => setQuickCartonSell(e.target.value)}
                            style={{ width: '105px', padding: '4px 6px' }}
                          />
                        ) : p.carton ? (
                          money(p.carton.sale_price_iqd)
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {isEditingThis ? (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button type="button" className="primary" onClick={() => handleSaveQuickPrice(p)}>
                              پاشەکەوت
                            </button>
                            <button type="button" className="secondary" onClick={() => setQuickPriceId(null)}>
                              پاشگەزبوونەوە
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button type="button" className="secondary" onClick={() => handleStartQuickPrice(p)}>
                              گۆڕینی خێرای نرخ
                            </button>
                            <button type="button" className="secondary" onClick={() => handleStartEdit(p)}>
                              دەستکاری تەواو
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 4. BARCODES: original Canva 024 layout, real local catalog handlers. */}
      {activeTab === 'barcodes' && (
        <section className="canva-barcode-024" data-canva-screen="024" dir="rtl">
          <div className="canva-catalog-page-heading canva-barcode-heading">
            <h1>بارکۆدەکان و جۆرەکانی فرۆشتن</h1>
            <nav className="canva-catalog-new-nav" aria-label="ڕێڕەوی کاڵا">
              <button type="button" className="canva-catalog-home" onClick={() => navigateTo('home')}>ماڵەوە</button>
              <button type="button" className="secondary" onClick={() => setActiveTab('list')}>کاڵا و نرخ</button>
            </nav>
          </div>

          <div className="canva-barcode-layout">
            <div className="canva-barcode-main">
              <h2>بارکۆدەکانی هەر جۆرە یەکەیەک</h2>
              <label className="canva-barcode-search">
                <strong>کاڵا</strong>
                <input type="search" value={barcodeCatalogProductQuery}
                  onChange={e => setBarcodeCatalogProductQuery(e.target.value)}
                  placeholder="هەڵبژاردنی کاڵا بە ناو یان بارکۆد" autoComplete="off" />
              </label>
              {barcodeCatalogQuery && barcodeCatalogProductQuery !== barcodeCatalogProduct?.name && (
                <div className="canva-barcode-suggestions" aria-label="کاڵاکانی دۆزراوە">
                  {barcodeCatalogMatches.map(p => (
                    <button key={p.id} type="button" className="secondary"
                      onClick={() => {
                        setBarcodeCatalogSelectedId(p.id);
                        setBarcodeCatalogProductQuery(p.name);
                        setBarcodeCatalogMode(p.base_unit === 'kg' ? 'kg' : 'unit');
                        setBarcodeCatalogAdding(false);
                        setNewAliasCode('');
                      }}>
                      {p.name} — {p.unit_barcode}
                    </button>
                  ))}
                </div>
              )}

              <h3>جۆری یەکە</h3>
              <div className="canva-barcode-mode-tabs" role="group" aria-label="جۆری یەکە">
                {([
                  ['unit', 'دانە'], ['carton', 'کارتۆن'],
                  ['bundle', 'دەستە'], ['set', 'سێت'], ['kg', 'کیلۆ']
                ] as const).map(([mode, label]) => (
                  <button type="button" key={mode} aria-pressed={barcodeCatalogMode === mode}
                    className={barcodeCatalogMode === mode ? 'primary' : 'secondary'}
                    disabled={!barcodeCatalogProduct || (
                      mode === 'unit' ? barcodeCatalogProduct.base_unit === 'kg'
                        : mode === 'kg' ? barcodeCatalogProduct.base_unit !== 'kg'
                        : mode === 'carton' ? !barcodeCatalogProduct.carton
                        : !barcodeCatalogProduct.extra_packs?.some(x => x.kind === mode)
                    )}
                    onClick={() => {
                      setBarcodeCatalogMode(mode);
                      setBarcodeCatalogAdding(false);
                      setNewAliasCode('');
                    }}>{label}</button>
                ))}
              </div>

              <div className="canva-barcode-table-wrap">
                <table className="canva-barcode-table">
                  <thead><tr>
                    <th>بارکۆد</th><th>جۆر</th><th>دۆخ</th><th>کردار</th>
                  </tr></thead>
                  <tbody>
                    {barcodeCatalogRows.length ? barcodeCatalogRows.map(row => (
                      <tr key={row.code}>
                        <td dir="ltr">{row.code}</td>
                        <td>{barcodeCatalogMode === 'unit' ? 'دانە'
                          : barcodeCatalogMode === 'carton' ? 'کارتۆن'
                          : barcodeCatalogMode === 'bundle' ? 'دەستە'
                          : barcodeCatalogMode === 'set' ? 'سێت' : 'کیلۆ'}</td>
                        <td>{row.primary ? 'سەرەکی' : 'هاوتا'}</td>
                        <td>—</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={4} className="canva-barcode-empty">—</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {barcodeCatalogAdding && barcodeCatalogProduct && barcodeCatalogEnabled && (
                <div className="canva-barcode-alias-edit">
                  <label htmlFor="canva-barcode-new-alias">بارکۆدی نوێ</label>
                  <input id="canva-barcode-new-alias" type="text" dir="ltr"
                    value={newAliasCode} onChange={e => setNewAliasCode(e.target.value)}
                    maxLength={60} autoComplete="off"/>
                  <button type="button" className="primary"
                    onClick={() => handleSaveBarcodeAlias(barcodeCatalogProduct, barcodeCatalogMode)}>
                    پاشەکەوت
                  </button>
                  <button type="button" className="secondary" onClick={() => {
                    setBarcodeCatalogAdding(false); setNewAliasCode('');
                  }}>هەڵوەشاندنەوە</button>
                </div>
              )}
              <button type="button" className="primary canva-barcode-add"
                disabled={!barcodeCatalogEnabled || barcodeCatalogAdding}
                onClick={() => { setBarcodeCatalogAdding(true); setNewAliasCode(''); }}>
                زیادکردنی بارکۆدی نوێ
              </button>
            </div>

            <aside className="canva-barcode-aside" aria-label="یەکە و پەیوەندییەکان">
              <h2>یەکە و پەیوەندییەکان</h2>
              <dl>
                <div><dt>یەکەی سەرەکی</dt><dd>
                  {barcodeCatalogProduct ? (barcodeCatalogProduct.base_unit === 'kg' ? 'کیلۆ' : 'دانە') : '—'}
                </dd></div>
                <div><dt>دانە لە کارتۆندا</dt><dd>
                  {barcodeCatalogProduct?.carton?.units_per_carton ?? '—'}
                </dd></div>
                <div><dt>ژمارەی بارکۆدەکان</dt><dd>{barcodeCatalogProduct ? barcodeCatalogTotalCount : '—'}</dd></div>
              </dl>
              <p>بارکۆدی دووبارە تۆمار ناکرێت</p>
              <button type="button" className="secondary" disabled title="پاراستن لە هەمان کاتی زیادکردنی بارکۆددا جێبەجێ دەکرێت">
                پاراستنی گۆڕانکاری
              </button>
            </aside>
          </div>
        </section>
      )}

      {/* Shelf Label Preview Modal */}
      {selectedForLabel && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '14px',
              padding: '22px',
              maxWidth: '360px',
              width: '100%',
              textAlign: 'center',
              border: '1px solid #dde6f0'
            }}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 900 }}>چاپی لیبڵی نرخی ڕەفە</h3>
            <div
              style={{
                border: '2px solid #1d3450',
                borderRadius: '10px',
                padding: '14px',
                background: '#fff',
                margin: '10px auto'
              }}
            >
              <div style={{ fontSize: '11px', color: '#536c85', fontWeight: 800 }}>سوپەرمارکێتی کانی چنار</div>
              <strong style={{ fontSize: '15px', display: 'block', margin: '4px 0', color: '#1d3450' }}>
                {selectedForLabel.name}
              </strong>
              <div
                style={{
                  fontSize: '24px',
                  fontWeight: 900,
                  color: '#1d3450',
                  direction: 'ltr',
                  margin: '6px 0'
                }}
              >
                {money(selectedForLabel.unit_sale_price_iqd)}
              </div>
              <div
                style={{
                  fontFamily: 'monospace',
                  letterSpacing: '2px',
                  fontSize: '13px',
                  fontWeight: 900,
                  direction: 'ltr'
                }}
              >
                ||| {selectedForLabel.unit_barcode} |||
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '14px' }}>
              <button type="button" className="primary" onClick={() => window.print()}>
                چاپکردن
              </button>
              <button type="button" className="secondary" onClick={() => setSelectedForLabel(null)}>
                داخستن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
