#!/usr/bin/env node

import { Command } from 'commander';
import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { App } from './app.js';
import { Network } from './network.js';
import { loadConfigFile, AppConfig } from './config.js';
import { expandPath } from './util.js';
import winston from 'winston';

// Load environment variables
dotenv.config();

// Setup logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

// Setup CLI
const program = new Command();

// Determine default config path: check local config.toml first, then env var, then default location
const getDefaultConfigPath = (): string => {
  if (process.env.SOLVER_CONFIG_PATH) {
    return process.env.SOLVER_CONFIG_PATH;
  }
  // Check for local config.toml
  if (existsSync('config.toml')) {
    return 'config.toml';
  }
  // Fall back to default location
  return expandPath('~/.config/onlyswaps/solver/config.toml');
};

program
  .name('onlyswaps-solver-ts')
  .description('TypeScript implementation of the OnlySwaps solver')
  .option(
    '-c, --config <path>',
    'Path to configuration file',
    getDefaultConfigPath()
  )
  .requiredOption(
    '-s, --private-key <key>',
    'Private key (hex-encoded, with or without 0x prefix)',
    process.env.SOLVER_PRIVATE_KEY
  )
  .parse(process.argv);

const options = program.opts();

async function main() {
  try {
    logger.info('Starting OnlySwaps Solver (TypeScript)');

    // Load configuration
    const config = loadConfigFile(options.config);
    logger.info(`Loaded configuration with ${config.networks.length} network(s)`);

    // Create networks
    const networks = await Network.createMany(options.privateKey, config.networks);

    // Setup signal handlers
    const shutdown = async () => {
      logger.info('Shutting down...');
      for (const network of networks.values()) {
        await network.destroy();
      }
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    process.on('SIGUSR2', shutdown); // For nodemon

    // Start the app
    await App.start(networks);
  } catch (error) {
    logger.error('Fatal error:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});

