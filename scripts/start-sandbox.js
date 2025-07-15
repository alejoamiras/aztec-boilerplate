import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { createPXEClient, waitForPXE } from '@aztec/aztec.js';

// Global reference for the active sandbox manager
let activeSandboxManager = null;
let signalHandlersSetup = false;

/**
 * Setup global signal handlers for graceful shutdown
 */
function setupSignalHandlers() {
  if (signalHandlersSetup) return;
  
  const handleShutdown = async (signal) => {
    console.log(`\n🛑 Received ${signal}, shutting down sandbox manager`);
    
    // Stop the active sandbox manager if it exists
    if (activeSandboxManager) {
      try {
        await activeSandboxManager.stop();
        console.log('✅ Sandbox manager stopped');
      } catch (err) {
        console.error('Error stopping manager:', err);
      }
      activeSandboxManager = null;
    }
    
    process.exit(0);
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  
  signalHandlersSetup = true;
}

/**
 * Start the Aztec sandbox and wait for it to be ready
 */
class SandboxManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.process = null;
    this.isReady = false;
    this.isExternalSandbox = false; // Track if we're using external sandbox vs our own process
    this.timeout = 180000; // 180 seconds timeout (3 minutes)
    this.maxRetries = 3;
    this.verbose = options.verbose ?? false; // Default to false for clean output during testing
    
    // Timer/interval tracking for centralized cleanup
    this.timers = {
      startupTimeout: null,
      forceKillTimeout: null
    };
    
    // Register this manager for signal handling (only one instance should exist)
    activeSandboxManager = this;
    setupSignalHandlers();
  }

  /**
   * Centralized cleanup of all timers and intervals
   */
  cleanupTimers() {
    if (this.timers.startupTimeout) {
      clearTimeout(this.timers.startupTimeout);
      this.timers.startupTimeout = null;
    }
    if (this.timers.forceKillTimeout) {
      clearTimeout(this.timers.forceKillTimeout);
      this.timers.forceKillTimeout = null;
    }
  }

  async checkSandboxConnectivity() {
    console.time(`✅ Sandbox ready`);
    
    const pxe = createPXEClient('http://localhost:8080');
    
    // Use waitForPXE without timeout parameter - it handles retries internally
    await waitForPXE(pxe);

    console.timeEnd(`✅ Sandbox ready`);
    
    // Additional check to ensure PXE is fully ready
    const nodeInfo = await pxe.getNodeInfo();
    
    console.log(`🔧 Node version: ${nodeInfo.nodeVersion}`);
  }

  async start() {
    return new Promise((resolve, reject) => {
      console.log('🚀 Starting Aztec sandbox');
      let resolved = false; // Prevent double resolution
      
      const safeResolve = (value) => {
        if (!resolved) {
          resolved = true;
          resolve(value);
        }
      };
      
      const safeReject = (error) => {
        if (!resolved) {
          resolved = true;
          reject(error);
        }
      };
      
      // Set up timeout
      this.timers.startupTimeout = setTimeout(() => {
        this.cleanup();
        safeReject(new Error('❌ Sandbox startup timed out after 180 seconds'));
      }, this.timeout);

      // Let waitForPXE handle connectivity checking with its internal retry logic
      console.log('🔍 Waiting for sandbox to be ready');
      (async () => {
        try {
          await this.checkSandboxConnectivity();
          this.cleanupTimers();
          this.isExternalSandbox = false; // Mark that we're using our own process
          this.isReady = true;
          console.log('✅ Successfully started our own sandbox process');
          safeResolve(this);
        } catch (error) {
          this.cleanupTimers();
          safeReject(new Error(`❌ Failed to connect to sandbox: ${error.message}`));
        }
      })();

      try {
        // Start the sandbox process
        this.process = spawn('aztec', ['start', '--sandbox'], {
          stdio: 'pipe',
        });

        // Handle process errors
        this.process.on('error', (error) => {
          this.cleanupTimers();
          if (error.code === 'ENOENT') {
            safeReject(new Error('❌ Aztec CLI not found. Please install it with aztec-up'));
          } else {
            safeReject(new Error(`❌ Failed to start sandbox: ${error.message}`));
          }
        });

        // Monitor stdout for informational messages
        if (this.verbose) {
          this.process.stdout.on('data', (data) => {
            const output = data.toString().trim();
            if (output) {
              console.log(`📡 Sandbox: ${output}`);
            }
          });
        }

        // Monitor stderr for errors
        this.process.stderr.on('data', (data) => {
          const output = data.toString().trim();
          if (output) {
            if (this.verbose) {
              console.log(`🚨 Sandbox error: ${output}`);
            }
            
            // Check for port already in use
            if (output.includes('port is already')) {
              this.cleanupTimers();
              console.log('ℹ️  Port 8080 is already in use, checking if existing sandbox is responsive');
              
              // Clean up our failed spawn process since we'll use external sandbox
              if (this.process && !this.process.killed) {
                this.process.kill('SIGTERM');
              }
              this.process = null;
              
              this.checkSandboxConnectivity().then(() => {
                this.isExternalSandbox = true; // Mark that we're using external sandbox
                this.isReady = true;
                console.log('✅ Connected to existing external sandbox');
                safeResolve(this);
              }).catch(() => {
                safeReject(new Error('❌ Port 8080 is in use but sandbox is not responsive'));
              });
            }
          }
        });

        // Handle process exit
        this.process.on('exit', (code, signal) => {
          this.cleanupTimers();
          if (!this.isReady) {
            if (code === 0) {
              safeReject(new Error('❌ Sandbox process exited unexpectedly'));
            } else {
              safeReject(new Error(`❌ Sandbox process exited with code ${code} and signal ${signal}`));
            }
          }
        });

      } catch (error) {
        this.cleanupTimers();
        safeReject(new Error(`❌ Failed to spawn sandbox process: ${error.message}`));
      }
    });
  }

  async stop() {
    // If using external sandbox, only clean up our state - don't stop external process
    if (this.isExternalSandbox) {
      console.log('🔌 Disconnecting from external sandbox (not stopping it)');
      this.cleanupTimers();
      this.process = null;
      this.isReady = false;
      this.isExternalSandbox = false;
      activeSandboxManager = null;
      return;
    }

    if (!this.process || this.process.killed) {
      // Clear global reference even if already stopped
      activeSandboxManager = null;
      this.cleanupTimers();
      return;
    }

    console.log('🛑 Stopping Aztec sandbox');
    
    return new Promise((resolve) => {
      // Set up force kill timeout
      this.timers.forceKillTimeout = setTimeout(() => {
        if (this.process && !this.process.killed) {
          console.log('🔥 Force killing sandbox process');
          this.process.kill('SIGKILL');
        }
      }, 5000);

      // Listen for process exit
      this.process.once('exit', () => {
        this.cleanupTimers();
        this.process = null;
        this.isReady = false;
        this.isExternalSandbox = false;
        // Clear global reference
        activeSandboxManager = null;
        resolve();
      });

      // Send SIGTERM first (graceful shutdown)
      this.process.kill('SIGTERM');
    });
  }

  cleanup() {
    // This is now just a synchronous wrapper for cases where we can't await
    this.cleanupTimers();
    
    // Only kill process if we own it, not if using external sandbox
    if (!this.isExternalSandbox && this.process && !this.process.killed) {
      this.process.kill('SIGTERM');
    }
    
    this.process = null;
    this.isReady = false;
    this.isExternalSandbox = false;
    // Clear global reference
    activeSandboxManager = null;
  }
}

/**
 * Start sandbox and return the manager instance
 */
async function startSandbox(options = {}) {
  const manager = new SandboxManager(options);
  await manager.start();
  return manager;
}

// This script is designed for Jest testing only - no standalone CLI execution

export { startSandbox, SandboxManager }; 