import {pilotEnabled} from "./localPilotV24";

// Explicit TEST-ONLY dual opt-in. Production builds always use the DEMO
// application and never expose a local PostgreSQL cashier as "live".
export const localCashierV32=pilotEnabled&&import.meta.env.DEV&&
  import.meta.env.VITE_V32_LOCAL_CASHIER==="true";
