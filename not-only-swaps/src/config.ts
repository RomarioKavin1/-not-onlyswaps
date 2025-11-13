import { readFileSync, existsSync } from 'fs';
import { parse } from 'toml';
import { expandPath } from './util.js';

export interface NetworkConfig {
  chain_id: number;
  rpc_url: string;
  tokens: string[];
  router_address: string;
  tx_gas_buffer?: number;
  tx_gas_price_buffer?: number;
}

export interface AgentConfig {
  healthcheck_listen_addr: string;
  healthcheck_port: number;
  log_level?: string;
  log_json?: boolean;
}

export interface AppConfig {
  agent: AgentConfig;
  networks: NetworkConfig[];
}

export interface CliArgs {
  configPath: string;
  privateKey: string;
}

export function loadConfigFile(configPath: string): AppConfig {
  let expandedPath = expandPath(configPath);
  
  // If path doesn't exist, try relative to current working directory
  if (!existsSync(expandedPath)) {
    const localPath = configPath;
    if (existsSync(localPath)) {
      expandedPath = localPath;
    } else {
      throw new Error(`Config file not found: ${configPath} (tried ${expandedPath} and ${localPath})`);
    }
  }
  
  const content = readFileSync(expandedPath, 'utf-8');
  const parsed = parse(content) as any;

  // Convert TOML array of tables to networks array
  const networks: NetworkConfig[] = parsed.networks || [];
  
  return {
    agent: {
      healthcheck_listen_addr: parsed.agent?.healthcheck_listen_addr || '0.0.0.0',
      healthcheck_port: parsed.agent?.healthcheck_port || 8081,
      log_level: parsed.agent?.log_level || 'info',
      log_json: parsed.agent?.log_json || false,
    },
    networks: networks.map((net: any) => ({
      chain_id: net.chain_id,
      rpc_url: net.rpc_url,
      tokens: net.tokens || [],
      router_address: net.router_address,
      tx_gas_buffer: net.tx_gas_buffer || 120,
      tx_gas_price_buffer: net.tx_gas_price_buffer || 100,
    })),
  };
}

