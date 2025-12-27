// server/src/mirror.ts
import { env } from "./env.js";

type MirrorAllowancesResponse = {
  allowances?: Array<{
    owner?: string;
    spender?: string;
    amount?: string; // tinybars as string
  }>;
  links?: { next?: string | null };
};

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`MirrorNode HTTP ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}

export async function getHbarAllowanceTinybars(ownerAccountId: string, spenderAccountId: string): Promise<bigint> {
  let next = `${env.MIRROR_NODE_BASE_URL}/accounts/${ownerAccountId}/allowances/crypto?limit=100`;

  while (next) {
    const data = await fetchJson<MirrorAllowancesResponse>(next);

    const found = (data.allowances ?? []).find(
      (a) => a.owner === ownerAccountId && a.spender === spenderAccountId
    );

    if (found?.amount != null) {
      return BigInt(found.amount);
    }

    const n = data.links?.next;
    if (!n) break;

    // mirror returns relative sometimes
    next = n.startsWith("http") ? n : `${env.MIRROR_NODE_BASE_URL}${n}`;
  }

  return 0n;
}
