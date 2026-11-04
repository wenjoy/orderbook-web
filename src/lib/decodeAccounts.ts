/** Borsh 布局解码：与 programs/settlement/src/state.rs 对齐（无 discriminator） */

export type DecodedMarket = {
  is_initialized: boolean;
  authority: string;
  base_mint: string;
  quote_mint: string;
  total_base_deposited: bigint;
  total_quote_deposited: bigint;
  bump: number;
};

export type DecodedUserVault = {
  is_initialized: boolean;
  owner: string;
  market: string;
  base_balance: bigint;
  quote_balance: bigint;
  bump: number;
};

function readBool(data: Uint8Array, o: number): [boolean, number] {
  return [data[o] !== 0, o + 1];
}

function readPubkey(data: Uint8Array, o: number): [Uint8Array, number] {
  return [data.slice(o, o + 32), o + 32];
}

function readU64(data: Uint8Array, o: number): [bigint, number] {
  const v = new DataView(data.buffer, data.byteOffset + o, 8).getBigUint64(0, true);
  return [v, o + 8];
}

function readU8(data: Uint8Array, o: number): [number, number] {
  return [data[o], o + 1];
}

/** base58 encode 32 bytes — 用 web3 PublicKey */
export function decodeMarket(data: Uint8Array, encode: (b: Uint8Array) => string): DecodedMarket {
  let o = 0;
  let is_initialized: boolean;
  let auth: Uint8Array, base: Uint8Array, quote: Uint8Array;
  let total_base: bigint, total_quote: bigint;
  let bump: number;
  [is_initialized, o] = readBool(data, o);
  [auth, o] = readPubkey(data, o);
  [base, o] = readPubkey(data, o);
  [quote, o] = readPubkey(data, o);
  [total_base, o] = readU64(data, o);
  [total_quote, o] = readU64(data, o);
  [bump, o] = readU8(data, o);
  return {
    is_initialized,
    authority: encode(auth),
    base_mint: encode(base),
    quote_mint: encode(quote),
    total_base_deposited: total_base,
    total_quote_deposited: total_quote,
    bump,
  };
}

export function decodeUserVault(
  data: Uint8Array,
  encode: (b: Uint8Array) => string
): DecodedUserVault {
  let o = 0;
  let is_initialized: boolean;
  let owner: Uint8Array, market: Uint8Array;
  let base_balance: bigint, quote_balance: bigint;
  let bump: number;
  [is_initialized, o] = readBool(data, o);
  [owner, o] = readPubkey(data, o);
  [market, o] = readPubkey(data, o);
  [base_balance, o] = readU64(data, o);
  [quote_balance, o] = readU64(data, o);
  [bump, o] = readU8(data, o);
  return {
    is_initialized,
    owner: encode(owner),
    market: encode(market),
    base_balance,
    quote_balance,
    bump,
  };
}

/** SPL Mint: supply @ 36, decimals @ 44, initialized @ 45 */
export function decodeMintSupply(data: Uint8Array): {
  supply: bigint;
  decimals: number;
  isInitialized: boolean;
} | null {
  if (data.length < 82) return null;
  const supply = new DataView(data.buffer, data.byteOffset + 36, 8).getBigUint64(0, true);
  const decimals = data[44];
  const isInitialized = data[45] !== 0;
  return { supply, decimals, isInitialized };
}

/** SPL Token Account: amount @ 64 */
export function decodeTokenAmount(data: Uint8Array): bigint | null {
  if (data.length < 72) return null;
  return new DataView(data.buffer, data.byteOffset + 64, 8).getBigUint64(0, true);
}
