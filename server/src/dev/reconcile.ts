// server/src/dev/reconcile.ts
import { pool, tx } from "../db.js";
import { env } from "../env.js";

async function main() {
  const timeoutSeconds = env.PENDING_CHARGE_TIMEOUT_SECONDS ?? 180;
  const cutoffSql = `now() - ($1::int * interval '1 second')`;

  const stale = await pool.query(
    `
    SELECT id, session_id, amount_tinybars
    FROM charges
    WHERE status = 'pending'
      AND charged_at < ${cutoffSql}
    ORDER BY charged_at ASC
    LIMIT 500
    `,
    [timeoutSeconds]
  );

  if (stale.rowCount === 0) {
    console.log("reconcile: no stale pending charges found");
    return;
  }

  console.log(`reconcile: found ${stale.rowCount} stale pending charges`);

  let fixed = 0;

  for (const row of stale.rows) {
    const chargeId = row.id as string;
    const sessionId = row.session_id as string;
    const amountTinybars = row.amount_tinybars as string; // int8 comes back as string

    await tx(async (c) => {
      // Mark failed only if still pending
      const upd = await c.query(
        `
        UPDATE charges
        SET status='failed',
            error = COALESCE(error, 'reconciled: pending timeout'),
            updated_at = now()
        WHERE id=$1 AND status='pending'
        RETURNING id
        `,
        [chargeId]
      );

      if (upd.rowCount === 0) return;

      // Unreserve amount from session total
      await c.query(
        `
        UPDATE payment_sessions
        SET total_charged_tinybars = GREATEST(0, total_charged_tinybars - $1::bigint)
        WHERE id=$2
        `,
        [amountTinybars, sessionId]
      );

      fixed += 1;
    });
  }

  console.log(`reconcile: fixed ${fixed} charges`);
}

main()
  .catch((e) => {
    console.error("reconcile failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
