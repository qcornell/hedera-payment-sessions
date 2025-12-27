// server/src/db.ts
import pg from "pg";
import { env } from "./env.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

// Optional but helpful: log pool errors
pool.on("error", (err) => {
  console.error("PG pool error:", err);
});

export async function tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let released = false;

  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    // Always try rollback
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      // ignore rollback error
    }

    // Destroy this client so we never reuse a poisoned connection
    client.release(true);
    released = true;

    // Log the REAL error (this is what you need to see)
    console.error("TX failed:", e);

    throw e;
  } finally {
    if (!released) client.release();
  }
}
