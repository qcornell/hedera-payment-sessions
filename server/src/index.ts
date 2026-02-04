// server/src/index.ts
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

import { env } from "./env.js";
import { pool, tx } from "./db.js";
import { getHbarAllowanceTinybars } from "./mirror.js";
import {
  getClient,
  getSpenderBalanceTinybars,
  transferFromAllowanceToSpender
} from "./hedera.js";
import {
  hbarToTinybars,
  jsonError,
  sha256Hex,
  timeBucket,
  tinybarsToHbarString
} from "./util.js";
import { hederaX402 } from "./x402.js";

type SessionRow = {
  id: string;
  user_account_id: string;
  spender_account_id: string;
  product_name: string | null;
  allowance_cap_tinybars: string; // int8 => string
  total_charged_tinybars: string; // int8 => string
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_charged_at: string | null;
  created_tx_id: string | null;
};

function apiSession(s: SessionRow) {
  return {
    id: s.id,
    userAccountId: s.user_account_id,
    spenderAccountId: s.spender_account_id,
    productName: s.product_name,
    capTinybars: s.allowance_cap_tinybars,
    totalChargedTinybars: s.total_charged_tinybars,
    createdAt: s.created_at,
    expiresAt: s.expires_at,
    revokedAt: s.revoked_at,
    lastChargedAt: s.last_charged_at
  };
}

async function getSessionById(sessionId: string) {
  const r = await pool.query<SessionRow>(
    `SELECT * FROM payment_sessions WHERE id=$1`,
    [sessionId]
  );
  return r.rows[0] ?? null;
}

async function getActiveSessionForUser(
  userAccountId: string,
  spenderAccountId: string
) {
  const r = await pool.query<SessionRow>(
    `
    SELECT * FROM payment_sessions
    WHERE user_account_id=$1
      AND spender_account_id=$2
      AND revoked_at IS NULL
    LIMIT 1
    `,
    [userAccountId, spenderAccountId]
  );
  return r.rows[0] ?? null;
}

async function activateSession(params: {
  userAccountId: string;
  spenderAccountId: string;
  expiryHours: number;
  productName?: string;
}) {
  const { userAccountId, spenderAccountId, expiryHours, productName } = params;

  const allowanceCap = await getHbarAllowanceTinybars(
    userAccountId,
    spenderAccountId
  );
  if (allowanceCap <= 0n) {
    throw new Error(
      "No on-chain allowance found for this user->spender pair (or amount is 0). Approve allowance in wallet first."
    );
  }

  const existing = await getActiveSessionForUser(userAccountId, spenderAccountId);

  if (existing) {
    const upd = await pool.query<SessionRow>(
      `
      UPDATE payment_sessions
      SET expires_at = now() + ($1::int * interval '1 hour'),
          product_name = COALESCE($2, product_name),
          allowance_cap_tinybars = $3::bigint
      WHERE id=$4
      RETURNING *
      `,
      [expiryHours, productName ?? null, allowanceCap.toString(), existing.id]
    );
    return { session: upd.rows[0], existed: true };
  }

  const id = uuidv4();
  const ins = await pool.query<SessionRow>(
    `
    INSERT INTO payment_sessions (
      id, user_account_id, spender_account_id, product_name,
      allowance_cap_tinybars, total_charged_tinybars,
      expires_at
    )
    VALUES ($1,$2,$3,$4,$5,0, now() + ($6::int * interval '1 hour'))
    RETURNING *
    `,
    [
      id,
      userAccountId,
      spenderAccountId,
      productName ?? null,
      allowanceCap.toString(),
      expiryHours
    ]
  );

  return { session: ins.rows[0], existed: false };
}

/**
 * We throw a typed "PENDING" error so routes can map it to 409 instead of 500/400.
 */
function pendingError(message = "Charge pending; retry shortly") {
  const err: any = new Error(message);
  err.code = "PENDING";
  return err;
}

