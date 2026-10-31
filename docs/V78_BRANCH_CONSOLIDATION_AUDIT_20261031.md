# ZHIROX371 Branch Consolidation Audit — 2026-10-31

Live GitHub snapshot: 83 branches, 30 open PRs; main 7e62b1d175a4a1709be7abe51e24a2cc7cb222bd.

## Safety
No branch has been mass-merged. The owner-locked Home design and production data remain untouched. A branch existing does not imply code unique to that branch has been tested or should override main.

## Already consolidated
- V65–V75 PR #73 merged into main.
- Both V77 update rollback foundations PR #74 and PR #75 merged into main.
- Windows Setup is an OFFLINE_PREVIEW_ONLY installer; not certified for live retail, cloud sync or automatic signed updates.

## Not approved for automatic merge
- PR #72 V76 release-readiness gate: observed failing CI check; do not describe as commercial GO.
- PR #12 transaction security consistency: merge state dirty, requires conflict resolution and full regression.
- PRs #2, #3, #4 overlap in scale PLU/product catalog/SQL migrations and test fixtures. Merge one blindly may regress another, despite a clean GitHub merge state.
- All older feature branches require ahead/behind checks, lockfile preservation, regression suite and checkout DB verification before merge.

## Open PRs as of audit
- #72 feature/v76-oneclick-production-readiness-20261031 -> feature/v75-native-windows-cashier-sql-lab-20261031 (draft=true)
- #71 feature/v75-native-windows-cashier-sql-lab-20261031 -> feature/v74-windows-exe-autosync-lab-20261031 (draft=true)
- #70 feature/v73-real-windows-exe-build-20261031 -> feature/v72-market-telemetry-rolling-backup-20261031 (draft=true)
- #69 feature/v72-market-telemetry-rolling-backup-20261031 -> feature/v71-market-postgres-crash-print-fence-20261031 (draft=true)
- #68 feature/v71-market-postgres-crash-print-fence-20261031 -> feature/v70-market-five-pc-soak-chaos-20261031 (draft=true)
- #67 feature/v70-market-five-pc-soak-chaos-20261031 -> feature/v69-isolated-docker-lan-five-pcs-20261031 (draft=true)
- #66 feature/v69-isolated-docker-lan-five-pcs-20261031 -> feature/v68-five-cashier-lan-recovery-20261031 (draft=true)
- #65 feature/v68-five-cashier-lan-recovery-20261031 -> feature/v67-twin-wan-reconnect-sync-20261031 (draft=true)
- #64 feature/v67-twin-wan-reconnect-sync-20261031 -> feature/v66-market-recovery-restore-lab-20261031 (draft=true)
- #63 feature/v66-market-recovery-restore-lab-20261031 -> feature/v65-market-physical-digital-twin-20261031 (draft=true)
- #62 feature/v65-market-physical-digital-twin-20261031 -> feature/v64-auth-gateway-least-privilege-20261031 (draft=true)
- #61 feature/v64-auth-gateway-least-privilege-20261031 -> feature/v63-db-actor-proof-20261031 (draft=true)
- #60 feature/v63-db-actor-proof-20261031 -> feature/v62-intent-shift-guard-20261031 (draft=true)
- #59 feature/v61-cash-ledger-executor-20261031 -> feature/v60-restricted-local-pg-api-role-20261031 (draft=true)
- #58 feature/v60-restricted-local-pg-api-role-20261031 -> feature/v59-real-postgres-https-cashier-acceptance-20261030 (draft=true)
- #57 feature/v59-real-postgres-https-cashier-acceptance-20261030 -> feature/v58-local-postgres-readiness-gate-20261030 (draft=true)
- #56 feature/v58-local-postgres-readiness-gate-20261030 -> feature/v57-locked-home-offline-shell-20261030 (draft=true)
- #55 feature/v57-locked-home-offline-shell-20261030 -> feature/v56-staging-https-auto-outbox-20261030 (draft=true)
- #54 feature/v56-staging-https-auto-outbox-20261030 -> feature/v55-one-click-windows-app-launcher-20261030 (draft=true)
- #53 feature/v55-one-click-windows-app-launcher-20261030 -> feature/v54-windows-receipt-spool-lab-20261030 (draft=false)
- #52 feature/v54-windows-receipt-spool-lab-20261030 -> feature/v53-windows-release-candidate-preflight-20261030 (draft=false)
- #51 feature/v53-windows-release-candidate-preflight-20261030 -> feature/v52-real-postgres-tls-disconnect-ci-20261030 (draft=false)
- #50 feature/v52-real-postgres-tls-disconnect-ci-20261030 -> feature/v51-cloud-cutover-and-catalog-dryrun-20261030 (draft=false)
- #49 feature/v51-cloud-cutover-and-catalog-dryrun-20261030 -> feature/v50-cloud-https-parity-lab-20261030 (draft=false)
- #48 feature/v50-cloud-https-parity-lab-20261030 -> feature/v49-offline-online-sync-lab-20261030 (draft=false)
- #47 feature/v49-offline-online-sync-lab-20261030 -> feature/v48-offline-windows-trial-bundle-20261030 (draft=false)
- #12 fix/transaction-security-consistency -> main (draft=true)
- #4 fix/scale-only-product-registration -> main (draft=true)
- #3 feature/scale-plu-registration-v19 -> main (draft=true)
- #2 feature/scale-plu-registration-fix -> main (draft=true)

