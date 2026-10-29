# V39 — Customer debt read integrity

The debt overview previously filtered the bounded first-500 customer snapshot and labelled the resulting sum as store debt. It now reads active positive-balance customers directly through PostgREST in exact-count pages of 50, ordered by balance descending, name and ID. Explicit debt collection/history actions continue to hydrate the exact customer beyond the mutation snapshot.

Search selects name, phone, address or note and uses the same literal wildcard escaping as V38. High-debt filtering is server-side and includes 100,000 IQD. Overdue filtering is server-side (`due_date < today`) and excludes null/today dates. Both the query and page overdue display use the Baghdad calendar date, independent of browser timezone. An in-progress paging sequence retains its initial date until refresh.

Over-limit filtering is explicitly page-local because ordinary PostgREST cannot compare balance and credit-limit columns. All four metrics and CSV describe only the visible filtered page. The pager describes the underlying server page/count. CSV includes full customer IDs and the source page range. There is no global debt-sum or global over-limit claim.

Pending requests blank rows/metrics and disable paging/export. Tokens, actor and store guards prevent stale replies from restoring rows after a new search, account reload or logout. Empty final pages recover after deletions. Debt mutation acknowledgements retain their identity guards while refreshing the new read page; SQL and financial RPCs are unchanged.

Validation: 242 local Node tests passed, syntax/assets build passed, browser scripts and PostgREST smoke script parse successfully. V39 adds 623-debtor pagination/ordering, date/amount boundary, race, denied-read, shrinking-page and Baghdad-midnight tests. Manual UI QA verifies server search beyond the 500-customer cache and exact payment selection. Authored browser and actual Auth/PostgREST CI scenarios remain pending remote CI execution.

Limits: offset pages are live reads, not a repeatable snapshot. The mutation selectors remain bounded plus explicitly pinned customers. History remains paged; this is not a full unbounded account statement. No locked Home, production database, schema, grant, RLS or PC Relay changes.
