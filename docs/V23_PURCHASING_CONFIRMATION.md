# V23 purchase order confirmation

Purchase order creation and cancellation previously swallowed server errors, updated browser state and displayed success. Automatic purchase prices were also guessed as 80% of retail price.

- Manual and low-stock batch orders now require the server to return every inserted ID. Unknown acknowledgement produces a reconciliation warning, not success. Refresh before retrying an uncertain network outcome; automatic retry/idempotent order creation is not added here.
- Low-stock orders use one insert statement for the complete known-cost batch. Local orders are appended only after complete confirmation. Unknown-cost products are skipped with an explicit count; enter the invoice price manually. The current cost editor cache is limited, so an omitted recorded cost can also require manual entry.
- Purchase and receiving forms use recorded cost when available, otherwise a blank required price. Blank, fractional, negative and unsafe integer prices cannot silently become zero. An explicitly entered zero remains allowed for genuinely free stock.
- Cancellation filters on store, order ID and pending status and requires a returned matching row. A received/cancelled/inaccessible order cannot be shown as successfully cancelled. This protects the UI race; no new backend schema is introduced.
- Six unit tests cover server rejection, network failure, missing/partial acknowledgements, batch validation and guarded cancellation. A real-source Chromium test covers rejected insertion, no phantom order and stale cancellation. All existing tests remain required.

Unchanged limitations: purchasing reads are capped at 500; supplier returns still need a receipt-linked server financial/stock workflow. This phase does not make capped account exports complete or migrate production data. The five locked Home files are unchanged.
