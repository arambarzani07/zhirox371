import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Opt-in V24 test only: when enabled, both Vite and the PostgreSQL pilot
// listen on 127.0.0.1. Never expose pilot credentials or API to public/LAN.
export default defineConfig(({mode})=>{
  const env=loadEnv(mode,process.cwd(),'VITE_');
  // A production Vite build is still a React DEMO, never a certified live POS.
  // Refuse any explicit official-release claim until the backend, roles, shifts,
  // printing, hardware and power-failure acceptance are implemented and tested.
  if(mode==='production'&&(env.VITE_ZHIROX_RELEASE_MODE==='official'||
     process.env.ZHIROX_RELEASE_MODE==='official')){
    throw Error('ZHIROX NO-GO: this React build is DEMO; an official cashier release is blocked pending physical and financial acceptance');
  }
  const pilot=env.VITE_ENABLE_LOCAL_PILOT==='true';
  const localCashier=pilot&&env.VITE_V32_LOCAL_CASHIER==='true'&&mode!=='production';
  const testMarket=pilot&&env.VITE_V81_TEST_MARKET==='true'&&mode!=='production';
  return {
    plugins:[react()],
    server:{
      host:pilot?'127.0.0.1':'0.0.0.0',
      port:3000,
      strictPort:true,
      ...(pilot?{proxy:{'/api/local':{
        target:localCashier?'http://127.0.0.1:3308':'http://127.0.0.1:3307',
        ...(testMarket?{target:'http://127.0.0.1:3311'}:{}),
        changeOrigin:false,
        secure:false
      }}}:{})
    }
  };
});
