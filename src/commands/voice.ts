/**
 * Setup Voice Command
 * 
 * Guides user through:
 * 1. Python installation check
 * 2. Dependency installation
 * 3. Model download
 * 4. Verification
 */

import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';

export async function handleSetupVoice(): Promise<void> {
  const setupWindow = vscode.window.createOutputChannel('Voice Setup');
  setupWindow.show();

  setupWindow.appendLine('🎧 LLM Local Assistant - Voice Narration Setup');
  setupWindow.appendLine('='.repeat(60));
  setupWindow.appendLine('');

  try {
    // Step 1: Check Python
    setupWindow.appendLine('Step 1️⃣  Checking Python installation...');
    const pythonPath = await checkPython(setupWindow);
    if (!pythonPath) {
      setupWindow.appendLine('');
      setupWindow.appendLine('❌ Python 3.8+ required');
      setupWindow.appendLine('Install from: https://www.python.org/downloads/');
      vscode.window.showErrorMessage(
        'Python 3.8+ required. Click to install.',
        'Install Python'
      );
      return;
    }
    setupWindow.appendLine(`✅ Found Python: ${pythonPath}`);
    setupWindow.appendLine('');

    // Step 2: Run setup script
    setupWindow.appendLine('Step 2️⃣  Installing dependencies...');
    setupWindow.appendLine('This may take a few minutes...');
    setupWindow.appendLine('');

    const success = await runSetupScript(pythonPath, setupWindow);

    if (success) {
      setupWindow.appendLine('');
      setupWindow.appendLine('='.repeat(60));
      setupWindow.appendLine('✅ Voice narration setup complete!');
      setupWindow.appendLine('='.repeat(60));
      setupWindow.appendLine('');
      setupWindow.appendLine('You can now use voice narration with /explain');
      setupWindow.appendLine('');
      setupWindow.appendLine('Settings:');
      setupWindow.appendLine('  - voice.enabled: true');
      setupWindow.appendLine('  - voice.language: en');
      setupWindow.appendLine('  - voice.speed: 1.0');
      setupWindow.appendLine('');
      setupWindow.appendLine('Troubleshooting:');
      setupWindow.appendLine('  - Re-run /setup-voice if issues persist');
      setupWindow.appendLine('  - Check extension output for error details');
      setupWindow.appendLine('  - Delete cache: rm -rf ~/.cache/chat-tts/');
      setupWindow.appendLine('');

      vscode.window.showInformationMessage(
        '✅ Voice narration setup complete! Try /explain now.'
      );
    } else {
      setupWindow.appendLine('');
      setupWindow.appendLine('❌ Setup failed. See details above.');
      vscode.window.showErrorMessage(
        'Voice setup failed. Check output panel for details.'
      );
    }
  } catch (error) {
    setupWindow.appendLine(`❌ Unexpected error: ${String(error)}`);
    vscode.window.showErrorMessage(`Setup error: ${String(error)}`);
  }
}

/**
 * Check if Python 3.8+ is available
 */
async function checkPython(output: vscode.OutputChannel): Promise<string | null> {
  return new Promise((resolve) => {
    const os = require('os');
    
    // Determine which Python command to try first based on platform
    const isWindows = os.platform() === 'win32';
    const primaryCmd = isWindows ? 'python' : 'python3';
    const secondaryCmd = isWindows ? 'python3' : 'python';

    // Try primary command first
    const tryPython = (cmd: string, onComplete: (success: boolean) => void) => {
      const python = spawn(cmd, ['--version']);
      let output_text = '';

      python.stdout.on('data', (data) => {
        output_text += data.toString();
      });

      python.stderr.on('data', (data) => {
        output_text += data.toString();
      });

      python.on('close', (code) => {
        const success = code === 0 && output_text.includes('3.');
        if (success) {
          output.appendLine(`   Detected Python: ${cmd}`);
        }
        onComplete(success);
      });

      python.on('error', () => {
        onComplete(false);
      });

      // Timeout after 2 seconds per attempt
      setTimeout(() => onComplete(false), 2000);
    };

    // Try primary command
    tryPython(primaryCmd, (success) => {
      if (success) {
        resolve(primaryCmd);
      } else {
        // Try secondary command
        output.appendLine(`   ${primaryCmd} not found, trying ${secondaryCmd}...`);
        tryPython(secondaryCmd, (success2) => {
          resolve(success2 ? secondaryCmd : null);
        });
      }
    });

    // Overall timeout after 10 seconds
    setTimeout(() => resolve(null), 10000);
  });
}

/**
 * Run Python setup script
 */
async function runSetupScript(
  pythonPath: string,
  output: vscode.OutputChannel
): Promise<boolean> {
  return new Promise((resolve) => {
    // Find setup_tts.py relative to extension
    const setupScript = path.join(
      __dirname,
      '..',
      '..',
      'python',
      'setup_tts.py'
    );

    const python = spawn(pythonPath, [setupScript]);

    python.stdout.on('data', (data) => {
      output.append(data.toString());
    });

    python.stderr.on('data', (data) => {
      output.append(data.toString());
    });

    python.on('close', (code) => {
      resolve(code === 0);
    });

    python.on('error', (error) => {
      output.appendLine(`Error running setup: ${error.message}`);
      resolve(false);
    });

    // 5 minute timeout
    setTimeout(() => {
      python.kill('SIGTERM');
      output.appendLine('Setup timeout after 5 minutes');
      resolve(false);
    }, 300000);
  });
}

/**
 * Test voice narration
 */
export async function handleTestVoice(): Promise<void> {
  const output = vscode.window.createOutputChannel('Voice Test');
  output.show();

  output.appendLine('🎧 Testing voice narration...');
  output.appendLine('');

  try {
    const { getTTSService } = await import('../services/ttsService');
    const tts = getTTSService();

    // Check availability
    output.appendLine('Checking TTS availability...');
    const available = await tts.isAvailable();

    if (!available) {
      output.appendLine('❌ TTS not available. Run /setup-voice first.');
      vscode.window.showErrorMessage('Run /setup-voice to enable voice narration');
      return;
    }

    output.appendLine('✅ TTS available');
    output.appendLine('');

    // Test synthesis
    output.appendLine('Synthesizing test audio...');
    const testText = 'Voice narration is working. Try it with explain command.';

    const startTime = Date.now();
    const result = await tts.synthesize(testText, 'en');
    const duration = Date.now() - startTime;

    output.appendLine(`✅ Synthesis complete in ${duration}ms`);
    output.appendLine(
      `   Audio size: ${(result.audio.length / 1024).toFixed(1)} KB`
    );
    output.appendLine(`   Duration: ${result.metadata.duration.toFixed(2)}s`);
    output.appendLine('');
    output.appendLine('✅ Voice narration is working!');

    vscode.window.showInformationMessage('✅ Voice narration test passed!');
  } catch (error) {
    output.appendLine(`❌ Test failed: ${String(error)}`);
    vscode.window.showErrorMessage(`Voice test failed: ${String(error)}`);
  }
}
