# ZHIROX371 — physical acceptance handover (V36 STAGING ONLY)

**Market:** سوپەرمارکێتی کانی چنار. **Language:** Sorani RTL, English digits. **Source of truth:** GitHub main release SHA, locally verified PostgreSQL — never a browser Demo state.

Complete this document only when devices and a dedicated disposable test database are physically available. Tick an item **only after witnessed test and evidence**. Every failure means **NO-GO**. Keep identifiers, private IPs, passwords and certificates in the store's private administration vault, **not** GitHub.

| Check | Required evidence | Result |
|---|---|---|
| Test artifact | Exact commit SHA, V36 manifest SHA256, reproducible build logs | ☐ |
| Windows workstation | PC model, OS, user privileges, secure auto-start, date/time | ☐ |
| Local PostgreSQL | Version, restricted SQL grants, LAN firewall, local migration ledger | ☐ |
| Local TLS | Server certificate SAN, trusted CA, enrolled peer IDs, wrong-client rejection | ☐ |
| Network offline | Unplug WAN while LAN stays up: checkout, barcode, receipt history still work | ☐ |
| Two cashier devices | Concurrent sale of final unit: one commits, one rejects, no negative stock | ☐ |
| Printer 58/80 mm | Exact model, paper width, Sorani text, six columns, total, weight, carton | ☐ |
| Printer failure | Power-off, paper-out, repeated request, ambiguous print, audited reprint | ☐ |
| Scanner & scale | With and without Enter, genuine prefix-27 checksum, correct integer grams | ☐ |
| Cash & shift | Open/close, expected vs counted, discrepancies and authorised cashier | ☐ |
| Reversal/credit | Refunds, debt and mixed tenders with real PostgreSQL audit events | ☐ |
| Pricing/security | 2-role permission tests, unit/carton prices, cross-store attempts rejected | ☐ |
| Data migration | Product names, duplicate barcode handling, stock reconciliation and rollback | ☐ |
| Internet sync | Offline sale must remain committed with cloud down, idempotent later upload | ☐ |
| Recovery | UPS and power interruption, prepared UUID retry, independent disk backup | ☐ |
| Restore | New physical host, separate DB, reconciliation, measured RPO and RTO | ☐ |
| Installer | Signed Windows package, clean install, upgrade, rollback, service security | ☐ |
| Staff operations | Training, manual fallback, start-of-day and end-of-day checklists | ☐ |
| Final owner acceptance | Operator, owner, date, evidence references, all checks PASS | ☐ |

**RPO:** ______ ; **RTO:** ______ ; **Operator:** ______ ; **Owner:** ______ ; **Candidate SHA:** ______ ; **Date:** ______ .

**Safety decision:** this document is an evidence collection template, **not** an authorization to sell or deploy. Until every required functional and physical item is verified, continue with a disposable staging database only.

### Absolute stop conditions
- Any Demo invoice, product stock or fake auth appears inside a candidate live cashier.
- Any sale depends on cloud/WAN, or an ambiguous checkout creates two sale IDs.
- A receipt total differs from its committed server sale or a printer claims success without physical proof.
- A backup has never been restored on an independent machine.
- Users/roles can read or alter other store/cashier data.
- Missing owner authorization for live cutover.
