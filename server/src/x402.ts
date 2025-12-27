// server/src/x402.ts
import type { Request, Response, NextFunction } from "express";
import { jsonError } from "./util.js";
import { env } from "./env.js";

export type ChargeFn = (args: {
  sessionId: string;
  amountTinybars: bigint;
  path: string;
}) => Promise<{ txId: string; cached: boolean }>;

export function hederaX402(opts: { priceTinybars: bigint; charge: ChargeFn }) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const sessionId = String(req.header("x-hedera-session-id") ?? "").trim();

    if (!sessionId) {
      return res.status(402).json({
        error: "Payment required",
        hedera: {
          action: "activate_session",
          spender: env.HEDERA_SPENDER_ACCOUNT_ID,
          priceTinybars: opts.priceTinybars.toString(),
          instructions: [
            "1) Approve an HBAR allowance in your wallet (owner -> spender)",
            "2) POST /api/sessions/activate with your accountId",
            "3) Retry request with header: x-hedera-session-id",
          ],
        },
      });
    }

    try {
      const out = await opts.charge({
        sessionId,
        amountTinybars: opts.priceTinybars,
        // More stable for idempotency than req.path
        path: req.originalUrl || req.path,
      });

      (req as any).paymentTxId = out.txId;
      (req as any).paymentCached = out.cached;
      return next();
    } catch (e: any) {
      const msg = e?.message ?? "charge_failed";

      // If session invalid/expired/etc, return 402 so client can re-activate
      if (/expired|revoked|cap|not found|allowance/i.test(msg)) {
        return res.status(402).json(jsonError("Payment required", { detail: msg }));
      }

      // If we returned "pending" from chargeSession, tell client to retry shortly
      if (/pending/i.test(msg)) {
        return res.status(409).json(jsonError("Charge pending", { detail: msg }));
      }

      return res.status(500).json(jsonError("Charge failed", { detail: msg }));
    }
  };
}
