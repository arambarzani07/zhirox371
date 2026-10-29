-- Disposable PostgreSQL 16; test claim, lease fencing, expiry, backoff and ack.
BEGIN;
DO $$
DECLARE
 s uuid:='10000000-0000-0000-0000-000000000027';
 other uuid:='10000000-0000-0000-0000-000000000028';
 sale uuid:='20000000-0000-0000-0000-000000000027';
 req uuid:='30000000-0000-0000-0000-000000000027';
 event uuid:='40000000-0000-0000-0000-000000000027';
 old_token uuid;fresh_token uuid; old_attempt integer; claimed integer;
BEGIN
 INSERT INTO zhirox_local.stores(id,name)
 VALUES(s,'V27 Local'),(other,'V27 Other');
 INSERT INTO zhirox_local.sales(store_id,id,request_id,receipt_no,cashier_id,total_minor)
 VALUES(s,sale,req,1,'50000000-0000-0000-0000-000000000027',3500);
 INSERT INTO zhirox_local.event_outbox(store_id,event_id,aggregate_id,event_type,payload)
 VALUES(s,event,sale,'sale.completed',
   jsonb_build_object('sale_id',sale,'receipt_no',1,'total_minor',3500));
 SELECT count(*) INTO claimed FROM zhirox_local.claim_outbox_v27(other,10,60);
 IF claimed<>0 THEN RAISE EXCEPTION 'cross-store event claim'; END IF;
 SELECT lease_token,attempt_count INTO old_token,old_attempt
 FROM zhirox_local.claim_outbox_v27(s,10,60);
 IF old_token IS NULL OR old_attempt<>1 THEN RAISE EXCEPTION 'claim failed'; END IF;
 SELECT count(*) INTO claimed FROM zhirox_local.claim_outbox_v27(s,10,60);
 IF claimed<>0 THEN RAISE EXCEPTION 'duplicate lease before expiry'; END IF;
 IF zhirox_local.ack_outbox_v27(s,event,gen_random_uuid())
 THEN RAISE EXCEPTION 'wrong lease token acknowledged'; END IF;
 IF NOT zhirox_local.fail_outbox_v27(s,event,old_token,'network_down')
 THEN RAISE EXCEPTION 'retry did not release lease'; END IF;
 IF (SELECT attempt_count FROM zhirox_local.event_outbox WHERE store_id=s AND event_id=event)<>1 OR
   (SELECT last_delivery_error FROM zhirox_local.event_outbox WHERE store_id=s AND event_id=event)<>'network_down' OR
   (SELECT next_attempt_at FROM zhirox_local.event_outbox WHERE store_id=s AND event_id=event)<=now()
 THEN RAISE EXCEPTION 'retry backoff failed'; END IF;
 SELECT count(*) INTO claimed FROM zhirox_local.claim_outbox_v27(s,10,60);
 IF claimed<>0 THEN RAISE EXCEPTION 'backoff ignored'; END IF;
 UPDATE zhirox_local.event_outbox SET next_attempt_at=now()-interval '1 second'
 WHERE store_id=s AND event_id=event;
 SELECT lease_token INTO fresh_token FROM zhirox_local.claim_outbox_v27(s,10,60);
 IF fresh_token IS NULL OR fresh_token=old_token THEN RAISE EXCEPTION 'fresh lease failed'; END IF;
 IF zhirox_local.ack_outbox_v27(s,event,old_token)
 THEN RAISE EXCEPTION 'stale lease acknowledged'; END IF;
 IF NOT zhirox_local.ack_outbox_v27(s,event,fresh_token)
 THEN RAISE EXCEPTION 'valid lease not acknowledged'; END IF;
 IF zhirox_local.ack_outbox_v27(s,event,fresh_token)
 THEN RAISE EXCEPTION 'event acknowledged twice'; END IF;
 SELECT count(*) INTO claimed FROM zhirox_local.claim_outbox_v27(s,10,60);
 IF claimed<>0 OR (SELECT delivered_at FROM zhirox_local.event_outbox
   WHERE store_id=s AND event_id=event) IS NULL
 THEN RAISE EXCEPTION 'delivered row reclaimed'; END IF;
 RAISE NOTICE 'V27 PASS: store-scoped leases, retry backoff, fenced ACK, no duplicate delivery mark';
END $$;
ROLLBACK;