type ReserveResult =
  | { kind: "alreadyDone"; txId: string }
  | { kind: "pending" }
  | { kind: "reserved" };

async function chargeSession(args: {
  sessionId: string;
  amountTinybars: bigint;
  path: string;
}) {
  const { sessionId, amountTinybars, path } = args;

  const bucket = timeBucket(env.IDEMPOTENCY_BUCKET_SECONDS);

  // ✅ IMPORTANT: include amount to avoid collisions
  const idempotencyKey = sha256Hex(
    `${sessionId}:${path}:${amountTinybars.toString()}:${bucket}`
  );

  // 1) Reserve in DB first (idempotent)
  const reserved: ReserveResult = await tx(async (c) => {
    // Insert if missing (safe under race)
    await c.query(
      `
      INSERT INTO charges (id, session_id, idempotency_key, amount_tinybars, request_path, status)
      VALUES ($1,$2,$3,$4,$5,'pending')
      ON CONFLICT (idempotency_key) DO NOTHING
      `,
      [uuidv4(), sessionId, idempotencyKey, amountTinybars.toString(), path]
    );

    // Load current state
    const existing = await c.query(
      `SELECT status, tx_id FROM charges WHERE idempotency_key=$1 LIMIT 1`,
      [idempotencyKey]
    );
    const row = existing.rows[0];

    if (!row) {
      throw new Error("Charge record missing after insert (unexpected)");
    }

    if (row.status === "success") {
      return { kind: "alreadyDone", txId: row.tx_id as string };
    }

    if (row.status === "pending") {
      // Someone else is already processing this bucket+amount+path
      return { kind: "pending" };
    }

    // If failed, allow retry: flip back to pending
    await c.query(
      `
      UPDATE charges
      SET status='pending', error=NULL, tx_id=NULL, updated_at=now()
      WHERE idempotency_key=$1 AND status='failed'
      `,
      [idempotencyKey]
    );

    // Now reserve in the session totals (cap guardrails)
    const upd = await c.query<SessionRow>(
      `
      UPDATE payment_sessions
      SET total_charged_tinybars = total_charged_tinybars + $1::bigint,
          last_charged_at = now()
      WHERE id=$2
        AND revoked_at IS NULL
        AND expires_at > now()
        AND total_charged_tinybars + $1::bigint <= allowance_cap_tinybars
      RETURNING *
      `,
      [amountTinybars.toString(), sessionId]
    );

    if (upd.rowCount === 0) {
      // Mark charge failed so you can see why in history
      await c.query(
        `
        UPDATE charges
        SET status='failed', error=$2, updated_at=now()
        WHERE idempotency_key=$1 AND status='pending'
        `,
        [idempotencyKey, "Session expired/revoked or cap would be exceeded"]
      );
      throw new Error("Session expired/revoked or cap would be exceeded");
    }

    return { kind: "reserved" };
  });

  if (reserved.kind === "pending") {
    throw pendingError();
  }

  if (reserved.kind === "alreadyDone") {
    return { txId: reserved.txId, cached: true };
  }

  // 2) Execute Hedera transfer (spender pays fees)
  const client = getClient();

  const spenderBal = await getSpenderBalanceTinybars(client);
  if (spenderBal < env.MIN_SPENDER_BALANCE_TINYBARS) {
    await tx(async (c) => {
      await c.query(
        `UPDATE charges SET status='failed', error=$2, updated_at=now()
         WHERE idempotency_key=$1 AND status='pending'`,
        [idempotencyKey, "Spender account needs more HBAR to pay fees"]
      );
      await c.query(
        `UPDATE payment_sessions
         SET total_charged_tinybars = GREATEST(0, total_charged_tinybars - $1::bigint)
         WHERE id=$2`,
        [amountTinybars.toString(), sessionId]
      );
    });
    throw new Error("Spender account needs more HBAR to pay fees");
  }

  const session = await getSessionById(sessionId);
  if (!session) throw new Error("Session not found");

  // Extra safety: verify allowance still exists on-chain
  const allowanceCap = await getHbarAllowanceTinybars(
    session.user_account_id,
    session.spender_account_id
  );
  if (allowanceCap <= 0n) {
    await tx(async (c) => {
      await c.query(
        `UPDATE charges SET status='failed', error=$2, updated_at=now()
         WHERE idempotency_key=$1 AND status='pending'`,
        [idempotencyKey, "On-chain allowance missing or revoked"]
      );
      await c.query(
        `UPDATE payment_sessions
         SET total_charged_tinybars = GREATEST(0, total_charged_tinybars - $1::bigint)
         WHERE id=$2`,
        [amountTinybars.toString(), sessionId]
      );
    });
    throw new Error("On-chain allowance missing or revoked");
  }

  try {
    const txId = await transferFromAllowanceToSpender(
      client,
      session.user_account_id,
      amountTinybars,
      `x402 ${path}`
    );

    await pool.query(
      `UPDATE charges SET status='success', tx_id=$2, error=NULL, charged_at=now(), updated_at=now()
       WHERE idempotency_key=$1`,
      [idempotencyKey, txId]
    );

    return { txId, cached: false };
  } catch (e: any) {
    const msg = e?.message ?? "unknown_error";

    await tx(async (c) => {
      await c.query(
        `UPDATE charges SET status='failed', error=$2, updated_at=now()
         WHERE idempotency_key=$1 AND status='pending'`,
        [idempotencyKey, msg]
      );
      await c.query(
        `UPDATE payment_sessions
         SET total_charged_tinybars = GREATEST(0, total_charged_tinybars - $1::bigint)
         WHERE id=$2`,
        [amountTinybars.toString(), sessionId]
      );
    });

    throw e;
  }
}

