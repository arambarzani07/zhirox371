# V26 — batch labels and real barcode encoding

The Labels / Bulk print destination now opens the authenticated product workspace rather than a placeholder. Open a price/barcode label, add it to the queue, set 1–50 copies per code, prepare a maximum of 200 labels, review them and print. Logout and store changes clear queued labels and invalidate in-flight label responses. The queue stays in memory through catalog pagination and clears on page reload; no local queue is presented as a central server record.

Every preview is resolved through the existing store-scoped `retail_resolve_barcode_v18` RPC. Preparation refreshes all queued codes and prices. Printing revalidates them again and blocks changed prices/names, inactive codes and network failures. Barcode identifiers remain strings. No prices, stock or sales are written.

Removed the old modulo-derived decorative barcode bars. The vendor-pinned MIT JsBarcode 3.12.1 encoder emits standard CODE128 with a checksum and quiet zones. Its exact ABC start/data/checksum/stop bits are checked independently. The SVG has a real viewBox, so fitting a label scales its bars instead of cropping them. Codes too dense for the available label width fail with an explanation.

Batch stock is fixed at 50×30mm, one label per page; single labels retain 50×30mm and 38×25mm options. The validated print content is cloned to a dedicated body-level print root, excluding navigation/forms and avoiding hidden ancestor clipping. The browser print dialog is not a claim of physical printer success. Hardware, driver margins, paper calibration and scanner readability still require a real printer/scanner trial. Browser-initiated printing without the validated print button produces no label root.

Validation: 180 Node tests and build checks locally; browser CI covers copy count, current server prices, changed-price blocking, SVG viewBox and 50×30mm print-only layout. No hosted database change is required for this feature, and no hosted records were modified.

The five remaining central workflows (attendance, worktime, staff review, alerts, approvals) were inspected again: incoming main prototypes persist browser-local records. They remain explicitly unavailable in production pending store-scoped server schemas, authorization and auditable updates. They have not been relabelled as completed server features.
