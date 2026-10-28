import { hashLocalPassword, verifyLocalPassword } from "./local-password.mjs";
import { makeLocalSessionCodec } from "./local-session.mjs";

// Isolated local authentication: no internet, no Supabase Auth.
// Service must stay loopback-only until TLS, provisioning and device enrollment exist.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createLocalAuthV3({ pool, secret, clock = () => Date.now() }) {
  if (typeof pool?.connect !== "function" || typeof pool?.query !== "function")
    throw new Error("local PostgreSQL pool is required");
  const codec = makeLocalSessionCodec(secret, clock);
  return {
    async login({ store_id, username, password } = {}) {
      if (!UUID.test(store_id || "") || typeof username !== "string" ||
          username.length < 3 || username.length > 100 ||
          typeof password !== "string" || Buffer.byteLength(password) > 1024)
        return null;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query(
          "SELECT id,store_id,role,enabled,password_hash,session_version,failed_attempts,locked_until FROM zhirox_local.local_users WHERE store_id=$1 AND username=$2 FOR UPDATE",
          [store_id, username]
        );
        const user = result.rows[0] || null;
        // Spend password-hashing effort even for unknown names to avoid an easy user oracle.
        const matches = user ? await verifyLocalPassword(password, user.password_hash) :
          (await hashLocalPassword(password.length >= 12 ? password : "dummy-password-12345"), false);
        const locked = user?.locked_until && new Date(user.locked_until).getTime() > clock();
        if (!user || !user.enabled || locked || !matches) {
          if (user && user.enabled && !locked) {
            await client.query(
              "UPDATE zhirox_local.local_users SET failed_attempts=failed_attempts+1, locked_until=CASE WHEN failed_attempts+1>=5 THEN clock_timestamp()+interval '15 minutes' ELSE locked_until END WHERE store_id=$1 AND id=$2",
              [store_id, user.id]
            );
          }
          await client.query("COMMIT");
          return null;
        }
        await client.query(
          "UPDATE zhirox_local.local_users SET failed_attempts=0,locked_until=NULL WHERE store_id=$1 AND id=$2",
          [store_id, user.id]
        );
        await client.query("COMMIT");
        return {
          token: codec.issue({ user_id: user.id, store_id: user.store_id,
            role: user.role, session_version: user.session_version }),
          role: user.role, expires_in_seconds: 900
        };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    async authorize(bearerToken, allowedRoles = ["owner", "manager", "cashier"]) {
      const principal = codec.verify(bearerToken, undefined, allowedRoles);
      if (!principal) return null;
      const result = await pool.query(
        "SELECT role,enabled,session_version,locked_until FROM zhirox_local.local_users WHERE store_id=$1 AND id=$2",
        [principal.store_id, principal.user_id]
      );
      const account = result.rows[0];
      if (!account || !account.enabled || account.role !== principal.role ||
          account.session_version !== principal.sv ||
          (account.locked_until && new Date(account.locked_until).getTime() > clock()))
        return null;
      return principal;
    }
  };
}
