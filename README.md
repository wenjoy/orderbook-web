# Orderbook Trading UI

React + TypeScript + Vite front end for the CLOB demo: off-chain matching,
on-chain settlement.

## Features

- Live order book, trades (with timestamps), depth bars and settlements over WebSocket
- Limit orders with client-side balance validation
- One-click account setup

## Quick start

```bash
npm install
npm run dev     # http://localhost:5173
```

Vite proxies `/api` and `/ws` to `http://127.0.0.1:8080`.

## Configuration

`.env.local` (see `env.example`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | `/api` | Backend API prefix |
| `VITE_WS_URL` | current host + `/ws` | WebSocket URL |
| `VITE_SOLANA_RPC` | `http://127.0.0.1:8899` | Solana RPC endpoint |
| `VITE_SETTLEMENT_PROGRAM_ID` | placeholder | Settlement program id |
| `VITE_FAUCET_URL` | `${VITE_API_URL}/onchain/request_token_airdrop` | Token faucet endpoint |

## Opening a trading account

The page shows four steps; one **Set up trading account** click runs the remaining ones
in order and updates progress live. Completed steps are skipped, so retrying is safe.

1. **SOL** — enough for account rent and fees. If short, the missing amount is requested
   automatically via `requestAirdrop` (local validator / devnet only).
2. **Token accounts** — creates the missing base/quote ATAs in one signature.
3. **Token balances** — calls the faucet twice (base + quote, 100 / 1000); both must be
   non-zero before trading.
4. **Trading account** — `InitializeVault` creates the user vault for the market.

## Structure

```
src/
  api.ts            REST client and faucet request
  markets.ts        Market list from GET /markets
  types.ts          Shared API types (raw u64 fields documented)
  components/       Header, Orderbook, OrderForm, Trades, OpenOrders,
                    Settlements, DepthChart, HoldingOverview, AccountSetup,
  hooks/            useWallet, useBalances, useTradingAccount, useWebSocket
  lib/              amount (unit conversion), settlementIx, chainStatus,
                    decodeAccounts, walletSend, time
```
