-- V34 disposable test: receipt creation is atomic and immutable.
BEGIN;
DO $$
DECLARE
 s uuid:='10000000-0000-0000-0000-000000000034';
 c uuid:='20000000-0000-0000-0000-000000000034';
 p uuid:='30000000-0000-0000-0000-000000000034';
 r uuid:='40000000-0000-0000-0000-000000000034';
 result record;
 ticket zhirox_local.receipt_snapshots_v34%ROWTYPE;
 refused_update boolean:=false;
 refused_delete boolean:=false;
BEGIN
 INSERT INTO zhirox_local.stores(id,name) VALUES(s,'سوپەرمارکێتی کانی چنار');
 INSERT INTO zhirox_local.products(store_id,id,name,price_minor,stock_base_units)
 VALUES(s,p,'تاقیکردنەوەی V34',1400,50);
 INSERT INTO zhirox_local.barcodes(store_id,code,product_id,quantity_base_units)
 VALUES(s,'6260053183974',p,1);
 PERFORM * FROM zhirox_local.prepare_checkout_v31(s,c,r,
   '[{"barcode":"6260053183974","qty":2}]'::jsonb,2800);
 IF EXISTS(SELECT 1 FROM zhirox_local.receipt_snapshots_v34 WHERE store_id=s)
 THEN RAISE EXCEPTION 'snapshot before commit'; END IF;
 SELECT * INTO STRICT result FROM zhirox_local.commit_checkout_v31(s,c,r);
 IF result.total_minor<>2800 THEN RAISE EXCEPTION 'wrong checked-out total'; END IF;
 SELECT * INTO STRICT ticket FROM zhirox_local.receipt_snapshots_v34
 WHERE store_id=s AND sale_id=result.sale_id;
 IF ticket.cashier_id<>c OR ticket.receipt_no<>result.receipt_no OR
    ticket.total_minor<>2800 OR jsonb_array_length(ticket.lines)<>1 OR
    ticket.lines->0->>'name'<>'تاقیکردنەوەی V34' OR
    (ticket.lines->0->>'line_total_minor')::bigint<>2800 OR
    ticket.lines->0->>'sale_mode'<>'unit'
 THEN RAISE EXCEPTION 'incorrect committed receipt snapshot'; END IF;
 UPDATE zhirox_local.products SET name='renamed later',price_minor=9000
 WHERE store_id=s AND id=p;
 IF (SELECT lines->0->>'name' FROM zhirox_local.receipt_snapshots_v34
     WHERE store_id=s AND sale_id=result.sale_id)<>'تاقیکردنەوەی V34'
 THEN RAISE EXCEPTION 'receipt changed after catalog update'; END IF;
 PERFORM * FROM zhirox_local.commit_checkout_v31(s,c,r);
 IF (SELECT count(*) FROM zhirox_local.receipt_snapshots_v34 WHERE store_id=s)<>1
 THEN RAISE EXCEPTION 'replay duplicated receipt'; END IF;
 BEGIN
  UPDATE zhirox_local.receipt_snapshots_v34 SET total_minor=1 WHERE store_id=s;
 EXCEPTION WHEN SQLSTATE '55000' THEN refused_update:=true;
 END;
 BEGIN
  DELETE FROM zhirox_local.receipt_snapshots_v34 WHERE store_id=s;
 EXCEPTION WHEN SQLSTATE '55000' THEN refused_delete:=true;
 END;
 IF NOT refused_update OR NOT refused_delete
 THEN RAISE EXCEPTION 'receipt archive must deny update/delete'; END IF;
 RAISE NOTICE 'V34 PASS: exact append-only checkout snapshot, replay and catalog isolation';
END $$;
ROLLBACK;
