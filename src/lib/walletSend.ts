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

  let confirmation;
  try {
    confirmation = await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed"
    );
  } catch (e) {
    // blockhash 过期 / 节点超时，交易状态未知
    throw new Error(
      `Transaction not confirmed: ${(e as Error).message} (sig ${signature})`
    );
  }

  if (confirmation.value.err) {
    const meta = await connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    const logs = meta?.meta?.logMessages;
    throw new Error(
      `Transaction failed: ${confirmation.value.err}` +
      (logs ? `\nlogs:\n${logs.join("\n")}` : "")
    );
  }
  return { signature };
}
