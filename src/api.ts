import { MarketPair } from "./markets";
import type {
  Orderbook,
  PlaceOrderResponse,
  SettlementJob,
  Side,
  Trade,
} from "./types";

const BASE = import.meta.env.VITE_API_URL ?? "/api";

export type OnchainResult = {
  built: {
    name: string;
    program_id: string;
    ix_data_hex: string;
    accounts: { pubkey: string; is_signer: boolean; is_writable: boolean }[];
    pdas: Record<string, unknown>;
    required_signer: string;
  };
  submitted: boolean;
  signature: string | null;
  error: string | null;
};

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = body.error ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => json<string>("/health").catch(() => "error"),

  orderbook: () => json<Orderbook>("/orderbook"),

  trades: () => json<{ trades: Trade[] }>("/trades").then((r) => r.trades),

  markets: () => json<MarketPair[]>("/markets"),

  placeOrder: (body: {
    side: Side;
    price: number;
    quantity: number;
    user: string;
    market: string;
  }) =>
    json<PlaceOrderResponse>("/orders", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  cancelOrder: (id: number) =>
    json<{ cancelled: boolean; order_id: number }>(`/orders/${id}`, {
      method: "DELETE",
    }),

  settlements: (limit = 50) =>
    json<SettlementJob[]>(`/settlements?limit=${limit}`),

  settlementConfig: () => json<Record<string, unknown>>("/settlement/config"),

  confirmSettlement: (id: number, signature: string, success = true) =>
    json<SettlementJob>(`/settlements/${id}/confirm`, {
      method: "POST",
      body: JSON.stringify({ signature, success }),
    }),

  // ----- on-chain program instructions -----
  onchainInstructions: () => json<Record<string, unknown>>("/onchain/instructions"),

  derivePdas: (q: {
    base_mint?: string;
    quote_mint?: string;
    owner?: string;
    market?: string;
  }) => {
    const sp = new URLSearchParams();
    Object.entries(q).forEach(([k, v]) => {
      if (v) sp.set(k, v);
    });
    return json<Record<string, unknown>>(`/onchain/derive?${sp}`);
  },

  initializeMarket: (body: {
    base_mint: string;
    quote_mint: string;
    authority?: string;
    submit?: boolean;
  }) =>
    json<OnchainResult>("/onchain/initialize-market", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  initializeVault: (body: {
    owner: string;
    market?: string;
    submit?: boolean;
  }) =>
    json<OnchainResult>("/onchain/initialize-vault", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  deposit: (body: {
    owner: string;
    amount: number;
    is_base: boolean;
    user_token: string;
    vault_token: string;
    market?: string;
    submit?: boolean;
  }) =>
    json<OnchainResult>("/onchain/deposit", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  withdraw: (body: {
    owner: string;
    amount: number;
    is_base: boolean;
    user_token: string;
    vault_token: string;
    market?: string;
    submit?: boolean;
  }) =>
    json<OnchainResult>("/onchain/withdraw", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  settleTrade: (body: {
    maker_user: string;
    taker_user: string;
    price: number;
    quantity: number;
    taker_is_buy: boolean;
    market?: string;
    authority?: string;
    submit?: boolean;
  }) =>
    json<OnchainResult>("/onchain/settle-trade", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export function wsUrl(): string {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL as string;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

export function rpcUrl(): string {
  return (
    (import.meta.env.VITE_SOLANA_RPC as string | undefined) ??
    "http://127.0.0.1:8899"
  );
}

