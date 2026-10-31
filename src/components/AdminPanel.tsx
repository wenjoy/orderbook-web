import { useEffect, useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { DEFAULT_MARKET, MARKET_PAIRS, type MarketPair } from "../markets";
import {
  buildDeposit,
  buildInitializeMarket,
  buildInitializeVault,
  buildWithdraw,
  deriveMarket,
  deriveUserVault,
  programId,
  type BuiltLocal,
} from "../lib/settlementIx";
import { signAndSendInstruction } from "../lib/walletSend";

type Props = {
  wallet: string | null;
  showToast: (m: string) => void;
};

/** Admin：本地构造（web3.js v1 + Phantom） */
export function AdminPanel({ wallet, showToast }: Props) {
  const [pair, setPair] = useState<MarketPair>(DEFAULT_MARKET);
  const [market, setMarket] = useState("");
  const [amount, setAmount] = useState("1000");
  const [isBase, setIsBase] = useState(false);
  const [userToken, setUserToken] = useState("");
  const [vaultToken, setVaultToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastJson, setLastJson] = useState<string | null>(null);

  useEffect(() => {
    try {
      const [m] = deriveMarket(
        programId(),
        new PublicKey(pair.baseMint),
        new PublicKey(pair.quoteMint)
      );
      setMarket(m.toBase58());
    } catch {
      setMarket("");
    }
  }, [pair]);

  const vaultPdaPreview = useMemo(() => {
    if (!wallet || !market) return "";
    try {
      const [v] = deriveUserVault(
        programId(),
        new PublicKey(market),
        new PublicKey(wallet)
      );
      return v.toBase58();
    } catch {
      return "";
    }
  }, [wallet, market]);

  const sendBuilt = async (label: string, built: BuiltLocal) => {
    if (!wallet) {
      showToast("先连接钱包");
      return;
    }
    setBusy(true);
    setLastJson(null);
    try {
      const { signature } = await signAndSendInstruction(built.ix);
      setLastJson(
        JSON.stringify(
          {
            name: built.name,
            signature,
            pdas: built.pdas,
            requiredSigner: built.requiredSigner,
            programId: built.ix.programId.toBase58(),
            keys: built.ix.keys.map((k) => ({
              pubkey: k.pubkey.toBase58(),
              isSigner: k.isSigner,
              isWritable: k.isWritable,
            })),
          },
          null,
          2
        )
      );
      if (built.pdas.market) setMarket(built.pdas.market);
      showToast(`${label}: ${signature.slice(0, 12)}…`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastJson(JSON.stringify({ error: msg }, null, 2));
      showToast(msg);
    } finally {
      setBusy(false);
    }
  };

  let programLabel = "(invalid program id)";
  try {
    programLabel = programId().toBase58();
  } catch {
    /* keep */
  }

  return (
    <div className="space-y-4">
      <div className="panel">
        <div className="panel-title">Admin · 链上准备</div>
        <div className="space-y-1 p-3 text-xs text-gray-500">
          <p>
            指令在前端本地构造，Phantom 签名发送。
            SDK：@solana/web3.js <strong className="text-gray-300">v1</strong>
            （与 Phantom 兼容；v3 易报 expected buffer）。
          </p>
          <p className="font-mono text-[10px] break-all">program {programLabel}</p>
          {!wallet && (
            <p className="text-ask">未连接钱包 — 请先在右上角 Connect Wallet</p>
          )}
          {wallet && (
            <p className="font-mono text-[10px] text-accent break-all">
              signer {wallet}
            </p>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">1. InitializeMarket</div>
        <div className="grid gap-2 p-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Trading pair</label>
            <select
              className="input"
              value={pair.id}
              onChange={(e) => {
                const next = MARKET_PAIRS.find((m) => m.id === e.target.value);
                if (next) setPair(next);
              }}
            >
              {MARKET_PAIRS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.symbol}
                </option>
              ))}
            </select>
            <p className="mt-1 font-mono text-[10px] text-gray-500 break-all">
              market PDA: {market || "—"}
            </p>
          </div>
          <button
            type="button"
            className="btn-primary sm:col-span-2"
            disabled={busy || !wallet}
            onClick={() => {
              if (!wallet) return;
              void sendBuilt(
                "InitMarket",
                buildInitializeMarket({
                  authority: new PublicKey(wallet),
                  baseMint: new PublicKey(pair.baseMint),
                  quoteMint: new PublicKey(pair.quoteMint),
                })
              );
            }}
          >
            Initialize Market（钱包签名发送）
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">2. InitializeVault</div>
        <div className="grid gap-2 p-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Owner = 当前钱包</label>
            <input
              className="input font-mono text-xs"
              value={wallet ?? ""}
              readOnly
              placeholder="Connect wallet first"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Market PDA</label>
            <input
              className="input font-mono text-xs"
              value={market}
              onChange={(e) => setMarket(e.target.value)}
            />
            {vaultPdaPreview && (
              <p className="mt-1 font-mono text-[10px] text-gray-500 break-all">
                user_vault PDA: {vaultPdaPreview}
              </p>
            )}
          </div>
          <button
            type="button"
            className="btn-primary sm:col-span-2"
            disabled={busy || !wallet || !market}
            onClick={() => {
              if (!wallet || !market) return;
              void sendBuilt(
                "InitVault",
                buildInitializeVault({
                  owner: new PublicKey(wallet),
                  market: new PublicKey(market),
                })
              );
            }}
          >
            Initialize Vault（钱包签名发送）
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">3. Deposit / Withdraw</div>
        <div className="grid gap-2 p-3 sm:grid-cols-2">
          <div>
            <label className="label">Amount</label>
            <input
              className="input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Asset</label>
            <select
              className="input"
              value={isBase ? "base" : "quote"}
              onChange={(e) => setIsBase(e.target.value === "base")}
            >
              <option value="quote">Quote ({pair.quoteSymbol})</option>
              <option value="base">Base ({pair.baseSymbol})</option>
            </select>
          </div>
          <div>
            <label className="label">User token account</label>
            <input
              className="input font-mono text-xs"
              value={userToken}
              onChange={(e) => setUserToken(e.target.value)}
              placeholder="用户 ATA"
            />
          </div>
          <div>
            <label className="label">Vault token account</label>
            <input
              className="input font-mono text-xs"
              value={vaultToken}
              onChange={(e) => setVaultToken(e.target.value)}
              placeholder="托管 token 账户"
            />
          </div>
          <button
            type="button"
            className="btn-bid"
            disabled={busy || !wallet || !userToken || !vaultToken || !market}
            onClick={() => {
              if (!wallet || !market) return;
              void sendBuilt(
                "Deposit",
                buildDeposit({
                  owner: new PublicKey(wallet),
                  market: new PublicKey(market),
                  userToken: new PublicKey(userToken),
                  vaultToken: new PublicKey(vaultToken),
                  amount: Number(amount),
                  isBase,
                })
              );
            }}
          >
            Deposit（钱包签名）
          </button>
          <button
            type="button"
            className="btn-ask"
            disabled={busy || !wallet || !userToken || !vaultToken || !market}
            onClick={() => {
              if (!wallet || !market) return;
              void sendBuilt(
                "Withdraw",
                buildWithdraw({
                  owner: new PublicKey(wallet),
                  market: new PublicKey(market),
                  userToken: new PublicKey(userToken),
                  vaultToken: new PublicKey(vaultToken),
                  amount: Number(amount),
                  isBase,
                })
              );
            }}
          >
            Withdraw（钱包签名）
          </button>
        </div>
      </div>

      {lastJson && (
        <div className="panel">
          <div className="panel-title">Last result</div>
          <pre className="max-h-56 overflow-auto p-3 text-[10px] text-gray-400 whitespace-pre-wrap break-all">
            {lastJson}
          </pre>
        </div>
      )}
    </div>
  );
}
