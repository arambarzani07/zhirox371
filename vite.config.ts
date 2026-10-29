import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Opt-in V24 test only: when enabled, both Vite and the PostgreSQL pilot
// listen on 127.0.0.1. Never expose pilot credentials or API to public/LAN.
export default defineConfig(({mode})=>{
  const env=loadEnv(mode,process.cwd(),'VITE_');
  const pilot=env.VITE_ENABLE_LOCAL_PILOT==='true';
  return {
    plugins:[react()],
    server:{
      host:pilot?'127.0.0.1':'0.0.0.0',
      port:3000,
      strictPort:true,
      ...(pilot?{proxy:{'/api/local':{
        target:'http://127.0.0.1:3305',
        changeOrigin:false,
        secure:false
      }}}:{})
    }
  };
});
