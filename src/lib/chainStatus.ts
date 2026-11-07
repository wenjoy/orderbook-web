/**
 * 链上就绪检查 + 可补齐项（Init Market/Vault、创建 ATA）
 * 浏览器-only：Uint8Array，无 Buffer
 */
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { rpcUrl } from "../api";
import {
  decodeMarket,
  decodeMintSupply,
  decodeTokenAmount,
  decodeUserVault,
  type DecodedMarket,
  type DecodedUserVault,
} from "./decodeAccounts";
import { deriveMarket, deriveUserVault, ixData, programId } from "./settlementIx";
import type { MarketPair } from "../markets";

export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

export type AccountStatus = {
  address: string;
  exists: boolean;
  lamports?: number;
  executable?: boolean;
  owner?: string;
  dataLen?: number;
};

export type TokenAccountStatus = AccountStatus & {
  amount: bigint | null;
  uiAmount: string | null;
};

export type MintStatus = AccountStatus & {
  supply: bigint | null;
  decimals: number | null;
  isInitialized: boolean | null;
};

export type ReadyReport = {
  rpc: string;
  program: AccountStatus & { programId: string };
  marketPda: AccountStatus & {
    address: string;
    decoded: DecodedMarket | null;
  };
  userVault: AccountStatus & {
    address: string;
    decoded: DecodedUserVault | null;
  };
  userWallet: AccountStatus & {
    address: string;
  },
  baseMint: MintStatus;
  quoteMint: MintStatus;
  /** 用户 ATA */
  walletBaseAta: TokenAccountStatus;
  walletQuoteAta: TokenAccountStatus;
  /** Market PDA 作为 owner 的托管 ATA（约定） */
  vaultBaseAta: TokenAccountStatus;
  vaultQuoteAta: TokenAccountStatus;
  checks: { id: string; ok: boolean; label: string; fix?: string }[];
  tradeReady: boolean;
};

function encodePk(bytes: Uint8Array): string {
  return new PublicKey(bytes).toBase58();
}

export function getAssociatedTokenAddress(owner: PublicKey, mint: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBytes(), TOKEN_PROGRAM_ID.toBytes(), mint.toBytes()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata;
}

/** Idempotent create ATA ix */
export function createAssociatedTokenAccountIx(params: {
  payer: PublicKey;
  owner: PublicKey;
  mint: PublicKey;
}): TransactionInstruction {
  const ata = getAssociatedTokenAddress(params.owner, params.mint);
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: params.payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: params.owner, isSigner: false, isWritable: false },
      { pubkey: params.mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: ixData(new Uint8Array()), // CreateIdempotent 实际 tag=1；Create 为 empty。用 CreateIdempotent:
  });
}

/** CreateIdempotent discriminator = 1 */
export function createAssociatedTokenAccountIdempotentIx(params: {
  payer: PublicKey;
  owner: PublicKey;
  mint: PublicKey;
}): TransactionInstruction {
  const ata = getAssociatedTokenAddress(params.owner, params.mint);
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: params.payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: params.owner, isSigner: false, isWritable: false },
      { pubkey: params.mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: ixData(new Uint8Array([1])),
  });
}

async function fetchInfo(
  connection: Connection,
  address: PublicKey
): Promise<{
  exists: boolean;
  lamports?: number;
  executable?: boolean;
  owner?: string;
  data: Uint8Array | null;
}> {
  const info = await connection.getAccountInfo(address, "confirmed");
  if (!info) {
    return { exists: false, data: null };
  }
  return {
    exists: true,
    lamports: info.lamports,
    executable: info.executable,
    owner: info.owner.toBase58(),
    data: info.data instanceof Uint8Array ? info.data : new Uint8Array(info.data),
  };
}

