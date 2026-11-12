/** Screen 054 must use authenticated server-side purchase request records.
 * A saved 047/048 tab-local draft is NOT a submitted request and the local
 * supplier balance, user role or approval-file UI cannot authorize decisions.
 */
export type PurchaseApprovalState054='pending'|'approved'|'rejected';
export interface PurchaseApproval054 {
  id:string;
  requestType:string;
  supplier:string;
  requester:string;
  requestedAt:string;
  amountIqd:number|null;
  previousAmountIqd:number|null;
  proposedAmountIqd:number|null;
  status:PurchaseApprovalState054;
  reason:string|null;
}
export interface PurchaseApprovalFeed054 {
  authenticated:boolean;
  connected:boolean;
  requests:readonly PurchaseApproval054[];
}
/** The isolated DEMO has no connected authoritative purchase approval source. */
export const disconnectedPurchaseApproval054=():PurchaseApprovalFeed054=>({
  authenticated:false,connected:false,requests:[]
});
const safeMoney054=(v:unknown):v is number=>
 typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
export const visiblePurchaseApprovals054=(
  feed:PurchaseApprovalFeed054, status:PurchaseApprovalState054, search:string
):PurchaseApproval054[]=>{
 if(!feed.connected||!feed.authenticated)return [];
 const q=search.trim().toLocaleLowerCase();
 return feed.requests.filter(row=>
   row.status===status&&
   safeMoney054(row.amountIqd??0)&&
   (!q||[row.id,row.supplier,row.requestType,row.requester]
    .some(value=>value.toLocaleLowerCase().includes(q)))
 );
};
export const pendingPurchaseApprovals054=(feed:PurchaseApprovalFeed054):number|null=>{
 if(!feed.connected||!feed.authenticated)return null;
 return feed.requests.filter(r=>r.status==='pending').length;
};
/** Frontend role values never grant authority. Decisions require trusted
 * backend actor identity, optimistic concurrency and an idempotent endpoint.
 */
export const canDecidePurchaseApproval054=(
  _claimedRole?:string,_requestId?:string
):false=>false;
