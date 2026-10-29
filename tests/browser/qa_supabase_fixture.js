/* Browser-only Supabase fixture. This never ships on a production page.
 * Browser tests intercept the SDK CDN before boot, then load REAL HTML/CSS/JS
 * from the working branch. All mock state stays in the Playwright page.
 */
(() => {
  const account={id:"11111111-1111-4111-8111-111111111111",email:"owner@qa.example"};
  const store={id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",owner_user_id:account.id,name:"QA Only",currency:"IQD"};
  const seed={id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",name:"کاڵای تاقیگە",price_minor:1000,active:true,currency:"IQD",store_id:store.id};
  const state={
    account,store,
    products:[seed],
    barcodes:[{store_id:store.id,product_id:seed.id,code:"4006381333931",unit_type:"unit",units_per_scan:1}],
    stock:[{store_id:store.id,product_id:seed.id,quantity:2}],
    sessions:[],movements:[],sales:[],saleItems:[],stockEvents:[],memberships:[],audit:[],
    called:[],stockReceipts:[],nextProduct:0,nextReceipt:0,forceRpcError:null,advancedRpcEnabled:true,advancedCatalogs:[],indexVersion:0
  };
  const error=(code,message)=>({code,message});
  function isValidEan13(code){
    const clean=String(code||"").trim();
    if(!/^\d{13}$/.test(clean))return false;
    let sum=0;
    for(let i=0;i<12;i++){
      const d=clean.charCodeAt(i)-48;
      sum+=(i%2===0)?d:d*3;
    }
    const check=(10-(sum%10))%10;
    return check===(clean.charCodeAt(12)-48);
  }
  function resolveScale27(code,idx){
    const clean=String(code||"").trim();
    if(!/^27\d{11}$/.test(clean)||!isValidEan13(clean))return null;
    const pluRaw=clean.slice(2,7);
    const pluNum=String(Number(pluRaw));
    const pluFull="27"+pluRaw;
    const grams=Number(clean.slice(7,12));
    if(pluRaw==="00000"||!Number.isSafeInteger(grams)||grams<=0)return null;
    const matches=state.products.filter(sp=>{
      if(sp.active===false||sp.currency!=="IQD"||!(Number(sp.price_minor)>0))return false;
      const sc=idx.catalogById.get(sp.id);
      if(sc?.sale_mode==="carton")return false;
      const spPlu=String(sc?.plu??sp.plu??"").trim();
      const spSku=String(sc?.sku??sp.sku??"").trim();
      if(spPlu&&(spPlu===pluRaw||spPlu===pluNum||spPlu===pluFull||(/^\d{1,5}$/.test(spPlu)&&spPlu.padStart(5,"0")===pluRaw)))return true;
      if(spSku&&(spSku===pluRaw||spSku===pluNum||spSku===pluFull))return true;
      const codes=idx.barcodesByProductId.get(sp.id)||[];
      return codes.some(b=>b.active!==false&&(b.code===pluFull||b.code===pluRaw||b.code===pluNum));
    });
    if(matches.length!==1)return null;
    const product=matches[0];
    const priceMinor=Math.round((Number(product.price_minor)*grams)/1000);
    if(priceMinor<=0)return null;
    const weightKg=Number((grams/1000).toFixed(3));
    return {
      product,
      catalog:idx.catalogById.get(product.id)||null,
      pluRaw,
      grams,
      weightKg,
      priceMinor,
      scaleLabel:weightKg.toFixed(3)+" کگم"
    };
  }
  function tableRows(name){
    if(name==="retail_stores")return state.store?[state.store]:[];
    if(name==="retail_products")return state.products;
    if(name==="retail_barcodes")return state.barcodes;
    if(name==="retail_stock_balances")return state.stock;
    if(name==="retail_cash_sessions")return state.sessions;
    if(name==="retail_cash_movements")return state.movements;
    if(name==="retail_sales")return state.sales;
    if(name==="retail_memberships")return state.memberships;
    if(name==="retail_audit_events")return state.audit;
    if(name==="retail_sale_items")return state.saleItems;
    if(name==="retail_stock_events")return state.stockEvents;
    throw Error("Unknown QA table "+name);
  }
  function from(table){
    const cond=[];let limit=Infinity,inserted=null,descending=false,sortKey=null;
    const query={
      select(){return this;},eq(key,val){cond.push([key,val]);return this;},
      order(key,opts){sortKey=key;descending=opts?.ascending===false;return this;},
      limit(n){limit=n;return this;},
      insert(value){inserted=value;return this;},
      getResult(){
        if(inserted!==null){
          if(table!=="retail_stores")return {data:null,error:error("42501","Fixture insert not allowed")};
          state.store={id:store.id,...inserted};inserted=null;
          return {data:state.store,error:null};
        }
        let rows=[...tableRows(table)].filter(v=>cond.every(([key,val])=>v[key]===val));
        if(sortKey)rows.sort((a,b)=>{
          let n=String(a[sortKey]??"").localeCompare(String(b[sortKey]??""));
          return descending?-n:n;
        });
        return {data:rows.slice(0,limit),error:null};
      },
      maybeSingle(){const r=this.getResult();return Promise.resolve({...r,data:r.data?.[0]??null});},
      single(){const r=this.getResult();return Promise.resolve({...r,data:r.data?.[0]??null});},
      then(onSuccess,onFailure){return Promise.resolve(this.getResult()).then(onSuccess,onFailure);}
    };
    return query;
  }
  let cachedIndex=null,cachedKey="";
  function getIndex(){
    const small=state.products.length<=500&&state.barcodes.length<=1500;
    const key=`${state.products.length}:${state.barcodes.length}:${state.stock.length}:${state.advancedCatalogs.length}:${state.indexVersion||0}`;
    if(!small&&cachedIndex&&cachedKey===key)return cachedIndex;
    const productById=new Map();
    for(const p of state.products)productById.set(p.id,p);
    const catalogById=new Map();
    for(const c of state.advancedCatalogs)catalogById.set(c.id,c);
    const stockByProductId=new Map();
    for(const s of state.stock)stockByProductId.set(s.product_id,s);
    const barcodesByProductId=new Map();
    const activeBarcodeByCode=new Map();
    const activeBarcodes=[];
    const prefixSet=new Set();
    for(const b of state.barcodes){
      let list=barcodesByProductId.get(b.product_id);
      if(!list){list=[];barcodesByProductId.set(b.product_id,list);}
      list.push(b);
      if(b.active!==false){
        const p=productById.get(b.product_id);
        if(p&&p.active!==false){
          activeBarcodeByCode.set(b.code,b);
          activeBarcodes.push(b);
          for(let i=1;i<b.code.length;i++)prefixSet.add(b.code.slice(0,i));
        }
      }
    }
    cachedKey=key;
    cachedIndex={productById,catalogById,stockByProductId,barcodesByProductId,activeBarcodeByCode,activeBarcodes,prefixSet};
    return cachedIndex;
  }
  function editorSnapshot(id){
    const p=state.products.find(x=>x.id===id);
    if(!p)return null;
    const existing=state.advancedCatalogs.find(x=>x.id===id);
    const version=p.catalog_version||1;
    if(existing)return structuredClone({...existing,version});
    const first=state.barcodes.find(x=>x.product_id===id&&x.unit_type==="unit"&&x.active!==false);
    return {id,version,advanced:false,name:p.name,sku:null,plu:null,
      unit_barcode:first?.code||"",unit_purchase_price_iqd:null,
      unit_sale_price_iqd:p.price_minor,unit_alias_barcodes:[],carton:null,currency:"IQD"};
  }
  function rpc(name,args){
    state.called.push({name,args});
    if(state.forceRpcError){const err=state.forceRpcError;state.forceRpcError=null;return Promise.resolve({data:null,error:err});}
    let data=null,err=null;
    if(name==="retail_create_product"){
      if(state.barcodes.some(x=>x.code===args.p_barcode))err=error("23505","duplicate barcode");
      else{
        const id="cccccccc-cccc-4ccc-8ccc-"+String(++state.nextProduct).padStart(12,"0");
        state.products.push({id,store_id:store.id,name:args.p_name,price_minor:args.p_price_minor,active:true,currency:"IQD"});
        state.barcodes.push({store_id:store.id,product_id:id,code:args.p_barcode,unit_type:"unit",units_per_scan:1});
        state.indexVersion=(state.indexVersion||0)+1;
        data=id;
      }
    }else if(name==="retail_register_product_v14"){
      const catalog=args.p_catalog;
      if(!state.advancedRpcEnabled)err=error("PGRST202","Function not found");
      else{
        const allCodes=[...(catalog.unit_barcode?[catalog.unit_barcode]:[]),...catalog.unit_alias_barcodes,...(catalog.carton?[catalog.carton.barcode,...(catalog.carton.alias_barcodes||[])]:[])];
        if(state.barcodes.some(x=>allCodes.includes(x.code)))err=error("23505","duplicate barcode");
        else{
          const id="cccccccc-cccc-4ccc-8ccc-"+String(++state.nextProduct).padStart(12,"0");
          state.products.push({id,store_id:store.id,name:catalog.name,price_minor:catalog.unit_sale_price_iqd??0,active:true,currency:"IQD",catalog_version:1});
          for(const code of [...(catalog.unit_barcode?[catalog.unit_barcode]:[]),...catalog.unit_alias_barcodes])
            state.barcodes.push({store_id:store.id,product_id:id,code,unit_type:"unit",units_per_scan:1});
          if(catalog.carton)for(const code of [catalog.carton.barcode,...(catalog.carton.alias_barcodes||[])])state.barcodes.push({store_id:store.id,product_id:id,code,unit_type:"carton",units_per_scan:catalog.carton.units_per_carton});
          state.advancedCatalogs.push({id,...catalog});
          state.indexVersion=(state.indexVersion||0)+1;
          data=id;
        }
      }
    }else if(name==="retail_product_snapshot_v15"||name==="retail_product_snapshot_v19"){
      if(!state.advancedRpcEnabled)err=error("PGRST202","Function not found");
      else{
        data=editorSnapshot(args.p_product_id);
        if(data&&name==="retail_product_snapshot_v19"){
          const p=state.products.find(x=>x.id===args.p_product_id);
          const stock=state.stock.find(x=>x.product_id===args.p_product_id);
          data={...data,base_unit:p?.base_unit||"unit",stock_quantity:Number(stock?.quantity||0)};
        }
      }
    }else if(name==="retail_product_history_v15"){
      if(!state.advancedRpcEnabled)err=error("PGRST202","Function not found");
      else data=state.audit.filter(x=>x.subject_id===args.p_product_id)
        .slice().reverse().slice(0,50).map(x=>structuredClone(x));
    }else if(name==="retail_update_product_v15"){
      if(!state.advancedRpcEnabled)err=error("PGRST202","Function not found");
      else{
        const p=state.products.find(x=>x.id===args.p_product_id);
        if(!p)err=error("22023","Product not found");
        else if((p.catalog_version||1)!==args.p_expected_version)
          err=error("40001","Stale catalog revision");
        else{
          const c=args.p_catalog,all=[...(c.unit_barcode?[c.unit_barcode]:[]),...c.unit_alias_barcodes,
            ...(c.carton?[c.carton.barcode,...c.carton.alias_barcodes]:[])];
          if(new Set(all).size!==all.length||state.barcodes.some(x=>x.product_id!==p.id&&all.includes(x.code)))
            err=error("23505","duplicate barcode");
          else{
            const old=editorSnapshot(p.id);
            p.name=c.name;p.price_minor=c.unit_sale_price_iqd??0;p.catalog_version=(p.catalog_version||1)+1;
            for(const barcode of state.barcodes.filter(x=>x.product_id===p.id))barcode.active=false;
            for(const code of [...(c.unit_barcode?[c.unit_barcode]:[]),...c.unit_alias_barcodes]){
              const existing=state.barcodes.find(x=>x.product_id===p.id&&x.code===code);
              if(existing){existing.active=true;existing.unit_type="unit";existing.units_per_scan=1;}
              else state.barcodes.push({store_id:store.id,product_id:p.id,code,unit_type:"unit",units_per_scan:1,active:true});
            }
            if(c.carton)for(const code of [c.carton.barcode,...c.carton.alias_barcodes]){
              const existing=state.barcodes.find(x=>x.product_id===p.id&&x.code===code);
              if(existing){existing.active=true;existing.unit_type="carton";existing.units_per_scan=c.carton.units_per_carton;}
              else state.barcodes.push({store_id:store.id,product_id:p.id,code,unit_type:"carton",units_per_scan:c.carton.units_per_carton,active:true});
            }
            const idx=state.advancedCatalogs.findIndex(x=>x.id===p.id);
            if(idx>=0)state.advancedCatalogs[idx]={id:p.id,...structuredClone(c)};
            else state.advancedCatalogs.push({id:p.id,...structuredClone(c)});
            state.indexVersion=(state.indexVersion||0)+1;
            data=editorSnapshot(p.id);
            state.audit.push({id:"eeeeeeee-eeee-4eee-8eee-"+String(state.audit.length+1).padStart(12,"0"),
              store_id:store.id,subject_id:p.id,actor_id:account.id,action:"product.update_v15",
              created_at:new Date().toISOString(),
              details:{before:old,after:structuredClone(data),old_version:old.version,new_version:data.version}});
          }
        }
      }
    }else if(name==="retail_resolve_barcode_v18"){
      if(!state.advancedRpcEnabled)err=error("PGRST202","Function not found");
      else{
        const clean=String(args.p_code||"").trim();
        if(!clean||clean.length>60||/[\s,،;]/.test(clean)){
          data={found:false,has_longer_prefix:false};
        }else{
          const idx=getIndex();
          const hasLonger=idx.prefixSet.has(clean);
          const b=idx.activeBarcodeByCode.get(clean);
          const p=b?idx.productById.get(b.product_id):null;
          const cat=b?idx.catalogById.get(b.product_id):null;
          const price=b?.unit_type==="carton"?cat?.carton?.sale_price_iqd:p?.price_minor;
          const validUnit=b?.unit_type==="unit"&&Number(b.units_per_scan)===1&&cat?.sale_mode!=="carton"&&Number.isSafeInteger(price);
          const validCarton=b?.unit_type==="carton"&&Number(b.units_per_scan)>=2&&cat?.carton&&Number(b.units_per_scan)===Number(cat.carton.units_per_carton)&&Number.isSafeInteger(price);
          if(b&&p&&p.active!==false&&p.currency==="IQD"&&(validUnit||validCarton)){
            const sibs=(idx.barcodesByProductId.get(p.id)||[]).filter(x=>x.active!==false).map(x=>({
              code:x.code,product_id:p.id,unit_type:x.unit_type,units_per_scan:x.units_per_scan,
              price_minor:x.unit_type==="carton"?(cat?.carton?.sale_price_iqd??null):p.price_minor
            }));
            data={
              found:true,code:b.code,product_id:p.id,product_name:p.name,
              sku:cat?.sku??p.sku??null,plu:cat?.plu??p.plu??null,
              unit_type:b.unit_type,units_per_scan:b.units_per_scan,base_unit:p.base_unit||"unit",
              is_scale:false,scale_grams:null,scale_weight_kg:null,scale_label:null,
              price_minor:price,unit_price_minor:cat?.sale_mode==="carton"?null:p.price_minor,
              carton_price_minor:cat?.carton?.sale_price_iqd??null,
              units_per_carton:cat?.carton?.units_per_carton??null,
              carton_name:cat?.carton?.name??null,
              currency:p.currency||"IQD",
              stock_quantity:idx.stockByProductId.get(p.id)?.quantity??0,
              has_longer_prefix:hasLonger,product_barcodes:sibs
            };
          }else{
            const scale=resolveScale27(clean,idx);
            if(scale){
              const scaleProd=scale.product;
              const sc=scale.catalog;
              data={
                found:true,code:clean,product_id:scaleProd.id,product_name:scaleProd.name,
                sku:sc?.sku??scaleProd.sku??null,plu:sc?.plu??scaleProd.plu??null,
                unit_type:"unit",units_per_scan:1,base_unit:scaleProd.base_unit||"kg",
                is_scale:true,scale_grams:scale.grams,scale_weight_kg:scale.weightKg,scale_label:scale.scaleLabel,
                price_minor:scale.priceMinor,unit_price_minor:scaleProd.price_minor,
                carton_price_minor:sc?.carton?.sale_price_iqd??null,
                units_per_carton:sc?.carton?.units_per_carton??null,
                carton_name:sc?.carton?.name??null,
                currency:scaleProd.currency||"IQD",
                stock_quantity:idx.stockByProductId.get(scaleProd.id)?.quantity??0,
                has_longer_prefix:hasLonger,
                product_barcodes:[{
                  code:clean,product_id:scaleProd.id,unit_type:"unit",
                  units_per_scan:1,price_minor:scale.priceMinor,
                  is_scale:true,scale_grams:scale.grams,scale_weight_kg:scale.weightKg,scale_label:scale.scaleLabel
                }]
              };
            }else{
              data={found:false,code:clean,has_longer_prefix:hasLonger};
            }
          }
        }
      }
    }else if(name==="retail_catalog_page_v18"){
      if(!state.advancedRpcEnabled)err=error("PGRST202","Function not found");
      else{
        const q=String(args.p_search??args.p_query??"").trim().toLowerCase();
        const stockFilter=String(args.p_stock_filter||"all");
        const off=Math.max(Number(args.p_offset)||0,0);
        const lim=Math.min(Math.max(Number(args.p_limit)||50,1),100);
        const idx=getIndex();
        let matched=state.products;
        if(q||stockFilter!=="all"){
          matched=state.products.filter(p=>{
            const qty=Number(idx.stockByProductId.get(p.id)?.quantity??0);
            if(stockFilter==="low"&&qty>5)return false;
            if(stockFilter==="out"&&qty>0)return false;
            if(!q)return true;
            if(String(p.name||"").toLowerCase().includes(q))return true;
            const cat=idx.catalogById.get(p.id);
            if(String(cat?.sku||p.sku||"").toLowerCase().includes(q))return true;
            if(String(cat?.plu||p.plu||"").toLowerCase().includes(q))return true;
            const codes=idx.barcodesByProductId.get(p.id)||[];
            return codes.some(b=>b.active!==false&&String(b.code||"").toLowerCase().includes(q));
          });
        }
        const total=matched.length;
        const items=matched.slice(off,off+lim).map(p=>{
          const cat=idx.catalogById.get(p.id);
          const activeCodes=(idx.barcodesByProductId.get(p.id)||[]).filter(b=>b.active!==false);
          const hasUnit=activeCodes.some(b=>b.unit_type==="unit");
          const hasCarton=Boolean(cat?.carton)||activeCodes.some(b=>b.unit_type==="carton");
          const saleMode=cat?.sale_mode||(hasCarton&&hasUnit?"both":(hasCarton?"carton":"unit"));
          return {
            id:p.id,name:p.name,sku:cat?.sku??p.sku??null,plu:cat?.plu??p.plu??null,
            price_minor:p.price_minor,sale_mode:saleMode,active:p.active!==false,
            currency:p.currency||"IQD",carton_name:cat?.carton?.name??null,
            units_per_carton:cat?.carton?.units_per_carton??null,
            carton_price_minor:cat?.carton?.sale_price_iqd??null,
            stock_quantity:idx.stockByProductId.get(p.id)?.quantity??0,
            barcodes:activeCodes.map(b=>b.code),
            barcode_details:activeCodes.map(b=>({
              code:b.code,unit_type:b.unit_type,units_per_scan:b.units_per_scan,
              price_minor:b.unit_type==="carton"?(cat?.carton?.sale_price_iqd??null):p.price_minor
            }))
          };
        });
        data={total_count:total,offset:off,limit:lim,items};
      }
    }else if(name==="retail_barcode_page_v18"){
      if(!state.advancedRpcEnabled)err=error("PGRST202","Function not found");
      else{
        const q=String(args.p_search??args.p_query??"").trim().toLowerCase();
        const off=Math.max(Number(args.p_offset)||0,0);
        const lim=Math.min(Math.max(Number(args.p_limit)||50,1),100);
        const idx=getIndex();
        let matched=idx.activeBarcodes;
        if(q){
          matched=idx.activeBarcodes.filter(b=>{
            if(String(b.code||"").toLowerCase().includes(q))return true;
            const p=idx.productById.get(b.product_id);
            if(String(p?.name||"").toLowerCase().includes(q))return true;
            const cat=idx.catalogById.get(b.product_id);
            if(String(cat?.sku||p?.sku||"").toLowerCase().includes(q))return true;
            if(String(cat?.plu||p?.plu||"").toLowerCase().includes(q))return true;
            return false;
          });
        }
        const total=matched.length;
        const items=matched.slice(off,off+lim).map(b=>{
          const p=idx.productById.get(b.product_id);
          const cat=idx.catalogById.get(b.product_id);
          const prodCodes=(idx.barcodesByProductId.get(b.product_id)||[]).filter(x=>x.active!==false&&x.unit_type===b.unit_type);
          const primaryCode=b.unit_type==="carton"?(cat?.carton?.barcode||prodCodes[0]?.code):(cat?.unit_barcode||p?.unit_primary_barcode||prodCodes[0]?.code);
          return {
            code:b.code,product_id:b.product_id,product_name:p?.name||"",
            unit_type:b.unit_type,units_per_scan:b.units_per_scan,
            price_minor:b.unit_type==="carton"?(cat?.carton?.sale_price_iqd??null):p?.price_minor,
            is_primary:b.code===primaryCode,active:true,product_active:p?.active!==false
          };
        });
        data={total_count:total,offset:off,limit:lim,items};
      }
    }else if(name==="retail_scan_catalog_v16"){
      data=state.barcodes.filter(b=>b.active!==false).map(b=>{
        const p=state.products.find(p=>p.id===b.product_id);
        const catalog=state.advancedCatalogs.find(x=>x.id===b.product_id);
        return {code:b.code,product_id:b.product_id,unit_type:b.unit_type,units_per_scan:b.units_per_scan,
          price_minor:b.unit_type==="carton"?catalog?.carton?.sale_price_iqd:p?.price_minor};
      }).filter(x=>Number.isSafeInteger(x.price_minor));
    }else if(name==="retail_shift_open"){
      if(state.sessions.some(x=>x.status==="open"))err=error("22023","Shift already open");
      else{
        state.sessions.unshift({id:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",store_id:store.id,cashier_id:account.id,
          opening_cash_minor:args.p_opening,opened_at:new Date().toISOString(),status:"open",variance_minor:null});
        data=state.sessions[0].id;
      }
    }else if(name==="retail_shift_summary"){
      const session=state.sessions.find(x=>x.id===args.p_session);
      const sales=state.sales.filter(x=>x.cash_session_id===args.p_session).reduce((n,x)=>n+x.total_minor,0);
      const movements=state.movements.filter(x=>x.session_id===args.p_session).reduce((n,x)=>n+(x.kind==="cash_in"?x.amount_minor:-x.amount_minor),0);
      data={opening:session.opening_cash_minor,sales,movements,expected:session.opening_cash_minor+sales+movements};
    }else if(name==="retail_cash_movement"){
      const row=state.movements.find(x=>x.request_id===args.p_request);
      if(row)data=row.id;
      else{
        const m={id:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",store_id:store.id,session_id:args.p_session,actor_id:account.id,
          request_id:args.p_request,kind:args.p_kind,amount_minor:args.p_amount,note:args.p_note,created_at:new Date().toISOString()};
        state.movements.push(m);data=m.id;
      }
    }else if(name==="retail_checkout_cash"){
      const shift=state.sessions.find(x=>x.status==="open");
      if(!shift)err=error("22023","No open cash shift");
      else{
        const idx=getIndex();
        const items=args.p_items||[];
        const total=items.reduce((sum,x)=>sum+(idx.productById.get(x.product_id)?.price_minor||0)*x.quantity,0);
        if(args.p_cash_received<total)err=error("22023","Cash amount is below total");
        else if(items.some(x=>(idx.stockByProductId.get(x.product_id)?.quantity||0)<x.quantity))err=error("22023","Insufficient stock");
        else{
          for(const x of items)idx.stockByProductId.get(x.product_id).quantity-=x.quantity;
          state.indexVersion=(state.indexVersion||0)+1;
          const id="ffffffff-ffff-4fff-8fff-"+String(++state.nextReceipt).padStart(12,"0");
          const sale={id,store_id:store.id,
            receipt_no:state.nextReceipt,total_minor:total,cash_received_minor:args.p_cash_received,
            change_due_minor:args.p_cash_received-total,cash_session_id:shift.id,cashier_id:account.id,status:"posted",
            created_at:new Date().toISOString()};
          state.sales.push(sale);
          for(const x of items){
            const p=idx.productById.get(x.product_id);
            state.saleItems.push({store_id:store.id,sale_id:id,product_id:x.product_id,quantity:x.quantity,
              unit_price_minor:p?.price_minor||0,package_type:"unit",units_per_package:1,base_units:x.quantity,
              product_name_snapshot:p?.name||""});
          }
          data=sale.id;
        }
      }
    }else if(name==="retail_checkout_packs_v16"||name==="retail_checkout_weight_v19"){
      const discount=Math.max(0,Number(args.p_discount||0));
      const previous=state.sales.find(x=>x.request_id===args.p_request);
      const payload=JSON.stringify({items:args.p_items,cash:args.p_cash_received,discount});
      const shift=state.sessions.find(x=>x.status==="open");
      if(previous){
        if(previous.request_payload!==payload)err=error("23505","request reused with changed payload");
        else data=previous.id;
      }else if(!shift)err=error("22023","No open cash shift");
      else{
        const idx=getIndex();
        let subtotal=0,invalid=false,needs=new Map();
        const saleLines=[];
        for(const line of args.p_items){
          const code=String(line.barcode);
          let b=idx.activeBarcodeByCode.get(code);
          let p=b?idx.productById.get(b.product_id):null;
          let catalog=b?idx.catalogById.get(b.product_id):null;
          let price=b?.unit_type==="carton"?catalog?.carton?.sale_price_iqd:p?.price_minor;
          let unitsPerScan=b?.units_per_scan;
          let unitType=b?.unit_type;
          let stockUnitsPerQty=unitsPerScan;
          let snapshotLabel=unitType==="carton"?" (کارتۆن)":" (دانە)";
          if(!b){
            const scale=resolveScale27(code,idx);
            if(scale){
              p=scale.product;
              price=scale.priceMinor;
              unitsPerScan=1;
              stockUnitsPerQty=scale.weightKg;
              unitType="unit";
              snapshotLabel=" ("+scale.scaleLabel+")";
              b={code,unit_type:"unit",units_per_scan:1,is_scale:true,scale_weight_kg:scale.weightKg};
            }
          }
          const expectedUnitsOk=b?.is_scale?(line.expected_units===1||line.expected_units===stockUnitsPerQty):line.expected_units===unitsPerScan;
          if(!b||!p||!Number.isSafeInteger(line.quantity)||line.quantity<1||
             line.expected_price_minor!==price||!expectedUnitsOk){
            invalid=true;break;
          }
          subtotal+=price*line.quantity;
          const lineBaseUnits=Number((line.quantity*stockUnitsPerQty).toFixed(3));
          needs.set(p.id,Number(((needs.get(p.id)||0)+lineBaseUnits).toFixed(3)));
          saleLines.push({product_id:p.id,quantity:line.quantity,unit_price_minor:price,
            package_type:unitType,package_barcode:code,units_per_package:unitsPerScan,
            base_units:lineBaseUnits,product_name_snapshot:p.name+snapshotLabel});
        }
        const total=subtotal-discount;
        if(invalid||discount<0||discount>subtotal)err=error("22023","Barcode price/pack changed or inactive");
        else if(args.p_cash_received<total)err=error("22023","Cash amount is below total");
        else if([...needs].some(([id,n])=>Number((idx.stockByProductId.get(id)?.quantity||0).toFixed(3))<n))
          err=error("22023","Insufficient stock");
        else{
          const id="ffffffff-ffff-4fff-8fff-"+String(++state.nextReceipt).padStart(12,"0");
          for(const [prodId,n] of [...needs.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){
            const stockRow=idx.stockByProductId.get(prodId);
            stockRow.quantity=Number((stockRow.quantity-n).toFixed(3));
            state.stockEvents.push({
              id:"eeeeeeee-0000-4000-8000-"+String(state.stockEvents.length+1).padStart(12,"0"),
              store_id:store.id,product_id:prodId,delta:-n,reason:"sale",sale_id:id
            });
          }
          state.indexVersion=(state.indexVersion||0)+1;
          state.sales.push({id,store_id:store.id,receipt_no:state.nextReceipt,
            total_minor:total,discount_minor:discount,cash_received_minor:args.p_cash_received,
            change_due_minor:args.p_cash_received-total,cash_session_id:shift.id,
            cashier_id:account.id,status:"posted",refunded:false,request_id:args.p_request,
            request_payload:payload,created_at:new Date().toISOString()});
          for(const entry of saleLines)state.saleItems.push({...entry,store_id:store.id,sale_id:id});
          data=id;
        }
      }
    }else if(name==="retail_return_sale_v19"){
      if(!args.p_store||!args.p_sale||!args.p_session||!args.p_request){
        err=error("22023","Invalid sale return request");
      }else{
        const existingByReq=state.sales.find(x=>x.store_id===store.id&&x.return_request_id===args.p_request);
        if(existingByReq){
          if(existingByReq.id!==args.p_sale||existingByReq.return_session_id!==args.p_session||existingByReq.return_actor_id!==account.id){
            err=error("23505","Return request reused with changed actor or payload");
          }else{
            data={
              sale_id:existingByReq.id,receipt_no:existingByReq.receipt_no,
              refunded_minor:existingByReq.total_minor,restored_units:existingByReq.restored_units||0,
              request_id:args.p_request,idempotent:true
            };
          }
        }else{
          const sale=state.sales.find(x=>x.id===args.p_sale&&x.store_id===store.id);
          const shift=state.sessions.find(x=>x.id===args.p_session&&x.status==="open");
          if(!sale||sale.status!=="posted"||sale.refunded){
            err=error("22023","پسووڵەکە پێشتر گەڕاوەتەوە یان نادروستە");
          }else if(state.movements.some(x=>x.store_id===store.id&&x.request_id===args.p_request)){
            err=error("23505","Return request reused with changed actor or payload");
          }else if(!shift){
            err=error("42501","Shift not open for user");
          }else{
            const shiftSales=state.sales.filter(x=>x.cash_session_id===shift.id&&x.status==="posted").reduce((n,x)=>n+x.total_minor,0);
            const shiftMoves=state.movements.filter(x=>x.session_id===shift.id).reduce((n,x)=>n+(x.kind==="cash_in"?x.amount_minor:-x.amount_minor),0);
            const drawerCash=shift.opening_cash_minor+shiftSales+shiftMoves;
            if(sale.total_minor>0&&drawerCash<sale.total_minor){
              err=error("22023","Insufficient cash in drawer");
            }else{
              const idx=getIndex();
              const items=state.saleItems.filter(x=>x.sale_id===sale.id);
              const restoreByProduct=new Map();
              for(const item of items){
                const baseUnits=Number(Number(item.base_units??(Number(item.quantity)*Number(item.units_per_package||1))).toFixed(3));
                restoreByProduct.set(item.product_id,Number(((restoreByProduct.get(item.product_id)||0)+baseUnits).toFixed(3)));
              }
              let restoredUnits=0;
              for(const [productId,baseUnits] of [...restoreByProduct.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){
                let row=idx.stockByProductId.get(productId);
                if(row)row.quantity=Number((row.quantity+baseUnits).toFixed(3));
                else{row={store_id:store.id,product_id:productId,quantity:baseUnits};state.stock.push(row);}
                state.stockEvents.push({
                  id:"eeeeeeee-1111-4000-8000-"+String(state.stockEvents.length+1).padStart(12,"0"),
                  store_id:store.id,product_id:productId,delta:baseUnits,reason:"sale_return",sale_id:sale.id
                });
                restoredUnits=Number((restoredUnits+baseUnits).toFixed(3));
              }
              sale.refunded=true;
              sale.return_request_id=args.p_request;
              sale.return_session_id=shift.id;
              sale.return_actor_id=account.id;
              sale.refunded_at=new Date().toISOString();
              sale.restored_units=restoredUnits;
              if(sale.total_minor>0){
                const movId="eeeeeeee-eeee-4eee-8eee-"+String(state.movements.length+1).padStart(12,"0");
                state.movements.push({
                  id:movId,
                  store_id:store.id,session_id:shift.id,actor_id:account.id,
                  request_id:args.p_request,kind:"cash_out",amount_minor:sale.total_minor,
                  note:"گەڕاندنەوەی پسووڵە #"+String(sale.receipt_no).padStart(6,"0"),
                  created_at:new Date().toISOString()
                });
                state.audit.push({
                  id:"aaaaaaaa-aaaa-4aaa-8aaa-"+String(state.audit.length+1).padStart(12,"0"),
                  store_id:store.id,subject_id:movId,actor_id:account.id,
                  action:"cash.movement",created_at:new Date().toISOString(),
                  details:{session:shift.id,kind:"cash_out",amount_iqd:sale.total_minor}
                });
              }
              state.audit.push({
                id:"aaaaaaaa-aaaa-4aaa-8aaa-"+String(state.audit.length+1).padStart(12,"0"),
                store_id:store.id,subject_id:sale.id,actor_id:account.id,
                action:"sale.return_v19",created_at:new Date().toISOString(),
                details:{receipt_no:sale.receipt_no,refunded_minor:sale.total_minor,restored_units:restoredUnits,request_id:args.p_request,session_id:shift.id}
              });
              state.indexVersion=(state.indexVersion||0)+1;
              data={sale_id:sale.id,receipt_no:sale.receipt_no,refunded_minor:sale.total_minor,restored_units:restoredUnits,request_id:args.p_request,idempotent:false};
            }
          }
        }
      }
    }else if(name==="retail_shift_close"){
      const session=state.sessions.find(s=>s.id===args.p_session&&s.status==="open");
      if(!session)err=error("22023","Shift not open");
      else{
        const sales=state.sales.filter(x=>x.cash_session_id===session.id).reduce((n,x)=>n+x.total_minor,0);
        const moves=state.movements.filter(x=>x.session_id===session.id).reduce((n,x)=>n+(x.kind==="cash_in"?x.amount_minor:-x.amount_minor),0);
        const expected=session.opening_cash_minor+sales+moves;
        session.status="closed";session.variance_minor=args.p_counted-expected;
        data={opening:session.opening_cash_minor,sales,movements:moves,expected,counted:args.p_counted,variance:session.variance_minor};
      }
    }else if(name==="retail_receive_mixed_v171"){
      const prior=state.stockReceipts.find(x=>x.request===args.p_request);
      const fingerprint=JSON.stringify({lines:args.p_lines,reason:args.p_reason});
      if(prior){
        if(prior.fingerprint!==fingerprint)err=error("23505","Mixed request reused");
        else data=prior.total;
      }else{
        const idx=getIndex();
        const lines=args.p_lines,found=[];
        let total=0,productId=null,invalid=!Array.isArray(lines)||lines.length!==2;
        if(!invalid)for(const line of lines){
          const b=idx.activeBarcodeByCode.get(line.barcode);
          const prod=b?idx.productById.get(b.product_id):null;
          const carton=prod?idx.catalogById.get(prod.id)?.carton:null;
          const valid=!!(b&&prod&&prod.active!==false&&Number.isSafeInteger(line.packages)&&line.packages>=1&&
            Number.isSafeInteger(line.expected_units)&&line.expected_units===b.units_per_scan&&
            ((b.unit_type==="unit"&&b.units_per_scan===1)||
             (b.unit_type==="carton"&&b.units_per_scan>=2&&carton?.units_per_carton===b.units_per_scan)));
          if(!valid||(productId&&productId!==prod.id)){invalid=true;break;}
          productId=prod.id;found.push(b.unit_type);total+=line.packages*b.units_per_scan;
        }
        if(invalid||!found.includes("unit")||!found.includes("carton")||total>1000000||
           !["opening","purchase"].includes(args.p_reason))
          err=error("22023","Invalid mixed stock receipt");
        else{
          let row=idx.stockByProductId.get(productId);
          if(row){row.quantity+=total;data=row.quantity;}
          else{row={store_id:store.id,product_id:productId,quantity:total};state.stock.push(row);data=row.quantity;}
          state.indexVersion=(state.indexVersion||0)+1;
          state.stockReceipts.push({request:args.p_request,lines,base_units:total,total:data,
            reason:args.p_reason,fingerprint});
          state.audit.push({id:"aaaaaaaa-aaaa-4aaa-8aaa-"+String(state.audit.length+1).padStart(12,"0"),
            store_id:store.id,subject_id:productId,actor_id:account.id,
            action:"stock.receive_mixed_v171",created_at:new Date().toISOString(),
            details:{lines,base_units:total,total_stock:data}});
        }
      }
    }else if(name==="retail_receive_packs_v17"){
      const idx=getIndex();
      const previous=state.stockReceipts.find(x=>x.request===args.p_request);
      const b=idx.activeBarcodeByCode.get(args.p_barcode);
      const item=b?idx.productById.get(b.product_id):null;
      const carton=b?idx.catalogById.get(b.product_id)?.carton:null;
      const valid=b&&item&&b.units_per_scan===args.p_expected_units&&
        (b.unit_type==="unit"&&b.units_per_scan===1||
         b.unit_type==="carton"&&b.units_per_scan>=2&&carton?.units_per_carton===b.units_per_scan);
      const change=args.p_packages*args.p_expected_units;
      if(!valid||!Number.isSafeInteger(args.p_packages)||args.p_packages<1||change>1000000||
         !["opening","purchase"].includes(args.p_reason))
        err=error("22023","Inactive or changed pack barcode");
      else if(previous){
        if(previous.code!==args.p_barcode||previous.packages!==args.p_packages||
            previous.reason!==args.p_reason||previous.units!==args.p_expected_units)
          err=error("23505","Stock receipt request reused");
        else data=previous.total;
      }else{
        let row=idx.stockByProductId.get(item.id);
        if(row){row.quantity+=change;data=row.quantity;}
        else{row={store_id:store.id,product_id:item.id,quantity:change};state.stock.push(row);data=row.quantity;}
        state.indexVersion=(state.indexVersion||0)+1;
        state.stockReceipts.push({request:args.p_request,code:args.p_barcode,packages:args.p_packages,
          units:args.p_expected_units,reason:args.p_reason,base_units:change,total:data});
        state.audit.push({id:"aaaaaaaa-aaaa-4aaa-8aaa-"+String(state.audit.length+1).padStart(12,"0"),
          store_id:store.id,subject_id:item.id,actor_id:account.id,
          action:"stock.receive_packs_v17",created_at:new Date().toISOString(),
          details:{barcode:args.p_barcode,package_type:b.unit_type,base_units:change,total_stock:data}});
      }
    }else if(name==="retail_receive_stock"){
      const idx=getIndex();
      const row=idx.stockByProductId.get(args.p_product);
      if(row)row.quantity+=args.p_quantity;
      else state.stock.push({store_id:store.id,product_id:args.p_product,quantity:args.p_quantity});
      state.indexVersion=(state.indexVersion||0)+1;
      data=true;
    }else if(name==="retail_assign_staff"){
      state.memberships.push({store_id:store.id,user_id:args.p_user,role:args.p_role,active:args.p_active,created_at:new Date().toISOString()});
      data=true;
    }else err=error("42883","Unknown fixture RPC "+name);
    return Promise.resolve({data,error:err});
  }
  window.__retailQA=state;
  window.supabase={createClient:()=>({
    auth:{
      getUser:async()=>({data:{user:account},error:null}),
      signInWithPassword:async()=>({data:{user:account},error:null}),
      signUp:async()=>({data:{user:account,session:null},error:null}),
      signOut:async()=>({error:null})
    },from,rpc
  })};
})();
