import * as vscode from 'vscode';
import * as os from 'os';
import { execSync } from 'child_process';

/**
 * Diagnostic utilities for LLM Local Assistant
 * Helps debug environment and execution issues in VS Code extension
 */

export function registerDiagnostics(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('llm-assistant.debug-environment', () => {
    const outputChannel = vscode.window.createOutputChannel('LLA Diagnostics');
    outputChannel.clear();
    outputChannel.appendLine('=== LLM Local Assistant Environment Diagnostics ===');
    outputChannel.appendLine(`Timestamp: ${new Date().toISOString()}`);
    outputChannel.appendLine(`OS Platform: ${os.platform()}`);
    outputChannel.appendLine(`OS Release: ${os.release()}`);
    outputChannel.appendLine(`Node Version: ${process.version}`);
    outputChannel.appendLine('--------------------------------------------------');

    // Critical Windows Variables
    outputChannel.appendLine(`ComSpec (Shell Path): ${process.env.ComSpec || 'NOT FOUND'}`);
    outputChannel.appendLine(`SystemRoot: ${process.env.SystemRoot || 'NOT FOUND'}`);
    outputChannel.appendLine(`PATH (first 200 chars): ${(process.env.PATH || 'NOT FOUND').substring(0, 200)}...`);
    outputChannel.appendLine('--------------------------------------------------');

    // Environment Accessibility Test
    outputChannel.appendLine('Environment "cmd.exe" Accessibility Test:');
    try {
      const whereCmd = execSync('where cmd.exe').toString();
      outputChannel.appendLine(`✅ cmd.exe found at: ${whereCmd.trim()}`);
    } catch (e) {
      outputChannel.appendLine(`❌ cmd.exe NOT accessible via simple exec: ${(e as any).message}`);
    }

    // Test npm accessibility
    outputChannel.appendLine('--------------------------------------------------');
    outputChannel.appendLine('Environment "npm" Accessibility Test:');
    try {
      const whereNpm = execSync('where npm').toString();
      outputChannel.appendLine(`✅ npm found at: ${whereNpm.trim()}`);
    } catch (e) {
      outputChannel.appendLine(`❌ npm NOT accessible via simple exec: ${(e as any).message}`);
    }

    // Test node accessibility
    outputChannel.appendLine('--------------------------------------------------');
    outputChannel.appendLine('Environment "node" Accessibility Test:');
    try {
      const whereNode = execSync('where node').toString();
      outputChannel.appendLine(`✅ node found at: ${whereNode.trim()}`);
    } catch (e) {
      outputChannel.appendLine(`❌ node NOT accessible via simple exec: ${(e as any).message}`);
    }

    outputChannel.appendLine('--------------------------------------------------');
    outputChannel.appendLine('Full PATH Environment Variable:');
    outputChannel.appendLine(process.env.PATH || 'NOT FOUND');
    outputChannel.show();
  });

  context.subscriptions.push(disposable);
}
