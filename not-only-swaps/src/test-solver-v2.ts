#!/usr/bin/env node
/**
 * Simple test script for SolverV2
 * Run with: tsx src/test-solver-v2.ts
 */

import { SolverV2 } from './solver-v2.js';
import { Network } from './network.js';
import { loadConfigFile } from './config.js';

async function test() {
  console.log('Testing SolverV2...');
  
  // This is just a basic test - you'll need to provide actual config
  try {
    const config = loadConfigFile('config.toml');
    const privateKey = process.env.SOLVER_PRIVATE_KEY || '0x0000000000000000000000000000000000000000000000000000000000000000';
    
    const networks = await Network.createMany(privateKey, config.networks);
    const solver = await SolverV2.from(networks);
    
    console.log('✅ SolverV2 initialized successfully!');
    console.log(`   Chains: ${Array.from(networks.keys()).join(', ')}`);
    console.log(`   Risk threshold: ${solver['riskManager'].maxRisk}`);
    console.log(`   Min solver fee: ${solver['riskManager'].minSolverFee}`);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

test();

