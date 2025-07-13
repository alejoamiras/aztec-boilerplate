import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Parse version number from aztec --version output
 * Handles both single-line and multi-line output formats
 * @param {string} output - Raw output from aztec --version command
 * @returns {string} - Extracted version number
 */
function parseVersionFromOutput(output) {
  const lines = output.trim().split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  if (lines.length === 0) {
    throw new Error('❌ Empty output from aztec --version command');
  }
  
  // If one line, use it. If two lines, use the second (version line)
  if (lines.length === 1) {
    return lines[0];
  } else if (lines.length === 2) {
    return lines[1];
  } else {
    throw new Error(`❌ Unexpected output format from aztec --version: expected 1 or 2 lines, got ${lines.length}`);
  }
}

/**
 * Check if the installed Aztec CLI version matches the expected version in package.json
 */
async function checkAztecVersion() {
  try {
    console.log('🔍 Checking Aztec CLI version');
    
    // Read expected version from package.json
    const packageJsonPath = join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    const expectedVersion = packageJson.config?.aztecVersion;
    
    if (!expectedVersion) {
      throw new Error('❌ No aztecVersion found in package.json config');
    }
    
    console.log(`📋 Expected Aztec version: ${expectedVersion}`);
    
    try {
      // Check if aztec CLI is installed and get version
      const { stdout } = await execAsync('aztec --version');
      const installedVersion = parseVersionFromOutput(stdout);
      
      console.log(`🔧 Installed Aztec version: ${installedVersion}`);
      
      // Compare versions
      if (installedVersion !== expectedVersion) {
        throw new Error(
          `❌ Version mismatch!\n` +
          `   Expected: ${expectedVersion}\n` +
          `   Installed: ${installedVersion}\n` +
          `   Please run: VERSION=${expectedVersion} aztec-up`
        );
      }
      
      console.log('✅ Aztec CLI version check passed');
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(
          `❌ Aztec CLI not found!\n` +
          `   Please install aztec-up and run: VERSION=${expectedVersion} aztec-up`
        );
      }
      throw error;
    }
    
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

export { checkAztecVersion };