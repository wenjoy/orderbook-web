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
  const provider = window.solana;
  if (!provider?.isPhantom || !provider.publicKey) {
    throw new Error("Connect Phantom wallet first");
  }
  if (typeof provider.signAndSendTransaction !== "function") {
    throw new Error("Wallet does not support signAndSendTransaction");
  }

  const feePayer = new PublicKey(provider.publicKey.toString());
  const required = ix.keys.filter((k) => k.isSigner).map((k) => k.pubkey.toBase58());
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
  }).add(ix);

  let ready = true;
  // 假设 transaction 是你构建好的交易对象
  try {
    // 手动进行模拟，开启日志输出
    const simulation = await connection.simulateTransaction(tx);

    console.log("🔍 模拟结果:", simulation);

    if (simulation.value.err) {
      console.error("❌ 模拟失败，程序错误:", simulation.value.err);
      // 这里通常会打印出具体的 ProgramError，例如 custom program error: 0x...
      console.error("📜 程序日志:", simulation.value.logs);
      ready = false;
    } else {
      console.log("✅ 模拟成功，交易逻辑本身没有问题");
    }
  } catch (simError) {
    console.error("模拟过程本身出错:", simError);
    ready = false;
  }

  if (!ready) {
    throw ("simuation error, stop submit")
  }
  const { signature } = await provider.signAndSendTransaction(tx);
  console.log("signature", signature);

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
