import { Network } from './network.js';
import { Solver } from './solver.js';
import { TradeExecutor } from './executor.js';
import { BlockEvent } from './model.js';
import NodeCache from 'node-cache';

export class App {
  /**
   * Start the main event loop
   */
  static async start(networks: Map<number, Network>): Promise<void> {
    // Create block event streams from all networks
    const blockStreams = Array.from(networks.values()).map((network) =>
      network.subscribeBlocks()
    );

    // Initialize solver
    const solver = await Solver.from(networks);
    const executor = new TradeExecutor(networks);

    // In-flight requests cache (30 second TTL)
    const inFlightRequests = new NodeCache({
      stdTTL: 30,
      maxKeys: 1000,
    });

    console.log('Starting event loop...');

    // Merge streams and process blocks
    await this.mergeAndProcessBlocks(blockStreams, solver, executor, inFlightRequests);
  }

  /**
   * Merge multiple async generators and process blocks
   */
  private static async mergeAndProcessBlocks(
    streams: Array<AsyncGenerator<BlockEvent>>,
    solver: Solver,
    executor: TradeExecutor,
    inFlightRequests: NodeCache
  ): Promise<void> {
    // Process blocks from all streams concurrently
    const streamPromises = streams.map(async (stream, index) => {
      try {
        for await (const blockEvent of stream) {
          try {
            const trades = await solver.fetchState(
              blockEvent.chainId,
              inFlightRequests
            );

            if (trades.length > 0) {
              console.log(
                `✅ Chain ${blockEvent.chainId} (block ${blockEvent.blockNumber}): Found ${trades.length} executable trade(s)`
              );
              await executor.execute(trades, inFlightRequests);
            }
          } catch (error) {
            console.error(
              `❌ Error processing block ${blockEvent.blockNumber} on chain ${blockEvent.chainId}:`,
              error
            );
          }
        }
      } catch (error) {
        console.error(`Stream ${index} error:`, error);
        throw error;
      }
    });

    // Wait for all streams (if any fail, the whole app should fail)
    await Promise.all(streamPromises);
    throw new Error('All block streams ended unexpectedly');
  }
}

