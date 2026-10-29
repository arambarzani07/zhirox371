/* Read-only server customer search. A fresh exact lookup precedes explicit selection. */
(() => {
 'use strict';
 function create({context,accept,changed=()=>{},api=window.RetailCustomerDirectory}){
  let token=0;
  const state={rows:[],offset:0,total:0,filters:null,ready:false,loading:false,selecting:false,error:'',selected:''};
  const same=(a,b)=>!!a&&!!b&&b.ready&&!b.busy&&['db','store','actor','epoch','revision','selection'].every(k=>a[k]===b[k]);
  function reset(){++token;Object.assign(state,{rows:[],offset:0,total:0,filters:null,ready:false,loading:false,selecting:false,error:'',selected:''});changed(state);}
  async function search(options={},offset=0){
   const before={...context()};if(!before?.ready||before.busy)return;
   const request=++token,current=()=>request===token&&same(before,context());
   Object.assign(state,{rows:[],total:0,ready:false,loading:true,selecting:false,error:'',selected:''});changed(state);
   try{
    const filters=offset===0?api.criteria(options):state.filters;if(!filters)throw Error('سەرەتا گەڕان بکە');
    state.filters=filters;state.offset=offset;
    let result=await api.read({db:before.db,store:before.store,filters,offset});if(!current())return;
    if(offset>0&&!result.rows.length&&result.total<=offset){offset=result.total?Math.floor((result.total-1)/api.size)*api.size:0;result=await api.read({db:before.db,store:before.store,filters,offset});if(!current())return;}
    Object.assign(state,{rows:result.rows,total:result.total,offset,ready:true});
   }catch(error){if(current())Object.assign(state,{rows:[],total:0,ready:false,error:error.message||String(error)});}
   finally{if(request===token){state.loading=false;if(!same(before,context())){state.rows=[];state.total=0;state.ready=false;}changed(state);}}
  }
  async function pick(id){
   const before={...context()};if(!before?.ready||before.busy||state.loading||state.selecting||!state.ready||!state.rows.some(c=>c.id===id))return;
   const request=++token,current=()=>request===token&&same(before,context());
   state.selecting=true;state.error='';changed(state);
   try{
    const customer=await api.one({db:before.db,store:before.store,id});if(!current())return;
    accept(customer);state.selected=customer.name;state.rows=[];state.total=0;state.ready=false;
   }catch(error){if(current()){state.error=error.message||String(error);state.rows=[];state.total=0;state.ready=false;}}
   finally{if(request===token){state.selecting=false;if(!same(before,context())&&!state.selected){state.rows=[];state.total=0;state.ready=false;}changed(state);}}
  }
  return Object.freeze({state,search,pick,reset});
 }
 window.RetailCustomerPicker=Object.freeze({create});
})();
