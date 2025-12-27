// server/src/hedera.ts

import {
  AccountBalanceQuery,
  AccountId,
  Client,
  Hbar,
  PrivateKey,
  TransferTransaction,
} from "@hashgraph/sdk";
import { env } from "./env.js";

/**
 * Supports:
 * - DER key strings that often start with "302e..." (hex DER) (with or without 0x)
 * - Raw 32-byte hex private keys (with or without 0x), ECDSA or ED25519
 */
function parsePrivateKey(key: string): PrivateKey {
  const raw = key.trim();
  const no0x = raw.startsWith("0x") ? raw.slice(2) : raw;

  // 1) Detect DER-encoded private keys (commonly start with 302e... in hex DER)
  // Handle both "302e..." and "0x302e..."
  if (/^302e/i.test(no0x)) {
    return PrivateKey.fromStringDer(no0x);
  }

  // 2) If it's exactly 32 bytes of hex, it could be ECDSA or ED25519
  // Try ECDSA first, fall back to ED25519.
  if (/^[0-9a-fA-F]{64}$/.test(no0x)) {
    const hex = `0x${no0x}`;
    try {
      return PrivateKey.fromStringECDSA(hex);
    } catch {
      return PrivateKey.fromStringED25519(hex);
    }
  }

  // 3) Otherwise assume it is a DER string (hashgraph sdk accepts DER string forms)
  // If this throws, it means the key format doesn't match what SDK expects.
  return PrivateKey.fromStringDer(raw);
}

export function getClient(): Client {
  const client =
    env.HEDERA_NETWORK === "mainnet" ? Client.forMainnet() : Client.forTestnet();

  client.setOperator(
    AccountId.fromString(env.HEDERA_SPENDER_ACCOUNT_ID),
    parsePrivateKey(env.HEDERA_SPENDER_PRIVATE_KEY)
  );

  return client;
}

export async function getSpenderBalanceTinybars(client: Client): Promise<bigint> {
  const balance = await new AccountBalanceQuery()
    .setAccountId(AccountId.fromString(env.HEDERA_SPENDER_ACCOUNT_ID))
    .execute(client);

  // balance.hbars.toTinybars() returns a Long -> convert to bigint safely
  return BigInt(balance.hbars.toTinybars().toString());
}

export async function transferFromAllowanceToSpender(
  client: Client,
  ownerAccountId: string,
  amountTinybars: bigint,
  memo?: string
): Promise<string> {
  if (amountTinybars <= 0n) {
    throw new Error(`amountTinybars must be > 0 (got ${amountTinybars})`);
  }

  const owner = AccountId.fromString(ownerAccountId);
  const spender = AccountId.fromString(env.HEDERA_SPENDER_ACCOUNT_ID);

  const tx = new TransferTransaction()
    .addApprovedHbarTransfer(owner, Hbar.fromTinybars((-amountTinybars).toString()))
    .addHbarTransfer(spender, Hbar.fromTinybars(amountTinybars.toString()));

  if (memo) tx.setTransactionMemo(memo.slice(0, 100));

  const res = await tx.execute(client);
  const receipt = await res.getReceipt(client);

  const txId = res.transactionId?.toString() ?? "unknown";
  if (receipt.status.toString() !== "SUCCESS") {
    throw new Error(`Hedera transfer failed: ${receipt.status.toString()}`);
  }

  return txId;
}
