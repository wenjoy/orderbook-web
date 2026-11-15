import { useCallback, useEffect, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { FAUCET_AMOUNTS, requestTokenAirdrop, rpcUrl } from "../api";
import type { MarketPair } from "../markets";
import { parseUnits } from "../lib/amount";
import {
  buildInitializeVault,
  deriveMarket,
  programId,
} from "../lib/settlementIx";
import {
  signAndSendInstruction,
  signAndSendInstructions,
} from "../lib/walletSend";
import {
  createAssociatedTokenAccountIdempotentIx,
  fetchAccountSetup,
  type AccountSetup,
} from "../lib/chainStatus";

/**
 * idle      — 还没连接钱包 / 没选市场
 * checking  — 正在查链上状态
 * missing   — 未开户，需要走「引导」
 * ready     — 已开户，可以交易
 * error     — 查询失败
 */
export type AccountState = "idle" | "checking" | "missing" | "ready" | "error";

/** 正在进行的单个动作，用于 per-step 文案与按钮禁用 */
export type AccountAction = "atas" | "faucet" | "vault" | "airdrop" | null;

export type SetupRunError = {
  /** 失败发生在第几步（1..4） */
  step: number;
  message: string;
};

/** 一键开户的运行状态：active 时 step 表示当前正在执行的步骤 */
export type SetupRun = {
  active: boolean;
  step: number | null;
  error: SetupRunError | null;
};

const IDLE_RUN: SetupRun = { active: false, step: null, error: null };

export type VaultData = {
  address: string;
  baseBalance: bigint;
  quoteBalance: bigint;
  baseDecimals: number | null;
  quoteDecimals: number | null;
};

const EMPTY_VAULT: VaultData = {
  address: "",
  baseBalance: 0n,
  quoteBalance: 0n,
  baseDecimals: null,
  quoteDecimals: null,
};

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * 交易账户状态 + 开户前置条件（SOL / ATA / 代币余额 / UserVault）。
 *
 * 四步对应：
 *   1. solOk             钱包有足够的 SOL 支付租金与手续费
 *   2. atasOk            base / quote ATA 已创建
 *   3. fundedOk          两个 ATA 余额都不为零
 *   4. vaultInitialized  交易账户已开户
 *
 * `setupAll()` 一键串行跑完剩余步骤；`run` 用于展示进度。
 */
export function useTradingAccount(
  wallet: string | null,
  market: MarketPair | null
) {
  const [state, setState] = useState<AccountState>("idle");
  const [setup, setSetup] = useState<AccountSetup | null>(null);
  const [vault, setVault] = useState<VaultData>(EMPTY_VAULT);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<AccountAction>(null);
  const [run, setRun] = useState<SetupRun>(IDLE_RUN);

  /**
   * silent = true 时不切到 checking，用于签名成功后的静默刷新，
   * 避免交易界面被整页 loading 顶掉。
   */
  const check = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!wallet || !market) {
        setState("idle");
        setSetup(null);
        setVault(EMPTY_VAULT);
        return;
      }
      if (!opts?.silent) setState("checking");
      setError(null);
      try {
        const next = await fetchAccountSetup({ wallet, market });
        setSetup(next);
        setVault({
          address: next.vaultAddress,
          baseBalance: next.baseBalance,
          quoteBalance: next.quoteBalance,
          baseDecimals: next.baseDecimals,
          quoteDecimals: next.quoteDecimals,
        });
        setState(next.vaultInitialized ? "ready" : "missing");
      } catch (e) {
        setError(errorMessage(e));
        if (!opts?.silent) setState("error");
      }
    },
    [wallet, market]
  );

  useEffect(() => {
    setRun(IDLE_RUN);
    void check();
  }, [check]);

  /** 第 2 步：创建缺失的钱包 ATA（base / quote 合并在一次签名里） */
  const createAtas = useCallback(async (): Promise<string | null> => {
    if (!wallet || !market) return null;
    setAction("atas");
    try {
      const payer = new PublicKey(wallet);
      // 以链上最新状态为准，避免按钮状态过期导致重复创建
      const current = await fetchAccountSetup({ wallet, market });
      setSetup(current);

      const ixs = [];
      if (!current.baseAta.exists) {
        ixs.push(
          createAssociatedTokenAccountIdempotentIx({
            payer,
            owner: payer,
            mint: new PublicKey(market.baseMint),
          })
        );
      }
      if (!current.quoteAta.exists) {
        ixs.push(
          createAssociatedTokenAccountIdempotentIx({
            payer,
            owner: payer,
            mint: new PublicKey(market.quoteMint),
          })
        );
      }
      if (ixs.length === 0) {
        await check({ silent: true });
        return null;
      }

      const { signature } = await signAndSendInstructions(ixs);
      await check({ silent: true });
      return signature;
    } finally {
      setAction(null);
    }
  }, [wallet, market, check]);

  /** 第 3 步：向水龙头领取 base / quote 代币（内部两次请求） */
  const requestTokens = useCallback(async (): Promise<string | null> => {
    if (!wallet || !market) return null;
    setAction("faucet");
    try {
      // 以链上最新状态为准：没 ATA 就先别领
      const current = await fetchAccountSetup({ wallet, market });
      setSetup(current);
      if (!current.baseAta.exists || !current.quoteAta.exists) {
        throw new Error("Create token accounts first");
      }
      if (current.baseDecimals == null || current.quoteDecimals == null) {
        throw new Error("Unknown mint decimals, cannot compute airdrop amount");
      }

      const baseRaw = parseUnits(String(FAUCET_AMOUNTS.base), current.baseDecimals);
      const quoteRaw = parseUnits(String(FAUCET_AMOUNTS.quote), current.quoteDecimals);
      if (baseRaw == null || quoteRaw == null) {
        throw new Error("Invalid airdrop amount for mint decimals");
      }

      const requests = [
        {
          symbol: market.baseSymbol,
          body: {
            destination: wallet,
            amount: Number(baseRaw),
            mint: market.baseMint,
          },
        },
        {
          symbol: market.quoteSymbol,
          body: {
            destination: wallet,
            amount: Number(quoteRaw),
            mint: market.quoteMint,
          },
        },
      ];

      // 两次请求彼此独立：一个失败不影响另一个已到账
      const signatures: string[] = [];
      const failures: string[] = [];
      for (const req of requests) {
        try {
          const res = await requestTokenAirdrop(req.body);
          if (res.signature) signatures.push(res.signature);
        } catch (e) {
          failures.push(`${req.symbol}: ${errorMessage(e)}`);
        }
      }

      await check({ silent: true });

      if (failures.length) {
        throw new Error(`Airdrop failed → ${failures.join(" / ")}`);
      }
      return signatures[0] ?? null;
    } finally {
      setAction(null);
    }
  }, [wallet, market, check]);

  /** 第 4 步：开户（InitializeVault）；成功后 state 变为 ready */
  const openVault = useCallback(async (): Promise<string | null> => {
    if (!wallet || !market) return null;
    setAction("vault");
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
    } finally {
      setAction(null);
    }
  }, [wallet, market, check]);

  /**
   * 一键开户：从当前状态开始，把没完成的步骤依次跑完。
   * 每步开始前都会重新读链上状态，因此重复点击是安全的（幂等）。
   */
  const setupAll = useCallback(async (): Promise<void> => {
    if (!wallet || !market) return;

    let step = 1;
    setRun({ active: true, step, error: null });
    setError(null);

    try {
      let current = await fetchAccountSetup({ wallet, market });
      setSetup(current);

      // 1 · SOL
      if (!current.solOk) {
        const missing = (current.requiredLamports - current.solLamports) / 1e9;
        throw new Error(
          `Insufficient SOL: need ≈ ${missing.toFixed(4)} more SOL to pay rent and fees`
        );
      }

      // 2 · ATA
      step = 2;
      setRun({ active: true, step, error: null });
      if (!current.atasOk) {
        await createAtas();
        current = await fetchAccountSetup({ wallet, market });
        setSetup(current);
      }
      if (!current.atasOk) {
        throw new Error("Token accounts were not created");
      }

      // 3 · 代币余额
      step = 3;
      setRun({ active: true, step, error: null });
      if (!current.fundedOk) {
        await requestTokens();
        current = await fetchAccountSetup({ wallet, market });
        setSetup(current);
      }
      if (!current.fundedOk) {
        throw new Error("Token accounts are still empty");
      }

      // 4 · 交易账户
      step = 4;
      setRun({ active: true, step, error: null });
      if (!current.vaultInitialized) {
        await openVault();
      }

      setRun(IDLE_RUN);
    } catch (e) {
      // 错误只挂在失败的那一步上，避免同时弹多条提示
      const message = errorMessage(e);
      setRun({ active: false, step, error: { step, message } });
      throw e instanceof Error ? e : new Error(message);
    }
  }, [wallet, market, createAtas, requestTokens, openVault]);

  /** 本地验证节点 / devnet 上的一键领水，仅用于开发调试 */
  const airdrop = useCallback(
    async (sol = 1) => {
      if (!wallet) return;
      setAction("airdrop");
      setError(null);
      try {
        const connection = new Connection(rpcUrl(), "confirmed");
        const signature = await connection.requestAirdrop(
          new PublicKey(wallet),
          Math.round(sol * 1e9)
        );
        await connection.confirmTransaction(signature, "confirmed");
        await check({ silent: true });
        return signature;
      } catch (e) {
        setError(errorMessage(e));
        throw e instanceof Error ? e : new Error(errorMessage(e));
      } finally {
        setAction(null);
      }
    },
    [wallet, check]
  );

  return {
    state,
    setup,
    vault,
    error,
    action,
    run,
    busy: action !== null || run.active,
    check,
    setupAll,
    airdrop,
  };
}
