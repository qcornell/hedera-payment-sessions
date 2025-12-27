// server/src/util.ts
import crypto from "crypto";

export const TINYBARS_PER_HBAR = 100_000_000n;

export function hbarToTinybars(hbar: number | string): bigint {
  const s = String(hbar).trim();
  if (!s) throw new Error("Invalid HBAR amount");

  const neg = s.startsWith("-");
  const raw = neg ? s.slice(1) : s;

  const [whole, frac = ""] = raw.split(".");
  const wholeN = BigInt(whole || "0");
  const fracPadded = (frac + "00000000").slice(0, 8);
  const fracN = BigInt(fracPadded || "0");

  const tiny = wholeN * TINYBARS_PER_HBAR + fracN;
  return neg ? -tiny : tiny;
}

export function tinybarsToHbarString(tinybars: bigint): string {
  const neg = tinybars < 0n;
  const abs = neg ? -tinybars : tinybars;

  const whole = abs / TINYBARS_PER_HBAR;
  const frac = abs % TINYBARS_PER_HBAR;

  const fracStr = frac.toString().padStart(8, "0").replace(/0+$/, "");
  const s = fracStr.length ? `${whole.toString()}.${fracStr}` : whole.toString();
  return neg ? `-${s}` : s;
}

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function timeBucket(seconds: number): number {
  return Math.floor(Date.now() / 1000 / seconds);
}

export function jsonError(message: string, extra?: Record<string, unknown>) {
  return { error: message, ...(extra ?? {}) };
}
