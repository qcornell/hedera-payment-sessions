// server/src/env.ts
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const EnvSchema = z.object({
  PORT: z.coerce.number().default(8080),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),

  DATABASE_URL: z.string().min(1),

  HEDERA_NETWORK: z.enum(["testnet", "mainnet"]).default("testnet"),
  HEDERA_SPENDER_ACCOUNT_ID: z.string().min(3),
  HEDERA_SPENDER_PRIVATE_KEY: z.string().min(10),

  MIRROR_NODE_BASE_URL: z.string().default("https://testnet.mirrornode.hedera.com/api/v1"),

  DEFAULT_CAP_HBAR: z.coerce.number().default(1),
  DEFAULT_EXPIRY_HOURS: z.coerce.number().default(24),

  IDEMPOTENCY_BUCKET_SECONDS: z.coerce.number().default(300),
  MIN_SPENDER_BALANCE_TINYBARS: z.coerce.bigint().default(1000000n),

  // used by reconcile
  PENDING_CHARGE_TIMEOUT_SECONDS: z.coerce.number().optional()
});

export const env = EnvSchema.parse(process.env);
