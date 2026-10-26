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
    sessions:[],movements:[],sales:[],saleItems:[],memberships:[],audit:[],
    called:[],stockReceipts:[],nextProduct:0,nextReceipt:0,forceRpcError:null,advancedRpcEnabled:true,advancedCatalogs:[]
  };
  const error=(code,message)=>({code,message});
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
          data=id;
        }
      }
    }else if(name==="retail_product_snapshot_v15"){
      if(!state.advancedRpcEnabled)err=error("PGRST202","Function not found");
      else data=editorSnapshot(args.p_product_id);
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
            data=editorSnapshot(p.id);
            state.audit.push({id:"eeeeeeee-eeee-4eee-8eee-"+String(state.audit.length+1).padStart(12,"0"),
              store_id:store.id,subject_id:p.id,actor_id:account.id,action:"product.update_v15",
              created_at:new Date().toISOString(),
              details:{before:old,after:structuredClone(data),old_version:old.version,new_version:data.version}});
          }
        }
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
        const items=args.p_items||[];
        const total=items.reduce((sum,x)=>sum+(state.products.find(p=>p.id===x.product_id)?.price_minor||0)*x.quantity,0);
        if(args.p_cash_received<total)err=error("22023","Cash amount is below total");
        else if(items.some(x=>(state.stock.find(s=>s.product_id===x.product_id)?.quantity||0)<x.quantity))err=error("22023","Insufficient stock");
        else{
          for(const x of items)state.stock.find(s=>s.product_id===x.product_id).quantity-=x.quantity;
          const sale={id:"ffffffff-ffff-4fff-8fff-"+String(++state.nextReceipt).padStart(12,"0"),store_id:store.id,
            receipt_no:state.nextReceipt,total_minor:total,cash_received_minor:args.p_cash_received,
            change_due_minor:args.p_cash_received-total,cash_session_id:shift.id,cashier_id:account.id,status:"posted",
            created_at:new Date().toISOString()};
          state.sales.push(sale);data=sale.id;
        }
      }
    }else if(name==="retail_checkout_packs_v16"){
      const previous=state.sales.find(x=>x.request_id===args.p_request);
      const payload=JSON.stringify({items:args.p_items,cash:args.p_cash_received});
      const shift=state.sessions.find(x=>x.status==="open");
      if(previous){
        if(previous.request_payload!==payload)err=error("23505","request reused with changed payload");
        else data=previous.id;
      }else if(!shift)err=error("22023","No open cash shift");
      else{
        let total=0,invalid=false,needs=new Map();
        const saleLines=[];
        for(const line of args.p_items){
          const code=String(line.barcode);
          const b=state.barcodes.find(b=>b.code===code&&b.active!==false);
          const p=state.products.find(p=>p.id===b?.product_id);
          const catalog=state.advancedCatalogs.find(x=>x.id===b?.product_id);
          const price=b?.unit_type==="carton"?catalog?.carton?.sale_price_iqd:p?.price_minor;
          if(!b||!p||!Number.isSafeInteger(line.quantity)||line.quantity<1||
             line.expected_price_minor!==price||line.expected_units!==b.units_per_scan){
            invalid=true;break;
          }
          total+=price*line.quantity;
          needs.set(p.id,(needs.get(p.id)||0)+line.quantity*b.units_per_scan);
          saleLines.push({product_id:p.id,quantity:line.quantity,unit_price_minor:price,
            package_type:b.unit_type,package_barcode:b.code,units_per_package:b.units_per_scan,
            base_units:line.quantity*b.units_per_scan,product_name_snapshot:p.name});
        }
        if(invalid)err=error("22023","Barcode price/pack changed or inactive");
        else if(args.p_cash_received<total)err=error("22023","Cash amount is below total");
        else if([...needs].some(([id,n])=>(state.stock.find(s=>s.product_id===id)?.quantity||0)<n))
          err=error("22023","Insufficient stock");
        else{
          for(const [id,n] of needs)state.stock.find(s=>s.product_id===id).quantity-=n;
          const id="ffffffff-ffff-4fff-8fff-"+String(++state.nextReceipt).padStart(12,"0");
          state.sales.push({id,store_id:store.id,receipt_no:state.nextReceipt,
            total_minor:total,cash_received_minor:args.p_cash_received,
            change_due_minor:args.p_cash_received-total,cash_session_id:shift.id,
            cashier_id:account.id,status:"posted",request_id:args.p_request,
            request_payload:payload,created_at:new Date().toISOString()});
          for(const entry of saleLines)state.saleItems.push({...entry,store_id:store.id,sale_id:id});
          data=id;
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
        const lines=args.p_lines,found=[];
        let total=0,productId=null,invalid=!Array.isArray(lines)||lines.length!==2;
        if(!invalid)for(const line of lines){
          const b=state.barcodes.find(x=>x.code===line.barcode&&x.active!==false);
          const prod=state.products.find(x=>x.id===b?.product_id&&x.active!==false);
          const carton=state.advancedCatalogs.find(x=>x.id===prod?.id)?.carton;
          const valid=!!(b&&prod&&Number.isSafeInteger(line.packages)&&line.packages>=1&&
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
          const row=state.stock.find(x=>x.product_id===productId);
          if(row)row.quantity+=total;
          else state.stock.push({store_id:store.id,product_id:productId,quantity:total});
          data=state.stock.find(x=>x.product_id===productId).quantity;
          state.stockReceipts.push({request:args.p_request,lines,base_units:total,total:data,
            reason:args.p_reason,fingerprint});
          state.audit.push({id:"aaaaaaaa-aaaa-4aaa-8aaa-"+String(state.audit.length+1).padStart(12,"0"),
            store_id:store.id,subject_id:productId,actor_id:account.id,
            action:"stock.receive_mixed_v171",created_at:new Date().toISOString(),
            details:{lines,base_units:total,total_stock:data}});
        }
      }
    }else if(name==="retail_receive_packs_v17"){
      const previous=state.stockReceipts.find(x=>x.request===args.p_request);
      const b=state.barcodes.find(x=>x.code===args.p_barcode&&x.active!==false);
      const item=state.products.find(x=>x.id===b?.product_id);
      const carton=state.advancedCatalogs.find(x=>x.id===b?.product_id)?.carton;
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
        const row=state.stock.find(x=>x.product_id===item.id);
        if(row)row.quantity+=change;
        else state.stock.push({store_id:store.id,product_id:item.id,quantity:change});
        data=state.stock.find(x=>x.product_id===item.id).quantity;
        state.stockReceipts.push({request:args.p_request,code:args.p_barcode,packages:args.p_packages,
          units:args.p_expected_units,reason:args.p_reason,base_units:change,total:data});
        state.audit.push({id:"aaaaaaaa-aaaa-4aaa-8aaa-"+String(state.audit.length+1).padStart(12,"0"),
          store_id:store.id,subject_id:item.id,actor_id:account.id,
          action:"stock.receive_packs_v17",created_at:new Date().toISOString(),
          details:{barcode:args.p_barcode,package_type:b.unit_type,base_units:change,total_stock:data}});
      }
    }else if(name==="retail_receive_stock"){
      const row=state.stock.find(x=>x.product_id===args.p_product);
      if(row)row.quantity+=args.p_quantity;
      else state.stock.push({store_id:store.id,product_id:args.p_product,quantity:args.p_quantity});
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
