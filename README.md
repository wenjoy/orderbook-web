# Orderbook App (Phase 5)

React + TypeScript + Vite + Tailwind 交易界面，对接 `api-server`。

## 功能

- 实时 Orderbook（WebSocket）+ 点击价格填单
- 限价买卖下单 / 取消挂单
- 最近成交
- 结算任务列表（Phase 4）
- 简易深度条
- 用户字符串 / Phantom 连接（写入 pubkey 作为 `user`）

## 启动

先启动后端：

```bash
cd api-server && cargo run
```

再启动前端：

```bash
cd app
npm install
npm run dev
```

浏览器打开 http://localhost:5173  

Vite 已把 `/api` 和 `/ws` 代理到 `http://127.0.0.1:3000`。

### 可选环境变量

```bash
VITE_API_URL=http://127.0.0.1:3000   # 不走代理时直连
VITE_WS_URL=ws://127.0.0.1:3000/ws
```

## 演示路径

1. 顶部用户填 `bob`，Sell 10 @ 100  
2. 用户改成 `alice`，Buy 5 @ 100  
3. 右侧出现 Trade + Settlement（dry_run → simulated）  
4. WebSocket 实时刷新深度  

## 目录

```
src/
  api.ts              # REST 客户端
  types.ts
  hooks/useWebSocket.ts
  components/
    Header.tsx
    Orderbook.tsx
    OrderForm.tsx
    Trades.tsx
    OpenOrders.tsx
    Settlements.tsx
    DepthChart.tsx
  App.tsx
```

## 说明

- 当前 API 用字符串 `user` 标识；Phantom 仅用于填入 pubkey，完整签名流在 queue/hot_wallet 模式与 Phase 4 热钱包接线后扩展。
- Vault 链上余额读取可在 Program 部署后用 `getAccountInfo` 补充。
