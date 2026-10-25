import type {
  Orderbook,
  PlaceOrderResponse,
  SettlementJob,
  Side,
  Trade,
} from "./types";

const BASE = import.meta.env.VITE_API_URL ?? "/api";

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

  placeOrder: (body: {
    side: Side;
    price: number;
    quantity: number;
    user: string;
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
};

export function wsUrl(): string {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL as string;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  // Vite proxy: same host /ws → backend
  return `${proto}//${window.location.host}/ws`;
}
