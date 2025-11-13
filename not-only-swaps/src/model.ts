// Removed unused ethers imports

export type RequestId = string; // 32-byte hex string (0x + 64 hex chars)

export interface SwapRequestParameters {
  srcChainId: bigint;
  dstChainId: bigint;
  sender: string;
  recipient: string;
  tokenIn: string;
  tokenOut: string;
  amountOut: bigint;
  verificationFee: bigint;
  solverFee: bigint;
  nonce: bigint;
  executed: boolean;
  requestedAt: bigint;
}

export interface Transfer {
  requestId: RequestId;
  params: SwapRequestParameters;
  conditions?: Condition[]; // Optional conditions for conditional execution
  maxWaitTime?: number; // Maximum time to wait for conditions (ms)
  priority?: number; // Execution priority (higher = more important)
}

/**
 * Condition types for conditional execution
 */
export type ConditionType = 'price' | 'time' | 'balance' | 'custom';
export type ConditionOperator = 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'between';

export interface Condition {
  type: ConditionType;
  operator: ConditionOperator;
  params: Record<string, any>;
}

/**
 * Extended transfer with conditions (for internal use)
 */
export interface ConditionalTransfer extends Transfer {
  conditions: Condition[];
}

export interface ChainState {
  nativeBalance: bigint;
  tokenBalances: Map<string, bigint>; // token address -> balance
  transfers: Transfer[];
  alreadyFulfilled: RequestId[];
}

export interface Trade {
  requestId: RequestId;
  nonce: bigint;
  tokenInAddr: string;
  tokenOutAddr: string;
  srcChainId: bigint;
  destChainId: bigint;
  senderAddr: string;
  recipientAddr: string;
  swapAmount: bigint;
}

export interface BlockEvent {
  chainId: number;
  blockNumber: number;
}

export function transferToTrade(transfer: Transfer): Trade {
  return {
    requestId: transfer.requestId,
    nonce: transfer.params.nonce,
    tokenInAddr: transfer.params.tokenIn,
    tokenOutAddr: transfer.params.tokenOut,
    srcChainId: transfer.params.srcChainId,
    destChainId: transfer.params.dstChainId,
    senderAddr: transfer.params.sender,
    recipientAddr: transfer.params.recipient,
    swapAmount: transfer.params.amountOut,
  };
}

