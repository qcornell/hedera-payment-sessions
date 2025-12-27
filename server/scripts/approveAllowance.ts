import {
  AccountAllowanceApproveTransaction,
  Client,
  Hbar,
  AccountId,
  PrivateKey
} from "@hashgraph/sdk";

function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

async function main() {
  const network = (process.env.HEDERA_NETWORK ?? "testnet").toLowerCase();

  const userAccountId = AccountId.fromString(must("USER_ACCOUNT_ID"));
  const spenderAccountId = AccountId.fromString(must("SPENDER_ACCOUNT_ID"));
  const allowanceHbar = Number(process.env.ALLOWANCE_HBAR ?? "1");

  const keyStr = must("USER_PRIVATE_KEY").trim();
  let userKey: PrivateKey;

  // This handles both DER ("302e...") and raw hex ("0x...") keys
  try {
    userKey = PrivateKey.fromString(keyStr);
  } catch {
    const cleaned = keyStr.replace(/^0x/i, "");
    userKey = PrivateKey.fromStringECDSA(cleaned);
  }

  const client =
    network === "mainnet" ? Client.forMainnet() :
    network === "previewnet" ? Client.forPreviewnet() :
    Client.forTestnet();

  client.setOperator(userAccountId, userKey);

  const tx = new AccountAllowanceApproveTransaction()
    .approveHbarAllowance(userAccountId, spenderAccountId, new Hbar(allowanceHbar));

  const resp = await tx.execute(client);
  const receipt = await resp.getReceipt(client);

  console.log("✅ Allowance approved");
  console.log("status:", receipt.status.toString());
  console.log("owner:", userAccountId.toString());
  console.log("spender:", spenderAccountId.toString());
  console.log("amount:", allowanceHbar, "HBAR");
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