## All existing branches
- chore/v30-main-consolidation-safe-archive-20261030
- chore/v78-branch-consolidation-audit-20261031
- design-lock/pc-home-v1
- feat/cashier-basket-six-column-grid-20261027
- feature/full-offline-foundation-v1
- feature/offline-local-auth-v3
- feature/offline-ui-v4-local-pilot
- feature/offline-v5-catalog-ui
- feature/retail-os-pc-foundation
- feature/scale-plu-registration-fix
- feature/scale-plu-registration-v19
- feature/source-auth-recovery-sorani-20261030
- feature/source-faithful-home-preview
- feature/v19-kg-base-unit-20261027
- feature/v20-smart-scan-basket-protection-20261027
- feature/v24-react-local-postgres-pilot-20261030
- feature/v25-local-price-locked-checkout-20261030
- feature/v26-atomic-packs-scale-checkout-20261030
- feature/v27-local-outbox-cloud-sync-pilot-20261030
- feature/v28-cloud-inbox-owner-readonly-20261030
- feature/v28-receipt-history-00e4775
- feature/v29-owner-mobile-event-reconciliation-20261030
- feature/v30-https-owner-security-gate-20261030
- feature/v31-durable-local-checkout-recovery-20261030
- feature/v32-local-only-cashier-receipts-20261030
- feature/v33-local-lan-tls-backup-drill-20261030
- feature/v34-immutable-local-receipt-preview-20261030
- feature/v35-offline-print-queue-and-release-gate-20261030
- feature/v36-isolated-lan-cashier-preflight-20261030
- feature/v37-local-shift-cash-ledger-20261030
- feature/v38-offline-cash-movements-reconciliation-20261030
- feature/v39-manager-approved-full-line-cash-refunds-20261030
- feature/v40-partial-cash-refunds-safe-payment-gate-20261030
- feature/v41-split-tender-preflight-fail-closed-20261030
- feature/v42-external-settlement-accounting-gate-20261030
- feature/v43-provider-neutral-stock-reservation-20261030
- feature/v44-offline-bank-exception-ledger-20261030
- feature/v44-provider-investigation-journal-20261030
- feature/v45-financial-integrity-audit-20261030
- feature/v46-offline-cashier-acceptance-gate-20261030
- feature/v47-hosted-preview-preflight-20261030
- feature/v48-offline-windows-trial-bundle-20261030
- feature/v49-offline-online-sync-lab-20261030
- feature/v50-cloud-https-parity-lab-20261030
- feature/v51-cloud-cutover-and-catalog-dryrun-20261030
- feature/v52-real-postgres-tls-disconnect-ci-20261030
- feature/v53-windows-release-candidate-preflight-20261030
- feature/v54-windows-receipt-spool-lab-20261030
- feature/v55-one-click-windows-app-launcher-20261030
- feature/v56-staging-https-auto-outbox-20261030
- feature/v57-locked-home-offline-shell-20261030
- feature/v58-local-postgres-readiness-gate-20261030
- feature/v59-real-postgres-https-cashier-acceptance-20261030
- feature/v60-restricted-local-pg-api-role-20261031
- feature/v61-cash-ledger-executor-20261031
- feature/v62-intent-shift-guard-20261031
- feature/v63-db-actor-proof-20261031
- feature/v64-auth-gateway-least-privilege-20261031
- feature/v65-market-physical-digital-twin-20261031
- feature/v66-market-recovery-restore-lab-20261031
- feature/v67-twin-wan-reconnect-sync-20261031
- feature/v68-five-cashier-lan-recovery-20261031
- feature/v69-isolated-docker-lan-five-pcs-20261031
- feature/v70-market-five-pc-soak-chaos-20261031
- feature/v71-market-postgres-crash-print-fence-20261031
- feature/v72-market-telemetry-rolling-backup-20261031
- feature/v73-real-windows-exe-build-20261031
- feature/v74-windows-exe-autosync-lab-20261031
- feature/v75-native-windows-cashier-sql-lab-20261031
- feature/v76-oneclick-production-readiness-20261031
- feature/v77-safe-update-rollback-foundation-20261031
- feature/v77-windows-safe-update-rollback-20261031
- fix/receipt-items-six-column-20261027
- fix/receipt-rtl-cleanprint-20261027
- fix/receipt-solid-grid-borders-20261027
- fix/scale-only-product-registration
- fix/scale-plu-registration-v19
- fix/transaction-security-consistency
- fix/v15-atomic-catalog-edit-20261027
- fix/v21-atomic-catalog-home-integrity-20261028
- fix/v22-atomic-direct-price-and-permissions-20261028
- fix/v23-preview-safety-offline-auth-gate-20261030
- main

## Required acceptance before merge
1. Confirm unique diff and no reversions of newer functionality.
2. Compare shared files and overlapping alternative changes.
3. Run entire PC home SHA-lock, product registration and receipt tests.
4. Run isolated offline PostgreSQL checkout/retry/backup tests.
5. Confirm Windows installer and commercial NO-GO gates are not weakened.
6. Merge only reviewed nonconflicting patches and keep release classification accurate.
