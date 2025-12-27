// server/src/dev/approveAllowance.ts
import { AccountAllowanceApproveTransaction, AccountId, Client, Hbar, PrivateKey } from "@hashgraph/sdk";
import { env } from "../env.js";
import { hbarToTinybars } from "../util.js";

/**
 * Optional helper for quick testing WITHOUT a wallet.
 * Requires you to set:
 *   USER_ACCOUNT_ID
 *   USER_PRIVATE_KEY
 *   CAP_HBAR (optional)
 *
 * It will approve an HBAR allowance from USER -> SPENDER (env.HEDERA_SPENDER_ACCOUNT_ID).
 */
async function main() {
  const userId = process.env.USER_ACCOUNT_ID;
  const userKey = process.env.USER_PRIVATE_KEY;

  if (!userId || !userKey) {
    console.log("Set USER_ACCOUNT_ID and USER_PRIVATE_KEY to use this dev helper.");
    return;
  }

  const capHbar = Number(process.env.CAP_HBAR ?? env.DEFAULT_CAP_HBAR);
  const capTiny = hbarToTinybars(capHbar);

  const client = env.HEDERA_NETWORK === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(AccountId.fromString(userId), PrivateKey.fromStringDer(userKey));

  const tx = new AccountAllowanceApproveTransaction()
    .approveHbarAllowance(userId, env.HEDERA_SPENDER_ACCOUNT_ID, Hbar.fromTinybars(capTiny));

  const res = await tx.execute(client);
  const receipt = await res.getReceipt(client);

  console.log("Approved allowance:", {
    owner: userId,
    spender: env.HEDERA_SPENDER_ACCOUNT_ID,
    capHbar,
    status: receipt.status.toString(),
    txId: res.transactionId?.toString()
  });
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
