-- V79 disposable PostgreSQL integration: every synthetic record ROLLED BACK.
BEGIN;
DO $test$
DECLARE
 store_a uuid:='10000000-0000-0000-0000-000000000079';
 store_b uuid:='10000000-0000-0000-0000-000000000080';
 owner_a uuid:='20000000-0000-0000-0000-000000000079';
 owner_b uuid:='20000000-0000-0000-0000-000000000080';
 cashier_a uuid:='20000000-0000-0000-0000-000000000081';
 customer uuid:='30000000-0000-0000-0000-000000000079';
 request1 uuid:='40000000-0000-0000-0000-000000000079';
 request2 uuid:='40000000-0000-0000-0000-000000000080';
 request3 uuid:='40000000-0000-0000-0000-000000000081';
 bal bigint;
 denied boolean;
BEGIN
 INSERT INTO zhirox_local.stores(id,name)
 VALUES(store_a,'V79 disposable A'),(store_b,'V79 disposable B');
 INSERT INTO zhirox_local.local_users
 (store_id,id,username,password_hash,role)
 VALUES(store_a,owner_a,'v79-manager-A','lab-only','manager'),
 (store_a,cashier_a,'v79-cashier-A','lab-only','cashier'),
 (store_b,owner_b,'v79-manager-B','lab-only','owner');
 PERFORM zhirox_local.register_customer_v79(store_a,owner_a,customer,'کڕیاری تاقیکردنەوە',NULL);
 PERFORM zhirox_local.register_customer_v79(store_b,owner_b,customer,'کڕیاری هەمان ناسنامە لە B',NULL);
 PERFORM zhirox_local.register_customer_v79(store_a,owner_a,customer,'کڕیاری تاقیکردنەوە',NULL);
 denied:=false;
 BEGIN
  PERFORM zhirox_local.register_customer_v79(store_a,owner_a,customer,'ناوێکی جیاواز',NULL);
 EXCEPTION WHEN SQLSTATE 'P7903' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'changed customer identity accepted'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.register_customer_v79(store_a,cashier_a,
    '30000000-0000-0000-0000-000000000080','نەهێڵراو',NULL);
 EXCEPTION WHEN SQLSTATE 'P7901' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'cashier created a debtor'; END IF;
 bal:=zhirox_local.record_customer_debt_v79(store_a,owner_a,customer,request1,'opening_debt',5000,'imported verified initial ledger');
 IF bal<>5000 THEN RAISE EXCEPTION 'initial debt incorrect %',bal; END IF;
 bal:=zhirox_local.record_customer_debt_v79(store_a,owner_a,customer,request2,'repayment',2000,'repayment accounting record');
 IF bal<>3000 THEN RAISE EXCEPTION 'repayment balance incorrect %',bal; END IF;
 bal:=zhirox_local.record_customer_debt_v79(store_a,owner_a,customer,request2,'repayment',2000,'repayment accounting record');
 IF bal<>3000 THEN RAISE EXCEPTION 'idempotent retry changed balance'; END IF;
 IF (SELECT count(*) FROM zhirox_local.customer_debt_ledger_v79
     WHERE store_id=store_a)<>2
 THEN RAISE EXCEPTION 'idempotency duplicated an entry'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.record_customer_debt_v79(store_a,owner_a,customer,request2,'repayment',1999,'repayment accounting record');
 EXCEPTION WHEN SQLSTATE 'P7903' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'same request accepted changed amount'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.record_customer_debt_v79(store_a,owner_a,customer,request3,'repayment',3001,'overpay must be denied');
 EXCEPTION WHEN SQLSTATE 'P7905' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'overpayment created negative debt'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.record_customer_debt_v79(store_a,cashier_a,customer,request3,'repayment',100,'cashier must be denied');
 EXCEPTION WHEN SQLSTATE 'P7901' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'cashier wrote a financial ledger'; END IF;
 denied:=false;
 BEGIN
  PERFORM zhirox_local.record_customer_debt_v79(store_a,owner_b,customer,request3,'repayment',100,'cross store actor denied');
 EXCEPTION WHEN SQLSTATE 'P7901' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'cross-store owner can alter store A'; END IF;
 denied:=false;
 BEGIN
  UPDATE zhirox_local.customer_debt_ledger_v79 SET amount_minor=1 WHERE store_id=store_a;
 EXCEPTION WHEN SQLSTATE 'P7904' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'immutable debt ledger UPDATE permitted'; END IF;
 denied:=false;
 BEGIN
  DELETE FROM zhirox_local.customer_debt_ledger_v79 WHERE store_id=store_a;
 EXCEPTION WHEN SQLSTATE 'P7904' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'immutable debt ledger DELETE permitted'; END IF;
 IF (SELECT balance_minor FROM zhirox_local.customer_debt_balances_v79
     WHERE store_id=store_a AND customer_id=customer)<>3000
 THEN RAISE EXCEPTION 'view disagrees with ledger'; END IF;
 IF (SELECT balance_minor FROM zhirox_local.customer_debt_balances_v79
     WHERE store_id=store_b AND customer_id=customer)<>0
 THEN RAISE EXCEPTION 'store B inherited store A balance'; END IF;
 IF EXISTS(SELECT 1 FROM information_schema.role_table_grants WHERE
   grantee='PUBLIC' AND table_schema='zhirox_local'
   AND table_name IN('customers_v79','customer_debt_ledger_v79'))
 THEN RAISE EXCEPTION 'public can read debtor data'; END IF;
END $test$;
ROLLBACK;
