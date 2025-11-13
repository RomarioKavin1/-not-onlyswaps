/**
 * Normalizes a chain ID from U256 (bigint) to u64 (number)
 */
export function normalizeChainId(chainId: bigint): number {
  // Extract the lower 64 bits
  return Number(chainId & BigInt('0xFFFFFFFFFFFFFFFF'));
}

/**
 * Converts a hex string to a RequestId (ensures 0x prefix and 66 chars total for bytes32)
 */
export function toRequestId(hex: string | Uint8Array): string {
  let hexString: string;
  
  if (typeof hex === 'string') {
    hexString = hex.startsWith('0x') ? hex.slice(2) : hex;
  } else {
    // Convert Uint8Array to hex
    hexString = Array.from(hex)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  
  // Ensure it's exactly 64 hex characters (32 bytes)
  const padded = hexString.padStart(64, '0').slice(0, 64);
  return `0x${padded.toLowerCase()}`;
}

/**
 * Expands home directory paths like ~/.config/...
 */
export function expandPath(path: string): string {
  if (path.startsWith('~')) {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    return path.replace('~', home);
  }
  return path;
}

