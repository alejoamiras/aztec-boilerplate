/**
 * Jest global teardown - runs after all tests
 */
export default async function teardown() {
  console.log("\nLast Step: Cleaning up Aztec testing environment");

  try {
    // Get the sandbox manager from global storage
    const sandboxManager = globalThis.__AZTEC_SANDBOX_MANAGER__;

    if (sandboxManager) {
      await sandboxManager.stop();
      console.log("✅ Sandbox stopped successfully");
    } else {
      console.log("ℹ️  No sandbox manager found, skipping cleanup");
    }

    console.log("✅ Aztec testing environment cleanup complete\n");
  } catch (error) {
    console.error("⚠️  Error during cleanup:", error.message);
    // Don't exit with error code during cleanup, just log the issue
  }
}