function fmtAmount(amount: bigint | null, decimals: number | null): string | null {
  if (amount == null) return null;
  if (decimals == null) return amount.toString();
  const d = Number(decimals);
  const base = 10n ** BigInt(d);
  const whole = amount / base;
  const frac = amount % base;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(d, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}

export type VaultStatus = {
  /** user_vault PDA 地址 */
  address: string;
  /** 账户是否已上链 */
  exists: boolean;
  /** 已上链且 is_initialized = true */
  initialized: boolean;
};

/**
 * 轻量查询：只取用户的 vault PDA 账户（1 次 RPC），
 * 用于 Trade 页判断是否需要引导用户「开户」。
 */
export async function fetchVaultStatus(params: {
  wallet: string;
  market: MarketPair;
}): Promise<VaultStatus> {
  const connection = new Connection(rpcUrl(), "confirmed");
  const pid = programId();
  const [marketPk] = deriveMarket(
    pid,
    new PublicKey(params.market.baseMint),
    new PublicKey(params.market.quoteMint)
  );
  const [vaultPk] = deriveUserVault(pid, marketPk, new PublicKey(params.wallet));
  const info = await fetchInfo(connection, vaultPk);

  let initialized = false;
  if (info.data && info.data.length >= 82) {
    try {
      initialized = decodeUserVault(info.data, encodePk).is_initialized;
    } catch {
      initialized = false;
    }
  }

  return { address: vaultPk.toBase58(), exists: info.exists, initialized };
}

export async function fetchReadyReport(params: {
  pair: MarketPair;
  wallet: string | null;
}): Promise<ReadyReport> {
  const connection = new Connection(rpcUrl(), "confirmed");
  const pid = programId();
  const baseMintPk = new PublicKey(params.pair.baseMint);
  const quoteMintPk = new PublicKey(params.pair.quoteMint);
  const [marketPk] = deriveMarket(pid, baseMintPk, quoteMintPk);

  let vaultPk: PublicKey | null = null;
  if (params.wallet) {
    const [v] = deriveUserVault(pid, marketPk, new PublicKey(params.wallet));
    vaultPk = v;
  }

  const programInfo = await fetchInfo(connection, pid);
  const marketInfo = await fetchInfo(connection, marketPk);
  const vaultInfo = vaultPk
    ? await fetchInfo(connection, vaultPk)
    : { exists: false, data: null as Uint8Array | null };
  const walletInfo = params.wallet
    ? await fetchInfo(connection, new PublicKey(params.wallet))
    : { exists: false, data: null as Uint8Array | null };
  console.log('wallet', walletInfo)

  const baseMintInfo = await fetchInfo(connection, baseMintPk);
  const quoteMintInfo = await fetchInfo(connection, quoteMintPk);

  let marketDecoded: DecodedMarket | null = null;
  if (marketInfo.data && marketInfo.data.length >= 114) {
    try {
      marketDecoded = decodeMarket(marketInfo.data, encodePk);
    } catch {
      marketDecoded = null;
    }
  }

  let vaultDecoded: DecodedUserVault | null = null;
  if (vaultInfo.data && vaultInfo.data.length >= 82) {
    try {
      vaultDecoded = decodeUserVault(vaultInfo.data, encodePk);
    } catch {
      vaultDecoded = null;
    }
  }

  const baseMintDecoded = baseMintInfo.data ? decodeMintSupply(baseMintInfo.data) : null;
  const quoteMintDecoded = quoteMintInfo.data ? decodeMintSupply(quoteMintInfo.data) : null;

  const walletPk = params.wallet ? new PublicKey(params.wallet) : null;
  const walletBaseAta = walletPk ? getAssociatedTokenAddress(walletPk, baseMintPk) : null;
  const walletQuoteAta = walletPk ? getAssociatedTokenAddress(walletPk, quoteMintPk) : null;
  // 托管 token 账户约定：owner = Market PDA
  const vaultBaseAta = getAssociatedTokenAddress(marketPk, baseMintPk);
  const vaultQuoteAta = getAssociatedTokenAddress(marketPk, quoteMintPk);

  async function tokenStatus(
    addr: PublicKey | null,
    decimals: number | null
  ): Promise<TokenAccountStatus> {
    if (!addr) {
      return {
        address: "—",
        exists: false,
        amount: null,
        uiAmount: null,
      };
    }
    const info = await fetchInfo(connection, addr);
    const amount =
      info.data != null ? decodeTokenAmount(info.data) : null;
    return {
      address: addr.toBase58(),
      exists: info.exists,
      lamports: info.lamports,
      owner: info.owner,
      dataLen: info.data?.length,
      amount,
      uiAmount: fmtAmount(amount, decimals),
    };
  }

  const baseDec = baseMintDecoded?.decimals ?? null;
  const quoteDec = quoteMintDecoded?.decimals ?? null;

  const [
    walletBaseAtaS,
    walletQuoteAtaS,
    vaultBaseAtaS,
    vaultQuoteAtaS,
  ] = await Promise.all([
    tokenStatus(walletBaseAta, baseDec),
    tokenStatus(walletQuoteAta, quoteDec),
    tokenStatus(vaultBaseAta, baseDec),
    tokenStatus(vaultQuoteAta, quoteDec),
  ]);

  const checks: ReadyReport["checks"] = [];

  const programOk = programInfo.exists && Boolean(programInfo.executable);
  checks.push({
    id: "program",
    ok: programOk,
    label: "Program 已部署且 executable",
    fix: programOk
      ? undefined
      : "用 solana program deploy 部署 settlement；设置 VITE_SETTLEMENT_PROGRAM_ID",
  });

  const baseMintOk = Boolean(baseMintDecoded?.isInitialized);
  const quoteMintOk = Boolean(quoteMintDecoded?.isInitialized);
  checks.push({
    id: "base_mint",
    ok: baseMintOk,
    label: `Base mint 存在 (${params.pair.baseSymbol})`,
    fix: baseMintOk
      ? undefined
      : "该市场的 base mint 链上不存在，请检查后端 markets 表中的 base_mint",
  });
  checks.push({
    id: "quote_mint",
    ok: quoteMintOk,
    label: `Quote mint 存在 (${params.pair.quoteSymbol})`,
    fix: quoteMintOk
      ? undefined
      : "该市场的 quote mint 链上不存在，请检查后端 markets 表中的 quote_mint",
  });

  const marketOk = marketInfo.exists && Boolean(marketDecoded?.is_initialized);
  checks.push({
    id: "market",
    ok: marketOk,
    label: "Market PDA 已初始化",
    fix: marketOk ? undefined : "Admin → Initialize Market（钱包签名）",
  });

  const vaultOk =
    Boolean(params.wallet) &&
    vaultInfo.exists &&
    Boolean(vaultDecoded?.is_initialized);
  checks.push({
    id: "user_vault",
    ok: vaultOk,
    label: "UserVault PDA 已初始化（当前钱包）",
    fix: !params.wallet
      ? "先连接钱包"
      : vaultOk
        ? undefined
        : "回 Trade 页点击「Open Account」初始化 User Vault（需先有 Market）",
  });

  const walletOk =
    Boolean(params.wallet) &&
    walletInfo.exists

  checks.push({
    id: "user_wallet",
    ok: walletOk,
    label: "User wallet is already on chain",
    fix: !params.wallet
      ? "先连接钱包"
      : walletOk
        ? undefined
        : "Admin → User wallet must have balance",
  });
  checks.push({
    id: "wallet_base_ata",
    ok: walletBaseAtaS.exists,
    label: "钱包 Base ATA",
    fix: walletBaseAtaS.exists
      ? undefined
      : "下方「创建钱包 Base ATA」或先有 mint",
  });
  checks.push({
    id: "wallet_quote_ata",
    ok: walletQuoteAtaS.exists,
    label: "钱包 Quote ATA",
    fix: walletQuoteAtaS.exists ? undefined : "下方「创建钱包 Quote ATA」",
  });
  checks.push({
    id: "vault_base_ata",
    ok: vaultBaseAtaS.exists,
    label: "托管 Base ATA（owner=Market PDA）",
    fix: vaultBaseAtaS.exists ? undefined : "下方「创建托管 Base ATA」",
  });
  checks.push({
    id: "vault_quote_ata",
    ok: vaultQuoteAtaS.exists,
    label: "托管 Quote ATA（owner=Market PDA）",
    fix: vaultQuoteAtaS.exists ? undefined : "下方「创建托管 Quote ATA」",
  });

  // 交易最少：program + mints + market + user vault + 有余额的托管逻辑
  // 链下撮合仍可只要求 program/market/vault；真实 deposit 还要 ATA
  const tradeReady =
    programOk && marketOk && vaultOk && baseMintOk && quoteMintOk && walletOk;

  return {
    rpc: rpcUrl(),
    program: {
      programId: pid.toBase58(),
      address: pid.toBase58(),
      exists: programInfo.exists,
      executable: programInfo.executable,
      lamports: programInfo.lamports,
      owner: programInfo.owner,
      dataLen: programInfo.data?.length,
    },
    marketPda: {
      address: marketPk.toBase58(),
      exists: marketInfo.exists,
      lamports: marketInfo.lamports,
      owner: marketInfo.owner,
      dataLen: marketInfo.data?.length,
      decoded: marketDecoded,
    },
    userVault: {
      address: vaultPk?.toBase58() ?? "—",
      exists: vaultInfo.exists,
      lamports: vaultInfo.lamports,
      owner: vaultInfo.owner,
      dataLen: vaultInfo.data?.length,
      decoded: vaultDecoded,
    },
    userWallet: {
      address: params.wallet ?? "-",
      exists: walletInfo.exists,
      lamports: walletInfo.lamports,
    },
    baseMint: {
      address: baseMintPk.toBase58(),
      exists: baseMintInfo.exists,
      lamports: baseMintInfo.lamports,
      owner: baseMintInfo.owner,
      supply: baseMintDecoded?.supply ?? null,
      decimals: baseMintDecoded?.decimals ?? null,
      isInitialized: baseMintDecoded?.isInitialized ?? null,
    },
    quoteMint: {
      address: quoteMintPk.toBase58(),
      exists: quoteMintInfo.exists,
      lamports: quoteMintInfo.lamports,
      owner: quoteMintInfo.owner,
      supply: quoteMintDecoded?.supply ?? null,
      decimals: quoteMintDecoded?.decimals ?? null,
      isInitialized: quoteMintDecoded?.isInitialized ?? null,
    },
    walletBaseAta: walletBaseAtaS,
    walletQuoteAta: walletQuoteAtaS,
    vaultBaseAta: vaultBaseAtaS,
    vaultQuoteAta: vaultQuoteAtaS,
    checks,
    tradeReady,
  };
}

export { Connection, PublicKey, Transaction };
