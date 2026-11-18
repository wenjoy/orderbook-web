/**
 * Phantom 签名发送 — @solana/web3.js v1（Buffer / legacy Transaction）
 */
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { rpcUrl } from "../api";

declare global {
  interface Window {
    solana?: {
      isPhantom?: boolean;
      publicKey?: { toString: () => string };
      connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{
        publicKey: { toString: () => string };
      }>;
      disconnect: () => Promise<void>;
      signAndSendTransaction: (
        transaction: Transaction,
        opts?: { skipPreflight?: boolean }
      ) => Promise<{ signature: string }>;
      on?: (event: string, handler: () => void) => void;
      off?: (event: string, handler: () => void) => void;
    };
  }
}

export type WalletSendResult = {
  signature: string;
};

const CONFIRM_POLL_INTERVAL_MS = 1_500;
/** 兜底上限：正常情况块高过期会先触发，这里只防 RPC 一直不返回块高 */
const CONFIRM_TIMEOUT_MS = 120_000;
/** 块高超过 lastValidBlockHeight 后再多等几块，覆盖「恰好落在最后一个有效块」的情况 */
const EXPIRY_GRACE_BLOCKS = 4;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ConfirmOutcome =
  | { kind: "success" }
  | { kind: "failed"; err: unknown }
  | { kind: "expired" };

type SignatureStatusValue = {
  err: unknown;
  confirmationStatus?: string;
} | null;

async function readSignatureStatus(
  connection: Connection,
  signature: string
): Promise<SignatureStatusValue> {
  const res = await connection.getSignatureStatuses([signature], {
    searchTransactionHistory: true,
  });
  return (res.value[0] as SignatureStatusValue) ?? null;
}

/**
 * 轮询 HTTP RPC 等待交易落块。
 *
 * 刻意不用 `connection.confirmTransaction`：它的块高策略依赖
 * `signatureSubscribe` 的 WebSocket 推送；一旦 WS 不可用（例如 `/rpc`
 * 同源代理没有转发 upgrade），订阅会一直卡在 pending，只能等块高过期后抛
 * `TransactionExpiredBlockheightExceededError` —— 表现就是「链上已经成功，
 * 前端却报 expires: block height exceeded」。这里的约定是：
 *   - 用 `getSignatureStatuses`（纯 HTTP）轮询，不依赖 WebSocket；
 *   - 只有 RPC 明确返回 `err` 才算失败；
 *   - 查不到签名时最多等到块高过期，绝不把「本地没等到」当成「上链失败」。
 */
async function waitForSignatureConfirmation(
  connection: Connection,
  signature: string,
  lastValidBlockHeight: number
): Promise<ConfirmOutcome> {
  const startedAt = Date.now();
  let processedSeen = false;
  let blockhashExpired = false;

  for (;;) {
    let status: SignatureStatusValue = null;
    try {
      status = await readSignatureStatus(connection, signature);
    } catch (e) {
      // RPC 抖动不算失败，继续轮询
      console.warn("[tx] getSignatureStatuses failed", e);
    }

    if (status?.err) return { kind: "failed", err: status.err };
    if (status) {
      const cs = status.confirmationStatus;
      if (cs === "confirmed" || cs === "finalized") return { kind: "success" };
      // processed 已经落块、只差 commitment 升级，先记下来，过期时也算成功
      if (cs === "processed") processedSeen = true;
    }

    if (!blockhashExpired) {
      try {
        const height = await connection.getBlockHeight("confirmed");
        if (height > lastValidBlockHeight + EXPIRY_GRACE_BLOCKS) {
          blockhashExpired = true;
        }
      } catch {
        /* 拿不到块高就靠超时兜底 */
      }
    }

    if (blockhashExpired || Date.now() - startedAt > CONFIRM_TIMEOUT_MS) {
      // 最后一次查询：交易可能刚好在临界点落块
      const last = await readSignatureStatus(connection, signature).catch(
        () => null
      );
      if (last?.err) return { kind: "failed", err: last.err };
      if (last) return { kind: "success" };
      if (processedSeen) return { kind: "success" };
      return { kind: "expired" };
    }

    await delay(CONFIRM_POLL_INTERVAL_MS);
  }
}

/** 失败时取程序日志（刚失败时交易索引可能还没建好，重试几次） */
async function fetchFailureLogs(
  connection: Connection,
  signature: string
): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const meta = await connection.getTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      const logs = meta?.meta?.logMessages;
      if (logs?.length) return logs.join("\n");
    } catch {
      /* 继续重试 */
    }
    await delay(500);
  }
  return null;
}

export async function signAndSendInstruction(
  ix: TransactionInstruction
): Promise<WalletSendResult> {
  return signAndSendInstructions([ix]);
}

/**
 * 一次签名发送多笔指令（例如同时创建 base / quote 两个 ATA）。
 * 会先本地模拟，模拟失败直接抛错，避免把注定失败的交易丢给钱包。
 */
export async function signAndSendInstructions(
  ixs: TransactionInstruction[]
): Promise<WalletSendResult> {
  const provider = window.solana;
  if (!provider?.isPhantom || !provider.publicKey) {
    throw new Error("Connect Phantom wallet first");
  }
  if (typeof provider.signAndSendTransaction !== "function") {
    throw new Error("Wallet does not support signAndSendTransaction");
  }
  if (ixs.length === 0) {
    throw new Error("Nothing to send");
  }

  const feePayer = new PublicKey(provider.publicKey.toString());
  const required = ixs
    .flatMap((ix) => ix.keys.filter((k) => k.isSigner))
    .map((k) => k.pubkey.toBase58());
  if (required.length && !required.includes(feePayer.toBase58())) {
    throw new Error(
      `Connected wallet is not the required signer (need ${required
        .map((s) => s.slice(0, 8) + "…")
        .join(", ")})`
    );
  }

  const connection = new Connection(rpcUrl(), "confirmed");
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");

  const tx = new Transaction({
    feePayer,
    blockhash,
    lastValidBlockHeight,
  }).add(...ixs);

  // 先在本地模拟：失败时把程序日志拼进错误信息，方便定位
  try {
    const simulation = await connection.simulateTransaction(tx);
    if (simulation.value.err) {
      const logs = simulation.value.logs?.join("\n") ?? "";
      throw new Error(
        `Simulation failed: ${JSON.stringify(simulation.value.err)}` +
          (logs ? `\nlogs:\n${logs}` : "")
      );
    }
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error(`Simulation failed: ${String(e)}`);
  }

  const { signature } = await provider.signAndSendTransaction(tx);

  const outcome = await waitForSignatureConfirmation(
    connection,
    signature,
    lastValidBlockHeight
  );

  if (outcome.kind === "failed") {
    const logs = await fetchFailureLogs(connection, signature);
    throw new Error(
      `Transaction failed: ${JSON.stringify(outcome.err)}` +
        (logs ? `\nlogs:\n${logs}` : "")
    );
  }

  if (outcome.kind === "expired") {
    // 注意：这不等于失败。交易可能仍在传播，调用方应回查链上状态再决定是否重试。
    throw new Error(
      "Transaction not confirmed: blockhash expired before the signature appeared on chain. " +
        `It may still land — re-check the on-chain state before retrying. (sig ${signature})`
    );
  }

  return { signature };
}
