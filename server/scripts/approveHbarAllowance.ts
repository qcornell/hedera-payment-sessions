import {
  AccountId,
  Client,
  Hbar,
  PrivateKey,
  AccountAllowanceApproveTransaction,
} from "@hashgraph/sdk";

function must(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v.trim();
}

function parseKey(raw: string) {
  const k = raw.trim().replace(/^"|"$/g, "");
  // Try a few formats to avoid portal/key-format confusion
  try { return PrivateKey.fromString(k); } catch {}
  try { return PrivateKey.fromString(k.startsWith("0x") ? k.slice(2) : k); } catch {}
  throw new Error("Could not parse USER_PRIVATE_KEY. Try the Portal key exactly as shown (including 0x if present).");
}

async function main() {
  const network = (process.env.HEDERA_NETWORK || "testnet").trim();
  const userId = AccountId.fromString(must("USER_ACCOUNT_ID"));
  const spenderId = AccountId.fromString(must("SPENDER_ACCOUNT_ID"));
  const userKey = parseKey(must("USER_PRIVATE_KEY"));

  const amountHbar = Number(process.env.ALLOWANCE_HBAR || "5");
  if (!Number.isFinite(amountHbar) || amountHbar <= 0) throw new Error("ALLOWANCE_HBAR must be > 0");

  const client =
    network === "mainnet" ? Client.forMainnet() :
    network === "previewnet" ? Client.forPreviewnet() :
    Client.forTestnet();

  client.setOperator(userId, userKey);

  console.log("Approving allowance...");
  console.log("user:", userId.toString());
  console.log("spender:", spenderId.toString());
  console.log("amount:", amountHbar, "HBAR");

  const tx = new AccountAllowanceApproveTransaction()
    .approveHbarAllowance(userId, spenderId, new Hbar(amountHbar));

  const resp = await tx.execute(client);
  const receipt = await resp.getReceipt(client);

  console.log("✅ Allowance approved");
  console.log("status:", receipt.status.toString());
}

main().catch((e) => {
  console.error("❌ Failed:", e?.message || e);
  process.exit(1);
});
