import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import type { MarketPair } from "../markets";
import {
  buildInitializeVault,
  deriveMarket,
  programId,
} from "../lib/settlementIx";
import { signAndSendInstruction } from "../lib/walletSend";
import { fetchVaultStatus } from "../lib/chainStatus";

export type VaultState = "idle" | "checking" | "missing" | "ready" | "error";

/**
 * 检测当前钱包在当前交易对下的 User Vault 是否已开户，
 * 并提供开户（InitializeVault）动作。
 */
export function useVaultStatus(
  wallet: string | null,
  market: MarketPair | null
) {
  const [state, setState] = useState<VaultState>("idle");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    if (!wallet || !market) {
      setState("idle");
      return;
    }
    setState("checking");
    setError(null);
    try {
      const res = await fetchVaultStatus({ wallet, market });
      setAddress(res.address);
      setState(res.initialized ? "ready" : "missing");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }, [wallet, market]);

  useEffect(() => {
    void check();
  }, [check]);

  /** 开户；成功返回签名，失败抛错（由调用方提示，页面仍停留在开户页） */
  const open = useCallback(async (): Promise<string | null> => {
    if (!wallet || !market) return null;
    setBusy(true);
    setError(null);
    try {
      const [marketPk] = deriveMarket(
        programId(),
        new PublicKey(market.baseMint),
        new PublicKey(market.quoteMint)
      );
      const built = buildInitializeVault({
        owner: new PublicKey(wallet),
        market: marketPk,
      });
      const { signature } = await signAndSendInstruction(built.ix);
      // 以链上状态为准：确认已初始化后才放行交易界面
      await check();
      return signature;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e instanceof Error ? e : new Error(msg);
    } finally {
      setBusy(false);
    }
  }, [wallet, market, check]);

  return { state, address, error, busy, open, check };
}
