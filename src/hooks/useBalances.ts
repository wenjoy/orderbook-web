import { useCallback, useEffect, useState } from "react";
import { rpcUrl } from "../api";
import { DEFAULT_MARKET } from "../markets";

export type TokenBalance = {
  mint: string;
  amount: string;
  uiAmount: number | null;
  decimals: number;
};

export type Balances = {
  sol: number | null;
  tokens: TokenBalance[];
  loading: boolean;
  error: string | null;
};

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(rpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error.message ?? JSON.stringify(body.error));
  return body.result as T;
}

export function useBalances(owner: string | null) {
  const [state, setState] = useState<Balances>({
    sol: null,
    tokens: [],
    loading: false,
    error: null,
  });

  const refresh = useCallback(async () => {
    if (!owner) {
      setState({ sol: null, tokens: [], loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const bal = await rpc<{ value: number }>("getBalance", [owner]);
      const sol = bal.value / 1e9;

      const parsed = await rpc<{
        value: {
          account: {
            data: {
              parsed: {
                info: {
                  mint: string;
                  tokenAmount: {
                    amount: string;
                    decimals: number;
                    uiAmount: number | null;
                  };
                };
              };
            };
          };
        }[];
      }>("getTokenAccountsByOwner", [
        owner,
        { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
        { encoding: "jsonParsed" },
      ]);

      let tokens: TokenBalance[] = (parsed.value ?? []).map((v) => {
        const info = v.account.data.parsed.info;
        return {
          mint: info.mint,
          amount: info.tokenAmount.amount,
          uiAmount: info.tokenAmount.uiAmount,
          decimals: info.tokenAmount.decimals,
        };
      });

      const prefer = new Set([DEFAULT_MARKET.baseMint, DEFAULT_MARKET.quoteMint]);
      tokens = [
        ...tokens.filter((t) => prefer.has(t.mint)),
        ...tokens.filter((t) => !prefer.has(t.mint)),
      ];

      setState({ sol, tokens, loading: false, error: null });
    } catch (e) {
      setState({
        sol: null,
        tokens: [],
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, [owner]);

  useEffect(() => {
    void refresh();
    if (!owner) return;
  }, [owner, refresh]);

  return { ...state, refresh };
}
