#!/usr/bin/env node
/**
 * Simple runner to test SolverV2 imports
 * Run with: tsx src/run-test.ts
 */

console.log('Testing SolverV2 imports...');

try {
  // Test imports
  const solverModule = await import('./solver-v2.js');
  
  console.log('✅ All imports successful!');
  console.log('   - SolverV2:', typeof solverModule.SolverV2);
  console.log('   - Available exports:', Object.keys(solverModule).join(', '));
  
  if (solverModule.SolverV2) {
    console.log('✅ SolverV2 class is available and ready to use!');
  }
  
  process.exit(0);
} catch (error: any) {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}

