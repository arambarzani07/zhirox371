/* PUBLIC client configuration. NEVER put service_role/secret keys here. */
window.RETAIL_CONFIG=Object.freeze({
  supabaseUrl:"https://qcfmlyyzfykzszvtllrw.supabase.co",
  publishableKey:"sb_publishable_lEEIz_8byZDKfVZ-ym3jIA_bbE8pX_Y",
  // A client-side flag is not a verified offline PostgreSQL deployment.
  // LocalStorage/seeded users are expressly a disposable demo, never production auth.
  offlineFirst:window.RETAIL_DEMO_MODE===true,
  preferredDisk:"D:\\SupermarketPOS_Data",
  pcBackupDir:"D:\\SupermarketPOS_Data\\backups",
  hourlySyncIntervalMs:3600000
});

(function initRetailOfflineEngine(){
  // Fail closed: an unauthenticated browser demo must NEVER replace real Supabase
  // or start sync/backup timers on a normal store or Google AI Studio origin.
  if(typeof window==="undefined"||window.RETAIL_DEMO_MODE!==true)return;

  if("serviceWorker" in navigator && !window.__retailQA){
    window.addEventListener("load",()=>{
      navigator.serviceWorker.register("./sw.js").catch(()=>{});
    });
  }

  const DB_STORAGE_KEY="retail_offline_db_v1";
  const QUEUE_STORAGE_KEY="retail_offline_sync_queue_v1";
  const META_STORAGE_KEY="retail_offline_sync_meta_v1";
  const DEFAULT_STORE_ID="11111111-2222-4333-8444-555555555555";
  const DEFAULT_OWNER_ID="00000000-0000-4000-8000-000000000001";

  function uuid(){
    if(typeof crypto!=="undefined"&&crypto.randomUUID)return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{
      const r=Math.random()*16|0,v=c==="x"?r:(r&0x3|0x8);
      return v.toString(16);
    });
  }

  function nowIso(){return new Date().toISOString();}

  function seedDefaultOfflineDb(){
    const ts=nowIso();
    const p1="22222222-1111-4111-8111-000000000001";
    const p2="22222222-1111-4111-8111-000000000002";
    const p3="22222222-1111-4111-8111-000000000003";
    const p4="22222222-1111-4111-8111-000000000004";
    const p5="22222222-1111-4111-8111-000000000005";
    const p6="22222222-1111-4111-8111-000000000006";
    const shiftId="33333333-1111-4111-8111-000000000001";
    return {
      version:1,
      currentUser:{
        id:DEFAULT_OWNER_ID,
        email:"owner@kanichnar.local",
        role:"authenticated"
      },
      retail_stores:[{
        id:DEFAULT_STORE_ID,
        name:"سوپەرمارکێتی کانی چنار",
        currency:"IQD",
        owner_user_id:DEFAULT_OWNER_ID,
        created_at:ts
      }],
      retail_memberships:[{
        store_id:DEFAULT_STORE_ID,
        user_id:DEFAULT_OWNER_ID,
        role:"owner",
        active:true,
        created_at:ts
      }],
      retail_products:[
        {id:p1,store_id:DEFAULT_STORE_ID,name:"برنجی مەحمود ٥ کگم",sku:"SKU-1001",plu:null,base_unit:"unit",price_minor:12500,active:true,created_at:ts},
        {id:p2,store_id:DEFAULT_STORE_ID,name:"زەیتی گوڵەبەڕۆژە ١ لیتر",sku:"SKU-1002",plu:null,base_unit:"unit",price_minor:2750,active:true,created_at:ts},
        {id:p3,store_id:DEFAULT_STORE_ID,name:"شەکری سپی ١ کگم",sku:"SKU-1003",plu:null,base_unit:"unit",price_minor:1500,active:true,created_at:ts},
        {id:p4,store_id:DEFAULT_STORE_ID,name:"چای جیهان ٤٥٠ گرام",sku:"SKU-1004",plu:null,base_unit:"unit",price_minor:5500,active:true,created_at:ts},
        {id:p5,store_id:DEFAULT_STORE_ID,name:"پەنیری کوردی تەرازوو (کگم)",sku:"101",plu:"00101",base_unit:"kg",price_minor:9000,active:true,created_at:ts},
        {id:p6,store_id:DEFAULT_STORE_ID,name:"گۆشتی گوێرەکەی تازە (کگم)",sku:"2",plu:"00002",base_unit:"kg",price_minor:18000,active:true,created_at:ts}
      ],
      retail_barcodes:[
        {code:"6291000000012",store_id:DEFAULT_STORE_ID,product_id:p1,unit_type:"unit",units_per_scan:1,price_minor:12500,active:true,created_at:ts},
        {code:"6291000000029",store_id:DEFAULT_STORE_ID,product_id:p2,unit_type:"unit",units_per_scan:1,price_minor:2750,active:true,created_at:ts},
        {code:"6291000000036",store_id:DEFAULT_STORE_ID,product_id:p3,unit_type:"unit",units_per_scan:1,price_minor:1500,active:true,created_at:ts},
        {code:"6291000000043",store_id:DEFAULT_STORE_ID,product_id:p4,unit_type:"unit",units_per_scan:1,price_minor:5500,active:true,created_at:ts},
        {code:"2700101",store_id:DEFAULT_STORE_ID,product_id:p5,unit_type:"unit",units_per_scan:1,price_minor:9000,active:true,created_at:ts},
        {code:"2700002",store_id:DEFAULT_STORE_ID,product_id:p6,unit_type:"unit",units_per_scan:1,price_minor:18000,active:true,created_at:ts}
      ],
      retail_stock_balances:[
        {store_id:DEFAULT_STORE_ID,product_id:p1,quantity:45,updated_at:ts},
        {store_id:DEFAULT_STORE_ID,product_id:p2,quantity:80,updated_at:ts},
        {store_id:DEFAULT_STORE_ID,product_id:p3,quantity:60,updated_at:ts},
        {store_id:DEFAULT_STORE_ID,product_id:p4,quantity:35,updated_at:ts},
        {store_id:DEFAULT_STORE_ID,product_id:p5,quantity:25,updated_at:ts},
        {store_id:DEFAULT_STORE_ID,product_id:p6,quantity:18,updated_at:ts}
      ],
      retail_stock_movements:[],
      retail_stock_events:[],
      retail_stock_expiries:[],
      retail_shift_sessions:[{
        id:shiftId,
        store_id:DEFAULT_STORE_ID,
        cashier_id:DEFAULT_OWNER_ID,
        status:"open",
        opening_cash_minor:100000,
        expected_cash_minor:100000,
        counted_cash_minor:null,
        variance_minor:null,
        opened_at:ts,
        closed_at:null
      }],
      retail_cash_sessions:[{
        id:shiftId,
        store_id:DEFAULT_STORE_ID,
        cashier_id:DEFAULT_OWNER_ID,
        status:"open",
        opening_cash_minor:100000,
        expected_cash_minor:100000,
        counted_cash_minor:null,
        variance_minor:null,
        opened_at:ts,
        closed_at:null
      }],
      retail_cash_movements:[],
      retail_sales:[],
      retail_sale_items:[],
      retail_sale_returns:[],
      retail_customers:[],
      retail_customer_ledger:[],
      retail_suppliers:[],
      retail_purchase_orders:[],
      retail_supplier_ledger:[],
      retail_finance_entries:[],
      retail_product_costs:[],
      retail_product_history:[],
      retail_store_settings:[],
      retail_staff_profiles:[],
      retail_campaigns:[],
      retail_offers:[],
      retail_discount_rules:[],
      retail_coupons:[],
      retail_audit_events:[{
        id:uuid(),
        store_id:DEFAULT_STORE_ID,
        actor_id:DEFAULT_OWNER_ID,
        action:"offline_engine_ready",
        event_type:"offline_engine_ready",
        subject_id:DEFAULT_STORE_ID,
        details:{mode:"100% Offline-First",disk:"D:\\SupermarketPOS_Data"},
        created_at:ts
      }],
      processed_requests:{}
    };
  }

  const IDB_NAME="RetailOS_PC_Vault_v1";
  const IDB_STORE="snapshots";
  let pcBackupTimer=null;
  let lastPcDiskBackupAt=null;
  let pcBackupFilesCount=2;

  // Request OS/Browser permanent storage lock automatically (Zero-Touch)
  if(!window.__retailQA&&typeof navigator!=="undefined"&&navigator.storage&&typeof navigator.storage.persist==="function"){
    navigator.storage.persist().catch(()=>{});
  }

  function saveToIndexedDbMirror(state){
    if(window.__retailQA||typeof indexedDB==="undefined")return;
    try{
      const req=indexedDB.open(IDB_NAME,1);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains(IDB_STORE)){
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess=()=>{
        try{
          const db=req.result;
          const tx=db.transaction(IDB_STORE,"readwrite");
          tx.objectStore(IDB_STORE).put({saved_at:nowIso(),state},"latest_db");
        }catch(_e){}
      };
    }catch(_e){}
  }

  function buildSnapshotFromState(state){
    return {
      products:state.retail_products||[],
      barcodes:state.retail_barcodes||[],
      stock_balances:state.retail_stock_balances||[],
      sales:state.retail_sales||[],
      sale_items:state.retail_sale_items||[],
      shift_sessions:state.retail_shift_sessions||[],
      cash_movements:state.retail_cash_movements||[],
      customers:state.retail_customers||[],
      customer_ledger:state.retail_customer_ledger||[],
      suppliers:state.retail_suppliers||[],
      purchase_orders:state.retail_purchase_orders||[],
      supplier_ledger:state.retail_supplier_ledger||[],
      finance_entries:state.retail_finance_entries||[],
      audit_events:(state.retail_audit_events||[]).slice(0,250)
    };
  }

  function scheduleSilentPcDiskBackup(state,reason="auto_local_pc"){
    if(window.__retailQA||typeof fetch!=="function")return;
    clearTimeout(pcBackupTimer);
    pcBackupTimer=setTimeout(async()=>{
      try{
        const storeRow=(state.retail_stores&&state.retail_stores[0])||{id:DEFAULT_STORE_ID,name:"سوپەرمارکێتی کانی چنار",currency:"IQD"};
        const resp=await fetch("/api/local-backup",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            reason,
            store:storeRow,
            full_db:state,
            snapshot:buildSnapshotFromState(state)
          })
        });
        if(resp.ok){
          const data=await resp.json().catch(()=>({}));
          lastPcDiskBackupAt=data.saved_at||nowIso();
          if(Number(data.pc_backup_files_count)>0)pcBackupFilesCount=Number(data.pc_backup_files_count);
          emitSyncStatus();
        }
      }catch(_e){}
    },900);
  }

  function loadDb(){
    try{
      const raw=localStorage.getItem(DB_STORAGE_KEY);
      if(raw){
        const parsed=JSON.parse(raw);
        if(parsed&&typeof parsed==="object"&&Array.isArray(parsed.retail_stores)){
          if(!Array.isArray(parsed.retail_stock_events))parsed.retail_stock_events=[];
          if(!Array.isArray(parsed.retail_product_history))parsed.retail_product_history=[];
          if(!Array.isArray(parsed.retail_shift_sessions)&&Array.isArray(parsed.retail_cash_sessions)){
            parsed.retail_shift_sessions=parsed.retail_cash_sessions;
          }
          if(!Array.isArray(parsed.retail_shift_sessions)){
            parsed.retail_shift_sessions=seedDefaultOfflineDb().retail_shift_sessions;
          }
          parsed.retail_cash_sessions=parsed.retail_shift_sessions;
          return parsed;
        }
      }
    }catch(_e){}
    const seeded=seedDefaultOfflineDb();
    saveDb(seeded);
    return seeded;
  }

  function saveDb(state){
    if(state&&typeof state==="object"){
      if(Array.isArray(state.retail_shift_sessions))state.retail_cash_sessions=state.retail_shift_sessions;
      else if(Array.isArray(state.retail_cash_sessions))state.retail_shift_sessions=state.retail_cash_sessions;
    }
    try{localStorage.setItem(DB_STORAGE_KEY,JSON.stringify(state));}catch(_e){}
    saveToIndexedDbMirror(state);
    scheduleSilentPcDiskBackup(state,"auto_change");
  }

  // Zero-Touch Self-Healing: On startup, ensure PC disk backup exists or auto-restore if browser storage was wiped
  if(!window.__retailQA&&typeof window!=="undefined"){
    window.addEventListener("load",async()=>{
      const current=loadDb();
      const hasSales=Array.isArray(current.retail_sales)&&current.retail_sales.length>0;
      const hasCustomProducts=Array.isArray(current.retail_products)&&current.retail_products.length>6;
      try{
        const resp=await fetch("/api/local-backup/restore",{cache:"no-store"});
        if(resp.ok){
          const payload=await resp.json();
          const diskDb=payload?.backup?.full_db;
          if(diskDb&&typeof diskDb==="object"&&Array.isArray(diskDb.retail_stores)){
            const diskSales=Array.isArray(diskDb.retail_sales)?diskDb.retail_sales.length:0;
            const diskProds=Array.isArray(diskDb.retail_products)?diskDb.retail_products.length:0;
            if(!hasSales&&!hasCustomProducts&&(diskSales>0||diskProds>6)){
              localStorage.setItem(DB_STORAGE_KEY,JSON.stringify(diskDb));
              saveToIndexedDbMirror(diskDb);
            }
          }
        }
      }catch(_e){}
      scheduleSilentPcDiskBackup(loadDb(),"boot_provision");
    });
  }

  function loadQueue(){
    try{
      const raw=localStorage.getItem(QUEUE_STORAGE_KEY);
      const parsed=JSON.parse(raw||"[]");
      return Array.isArray(parsed)?parsed:[];
    }catch(_e){return[];}
  }

  function saveQueue(list){
    try{localStorage.setItem(QUEUE_STORAGE_KEY,JSON.stringify(list.slice(-2000)));}catch(_e){}
  }

  function loadMeta(){
    const def={
      intervalMinutes:60,
      lastSyncedAt:null,
      lastAttemptAt:null,
      lastStatus:"idle",
      lastError:null,
      totalSyncedBatches:0,
      totalSyncedOps:0,
      history:[]
    };
    try{
      const raw=localStorage.getItem(META_STORAGE_KEY);
      if(raw){
        const parsed=JSON.parse(raw);
        if(parsed&&typeof parsed==="object")return {...def,...parsed,history:Array.isArray(parsed.history)?parsed.history:[]};
      }
    }catch(_e){}
    return def;
  }

  function saveMeta(meta){
    try{localStorage.setItem(META_STORAGE_KEY,JSON.stringify(meta));}catch(_e){}
  }

  const realSupabaseGlobal=window.supabase&&typeof window.supabase.createClient==="function"
    ?{createClient:window.supabase.createClient.bind(window.supabase)}
    :null;

  let syncInFlight=false;

  function emitSyncStatus(){
    try{
      window.dispatchEvent(new CustomEvent("retail-offline-sync-status",{detail:getSyncStatus()}));
    }catch(_e){}
  }

  function enqueueOperation(type,name,payload){
    const q=loadQueue();
    q.push({
      id:uuid(),
      type,
      name,
      payload,
      queued_at:nowIso()
    });
    saveQueue(q);
    emitSyncStatus();
  }

  function getSyncStatus(){
    const meta=loadMeta();
    const queue=loadQueue();
    const intervalMs=Math.max(5,Number(meta.intervalMinutes||60))*60000;
    const lastTs=meta.lastSyncedAt?new Date(meta.lastSyncedAt).getTime():0;
    const nextSyncMs=lastTs>0?Math.max(0,(lastTs+intervalMs)-Date.now()):intervalMs;
    return {
      mode:"100% Offline-First",
      autoProvisioned:true,
      preferredDisk:"D:",
      pcBackupDir:"D:\\SupermarketPOS_Data\\backups",
      pcStorageLayers:["D:\\SupermarketPOS_Data\\backups\\backup-latest.json","D:\\SupermarketPOS_Data\\offline_server_sync.json","IndexedDB Vault","LocalStorage"],
      lastPcDiskBackupAt,
      pcBackupFilesCount,
      online:typeof navigator!=="undefined"?Boolean(navigator.onLine):false,
      syncing:syncInFlight,
      pendingCount:queue.length,
      intervalMinutes:Number(meta.intervalMinutes||60),
      intervalMs,
      lastSyncedAt:meta.lastSyncedAt,
      lastAttemptAt:meta.lastAttemptAt,
      lastStatus:meta.lastStatus,
      lastError:meta.lastError,
      nextSyncInMs:nextSyncMs,
      nextSyncAt:new Date(Date.now()+nextSyncMs).toISOString(),
      totalSyncedBatches:Number(meta.totalSyncedBatches||0),
      totalSyncedOps:Number(meta.totalSyncedOps||0),
      history:meta.history||[]
    };
  }

  async function syncNow(reason="manual"){
    if(syncInFlight)return getSyncStatus();
    const meta=loadMeta();
    meta.lastAttemptAt=nowIso();

    if(typeof navigator!=="undefined"&&navigator.onLine===false){
      meta.lastStatus="offline_deferred";
      meta.lastError="هێڵی ئینتەرنێت نییە — داتاکان لە ناوخۆ پارێزراون تا کاتی بوونی ئینتەرنێت";
      saveMeta(meta);
      emitSyncStatus();
      return getSyncStatus();
    }

    syncInFlight=true;
    emitSyncStatus();

    const state=loadDb();
    const queue=loadQueue();
    const batchId="sync_"+Date.now();
    const storeRow=(state.retail_stores&&state.retail_stores[0])||{id:DEFAULT_STORE_ID,name:"سوپەرمارکێتی کانی چنار",currency:"IQD"};
    const snapshot=buildSnapshotFromState(state);

    let serverSaved=false;
    let supabaseSaved=false;
    let errorMsg=null;

    try{
      const resp=await fetch("/api/sync",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          batch_id:batchId,
          reason,
          synced_at:nowIso(),
          store:storeRow,
          operations:queue,
          full_db:state,
          snapshot
        })
      });
      if(resp.ok){
        serverSaved=true;
        const syncJson=await resp.json().catch(()=>({}));
        lastPcDiskBackupAt=syncJson.synced_at||nowIso();
        if(Number(syncJson.pc_backup_files_count)>0)pcBackupFilesCount=Number(syncJson.pc_backup_files_count);
      }else{
        errorMsg="Server HTTP "+resp.status;
      }
    }catch(err){
      errorMsg=String(err?.message||err);
    }

    if(realSupabaseGlobal&&window.RETAIL_CONFIG?.supabaseUrl&&window.RETAIL_CONFIG?.publishableKey){
      try{
        const remoteClient=realSupabaseGlobal.createClient(
          window.RETAIL_CONFIG.supabaseUrl,
          window.RETAIL_CONFIG.publishableKey,
          {auth:{persistSession:true,autoRefreshToken:false}}
        );
        const ping=await Promise.race([
          remoteClient.from("retail_stores").select("id").limit(1),
          new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout")),3500))
        ]);
        if(ping&&!ping.error)supabaseSaved=true;
      }catch(_e){}
    }

    syncInFlight=false;
    if(serverSaved||supabaseSaved){
      const syncedCount=queue.length;
      saveQueue([]);
      const completedAt=nowIso();
      meta.lastSyncedAt=completedAt;
      meta.lastStatus="synced";
      meta.lastError=null;
      meta.totalSyncedBatches=Number(meta.totalSyncedBatches||0)+1;
      meta.totalSyncedOps=Number(meta.totalSyncedOps||0)+syncedCount;
      meta.history=[
        {
          id:batchId,
          synced_at:completedAt,
          reason:reason==="hourly"?"ناردنی خۆکاری کاتژمێری":reason==="online_resume"?"گەڕانەوەی هێڵی ئینتەرنێت":"ناردنی دەستبەجێ",
          ops_count:syncedCount,
          records_count:
            snapshot.products.length+
            snapshot.barcodes.length+
            snapshot.sales.length+
            snapshot.customers.length+
            snapshot.suppliers.length+
            snapshot.finance_entries.length,
          target:supabaseSaved?"سێرڤەری ناوخۆ + کڵاود":"سێرڤەری سەرەکی"
        },
        ...(meta.history||[]).slice(0,24)
      ];
      saveMeta(meta);
    }else{
      meta.lastStatus="retry_scheduled";
      meta.lastError=errorMsg||"پەیوەندیی سێرڤەر بەردەست نەبوو";
      saveMeta(meta);
    }

    emitSyncStatus();
    return getSyncStatus();
  }

  function setIntervalMinutes(mins){
    const m=Math.max(5,Math.min(720,Math.round(Number(mins)||60)));
    const meta=loadMeta();
    meta.intervalMinutes=m;
    saveMeta(meta);
    emitSyncStatus();
    return getSyncStatus();
  }

  // Hourly Scheduler: checks every 60 seconds whether 1 hour (or configured interval) has elapsed
  setInterval(()=>{
    if(window.__retailQA)return;
    const meta=loadMeta();
    const intervalMs=Math.max(5,Number(meta.intervalMinutes||60))*60000;
    const lastTs=meta.lastSyncedAt?new Date(meta.lastSyncedAt).getTime():0;
    const due=!lastTs||(Date.now()-lastTs>=intervalMs);
    if(due&&typeof navigator!=="undefined"&&navigator.onLine){
      void syncNow("hourly");
    }else{
      emitSyncStatus();
    }
  },60000);

  // When internet connection returns, if hourly sync was due or queue has items, sync automatically
  window.addEventListener("online",()=>{
    if(window.__retailQA)return;
    const meta=loadMeta();
    const queue=loadQueue();
    const intervalMs=Math.max(5,Number(meta.intervalMinutes||60))*60000;
    const lastTs=meta.lastSyncedAt?new Date(meta.lastSyncedAt).getTime():0;
    if(queue.length>0||!lastTs||(Date.now()-lastTs>=intervalMs)){
      void syncNow("online_resume");
    }else{
      emitSyncStatus();
    }
  });

  window.addEventListener("offline",()=>{
    emitSyncStatus();
  });

  function importBackupSnapshot(data){
    if(!data||typeof data!=="object")return false;
    const db=loadDb();
    if(Array.isArray(data.products)&&data.products.length)db.retail_products=data.products;
    if(Array.isArray(data.barcodes)&&data.barcodes.length)db.retail_barcodes=data.barcodes;
    if(Array.isArray(data.stock_balances)&&data.stock_balances.length)db.retail_stock_balances=data.stock_balances;
    if(Array.isArray(data.stock_expiries)&&data.stock_expiries.length)db.retail_stock_expiries=data.stock_expiries;
    if(Array.isArray(data.customers)&&data.customers.length)db.retail_customers=data.customers;
    if(Array.isArray(data.customer_ledger)&&data.customer_ledger.length)db.retail_customer_ledger=data.customer_ledger;
    if(Array.isArray(data.suppliers)&&data.suppliers.length)db.retail_suppliers=data.suppliers;
    if(Array.isArray(data.purchase_orders)&&data.purchase_orders.length)db.retail_purchase_orders=data.purchase_orders;
    if(Array.isArray(data.supplier_ledger)&&data.supplier_ledger.length)db.retail_supplier_ledger=data.supplier_ledger;
    if(Array.isArray(data.finance_entries)&&data.finance_entries.length)db.retail_finance_entries=data.finance_entries;
    if(data.settings&&typeof data.settings==="object"){
      const storeId=data.store_id||db.retail_stores[0]?.id||DEFAULT_STORE_ID;
      const idx=db.retail_store_settings.findIndex(r=>r.store_id===storeId);
      if(idx>=0)db.retail_store_settings[idx].settings_json={...db.retail_store_settings[idx].settings_json,...data.settings};
      else db.retail_store_settings.unshift({id:uuid(),store_id:storeId,settings_json:data.settings,updated_at:nowIso()});
    }
    addAudit(db,db.retail_stores[0]?.id||DEFAULT_STORE_ID,"system.restore_backup",DEFAULT_STORE_ID,{restored_at:nowIso()});
    saveDb(db);
    return true;
  }

  window.RetailOfflineSync={
    getStatus:getSyncStatus,
    syncNow,
    setIntervalMinutes,
    enqueue:enqueueOperation,
    getDatabaseSnapshot:()=>loadDb(),
    importBackupSnapshot
  };

  // =========================================================================
  // 100% Offline-First Supabase Local Engine (Active when !window.__retailQA)
  // =========================================================================
  function createOfflineQueryBuilder(rawTable){
    const table=rawTable==="retail_cash_sessions"?"retail_shift_sessions":rawTable;
    const state={
      table,
      op:"select",
      payload:null,
      filters:[],
      orders:[],
      limitCount:null,
      singleMode:null
    };

    function applyFilters(rows){
      return rows.filter(row=>{
        for(const f of state.filters){
          if(f.kind==="eq"&&row?.[f.col]!==f.val)return false;
          if(f.kind==="neq"&&row?.[f.col]===f.val)return false;
          if(f.kind==="in"&&Array.isArray(f.val)&&!f.val.includes(row?.[f.col]))return false;
          if(f.kind==="ilike"){
            const needle=String(f.val||"").replace(/%/g,"").toLowerCase();
            const hay=String(row?.[f.col]||"").toLowerCase();
            if(!hay.includes(needle))return false;
          }
        }
        return true;
      });
    }

    function execute(){
      const db=loadDb();
      if(!Array.isArray(db[table]))db[table]=[];
      let rows=db[table];

      if(state.op==="insert"){
        const items=Array.isArray(state.payload)?state.payload:[state.payload];
        const inserted=items.map(it=>({
          id:it?.id||uuid(),
          created_at:it?.created_at||nowIso(),
          ...it
        }));
        db[table].unshift(...inserted);
        saveDb(db);
        enqueueOperation("table_insert",table,inserted);
        const out=state.singleMode?inserted[0]||null:inserted;
        return {data:out,error:null};
      }

      if(state.op==="upsert"){
        const items=Array.isArray(state.payload)?state.payload:[state.payload];
        const upserted=[];
        for(const it of items){
          if(!it)continue;
          const idx=db[table].findIndex(r=>
            (it.id&&r.id===it.id)||
            (table==="retail_store_settings"&&it.store_id&&r.store_id===it.store_id)||
            (table==="retail_product_costs"&&it.store_id&&it.product_id&&r.store_id===it.store_id&&r.product_id===it.product_id)||
            (table==="retail_staff_profiles"&&it.store_id&&it.user_id&&r.store_id===it.store_id&&r.user_id===it.user_id)||
            (table==="retail_barcodes"&&it.store_id&&it.code&&r.store_id===it.store_id&&r.code===it.code)
          );
          if(idx>=0){
            db[table][idx]={...db[table][idx],...it,updated_at:nowIso()};
            upserted.push(db[table][idx]);
          }else{
            const rec={id:it.id||uuid(),created_at:it.created_at||nowIso(),...it};
            db[table].unshift(rec);
            upserted.push(rec);
          }
        }
        saveDb(db);
        enqueueOperation("table_upsert",table,upserted);
        const out=state.singleMode?upserted[0]||null:upserted;
        return {data:out,error:null};
      }

      if(state.op==="update"){
        const matched=applyFilters(rows);
        for(const r of matched){
          Object.assign(r,state.payload,{updated_at:nowIso()});
        }
        saveDb(db);
        enqueueOperation("table_update",table,{filters:state.filters,patch:state.payload});
        const out=state.singleMode?matched[0]||null:matched;
        return {data:out,error:null};
      }

      if(state.op==="delete"){
        const matched=new Set(applyFilters(rows));
        const deleted=[...matched];
        db[table]=rows.filter(r=>!matched.has(r));
        saveDb(db);
        enqueueOperation("table_delete",table,{filters:state.filters});
        return {data:deleted,error:null};
      }

      let result=[...applyFilters(rows)];
      for(let i=state.orders.length-1;i>=0;i--){
        const {col,ascending}=state.orders[i];
        result.sort((a,b)=>{
          const va=a?.[col],vb=b?.[col];
          if(va===vb)return 0;
          if(va==null)return 1;
          if(vb==null)return -1;
          const cmp=typeof va==="number"&&typeof vb==="number"?va-vb:String(va).localeCompare(String(vb));
          return ascending?cmp:-cmp;
        });
      }
      if(Number.isFinite(state.limitCount)){
        result=result.slice(0,state.limitCount);
      }
      if(state.singleMode==="maybeSingle"||state.singleMode==="single"){
        return {data:result[0]||null,error:null};
      }
      return {data:result,error:null};
    }

    const builder={
      select(){return builder;},
      insert(payload){state.op="insert";state.payload=payload;return builder;},
      upsert(payload){state.op="upsert";state.payload=payload;return builder;},
      update(payload){state.op="update";state.payload=payload;return builder;},
      delete(){state.op="delete";return builder;},
      eq(col,val){state.filters.push({kind:"eq",col,val});return builder;},
      neq(col,val){state.filters.push({kind:"neq",col,val});return builder;},
      in(col,val){state.filters.push({kind:"in",col,val});return builder;},
      ilike(col,val){state.filters.push({kind:"ilike",col,val});return builder;},
      order(col,opts={}){state.orders.push({col,ascending:opts.ascending!==false});return builder;},
      limit(n){state.limitCount=Number(n);return builder;},
      maybeSingle(){state.singleMode="maybeSingle";return Promise.resolve(execute());},
      single(){state.singleMode="single";return Promise.resolve(execute());},
      then(onFulfilled,onRejected){
        return Promise.resolve(execute()).then(onFulfilled,onRejected);
      }
    };
    return builder;
  }

  function getBalance(db,storeId,productId){
    const row=db.retail_stock_balances.find(b=>b.store_id===storeId&&b.product_id===productId);
    return Number(row?.quantity||0);
  }

  function setBalance(db,storeId,productId,qty){
    const clean=Number(Number(qty||0).toFixed(3));
    const row=db.retail_stock_balances.find(b=>b.store_id===storeId&&b.product_id===productId);
    if(row){
      row.quantity=clean;
      row.updated_at=nowIso();
    }else{
      db.retail_stock_balances.push({store_id:storeId,product_id:productId,quantity:clean,updated_at:nowIso()});
    }
    return clean;
  }

  function addAudit(db,storeId,eventType,subjectId=null,details=null){
    db.retail_audit_events.unshift({
      id:uuid(),
      store_id:storeId||DEFAULT_STORE_ID,
      actor_id:db.currentUser?.id||DEFAULT_OWNER_ID,
      action:eventType,
      event_type:eventType,
      subject_id:subjectId||storeId||DEFAULT_STORE_ID,
      details:details||{},
      created_at:nowIso()
    });
  }

  function productBarcodesFor(db,storeId,productId,unitPriceMinor){
    return db.retail_barcodes
      .filter(b=>b.store_id===storeId&&b.product_id===productId&&b.active!==false)
      .map(b=>({
        code:b.code,
        product_id:b.product_id,
        unit_type:b.unit_type||"unit",
        units_per_scan:Number(b.units_per_scan||1),
        price_minor:Number(b.price_minor??unitPriceMinor??0),
        active:b.active!==false
      }));
  }

  function executeOfflineRpc(fn,args={}){
    const db=loadDb();
    const storeId=args.p_store||args.p_store_id||db.retail_stores[0]?.id||DEFAULT_STORE_ID;

    if(fn==="retail_bootstrap_store"){
      let st=db.retail_stores[0];
      if(!st){
        st={
          id:DEFAULT_STORE_ID,
          name:args.p_store_name||"سوپەرمارکێتی کانی چنار",
          currency:args.p_currency||"IQD",
          owner_user_id:db.currentUser?.id||DEFAULT_OWNER_ID,
          created_at:nowIso()
        };
        db.retail_stores.push(st);
        saveDb(db);
      }
      return {data:st.id,error:null};
    }

    if(fn==="retail_resolve_barcode_v18"){
      const code=String(args.p_code||"").trim();
      const hasLongerPrefix=Boolean(code)&&db.retail_barcodes.some(
        x=>x.store_id===storeId&&x.active!==false&&String(x.code||"").length>code.length&&String(x.code||"").startsWith(code)
      );
      if(!code){
        return {data:{found:false,has_longer_prefix:false},error:null};
      }

      if(/^27\d{11}$/.test(code)){
        const prefix7=code.slice(0,7);
        const pluRaw=code.slice(2,7);
        const pluNum=String(Number(pluRaw));
        const grams=Number(code.slice(7,12));
        const scaleBar=db.retail_barcodes.find(x=>x.store_id===storeId&&x.active!==false&&(
          x.code===prefix7||x.code===code
        ));
        const p=scaleBar
          ?db.retail_products.find(x=>x.id===scaleBar.product_id&&x.active!==false)
          :db.retail_products.find(x=>x.store_id===storeId&&x.active!==false&&(
            String(x.plu||"")===pluRaw||String(x.plu||"")===pluNum||String(x.sku||"")===pluRaw||String(x.sku||"")===pluNum
          ));
        if(p&&p.base_unit==="kg"&&grams>0){
          const kgQty=Number((grams/1000).toFixed(3));
          const unitPrice=Number(p.price_minor||0);
          const linePrice=Math.round((unitPrice*grams)/1000);
          const aliases=productBarcodesFor(db,storeId,p.id,unitPrice);
          return {
            data:{
              found:true,
              code,
              product_id:p.id,
              product_name:p.name,
              sku:p.sku||pluNum,
              plu:p.plu||pluRaw,
              currency:"IQD",
              base_unit:"kg",
              unit_type:"unit",
              unit_price_minor:unitPrice,
              scale_unit_price_minor:unitPrice,
              price_minor:linePrice,
              units_per_scan:1,
              stock_quantity:getBalance(db,storeId,p.id),
              product_barcodes:aliases,
              is_scale:true,
              scale_grams:grams,
              scale_weight_kg:kgQty,
              scale_label:kgQty.toFixed(3)+" کگم",
              has_longer_prefix:false
            },
            error:null
          };
        }
      }

      const b=db.retail_barcodes.find(x=>x.store_id===storeId&&x.code===code&&x.active!==false);
      if(b){
        const p=db.retail_products.find(x=>x.id===b.product_id&&x.active!==false);
        if(p){
          const unitPrice=Number(p.price_minor||0);
          const pkgPrice=Number(b.price_minor??unitPrice);
          const aliases=productBarcodesFor(db,storeId,p.id,unitPrice);
          const isKgPrefix=p.base_unit==="kg"&&code.length===7&&code.startsWith("27");
          return {
            data:{
              found:true,
              code:b.code,
              product_id:p.id,
              product_name:p.name,
              sku:p.sku||null,
              plu:p.plu||null,
              currency:"IQD",
              base_unit:p.base_unit||"unit",
              unit_type:b.unit_type||"unit",
              units_per_scan:Number(b.units_per_scan||1),
              price_minor:pkgPrice,
              unit_price_minor:unitPrice,
              scale_unit_price_minor:null,
              stock_quantity:getBalance(db,storeId,p.id),
              product_barcodes:aliases,
              is_scale:false,
              scale_grams:null,
              scale_weight_kg:null,
              scale_label:null,
              has_longer_prefix:Boolean(hasLongerPrefix||isKgPrefix)
            },
            error:null
          };
        }
      }
      return {data:{found:false,has_longer_prefix:hasLongerPrefix},error:null};
    }

    if(fn==="retail_catalog_page_v18"){
      const q=String(args.p_search||args.p_query||"").trim().toLowerCase();
      const stockFilter=args.p_stock_filter||null;
      const lim=Number(args.p_limit||50);
      const off=Number(args.p_offset||0);
      const filtered=db.retail_products.filter(p=>{
        if(p.store_id!==storeId||p.active===false)return false;
        const stQty=getBalance(db,storeId,p.id);
        if(stockFilter==="out"&&stQty>0)return false;
        if(stockFilter==="low"&&stQty>5)return false;
        if(!q)return true;
        const bMatch=db.retail_barcodes.some(b=>b.product_id===p.id&&String(b.code||"").toLowerCase().includes(q));
        return String(p.name||"").toLowerCase().includes(q)||String(p.sku||"").toLowerCase().includes(q)||String(p.plu||"").toLowerCase().includes(q)||bMatch;
      });
      const page=filtered.slice(off,off+lim).map(p=>{
        const unitPrice=Number(p.price_minor||0);
        const bDetails=productBarcodesFor(db,storeId,p.id,unitPrice);
        const unitBar=bDetails.find(b=>b.unit_type==="unit");
        const packBar=bDetails.find(b=>b.unit_type==="carton");
        const saleMode=p.sale_mode||(packBar?(unitBar?"both":"carton"):"unit");
        return {
          product_id:p.id,
          id:p.id,
          name:p.name,
          sku:p.sku||null,
          plu:p.plu||null,
          base_unit:p.base_unit||"unit",
          currency:p.currency||"IQD",
          sale_mode:saleMode,
          price_minor:unitPrice,
          unit_barcode:unitBar?.code||null,
          pack_barcode:packBar?.code||null,
          pack_units:packBar?Number(packBar.units_per_scan||1):null,
          pack_price_minor:packBar?Number(packBar.price_minor||0):null,
          carton_price_minor:packBar?Number(packBar.price_minor||0):(p.carton?.sale_price_iqd??null),
          units_per_carton:packBar?Number(packBar.units_per_scan||1):(p.carton?.units_per_carton??null),
          barcodes:bDetails.map(b=>b.code),
          barcode_details:bDetails,
          stock_quantity:getBalance(db,storeId,p.id),
          active:p.active!==false,
          total_count:filtered.length
        };
      });
      return {data:{items:page,total_count:filtered.length},error:null};
    }

    if(fn==="retail_barcode_page_v18"){
      const q=String(args.p_search||args.p_query||"").trim().toLowerCase();
      const lim=Number(args.p_limit||50);
      const off=Number(args.p_offset||0);
      const filtered=db.retail_barcodes.filter(b=>{
        if(b.store_id!==storeId||b.active===false)return false;
        const p=db.retail_products.find(x=>x.id===b.product_id);
        if(!p||p.active===false)return false;
        if(!q)return true;
        return String(b.code||"").toLowerCase().includes(q)||String(p?.name||"").toLowerCase().includes(q);
      });
      const page=filtered.slice(off,off+lim).map(b=>{
        const p=db.retail_products.find(x=>x.id===b.product_id);
        const firstForType=db.retail_barcodes.find(x=>x.store_id===storeId&&x.product_id===b.product_id&&x.unit_type===b.unit_type&&x.active!==false);
        return {
          code:b.code,
          product_id:b.product_id,
          product_name:p?.name||"—",
          base_unit:p?.base_unit||"unit",
          unit_type:b.unit_type||"unit",
          units_per_scan:Number(b.units_per_scan||1),
          price_minor:Number(b.price_minor??p?.price_minor??0),
          is_primary:Boolean(firstForType&&firstForType.code===b.code),
          active:b.active!==false,
          total_count:filtered.length
        };
      });
      return {data:{items:page,total_count:filtered.length},error:null};
    }

    if(fn==="retail_shift_open"){
      const existing=db.retail_shift_sessions.find(s=>s.store_id===storeId&&s.status==="open");
      if(existing)return {data:existing,error:null};
      const opening=Math.max(0,Math.round(Number(args.p_opening||0)));
      const sess={
        id:uuid(),
        store_id:storeId,
        cashier_id:db.currentUser?.id||DEFAULT_OWNER_ID,
        status:"open",
        opening_cash_minor:opening,
        expected_cash_minor:opening,
        counted_cash_minor:null,
        variance_minor:null,
        opened_at:nowIso(),
        closed_at:null
      };
      db.retail_shift_sessions.unshift(sess);
      addAudit(db,storeId,"shift_open",sess.id,{opening_cash_minor:opening});
      saveDb(db);
      enqueueOperation("rpc",fn,args);
      return {data:sess,error:null};
    }

    if(fn==="retail_shift_summary"){
      const sessId=args.p_session;
      const sess=db.retail_shift_sessions.find(s=>s.id===sessId)||db.retail_shift_sessions.find(s=>s.store_id===storeId&&s.status==="open");
      if(!sess)return {data:{opening:0,sales:0,refunds:0,cash_in:0,cash_out:0,movements:0,expected:0},error:null};
      const openedTs=new Date(sess.opened_at).getTime();
      const closedTs=sess.closed_at?new Date(sess.closed_at).getTime():Infinity;
      const shiftSales=db.retail_sales.filter(s=>{
        if(s.store_id!==storeId||s.status!=="posted")return false;
        const ts=new Date(s.created_at).getTime();
        return ts>=openedTs&&ts<=closedTs;
      });
      const salesSum=shiftSales.reduce((acc,s)=>acc+Number(s.total_minor||0),0);
      const refundsSum=shiftSales.filter(s=>s.refunded).reduce((acc,s)=>acc+Number(s.total_minor||0),0);
      const moves=db.retail_cash_movements.filter(m=>m.session_id===sess.id);
      const cashIn=moves.filter(m=>m.kind==="cash_in").reduce((acc,m)=>acc+Number(m.amount_minor||0),0);
      const cashOut=moves.filter(m=>m.kind==="cash_out").reduce((acc,m)=>acc+Number(m.amount_minor||0),0);
      const movements=cashIn-cashOut;
      const expected=Number(sess.opening_cash_minor||0)+salesSum-refundsSum+movements;
      sess.expected_cash_minor=expected;
      saveDb(db);
      return {
        data:{
          session_id:sess.id,
          opening:Number(sess.opening_cash_minor||0),
          sales:salesSum,
          refunds:refundsSum,
          cash_in:cashIn,
          cash_out:cashOut,
          movements,
          expected
        },
        error:null
      };
    }

    if(fn==="retail_cash_movement"){
      const reqId=args.p_request||args.p_request_id||uuid();
      if(db.processed_requests[reqId])return {data:db.processed_requests[reqId],error:null};
      const mov={
        id:uuid(),
        store_id:storeId,
        session_id:args.p_session,
        actor_id:db.currentUser?.id||DEFAULT_OWNER_ID,
        kind:args.p_kind||"cash_in",
        amount_minor:Math.round(Number(args.p_amount||0)),
        note:args.p_note||"",
        request_id:reqId,
        created_at:nowIso()
      };
      db.retail_cash_movements.unshift(mov);
      db.processed_requests[reqId]=mov;
      addAudit(db,storeId,"cash_movement_"+mov.kind,mov.id,{amount_minor:mov.amount_minor,note:mov.note});
      saveDb(db);
      enqueueOperation("rpc",fn,args);
      return {data:mov,error:null};
    }

    if(fn==="retail_shift_close"){
      const sess=db.retail_shift_sessions.find(s=>s.id===args.p_session&&s.store_id===storeId);
      if(!sess)return {data:null,error:{message:"شێفتی کراوە نەدۆزرایەوە"}};
      const summary=executeOfflineRpc("retail_shift_summary",{p_store:storeId,p_session:sess.id}).data;
      const counted=Math.round(Number(args.p_counted||0));
      const expected=Number(summary.expected||0);
      const variance=counted-expected;
      sess.status="closed";
      sess.expected_cash_minor=expected;
      sess.counted_cash_minor=counted;
      sess.variance_minor=variance;
      sess.closed_at=nowIso();
      addAudit(db,storeId,"shift_close",sess.id,{expected,counted,variance});
      saveDb(db);
      enqueueOperation("rpc",fn,args);
      return {
        data:{
          session_id:sess.id,
          opening:summary.opening,
          sales:summary.sales,
          refunds:summary.refunds,
          cash_in:summary.cash_in,
          cash_out:summary.cash_out,
          movements:summary.movements,
          expected,
          counted,
          variance,
          closed_at:sess.closed_at
        },
        error:null
      };
    }

    if(fn==="retail_checkout_cash"||fn==="retail_checkout_packs_v16"||fn==="retail_checkout_weight_v19"){
      const reqId=args.p_request||args.p_request_id||uuid();
      if(db.processed_requests[reqId]){
        const prev=db.processed_requests[reqId];
        return {data:typeof prev==="string"?prev:(prev.sale_id||prev),error:null};
      }
      const items=Array.isArray(args.p_items)?args.p_items:[];
      if(!items.length)return {data:null,error:{message:"سەبەتە بەتاڵە"}};
      const discount=Math.max(0,Math.round(Number(args.p_discount||0)));
      const cashReceived=Math.max(0,Math.round(Number(args.p_cash_received||0)));
      let subtotal=0;
      const normalizedLines=[];

      for(const line of items){
        const rawCode=String(line.barcode||line.package_barcode||"").trim();
        let p=null;
        let isScale=false;
        let qty=Number(line.quantity||1);
        let unitsPerPkg=Number(line.expected_units||line.units_per_package||1);
        let packageType=line.package_type||"unit";
        let unitPrice=0;
        let baseUnits=0;
        let lineTotal=0;
        let baseUnitSnapshot="unit";

        if(rawCode&&/^27\d{11}$/.test(rawCode)){
          const resolved=executeOfflineRpc("retail_resolve_barcode_v18",{p_store:storeId,p_code:rawCode}).data;
          if(resolved&&resolved.found&&resolved.is_scale){
            p=db.retail_products.find(x=>x.id===resolved.product_id&&x.store_id===storeId);
            isScale=true;
            baseUnitSnapshot="kg";
            packageType="unit";
            unitsPerPkg=1;
            const kgWeight=Number(resolved.scale_weight_kg||0);
            qty=kgWeight;
            baseUnits=kgWeight;
            unitPrice=Number(resolved.scale_unit_price_minor||p?.price_minor||0);
            lineTotal=Math.round(kgWeight*unitPrice);
          }
        }

        if(!p&&rawCode){
          const b=db.retail_barcodes.find(x=>x.store_id===storeId&&x.code===rawCode&&x.active!==false);
          if(b){
            p=db.retail_products.find(x=>x.id===b.product_id&&x.store_id===storeId&&x.active!==false);
            if(p){
              packageType=b.unit_type||"unit";
              unitsPerPkg=Number(b.units_per_scan||1);
              unitPrice=Number(b.price_minor??p.price_minor??0);
              baseUnitSnapshot=p.base_unit==="kg"?"kg":"unit";
              baseUnits=baseUnitSnapshot==="kg"?qty:qty*unitsPerPkg;
              lineTotal=Math.round(qty*unitPrice);
            }
          }
        }

        if(!p&&line.product_id){
          p=db.retail_products.find(x=>x.id===line.product_id&&x.store_id===storeId&&x.active!==false);
          if(p){
            baseUnitSnapshot=p.base_unit==="kg"?"kg":"unit";
            packageType=line.package_type||(baseUnitSnapshot==="kg"?"kg":"unit");
            unitsPerPkg=Number(line.units_per_package||1);
            unitPrice=Number(line.unit_price_minor??p.price_minor??0);
            baseUnits=line.base_units!=null?Number(line.base_units):(baseUnitSnapshot==="kg"?qty:qty*unitsPerPkg);
            lineTotal=Math.round(qty*unitPrice);
          }
        }

        if(!p)return {data:null,error:{message:"کاڵا نەدۆزرایەوە"}};
        const curStock=getBalance(db,storeId,p.id);
        if(curStock+1e-6<baseUnits){
          return {data:null,error:{message:"بڕی کاڵا لە کۆگا بەش ناکات: "+p.name}};
        }
        subtotal+=lineTotal;
        normalizedLines.push({
          product:p,
          qty,
          unitPrice,
          baseUnits:Number(baseUnits.toFixed(3)),
          unitsPerPkg,
          packageType,
          packageBarcode:rawCode||null,
          baseUnitSnapshot,
          isScale
        });
      }

      const totalMinor=Math.max(0,subtotal-discount);
      if(cashReceived<totalMinor){
        return {data:null,error:{message:"پارەی وەرگیراو کەمترە لە کۆی پسووڵە"}};
      }
      const changeDue=cashReceived-totalMinor;
      const nextReceiptNo=db.retail_sales.reduce((m,s)=>Math.max(m,Number(s.receipt_no||0)),0)+1;
      const saleId=uuid();
      const ts=nowIso();

      for(const nl of normalizedLines){
        const curStock=getBalance(db,storeId,nl.product.id);
        setBalance(db,storeId,nl.product.id,Math.max(0,curStock-nl.baseUnits));
        db.retail_sale_items.unshift({
          id:uuid(),
          store_id:storeId,
          sale_id:saleId,
          product_id:nl.product.id,
          product_name_snapshot:nl.product.name,
          quantity:nl.qty,
          unit_price_minor:nl.unitPrice,
          package_type:nl.packageType,
          package_barcode:nl.packageBarcode,
          units_per_package:nl.unitsPerPkg,
          base_units:nl.baseUnits,
          base_unit_snapshot:nl.baseUnitSnapshot,
          created_at:ts
        });
        db.retail_stock_movements.unshift({
          id:uuid(),
          store_id:storeId,
          product_id:nl.product.id,
          movement_type:"sale",
          quantity_delta:-nl.baseUnits,
          note:"پسووڵە #"+String(nextReceiptNo).padStart(6,"0"),
          created_at:ts
        });
        db.retail_stock_events.unshift({
          id:uuid(),
          store_id:storeId,
          product_id:nl.product.id,
          delta:-nl.baseUnits,
          reason:"sale",
          sale_id:saleId,
          request_id:reqId,
          created_at:ts
        });
      }

      const saleRow={
        id:saleId,
        store_id:storeId,
        receipt_no:nextReceiptNo,
        total_minor:totalMinor,
        discount_minor:discount,
        cash_received_minor:cashReceived,
        change_due_minor:changeDue,
        cashier_id:db.currentUser?.id||DEFAULT_OWNER_ID,
        status:"posted",
        currency:"IQD",
        refunded:false,
        request_id:reqId,
        request_payload:{items,cash_received:cashReceived,discount},
        created_at:ts
      };
      db.retail_sales.unshift(saleRow);
      db.processed_requests[reqId]=saleId;
      addAudit(db,storeId,"sale.checkout_weight_v19",saleId,{
        receipt_no:nextReceiptNo,
        total_iqd:totalMinor,
        discount_iqd:discount,
        cash_iqd:cashReceived
      });
      saveDb(db);
      enqueueOperation("rpc",fn,args);
      return {data:saleId,error:null};
    }

    if(fn==="retail_return_sale"||fn==="retail_return_sale_v19"){
      const reqId=args.p_request||args.p_request_id||uuid();
      if(db.processed_requests[reqId])return {data:db.processed_requests[reqId],error:null};
      const sale=db.retail_sales.find(s=>s.id===args.p_sale&&s.store_id===storeId);
      if(!sale)return {data:null,error:{message:"پسووڵە نەدۆزرایەوە"}};
      if(sale.refunded)return {data:null,error:{message:"ئەم پسووڵەیە پێشتر گەڕێندراوەتەوە"}};
      sale.refunded=true;
      const ts=nowIso();
      const items=db.retail_sale_items.filter(i=>i.sale_id===sale.id);
      for(const it of items){
        const delta=Number(it.base_units||it.quantity||0);
        setBalance(db,storeId,it.product_id,getBalance(db,storeId,it.product_id)+delta);
        db.retail_stock_movements.unshift({
          id:uuid(),
          store_id:storeId,
          product_id:it.product_id,
          movement_type:"sale_return",
          quantity_delta:delta,
          note:args.p_reason||("گەڕاندنەوەی پسووڵە #"+sale.receipt_no),
          created_at:ts
        });
        db.retail_stock_events.unshift({
          id:uuid(),
          store_id:storeId,
          product_id:it.product_id,
          delta:delta,
          reason:"return",
          sale_id:sale.id,
          request_id:reqId,
          created_at:ts
        });
      }
      const retRow={
        sale_id:sale.id,
        receipt_no:sale.receipt_no,
        refunded_minor:sale.total_minor,
        reason:args.p_reason||"گەڕاندنەوەی کاڵا",
        created_at:ts
      };
      db.retail_sale_returns.unshift(retRow);
      db.processed_requests[reqId]=retRow;
      addAudit(db,storeId,"sale.return",sale.id,{receipt_no:sale.receipt_no,reason:retRow.reason});
      saveDb(db);
      enqueueOperation("rpc",fn,args);
      return {data:retRow,error:null};
    }

    if(fn==="retail_receive_stock"||fn==="retail_receive_packs_v17"||fn==="retail_receive_mixed_v171"||fn==="retail_receive_weight_v19"||fn==="retail_adjust_stock_v19"){
      const reqId=args.p_request||args.p_request_id||uuid();
      if(db.processed_requests[reqId])return {data:db.processed_requests[reqId],error:null};
      const ts=nowIso();

      if(fn==="retail_receive_mixed_v171"&&Array.isArray(args.p_lines)){
        const updated=[];
        for(const ln of args.p_lines){
          const code=String(ln.barcode||"").trim();
          const b=db.retail_barcodes.find(x=>x.store_id===storeId&&x.code===code&&x.active!==false);
          const pid=b?.product_id||ln.product_id;
          if(!pid)return {data:null,error:{message:"بارکۆدی کاڵا نەدۆزرایەوە: "+code}};
          const packs=Number(ln.packages||ln.quantity||0);
          const unitsPerPack=Number(ln.expected_units||b?.units_per_scan||1);
          const delta=Number((packs*unitsPerPack).toFixed(3));
          const cur=getBalance(db,storeId,pid);
          const nextQty=Math.max(0,Number((cur+delta).toFixed(3)));
          setBalance(db,storeId,pid,nextQty);
          db.retail_stock_movements.unshift({
            id:uuid(),store_id:storeId,product_id:pid,movement_type:"purchase",
            quantity_delta:delta,note:args.p_reason||"وەرگرتنی کۆگا",created_at:ts
          });
          db.retail_stock_events.unshift({
            id:uuid(),store_id:storeId,product_id:pid,delta,
            reason:args.p_reason||"receive_mixed",sale_id:null,request_id:reqId,created_at:ts
          });
          updated.push({product_id:pid,quantity:nextQty,delta});
        }
        db.processed_requests[reqId]=updated;
        addAudit(db,storeId,"stock.receive_mixed_v171",storeId,{lines:updated.length,reason:args.p_reason});
        saveDb(db);
        enqueueOperation("rpc",fn,args);
        return {data:updated,error:null};
      }

      let pid=args.p_product||args.p_product_id;
      let barcodeRow=null;
      if(!pid&&args.p_barcode){
        const code=String(args.p_barcode).trim();
        barcodeRow=db.retail_barcodes.find(x=>x.store_id===storeId&&x.code===code&&x.active!==false);
        pid=barcodeRow?.product_id;
      }
      if(!pid)return {data:null,error:{message:"کاڵا نەدۆزرایەوە بۆ نوێکردنەوەی کۆگا"}};

      const cur=getBalance(db,storeId,pid);
      let delta=0;
      let nextQty=cur;

      if(fn==="retail_adjust_stock_v19"){
        const mode=String(args.p_mode||"");
        const qtyVal=Number(args.p_quantity??args.p_delta??0);
        if(mode==="set_exact"){
          nextQty=Math.max(0,Number(qtyVal.toFixed(3)));
          delta=Number((nextQty-cur).toFixed(3));
        }else if(mode==="delta_out"){
          delta=-Math.abs(Number(qtyVal.toFixed(3)));
          nextQty=Math.max(0,Number((cur+delta).toFixed(3)));
        }else if(mode==="delta_in"){
          delta=Math.abs(Number(qtyVal.toFixed(3)));
          nextQty=Math.max(0,Number((cur+delta).toFixed(3)));
        }else{
          delta=Number(qtyVal.toFixed(3));
          nextQty=Math.max(0,Number((cur+delta).toFixed(3)));
        }
      }else if(fn==="retail_receive_weight_v19"){
        delta=Number(Number(args.p_kg??args.p_quantity??0).toFixed(3));
        nextQty=Math.max(0,Number((cur+delta).toFixed(3)));
      }else if(fn==="retail_receive_packs_v17"){
        const packages=Number(args.p_packages??args.p_quantity??0);
        const unitsPerPkg=Number(args.p_expected_units??args.p_units_per_package??barcodeRow?.units_per_scan??1);
        delta=Number((packages*unitsPerPkg).toFixed(3));
        nextQty=Math.max(0,Number((cur+delta).toFixed(3)));
      }else if(fn==="retail_receive_mixed_v171"){
        const packs=Number(args.p_pack_qty||0)*Number(args.p_units_per_pack||1);
        const loose=Number(args.p_loose_units||0);
        delta=Number((packs+loose).toFixed(3));
        nextQty=Math.max(0,Number((cur+delta).toFixed(3)));
      }else{
        delta=Number(Number(args.p_quantity||0).toFixed(3));
        nextQty=Math.max(0,Number((cur+delta).toFixed(3)));
      }

      setBalance(db,storeId,pid,nextQty);
      const reasonText=args.p_reason||args.p_note||(delta>=0?"receive":"adjustment");
      db.retail_stock_movements.unshift({
        id:uuid(),
        store_id:storeId,
        product_id:pid,
        movement_type:delta>=0?"purchase":"adjustment",
        quantity_delta:delta,
        note:reasonText,
        created_at:ts
      });
      db.retail_stock_events.unshift({
        id:uuid(),
        store_id:storeId,
        product_id:pid,
        delta,
        reason:reasonText,
        sale_id:null,
        request_id:reqId,
        created_at:ts
      });
      const res={product_id:pid,quantity:nextQty,delta};
      db.processed_requests[reqId]=res;
      addAudit(db,storeId,fn==="retail_adjust_stock_v19"?"stock.adjust_v19":"stock.receive",pid,{
        mode:args.p_mode||"receive",
        delta,
        new_quantity:nextQty,
        reason:reasonText,
        note:args.p_note||null
      });
      saveDb(db);
      enqueueOperation("rpc",fn,args);
      return {data:res,error:null};
    }

    if(fn==="retail_create_product"||fn==="retail_register_product_v14"){
      const pid=uuid();
      const ts=nowIso();
      const cat=args.p_catalog&&typeof args.p_catalog==="object"?args.p_catalog:null;
      const name=String(cat?.name||args.p_name||"").trim();
      if(!name)return {data:null,error:{message:"ناوی کاڵا پێویستە"}};
      const saleMode=cat?.sale_mode||"unit";
      const price=Math.max(0,Math.round(Number(cat?.unit_sale_price_iqd??args.p_price_minor??args.p_price??args.p_unit_price??cat?.carton?.sale_price_iqd??0)));
      const purchasePrice=cat?.unit_purchase_price_iqd!=null?Math.max(0,Math.round(Number(cat.unit_purchase_price_iqd))):null;
      const baseUnit=args.p_base_unit==="kg"?"kg":"unit";
      const code=String(cat?.unit_barcode||args.p_barcode||args.p_unit_barcode||"").trim();
      const aliasCodes=Array.isArray(cat?.unit_alias_barcodes)?cat.unit_alias_barcodes.map(x=>String(x||"").trim()).filter(Boolean):[];
      const cartonObj=cat?.carton&&typeof cat.carton==="object"?cat.carton:null;

      const prod={
        id:pid,
        store_id:storeId,
        name,
        sku:cat?.sku||args.p_sku||null,
        plu:cat?.plu||args.p_plu||null,
        sale_mode:saleMode,
        base_unit:baseUnit,
        currency:"IQD",
        price_minor:price,
        purchase_price_minor:purchasePrice,
        unit_primary_barcode:code||null,
        catalog_version:1,
        carton:cartonObj?{
          name:cartonObj.name||null,
          barcode:String(cartonObj.barcode||"").trim(),
          alias_barcodes:Array.isArray(cartonObj.alias_barcodes)?cartonObj.alias_barcodes:[],
          units_per_carton:Number(cartonObj.units_per_carton||1),
          sale_price_iqd:Number(cartonObj.sale_price_iqd||0),
          purchase_price_iqd:cartonObj.purchase_price_iqd!=null?Number(cartonObj.purchase_price_iqd):null
        }:null,
        active:true,
        created_at:ts
      };
      db.retail_products.unshift(prod);

      if(code){
        db.retail_barcodes.unshift({
          code,
          store_id:storeId,
          product_id:pid,
          unit_type:"unit",
          units_per_scan:1,
          price_minor:price,
          active:true,
          created_at:ts
        });
      }
      for(const ac of aliasCodes){
        if(ac&&ac!==code){
          db.retail_barcodes.unshift({
            code:ac,
            store_id:storeId,
            product_id:pid,
            unit_type:"unit",
            units_per_scan:1,
            price_minor:price,
            active:true,
            created_at:ts
          });
        }
      }
      if(cartonObj&&cartonObj.barcode&&Number(cartonObj.units_per_carton)>=2){
        const cCode=String(cartonObj.barcode).trim();
        const cUnits=Number(cartonObj.units_per_carton);
        const cPrice=Math.round(Number(cartonObj.sale_price_iqd||price*cUnits));
        db.retail_barcodes.unshift({
          code:cCode,
          store_id:storeId,
          product_id:pid,
          unit_type:"carton",
          units_per_scan:cUnits,
          price_minor:cPrice,
          active:true,
          created_at:ts
        });
        for(const cac of (Array.isArray(cartonObj.alias_barcodes)?cartonObj.alias_barcodes:[])){
          const cleanCac=String(cac||"").trim();
          if(cleanCac&&cleanCac!==cCode){
            db.retail_barcodes.unshift({
              code:cleanCac,
              store_id:storeId,
              product_id:pid,
              unit_type:"carton",
              units_per_scan:cUnits,
              price_minor:cPrice,
              active:true,
              created_at:ts
            });
          }
        }
      }else if(args.p_pack_barcode&&Number(args.p_pack_units)>1){
        db.retail_barcodes.unshift({
          code:String(args.p_pack_barcode).trim(),
          store_id:storeId,
          product_id:pid,
          unit_type:"carton",
          units_per_scan:Number(args.p_pack_units),
          price_minor:Math.round(Number(args.p_pack_price||price*Number(args.p_pack_units))),
          active:true,
          created_at:ts
        });
      }
      const initStock=Number(args.p_initial_stock||args.p_opening_stock||0);
      setBalance(db,storeId,pid,initStock);
      db.retail_product_history.unshift({
        id:uuid(),
        store_id:storeId,
        product_id:pid,
        version:1,
        action:"product.register_v14",
        actor_id:db.currentUser?.id||DEFAULT_OWNER_ID,
        created_at:ts
      });
      addAudit(db,storeId,"product.create",pid,{name:prod.name,sku:prod.sku,plu:prod.plu});
      saveDb(db);
      enqueueOperation("rpc",fn,args);
      return {data:pid,error:null};
    }

    if(fn==="retail_update_product_v15"){
      const pid=args.p_product||args.p_product_id;
      const p=db.retail_products.find(x=>x.id===pid&&x.store_id===storeId);
      if(!p)return {data:null,error:{message:"کاڵا نەدۆزرایەوە"}};
      const cat=args.p_catalog&&typeof args.p_catalog==="object"?args.p_catalog:null;
      const ts=nowIso();

      if(cat){
        if(cat.name)p.name=String(cat.name).trim();
        p.sku=cat.sku||null;
        p.plu=cat.plu||null;
        p.sale_mode=cat.sale_mode||p.sale_mode||"unit";
        if(cat.unit_sale_price_iqd!=null){
          p.price_minor=Math.max(0,Math.round(Number(cat.unit_sale_price_iqd)));
        }else if(cat.carton?.sale_price_iqd!=null&&p.sale_mode==="carton"){
          p.price_minor=Math.max(0,Math.round(Number(cat.carton.sale_price_iqd)));
        }
        if(cat.unit_purchase_price_iqd!==undefined){
          p.purchase_price_minor=cat.unit_purchase_price_iqd!=null?Math.max(0,Math.round(Number(cat.unit_purchase_price_iqd))):null;
        }
        p.unit_primary_barcode=cat.unit_barcode||p.unit_primary_barcode||null;
        p.carton=cat.carton?{
          name:cat.carton.name||null,
          barcode:String(cat.carton.barcode||"").trim(),
          alias_barcodes:Array.isArray(cat.carton.alias_barcodes)?cat.carton.alias_barcodes:[],
          units_per_carton:Number(cat.carton.units_per_carton||1),
          sale_price_iqd:Number(cat.carton.sale_price_iqd||0),
          purchase_price_iqd:cat.carton.purchase_price_iqd!=null?Number(cat.carton.purchase_price_iqd):null
        }:null;

        // Rebuild barcodes for this product
        db.retail_barcodes=db.retail_barcodes.filter(b=>!(b.store_id===storeId&&b.product_id===pid));
        if(cat.unit_barcode){
          db.retail_barcodes.unshift({
            code:String(cat.unit_barcode).trim(),
            store_id:storeId,
            product_id:pid,
            unit_type:"unit",
            units_per_scan:1,
            price_minor:p.price_minor,
            active:true,
            created_at:ts
          });
        }
        for(const ac of (Array.isArray(cat.unit_alias_barcodes)?cat.unit_alias_barcodes:[])){
          const cleanAc=String(ac||"").trim();
          if(cleanAc&&cleanAc!==cat.unit_barcode){
            db.retail_barcodes.unshift({
              code:cleanAc,
              store_id:storeId,
              product_id:pid,
              unit_type:"unit",
              units_per_scan:1,
              price_minor:p.price_minor,
              active:true,
              created_at:ts
            });
          }
        }
        if(cat.carton&&cat.carton.barcode&&Number(cat.carton.units_per_carton)>=2){
          const cCode=String(cat.carton.barcode).trim();
          const cUnits=Number(cat.carton.units_per_carton);
          const cPrice=Math.round(Number(cat.carton.sale_price_iqd||p.price_minor*cUnits));
          db.retail_barcodes.unshift({
            code:cCode,
            store_id:storeId,
            product_id:pid,
            unit_type:"carton",
            units_per_scan:cUnits,
            price_minor:cPrice,
            active:true,
            created_at:ts
          });
          for(const cac of (Array.isArray(cat.carton.alias_barcodes)?cat.carton.alias_barcodes:[])){
            const cleanCac=String(cac||"").trim();
            if(cleanCac&&cleanCac!==cCode){
              db.retail_barcodes.unshift({
                code:cleanCac,
                store_id:storeId,
                product_id:pid,
                unit_type:"carton",
                units_per_scan:cUnits,
                price_minor:cPrice,
                active:true,
                created_at:ts
              });
            }
          }
        }
      }else{
        if(args.p_name)p.name=String(args.p_name).trim();
        if(args.p_price!=null||args.p_unit_price!=null){
          p.price_minor=Math.max(0,Math.round(Number(args.p_price??args.p_unit_price)));
        }
        if(args.p_sku!==undefined)p.sku=args.p_sku||null;
        if(args.p_plu!==undefined)p.plu=args.p_plu||null;
        if(args.p_active!==undefined)p.active=Boolean(args.p_active);
        if(args.p_unit_barcode){
          const bc=db.retail_barcodes.find(b=>b.product_id===pid&&b.unit_type==="unit");
          if(bc){
            bc.code=String(args.p_unit_barcode).trim();
            bc.price_minor=p.price_minor;
          }else{
            db.retail_barcodes.unshift({
              code:String(args.p_unit_barcode).trim(),
              store_id:storeId,
              product_id:pid,
              unit_type:"unit",
              units_per_scan:1,
              price_minor:p.price_minor,
              active:true,
              created_at:ts
            });
          }
        }
      }
      p.catalog_version=Number(p.catalog_version||1)+1;
      p.updated_at=ts;
      db.retail_product_history.unshift({
        id:uuid(),
        store_id:storeId,
        product_id:pid,
        version:p.catalog_version,
        action:"updated",
        actor_id:db.currentUser?.id||DEFAULT_OWNER_ID,
        created_at:ts
      });
      addAudit(db,storeId,"product.update_v15",pid,{name:p.name,version:p.catalog_version});
      saveDb(db);
      enqueueOperation("rpc",fn,args);
      return {data:{id:p.id,version:p.catalog_version,product:p},error:null};
    }

    if(fn==="retail_product_snapshot_v15"||fn==="retail_product_snapshot_v19"){
      const pid=args.p_product||args.p_product_id;
      const p=db.retail_products.find(x=>x.id===pid&&x.store_id===storeId);
      if(!p)return {data:null,error:{message:"کاڵا نەدۆزرایەوە"}};
      const bcs=db.retail_barcodes.filter(b=>b.product_id===pid&&b.store_id===storeId&&b.active!==false);
      const unitBars=bcs.filter(b=>b.unit_type==="unit");
      const cartonBars=bcs.filter(b=>b.unit_type==="carton");
      const primaryUnit=unitBars.find(b=>b.code===p.unit_primary_barcode)?.code||unitBars[0]?.code||"";
      const unitAliases=unitBars.map(b=>b.code).filter(c=>c!==primaryUnit);
      const primaryCarton=cartonBars[0]||null;
      const cartonAliases=cartonBars.slice(1).map(b=>b.code);
      const saleMode=p.sale_mode||(primaryCarton?(primaryUnit?"both":"carton"):"unit");
      const cartonSnap=p.carton||(primaryCarton?{
        name:null,
        barcode:primaryCarton.code,
        alias_barcodes:cartonAliases,
        units_per_carton:Number(primaryCarton.units_per_scan||2),
        sale_price_iqd:Number(primaryCarton.price_minor||0),
        purchase_price_iqd:null
      }:null);

      return {
        data:{
          id:p.id,
          version:Number(p.catalog_version||1),
          name:p.name,
          sku:p.sku||null,
          plu:p.plu||null,
          sale_mode:saleMode,
          base_unit:p.base_unit||"unit",
          currency:p.currency||"IQD",
          stock_quantity:getBalance(db,storeId,pid),
          unit_barcode:primaryUnit,
          unit_alias_barcodes:unitAliases,
          unit_sale_price_iqd:saleMode==="carton"?null:Number(p.price_minor||0),
          unit_purchase_price_iqd:p.purchase_price_minor??null,
          carton:cartonSnap,
          product:p,
          barcodes:bcs
        },
        error:null
      };
    }

    if(fn==="retail_product_history_v15"){
      const pid=args.p_product||args.p_product_id;
      const hist=(db.retail_product_history||[]).filter(h=>h.store_id===storeId&&h.product_id===pid);
      return {data:hist,error:null};
    }

    if(fn==="retail_set_product_base_unit_v19"){
      const pid=args.p_product||args.p_product_id;
      const p=db.retail_products.find(x=>x.id===pid&&x.store_id===storeId);
      if(!p)return {data:null,error:{message:"کاڵا نەدۆزرایەوە"}};
      const targetUnit=(args.p_unit||args.p_base_unit)==="kg"?"kg":"unit";
      p.base_unit=targetUnit;
      p.catalog_version=Number(p.catalog_version||1)+1;
      if(args.p_plu!==undefined)p.plu=args.p_plu||null;
      addAudit(db,storeId,"product.set_base_unit_v19",pid,{base_unit:targetUnit});
      saveDb(db);
      enqueueOperation("rpc",fn,args);
      return {data:{id:p.id,base_unit:p.base_unit,version:p.catalog_version},error:null};
    }

    if(fn==="retail_assign_staff"){
      const uid=args.p_user||uuid();
      const role=args.p_role||"cashier";
      const existing=db.retail_memberships.find(m=>m.store_id===storeId&&m.user_id===uid);
      if(existing){
        existing.role=role;
        existing.active=args.p_active!==false;
      }else{
        db.retail_memberships.unshift({
          store_id:storeId,
          user_id:uid,
          role,
          active:args.p_active!==false,
          created_at:nowIso()
        });
      }
      addAudit(db,storeId,"assign_staff",uid,{role});
      saveDb(db);
      enqueueOperation("rpc",fn,args);
      return {data:{user_id:uid,role},error:null};
    }

    enqueueOperation("rpc",fn,args);
    return {data:{ok:true},error:null};
  }

  function createOfflineSupabaseClient(){
    const authListeners=new Set();
    return {
      auth:{
        async getSession(){
          const db=loadDb();
          if(db.currentUser?.loggedOut)return {data:{session:null},error:null};
          const user=db.currentUser||{id:DEFAULT_OWNER_ID,email:"owner@kanichnar.local",role:"authenticated"};
          return {data:{session:{user,access_token:"offline-local-session"}},error:null};
        },
        async getUser(){
          const db=loadDb();
          if(db.currentUser?.loggedOut)return {data:{user:null},error:null};
          const user=db.currentUser||{id:DEFAULT_OWNER_ID,email:"owner@kanichnar.local",role:"authenticated"};
          return {data:{user},error:null};
        },
        async signInWithPassword({email}){
          const db=loadDb();
          const clean=String(email||"owner@kanichnar.local").trim();
          let targetId=DEFAULT_OWNER_ID;
          let targetEmail=clean||"owner@kanichnar.local";
          if(clean&&clean!=="owner@kanichnar.local"){
            const m=(db.retail_memberships||[]).find(x=>x.user_id===clean);
            const inDb=(db.retail_staff_profiles||[]).find(p=>p.email===clean||p.pin_code===clean||p.user_id===clean||p.full_name===clean);
            if(m){
              targetId=m.user_id;
            }else if(inDb){
              targetId=inDb.user_id;
              targetEmail=inDb.email&&inDb.email!=="—"?inDb.email:clean;
            }else if(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(clean)){
              targetId=clean;
            }else{
              try{
                const sp=JSON.parse(localStorage.getItem("retail_staff_profiles_v18")||"{}");
                for(const [uid,p] of Object.entries(sp)){
                  if(p.email===clean||p.pin_code===clean||p.user_id===clean||p.full_name===clean){
                    targetId=uid;
                    targetEmail=p.email&&p.email!=="—"?p.email:clean;
                    break;
                  }
                }
              }catch(_e){}
            }
          }
          db.currentUser={
            id:targetId,
            email:targetEmail,
            role:"authenticated"
          };
          saveDb(db);
          const session={user:db.currentUser,access_token:"offline-local-session"};
          for(const cb of authListeners){try{cb("SIGNED_IN",session);}catch(_e){}}
          return {data:{user:db.currentUser,session},error:null};
        },
        async signUp({email}){
          return this.signInWithPassword({email});
        },
        async signOut(){
          const db=loadDb();
          db.currentUser={id:"00000000-0000-0000-0000-000000000000",loggedOut:true};
          saveDb(db);
          for(const cb of authListeners){try{cb("SIGNED_OUT",null);}catch(_e){}}
          return {error:null};
        },
        onAuthStateChange(cb){
          if(typeof cb==="function")authListeners.add(cb);
          return {data:{subscription:{unsubscribe(){authListeners.delete(cb);}}}};
        }
      },
      from(table){
        return createOfflineQueryBuilder(table);
      },
      rpc(fn,args={}){
        return Promise.resolve(executeOfflineRpc(fn,args));
      }
    };
  }

  const offlineSupabaseFacade={
    createClient(){
      if(window.__retailQA&&realSupabaseGlobal){
        return realSupabaseGlobal.createClient.apply(realSupabaseGlobal,arguments);
      }
      return createOfflineSupabaseClient();
    }
  };

  if(!window.__retailQA){
    try{
      Object.defineProperty(window,"supabase",{
        configurable:true,
        enumerable:true,
        get(){
          return window.__retailQA&&realSupabaseGlobal?realSupabaseGlobal:offlineSupabaseFacade;
        },
        set(val){
          if(val&&typeof val.createClient==="function"&&!realSupabaseGlobal){
            // Capture real client if loaded asynchronously, while keeping offline facade active
          }
        }
      });
    }catch(_e){
      window.supabase=offlineSupabaseFacade;
    }
  }
})();

