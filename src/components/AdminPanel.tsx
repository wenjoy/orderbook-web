import { useEffect, useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { type MarketPair } from "../markets";
import {
  buildDeposit,
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
  market: MarketPair | null;
};

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

/** Admin：本地构造（web3.js v1 + Phantom） */
export function AdminPanel({ wallet, showToast, market: pair }: Props) {
  const [marketAddress, setMarketAddress] = useState("");
  const [amount, setAmount] = useState("10");
  const [isBase, setIsBase] = useState(false);
  const [userToken, setUserToken] = useState("");
  const [vaultToken, setVaultToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastJson, setLastJson] = useState<string | null>(null);

  useEffect(() => {
    if (!pair) {
      setMarketAddress("");
      return;
    }
    try {
      const [m] = deriveMarket(
        programId(),
        new PublicKey(pair.baseMint),
        new PublicKey(pair.quoteMint)
      );
      setMarketAddress(m.toBase58());
    } catch {
      setMarketAddress("");
    }
  }, [pair]);

  const vaultPdaPreview = useMemo(() => {
    if (!wallet || !marketAddress) return "";
    try {
      const [v] = deriveUserVault(
        programId(),
        new PublicKey(marketAddress),
        new PublicKey(wallet)
      );
      return v.toBase58();
    } catch {
      return "";
    }
  }, [wallet, marketAddress]);

  useEffect(() => {
    if (!pair) {
      setUserToken("");
      setVaultToken("");
      return;
    }
    const mint = isBase ? pair.baseMint : pair.quoteMint;
    if (wallet) {
      const [ata] = PublicKey.findProgramAddressSync(
        [new PublicKey(wallet).toBuffer(), new PublicKey(TOKEN_PROGRAM_ID).toBuffer(), new PublicKey(mint).toBuffer()], ASSOCIATED_TOKEN_PROGRAM_ID);
      setUserToken(ata.toBase58());
    }

    if (vaultPdaPreview) {
      const [ata] = PublicKey.findProgramAddressSync(
        // [new PublicKey(vaultPdaPreview).toBuffer(), new PublicKey(TOKEN_PROGRAM_ID).toBuffer(), new PublicKey(mint).toBuffer()], ASSOCIATED_TOKEN_PROGRAM_ID);
        [new PublicKey(marketAddress).toBuffer(), new PublicKey(TOKEN_PROGRAM_ID).toBuffer(), new PublicKey(mint).toBuffer()], ASSOCIATED_TOKEN_PROGRAM_ID);
      setVaultToken(ata.toBase58());
    }
  }, [vaultPdaPreview, wallet, isBase, pair, marketAddress]);


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
      if (built.pdas.market) setMarketAddress(built.pdas.market);
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
        <div className="space-y-1 p-3 text-xs text-gray-500">
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
            <div className="flex items-center gap-2 rounded-md border border-surface-3 bg-surface px-3 py-2">
              <span className="font-mono text-sm text-gray-200">
                {pair ? `${pair.baseSymbol} / ${pair.quoteSymbol}` : "—"}
              </span>
              <span className="text-[10px] text-gray-500">
                （在顶部导航切换交易对）
              </span>
            </div>
            <p className="mt-1 font-mono text-[10px] text-gray-500 break-all">
              market PDA: {marketAddress || "—"}
            </p>
          </div>
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
              value={marketAddress}
              onChange={(e) => setMarketAddress(e.target.value)}
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
            disabled={busy || !wallet || !marketAddress}
            onClick={() => {
              if (!wallet || !marketAddress) return;
              void sendBuilt(
                "InitVault",
                buildInitializeVault({
                  owner: new PublicKey(wallet),
                  market: new PublicKey(marketAddress),
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
              <option value="quote">Quote ({pair?.quoteSymbol ?? "—"})</option>
              <option value="base">Base ({pair?.baseSymbol ?? "—"})</option>
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
            disabled={busy || !wallet || !userToken || !vaultToken || !marketAddress}
            onClick={() => {
              if (!wallet || !marketAddress) return;
              void sendBuilt(
                "Deposit",
                buildDeposit({
                  owner: new PublicKey(wallet),
                  market: new PublicKey(marketAddress),
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
            disabled={busy || !wallet || !userToken || !vaultToken || !marketAddress}
            onClick={() => {
              if (!wallet || !marketAddress) return;
              void sendBuilt(
                "Withdraw",
                buildWithdraw({
                  owner: new PublicKey(wallet),
                  market: new PublicKey(marketAddress),
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
