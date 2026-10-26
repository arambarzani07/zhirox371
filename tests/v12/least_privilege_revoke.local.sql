-- V13 LOCAL QA ONLY: validate a narrowly scoped least-privilege repair.
-- Never execute on hosted Supabase without explicit authorization.
-- No schema, data, RLS policy, Auth account, or table other than retail_* is changed.
REVOKE TRUNCATE ON TABLE
 public.retail_audit_events,
 public.retail_barcodes,
 public.retail_cash_movements,
 public.retail_cash_sessions,
 public.retail_customers,
 public.retail_memberships,
 public.retail_products,
 public.retail_receipt_counters,
 public.retail_sale_items,
 public.retail_sales,
 public.retail_stock_balances,
 public.retail_stock_events,
 public.retail_stores
FROM anon, authenticated;