// ----------------- Express API -----------------
const app = express();

app.use(morgan("dev"));
app.use(express.json({ limit: "1mb" }));

// ✅ Support single origin OR comma-separated list in env.CORS_ORIGIN
const corsOrigins = String(env.CORS_ORIGIN ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // allow curl/postman/no-origin
      if (!origin) return cb(null, true);

      // if not configured, allow all (dev-friendly)
      if (corsOrigins.length === 0) return cb(null, true);

      if (corsOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true
  })
);

app.get("/health", (_req, res) => res.json({ ok: true }));

const ActivateBody = z.object({
  userAccountId: z.string().min(3),
  expiryHours: z.number().optional(),
  productName: z.string().optional()
});

app.post("/api/sessions/activate", async (req, res) => {
  try {
    const body = ActivateBody.parse(req.body);
    const out = await activateSession({
      userAccountId: body.userAccountId,
      spenderAccountId: env.HEDERA_SPENDER_ACCOUNT_ID,
      expiryHours: body.expiryHours ?? env.DEFAULT_EXPIRY_HOURS,
      productName: body.productName
    });

    return res.json({ session: apiSession(out.session), existed: out.existed });
  } catch (e: any) {
    return res
      .status(400)
      .json(jsonError("activate_failed", { detail: e?.message ?? String(e) }));
  }
});

app.get("/api/sessions/me", async (req, res) => {
  try {
    const userAccountId = z.string().min(3).parse(req.query.userAccountId);
    const s = await getActiveSessionForUser(
      userAccountId,
      env.HEDERA_SPENDER_ACCOUNT_ID
    );
    if (!s) return res.status(404).json(jsonError("No active session"));
    return res.json({ session: apiSession(s) });
  } catch (e: any) {
    return res
      .status(400)
      .json(jsonError("bad_request", { detail: e?.message ?? String(e) }));
  }
});

