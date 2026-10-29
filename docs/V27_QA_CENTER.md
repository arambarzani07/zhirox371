# QA center alignment with V27

The transaction QA page now describes 22 current scenarios across sales, shifts, access, catalog/labels, finance and staff/audit workflows. Search covers titles, descriptions and expected outcomes; category and search combine and selection stays within the visible result set. Empty results hide stale details. Counts derive from the scenario list.

The page is an inspection guide, not a live test runner. It explicitly distinguishes expected outcomes from observed CI results, removes the stale V8/10-test label and unsupported live database-version claim, and links to the actual source suites at the verified V27 commit. The workflow link remains the entry to real CI results. Physical scanner/printer checks are still manual.

This is a presentation change only. It makes no database calls, executes no transactions, and changes none of the locked Home assets.
