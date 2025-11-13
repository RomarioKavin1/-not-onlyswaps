import { Address, FixedBytes, Uint256 } from 'ethers';

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