app.get("/api/sessions/:sessionId", async (req, res) => {
  const sessionId = String(req.params.sessionId);
  const s = await getSessionById(sessionId);
  if (!s) return res.status(404).json(jsonError("Session not found"));

  const charges = await pool.query(
    `
    SELECT id, session_id, amount_tinybars, request_path, status, tx_id, error, charged_at
    FROM charges
    WHERE session_id=$1
    ORDER BY charged_at DESC
    LIMIT 50
    `,
    [sessionId]
  );

  return res.json({
    session: apiSession(s),
    charges: charges.rows.map((c) => ({
      id: c.id,
      sessionId: c.session_id,
      amountTinybars: c.amount_tinybars,
      requestPath: c.request_path,
      status: c.status,
      txId: c.tx_id,
      error: c.error,
      chargedAt: c.charged_at
    }))
  });
});

const DeactivateBody = z.object({
  sessionId: z.string().uuid()
});

app.post("/api/sessions/deactivate", async (req, res) => {
  try {
    const body = DeactivateBody.parse(req.body);
    const s = await getSessionById(body.sessionId);
    if (!s) return res.status(404).json(jsonError("Session not found"));

    const allowance = await getHbarAllowanceTinybars(
      s.user_account_id,
      s.spender_account_id
    );
    if (allowance > 0n) {
      return res.status(400).json(
        jsonError("Allowance still active", {
          detail:
            "Revoke the allowance in HashPack first (set to 0), then call deactivate again."
        })
      );
    }

    const upd = await pool.query(
      `UPDATE payment_sessions SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL RETURNING id`,
      [body.sessionId]
    );

    if (upd.rowCount === 0) return res.json({ ok: true, already: true });
    return res.json({ ok: true });
  } catch (e: any) {
    return res
      .status(400)
      .json(jsonError("deactivate_failed", { detail: e?.message ?? String(e) }));
  }
});

const ChargeBody = z.object({
  sessionId: z.string().uuid(),
  amountHbar: z.number().positive(),
  path: z.string().optional()
});

app.post("/api/charges", async (req, res) => {
  try {
    const body = ChargeBody.parse(req.body);
    const out = await chargeSession({
      sessionId: body.sessionId,
      amountTinybars: hbarToTinybars(body.amountHbar),
      path: body.path ?? "/api/charges"
    });
    return res.json({ status: "success", txId: out.txId, cached: out.cached });
  } catch (e: any) {
    if (e?.code === "PENDING" || /pending/i.test(e?.message ?? "")) {
      return res
        .status(409)
        .json(jsonError("charge_pending", { detail: e?.message ?? "pending" }));
    }
    return res
      .status(400)
      .json(jsonError("charge_failed", { detail: e?.message ?? String(e) }));
  }
});

// x402 demo route: charges 0.1 HBAR per request
app.get(
  "/api/premium",
  hederaX402({
    priceTinybars: hbarToTinybars(0.1),
    charge: async ({ sessionId, amountTinybars, path }) => {
      return chargeSession({ sessionId, amountTinybars, path });
    }
  }),
  (req, res) => {
    return res.json({
      premium: true,
      message: "Charged successfully",
      paymentTxId: (req as any).paymentTxId ?? null,
      cached: (req as any).paymentCached ?? false
    });
  }
);

app.listen(env.PORT, () => {
  console.log(`server listening on http://localhost:${env.PORT}`);
  console.log(`x402 demo: GET http://localhost:${env.PORT}/api/premium`);
  console.log(`mirror: ${env.MIRROR_NODE_BASE_URL}`);
  console.log(`spender: ${env.HEDERA_SPENDER_ACCOUNT_ID}`);
  console.log(`default cap: ${env.DEFAULT_CAP_HBAR} HBAR`);
  console.log(`default expiry: ${env.DEFAULT_EXPIRY_HOURS}h (backend-enforced)`);
  console.log(
    `note: allowances have NO native expiry; backend stops charging after expiresAt`
  );
  console.log(
    `example: 0.1 HBAR = ${tinybarsToHbarString(hbarToTinybars(0.1))} HBAR`
  );
});
