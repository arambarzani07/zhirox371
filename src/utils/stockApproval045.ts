/** Screen 045 is a visual reference until a trustworthy authenticated
 * inventory approval source and server-side, idempotent decision endpoint exist.
 * Never infer a submitted request from a tab-local count/reconciliation draft.
 */
export type ApprovalFilter045 = 'pending' | 'approved' | 'rejected';
export interface StockApproval045 {
  id: string;
  subject: string;
  action: string;
  requestedBy: string;
  requestedAt: string;
  reason: string;
  status: ApprovalFilter045;
}
export interface StockApprovalFeed045 {
  connected: boolean;
  records: readonly StockApproval045[];
}
/** Real approval feed is NOT connected in the isolated React DEMO. */
export const disconnectedStockApprovalFeed045 = (): StockApprovalFeed045 =>
  ({ connected: false, records: [] });

/** Pure presentation filter for a future verified feed. It grants no rights. */
export const filterStockApproval045 = (
  feed: StockApprovalFeed045, query: string, status: ApprovalFilter045
): StockApproval045[] => {
  if (!feed.connected) return [];
  const q = query.trim().toLocaleLowerCase();
  return feed.records.filter(row => (
    row.status === status &&
    (!q || [row.id,row.subject,row.action,row.requestedBy]
      .some(value => value.toLocaleLowerCase().includes(q)))
  ));
};
/** Client role claims are NEVER authorization to approve or reject. */
export const canDecideStockApproval045 = (_role?: string, _id?: string): false => false;
