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
    sessions:[],movements:[],sales:[],memberships:[],audit:[],
    called:[],nextProduct:0,nextReceipt:0,forceRpcError:null
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
    if(name==="retail_sale_items")return [];
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
