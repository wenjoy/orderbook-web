import { useEffect, useState } from "react";
import { api, type OnchainResult } from "../api";
import { DEFAULT_MARKET, MARKET_PAIRS, type MarketPair } from "../markets";

type Props = {
  wallet: string | null;
  showToast: (m: string) => void;
};

function ResultBox({ r }: { r: OnchainResult | null }) {
  if (!r) return null;
  return (
    <pre className="mt-2 max-h-48 overflow-auto rounded bg-black/40 p-2 text-[10px] text-gray-400">
      {JSON.stringify(
        {
          name: r.built.name,
          submitted: r.submitted,
          signature: r.signature,
          error: r.error,
          pdas: r.built.pdas,
          accounts: r.built.accounts,
          ix_data_hex: r.built.ix_data_hex,
        },
        null,
        2
      )}
    </pre>
  );
}

export function AdminPanel({ wallet, showToast }: Props) {
  const [pair, setPair] = useState<MarketPair>(DEFAULT_MARKET);
  const [market, setMarket] = useState("");
  const [owner, setOwner] = useState(wallet ?? "");
  const [amount, setAmount] = useState("1000");
  const [isBase, setIsBase] = useState(false);
  const [userToken, setUserToken] = useState("");
  const [vaultToken, setVaultToken] = useState("");
  const [submit, setSubmit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<OnchainResult | null>(null);

  useEffect(() => {
    if (wallet) setOwner(wallet);
  }, [wallet]);

  const run = async (fn: () => Promise<OnchainResult>, label: string) => {
    setBusy(true);
    setLast(null);
    try {
      const r = await fn();
      setLast(r);
      if (r.error) showToast(`${label} error: ${r.error}`);
      else if (r.submitted) showToast(`${label} submitted: ${r.signature?.slice(0, 12)}…`);
      else showToast(`${label} built (submit=false)`);
      const m = r.built.pdas?.market ?? r.built.pdas?.["market"];
      if (typeof m === "string") setMarket(m);
      if (typeof r.built.pdas?.market === "string") setMarket(r.built.pdas.market as string);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="panel">
        <div className="panel-title">Admin · 链上准备</div>
        <div className="space-y-3 p-3 text-sm">
          <p className="text-xs text-gray-500">
            默认 <code className="text-gray-400">submit=false</code> 只构造指令。
            勾选 Submit 并用匹配的 <code className="text-gray-400">SETTLEMENT_KEYPAIR</code> 热钱包才会真上链。
          </p>
          <label className="flex items-center gap-2 text-xs text-gray-400">
            <input
              type="checkbox"
              checked={submit}
              onChange={(e) => setSubmit(e.target.checked)}
            />
            Submit on-chain (热钱包)
          </label>
        </div>
      </div>

      {/* Init Market */}
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
            <p className="mt-1 font-mono text-[10px] text-gray-500">
              base {pair.baseMint.slice(0, 8)}… · quote {pair.quoteMint.slice(0, 8)}…
            </p>
          </div>
          <button
            type="button"
            className="btn-primary sm:col-span-2"
            disabled={busy}
            onClick={() =>
              run(
                () =>
                  api.initializeMarket({
                    base_mint: pair.baseMint,
                    quote_mint: pair.quoteMint,
                    authority: "69ouCtDdqt7srmncBTgwbfy9yQMGCEuFPNGUFpPwWRKM",
                    // authority: "Ax81KAFh4tZAqoKLGiebbBMSxEzGnrfXZL9kGCWwwaqJ",
                    submit,
                  }),
                "InitMarket"
              )
            }
          >
            Initialize Market
          </button>
        </div>
      </div>

      {/* Init Vault */}
      <div className="panel">
        <div className="panel-title">2. InitializeVault</div>
        <div className="grid gap-2 p-3 sm:grid-cols-2">
          <div>
            <label className="label">Owner (钱包)</label>
            <input
              className="input font-mono text-xs"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="连接钱包后自动填入"
            />
            {wallet && (
              <button type="button" className="btn-ghost mt-1 text-[10px]" onClick={() => setOwner(wallet)}>
                使用当前钱包
              </button>
            )}
          </div>
          <div>
            <label className="label">Market PDA</label>
            <input className="input font-mono text-xs" value={market} onChange={(e) => setMarket(e.target.value)} />
          </div>
          <button
            type="button"
            className="btn-primary sm:col-span-2"
            disabled={busy || !owner}
            onClick={() =>
              run(
                () =>
                  api.initializeVault({
                    owner,
                    market: market || undefined,
                    submit,
                  }),
                "InitVault"
              )
            }
          >
            Initialize Vault
          </button>
        </div>
      </div>

      {/* Deposit / Withdraw */}
      <div className="panel">
        <div className="panel-title">3. Deposit / Withdraw</div>
        <div className="grid gap-2 p-3 sm:grid-cols-2">
          <div>
            <label className="label">Amount</label>
            <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="label">Asset</label>
            <select
              className="input"
              value={isBase ? "base" : "quote"}
              onChange={(e) => setIsBase(e.target.value === "base")}
            >
              <option value="quote">Quote</option>
              <option value="base">Base</option>
            </select>
          </div>
          <div>
            <label className="label">User token account</label>
            <input className="input font-mono text-xs" value={userToken} onChange={(e) => setUserToken(e.target.value)} />
          </div>
          <div>
            <label className="label">Vault token account</label>
            <input className="input font-mono text-xs" value={vaultToken} onChange={(e) => setVaultToken(e.target.value)} />
          </div>
          <button
            type="button"
            className="btn-bid"
            disabled={busy || !owner || !userToken || !vaultToken}
            onClick={() =>
              run(
                () =>
                  api.deposit({
                    owner,
                    amount: Number(amount),
                    is_base: isBase,
                    user_token: userToken,
                    vault_token: vaultToken,
                    market: market || undefined,
                    submit,
                  }),
                "Deposit"
              )
            }
          >
            Deposit
          </button>
          <button
            type="button"
            className="btn-ask"
            disabled={busy || !owner || !userToken || !vaultToken}
            onClick={() =>
              run(
                () =>
                  api.withdraw({
                    owner,
                    amount: Number(amount),
                    is_base: isBase,
                    user_token: userToken,
                    vault_token: vaultToken,
                    market: market || undefined,
                    submit,
                  }),
                "Withdraw"
              )
            }
          >
            Withdraw
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Last response</div>
        <div className="p-3">
          <ResultBox r={last} />
        </div>
      </div>
    </div>
  );
}
