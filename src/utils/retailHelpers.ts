export function money(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return `${safe.toLocaleString('en-US')} IQD`;
}

export function isValidEan13(value: string): boolean {
  if (typeof value !== 'string' || !/^[0-9]{13}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(value[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const digit = (10 - (sum % 10)) % 10;
  return digit === Number(value[12]);
}

export function computeEan13Checksum(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

export function generateNextBarcode(prefix = '20'): string {
  const randomPart = Math.floor(1000000000 + Math.random() * 9000000000).toString().slice(0, 10);
  const first12 = `${prefix}${randomPart}`.slice(0, 12);
  const check = computeEan13Checksum(first12);
  return `${first12}${check}`;
}

export interface ScaleBarcodeInfo {
  isScale: boolean;
  itemCode: string | null;
  grams: number | null;
  kg: number | null;
  checksumValid: boolean;
}

export function parseScaleBarcode(code: string): ScaleBarcodeInfo {
  const trimmed = String(code || '').trim();
  if (/^(27|28)[0-9]{11}$/.test(trimmed)) {
    const valid = isValidEan13(trimmed);
    const itemCode = trimmed.slice(2, 7);
    const rawGrams = Number(trimmed.slice(7, 12));
    const kg = Number((rawGrams / 1000).toFixed(3));
    return {
      isScale: true,
      itemCode,
      grams: rawGrams,
      kg,
      checksumValid: valid
    };
  }
  return {
    isScale: false,
    itemCode: null,
    grams: null,
    kg: null,
    checksumValid: false
  };
}

export function inspectBarcode(input: string) {
  const code = String(input ?? '').trim();
  const numeric13 = /^[0-9]{13}$/.test(code);
  const valid = numeric13 ? isValidEan13(code) : null;
  const scale = numeric13 && code.startsWith('27');
  const scaleInfo = scale ? parseScaleBarcode(code) : null;

  return {
    code,
    length: code.length,
    type: numeric13 ? 'EAN-13' : /^[0-9]+$/.test(code) ? 'ژمارەیی (Numeric)' : 'ئەلفانوومێریک (Alphanumeric)',
    checksum: numeric13 ? (valid ? 'دروستە (Valid)' : 'نادروستە (Invalid Checksum)') : 'پەیوەندی نییە',
    scaleItemCode: scaleInfo?.itemCode || null,
    scaleGrams: scaleInfo?.grams || null,
    possibleScaleBarcode: scale,
    validEan13: valid
  };
}

export function formatDateTime(isoString?: string): string {
  const date = isoString ? new Date(isoString) : new Date();
  return date.toLocaleString('ckb-IQ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

// Strict 3-column DEMO import: name, barcode, positive integer selling price.
// Never fabricate missing prices or parse arbitrary text as currency.
export function parseCsvRows(csvText: string): Array<{ name: string; barcode: string; price: number }> {
  const lines = csvText.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const rows: Array<{name:string;barcode:string;price:number}>=[];
  const fields=(line:string,separator:string):string[]|null=>{
    const parts:string[]=[];
    let value="",quoted=false;
    for(let i=0;i<line.length;i++){
      const ch=line[i];
      if(ch==='"'){
        if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;
      }else if(ch===separator&&!quoted){parts.push(value.trim());value="";}
      else value+=ch;
    }
    if(quoted)return null;
    parts.push(value.trim());
    return parts;
  };
  for(const line of lines){
    if(line.startsWith('#')||line.startsWith('نام')||
       line.toLowerCase().startsWith('name'))continue;
    let parsed:null|{name:string;barcode:string;price:number}=null;
    for(const separator of ["\t",";",","]){
      const parts=fields(line,separator);
      if(!parts||parts.length!==3)continue;
      const [name,barcode,rawPrice]=parts;
      if(!name||!/^[0-9A-Za-z._-]{3,40}$/.test(barcode))continue;
      if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(rawPrice))continue;
      const price=Number(rawPrice.replaceAll(",",""));
      if(!Number.isSafeInteger(price)||price<=0)continue;
      parsed={name,barcode,price};
      break;
    }
    if(parsed)rows.push(parsed);
  }
  return rows;
}
