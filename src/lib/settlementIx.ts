/**
 * Settlement Program 指令构造
 * 浏览器环境：禁止使用 Node Buffer，一律 Uint8Array
 * 兼容 @solana/web3.js v1 + Phantom
 */
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";

export function programId(): PublicKey {
  const id =
    (import.meta.env.VITE_SETTLEMENT_PROGRAM_ID as string | undefined) ||
    "Sett1eMent11111111111111111111111111111111";
  return new PublicKey(id);
}

export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);

const enc = new TextEncoder();
const MARKET_SEED = enc.encode("market");
const USER_VAULT_SEED = enc.encode("user_vault");

/** PublicKey → 32-byte Uint8Array（不依赖 Buffer） */
function keyBytes(pk: PublicKey): Uint8Array {
  return pk.toBytes();
}

export function deriveMarket(
  program: PublicKey,
  baseMint: PublicKey,
  quoteMint: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [MARKET_SEED, keyBytes(baseMint), keyBytes(quoteMint)],
    program
  );
}

export function deriveUserVault(
  program: PublicKey,
  market: PublicKey,
  owner: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [USER_VAULT_SEED, keyBytes(market), keyBytes(owner)],
    program
  );
}

/**
 * web3.js v1 的 `TransactionInstruction.data` 类型标注为 Node `Buffer`，
 * 但运行时接受任意 `Uint8Array`（内部序列化用 `toBuffer()` 自行转换）。
 * 浏览器环境不引入 Node Buffer，这里只在类型层面收窄，运行期零成本。
 */
export function ixData(bytes: Uint8Array): Buffer {
  return bytes as unknown as Buffer;
}

function u64le(n: number | bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(n), true);
  return out;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function packInitializeMarket(): Uint8Array {
  return new Uint8Array([0]);
}

export function packInitializeVault(): Uint8Array {
  return new Uint8Array([1]);
}

export function packDeposit(amount: number | bigint, isBase: boolean): Uint8Array {
  return concatBytes(
    new Uint8Array([2]),
    u64le(amount),
    new Uint8Array([isBase ? 1 : 0])
  );
}

export function packWithdraw(amount: number | bigint, isBase: boolean): Uint8Array {
  return concatBytes(
    new Uint8Array([3]),
    u64le(amount),
    new Uint8Array([isBase ? 1 : 0])
  );
}

export function packSettleTrade(
  price: number | bigint,
  quantity: number | bigint,
  takerIsBuy: boolean
): Uint8Array {
  return concatBytes(
    new Uint8Array([4]),
    u64le(price),
    u64le(quantity),
    new Uint8Array([takerIsBuy ? 1 : 0])
  );
}

export type BuiltLocal = {
  name: string;
  ix: TransactionInstruction;
  pdas: Record<string, string>;
  requiredSigner: "authority" | "owner";
};

export function buildInitializeMarket(params: {
  authority: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  program?: PublicKey;
}): BuiltLocal {
  const program = params.program ?? programId();
  const [market, bump] = deriveMarket(program, params.baseMint, params.quoteMint);
  const ix = new TransactionInstruction({
    programId: program,
    keys: [
      { pubkey: params.authority, isSigner: true, isWritable: true },
      { pubkey: market, isSigner: false, isWritable: true },
      { pubkey: params.baseMint, isSigner: false, isWritable: false },
      { pubkey: params.quoteMint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: ixData(packInitializeMarket()),
  });
  return {
    name: "InitializeMarket",
    ix,
    pdas: { market: market.toBase58(), bump: String(bump) },
    requiredSigner: "authority",
  };
}

export function buildInitializeVault(params: {
  owner: PublicKey;
  market: PublicKey;
  program?: PublicKey;
}): BuiltLocal {
  const program = params.program ?? programId();
  const [vault, bump] = deriveUserVault(program, params.market, params.owner);
  const ix = new TransactionInstruction({
    programId: program,
    keys: [
      { pubkey: params.owner, isSigner: true, isWritable: true },
      { pubkey: params.market, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: ixData(packInitializeVault()),
  });
  return {
    name: "InitializeVault",
    ix,
    pdas: {
      user_vault: vault.toBase58(),
      bump: String(bump),
      owner: params.owner.toBase58(),
    },
    requiredSigner: "owner",
  };
}

export function buildDeposit(params: {
  owner: PublicKey;
  market: PublicKey;
  userToken: PublicKey;
  vaultToken: PublicKey;
  amount: number | bigint;
  isBase: boolean;
  program?: PublicKey;
}): BuiltLocal {
  const program = params.program ?? programId();
  const [vault] = deriveUserVault(program, params.market, params.owner);
  const ix = new TransactionInstruction({
    programId: program,
    keys: [
      { pubkey: params.owner, isSigner: true, isWritable: false },
      { pubkey: params.market, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: params.userToken, isSigner: false, isWritable: true },
      { pubkey: params.vaultToken, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: ixData(packDeposit(params.amount, params.isBase)),
  });
  return {
    name: "Deposit",
    ix,
    pdas: { user_vault: vault.toBase58() },
    requiredSigner: "owner",
  };
}

export function buildWithdraw(params: {
  owner: PublicKey;
  market: PublicKey;
  userToken: PublicKey;
  vaultToken: PublicKey;
  amount: number | bigint;
  isBase: boolean;
  program?: PublicKey;
}): BuiltLocal {
  const program = params.program ?? programId();
  const [vault] = deriveUserVault(program, params.market, params.owner);
  const ix = new TransactionInstruction({
    programId: program,
    keys: [
      { pubkey: params.owner, isSigner: true, isWritable: false },
      { pubkey: params.market, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: params.userToken, isSigner: false, isWritable: true },
      { pubkey: params.vaultToken, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: ixData(packWithdraw(params.amount, params.isBase)),
  });
  return {
    name: "Withdraw",
    ix,
    pdas: { user_vault: vault.toBase58() },
    requiredSigner: "owner",
  };
}
