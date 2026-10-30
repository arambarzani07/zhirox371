# ZHIROX371 V54 — TEST ONLY: Windows thermal receipt submission

Status **NOT FOR SALES / NO-GO**. This stage extends the V53 release candidate with a **manual Windows GDI test-spooler adapter**, not a physically certified receipt printer.

## Safety and actual behavior
- A Windows operator first provisions a DISPOSABLE local PostgreSQL test DB, current migrations 001–022 as required, then **026_print_spool_fencing_v54.sql**, and synthetic product, cashier, sale, immutable V34 receipt and V35 print queue.
- The test operator supplies a single **known test job UUID**, store UUID, exact installed test printer name, and explicit `ZHIROX_V54_PRINTER_LAB_ENABLED=true` and `ZHIROX_V54_TEST_MODE=true` process configuration. The local PostgreSQL connection must be loopback with a clearly named test/trial/disposable DB. Do not place credentials in chat or GitHub.
- Run `windows/Start-ZHIROX-Print-V54.ps1` from a separate V54 test installation; never add it to Windows Startup or Task Scheduler. It checks that the printer exists using PowerShell GDI before claiming a job.
- PostgreSQL `zhirox_local.claim_print_dispatch_v54` verifies the job is queued, matches an immutable receipt, then durably fences it in state `claimed`. Two attempts for one job are explicitly refused, including after uncertain printer status.
- The Node worker reconstructs a Sorani receipt from the immutable SQL snapshot and verifies line order, line sum, supported scale quantities, unit/carton modes and 58/80 mm paper. It never uses a browser-supplied subtotal, raw ESC/POS or shell command strings.
- The Windows printing adapter submits to the exact named Windows printer, requiring a supported 58/80 mm driver-reported paper width. It prints a prominent **TEST/NOT FOR REAL SALES** marker.
- PostgreSQL records only `submitted_to_windows` or `manual_review` in the **dispatch audit table**; parent print request remains `claimed`. Neither spooler success nor CI ever sets `state='printed'` because Windows spool acceptance does not prove the receipt physically exited the device.
- A failed or ambiguous print attempt is **never requeued automatically**. An operator must compare the physical output and dispatch log before using any future approved reprint workflow. There is no automatic retry, preventing silent duplicates.

## Important limitations
- Real receipt alignment, six columns, Kurdish shaping, QR/font rendering, roll length, paper-out, power interruption and reprint behavior **must be observed physically**. GDI text drawing is not a certified final Sorani printer driver.
- Printer driver spool acceptance is NOT hardware printed. In the V54 RC, the original V35 browser GET endpoint still reports `hardware_printed:false`.
- No production printer name, customer data, PDF, CSV, printer secrets, active bank payment or market DB is packaged.
- This is a **test-only RC**, and it does not provide local PostgreSQL installation, code signing, protected Windows background cloud sync service or full catalog/price/stock cloud synchronization. Release status always `NO_GO`.
- No change to the locked 12-card Home, existing Supabase production, Vercel Production, legacy SQL Server or PC Relay.

## Tests
- `node --test offline/tests/windows-print-dispatch-v54.test.mjs`
- `psql -v ON_ERROR_STOP=1 -f offline/migrations/026_print_spool_fencing_v54.sql` (new disposable DB after prior migrations)
- `psql -v ON_ERROR_STOP=1 -f offline/tests/026_print_spool_fencing_v54.sql` (transaction rolls back)

Windows GDI printing can only be certified in the actual market after receipt paper width and real device acceptance. Until then: **NO-GO**.
