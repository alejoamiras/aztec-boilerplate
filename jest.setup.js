import { checkAztecVersion } from "./scripts/check-aztec-version.js";
import { startSandbox } from "./scripts/start-sandbox.js";

/**
 * Jest global setup - runs before all tests
 */
export default async function setup() {
  console.log("\n🔧 Setting up Aztec testing environment\n");

  try {
    // Step 1: Check Aztec CLI version
    console.log("Step 1: Checking Aztec CLI version compatibility");
    await checkAztecVersion();
    console.log("");

    // Step 2: Start sandbox and wait for readiness
    console.log("Step 2: Starting Aztec sandbox");
    const sandboxManager = await startSandbox();
    console.log("");

    // Store sandbox manager globally for teardown
    globalThis.__AZTEC_SANDBOX_MANAGER__ = sandboxManager;
  } catch (error) {
    console.error(`\n❌ Setup failed: ${error.message}`);
    process.exit(1);
  }
}
