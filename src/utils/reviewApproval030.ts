import type { AuditLogEntry } from '../types';

/** Local DEMO audit data are NOT requests for approval. */
export type ReviewFilter030 = 'all' | 'pending' | 'recorded_demo';
export type ReviewAudit030 = AuditLogEntry & {
  priceChange: NonNullable<AuditLogEntry['priceChange']>;
};
export const recordedPriceAudit030 = (
  entries:readonly AuditLogEntry[]
): ReviewAudit030[] => entries
  .filter((item):item is ReviewAudit030 =>
    item.priceChange?.status === 'recorded_demo')
  .slice()
  .sort((a,b) => b.timestamp.localeCompare(a.timestamp) || a.id.localeCompare(b.id));

/** No real approvals collection/backend is connected; never synthesize pending items. */
export const reviewEntries030 = (
  entries:readonly AuditLogEntry[], filter:ReviewFilter030, query:string
):ReviewAudit030[] => {
  if(filter==='pending') return [];
  const q=query.trim().toLocaleLowerCase();
  return recordedPriceAudit030(entries).filter(item=>{
    if(!q) return true;
    const change=item.priceChange;
    return change.productName.toLocaleLowerCase().includes(q)
      || change.barcode.toLocaleLowerCase().includes(q)
      || item.id.toLocaleLowerCase().includes(q);
  });
};

/** Fail closed, even for a forged manager role. Backend approval is not present. */
export const canFinalizeReview030 = (_role?:string,_id?:string):false => false;
