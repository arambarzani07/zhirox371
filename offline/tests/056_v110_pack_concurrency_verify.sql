-- Exactly ONE terminal can sell the shared 6 base units.
DO $verify$
DECLARE
 s uuid:='11000000-0000-4000-8000-000000000310';
 p uuid:='11000000-0000-4000-8000-000000000311';
 stock bigint; first_count integer; sold_count integer;
 completed_price bigint; completed_mode text; completed_qty bigint;
BEGIN
 IF current_database()<>'zhirox_v110_packs_disposable'
 THEN RAISE EXCEPTION 'V110 disposable database required'; END IF;
 SELECT count(*) INTO sold_count FROM zhirox_local.sales WHERE store_id=s;
 SELECT stock_base_units INTO stock FROM zhirox_local.products WHERE store_id=s AND id=p;
 SELECT count(*) INTO first_count FROM zhirox_local.checkout_intents_v31
 WHERE store_id=s AND state='committed';
 SELECT l.sale_mode_snapshot,l.quantity_base_units,l.line_total_minor
 INTO completed_mode,completed_qty,completed_price
 FROM zhirox_local.sale_lines l WHERE l.store_id=s;
 IF sold_count<>1 OR first_count<>1 OR
   (SELECT count(*) FROM zhirox_local.stock_ledger WHERE store_id=s)<>1 OR
   (SELECT count(*) FROM zhirox_local.event_outbox WHERE store_id=s)<>1 OR
   (SELECT count(*) FROM zhirox_local.sale_lines WHERE store_id=s)<>1 OR
   NOT ((completed_mode='bundle' AND completed_qty=6 AND completed_price=2700 AND stock=0)
    OR (completed_mode='set' AND completed_qty=4 AND completed_price=1900 AND stock=2))
 THEN RAISE EXCEPTION 'V110 race oversold stock or created partial receipt'; END IF;
 RAISE NOTICE 'V110 PASS: two cashier pack intents, exactly one atomic sale, no oversell';
END $verify$;
