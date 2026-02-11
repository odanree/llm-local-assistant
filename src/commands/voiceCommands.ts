/**
 * Voice Narration Commands
 * 
 * Registers and handles all voice-related commands:
 * - /setup-voice - Initialize voice narration
 * - /test-voice - Test voice functionality
 * - Settings integration
 */

import * as vscode from 'vscode';
import { handleSetupVoice, handleTestVoice } from './voice';
import { TTSSettings, DEFAULT_TTS_SETTINGS } from '../types/tts';

/**
 * Register all voice-related commands
 */
export function registerVoiceCommands(context: vscode.ExtensionContext): void {
  // /setup-voice command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'llm-assistant.setup-voice',
      handleSetupVoiceCommand
    )
  );

  // /test-voice command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'llm-assistant.test-voice',
      handleTestVoiceCommand
    )
  );

  // Listen for settings changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('llm-assistant.voice')) {
        vscode.window.showInformationMessage(
          'Voice settings updated. Changes take effect on next /explain.'
        );
      }
    })
  );
}

/**
 * Handle /setup-voice command
 */
async function handleSetupVoiceCommand(): Promise<void> {
  const progress = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Setting up voice narration...',
      cancellable: true,
    },
    async (progress, token) => {
      progress.report({ message: 'Starting setup...' });

      return new Promise<void>(async (resolve) => {
        try {
          await handleSetupVoice();
          resolve();
        } catch (error) {
          vscode.window.showErrorMessage(
            `Setup failed: ${String(error)}`
          );
          resolve();
        }
      });
    }
  );
}

/**
 * Handle /test-voice command
 */
async function handleTestVoiceCommand(): Promise<void> {
  const progress = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Testing voice narration...',
      cancellable: false,
    },
    async (progress) => {
      try {
        await handleTestVoice();
      } catch (error) {
        vscode.window.showErrorMessage(
          `Test failed: ${String(error)}`
        );
      }
    }
  );
}

/**
 * Get voice settings from configuration
 */
export function getVoiceSettings(): TTSSettings {
  const config = vscode.workspace.getConfiguration('llm-assistant.voice');

  return {
    enabled: config.get('enabled', DEFAULT_TTS_SETTINGS.enabled),
    speed: config.get('speed', DEFAULT_TTS_SETTINGS.speed),
    language: config.get('language', DEFAULT_TTS_SETTINGS.language) as
      | 'en'
      | 'zh',
    maxChunkLength: config.get(
      'maxChunkLength',
      DEFAULT_TTS_SETTINGS.maxChunkLength
    ),
    cacheEnabled: config.get(
      'cacheEnabled',
      DEFAULT_TTS_SETTINGS.cacheEnabled
    ),
  };
}

/**
 * Update voice setting
 */
export async function updateVoiceSetting(
  key: keyof TTSSettings,
  value: any
): Promise<void> {
  const config = vscode.workspace.getConfiguration('llm-assistant.voice');
  await config.update(key, value, vscode.ConfigurationTarget.Global);
}

/**
 * Show voice settings quick pick
 */
export async function showVoiceSettingsQuickPick(): Promise<void> {
  const settings = getVoiceSettings();

  const items = [
    {
      label: settings.enabled ? '✓ Voice enabled' : '✗ Voice disabled',
      description: 'Toggle voice narration',
      setting: 'enabled',
      value: !settings.enabled,
    },
    {
      label: `Speed: ${settings.speed}x`,
      description: 'Adjust playback speed',
      setting: 'speed',
      value: null, // Will show input
    },
    {
      label: `Language: ${settings.language}`,
      description: 'Choose narration language',
      setting: 'language',
      value: null, // Will show options
    },
    {
      label: `Cache: ${settings.cacheEnabled ? 'enabled' : 'disabled'}`,
      description: 'Toggle audio caching',
      setting: 'cacheEnabled',
      value: !settings.cacheEnabled,
    },
  ];

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a voice setting to modify',
  });

  if (!selected) return;

  if (selected.setting === 'speed') {
    const speedInput = await vscode.window.showInputBox({
      placeHolder: '1.0',
      value: settings.speed.toString(),
      prompt: 'Speed (0.5 to 2.0)',
      validateInput: (value) => {
        const num = parseFloat(value);
        if (isNaN(num) || num < 0.5 || num > 2.0) {
          return 'Must be between 0.5 and 2.0';
        }
        return '';
      },
    });

    if (speedInput) {
      await updateVoiceSetting('speed', parseFloat(speedInput));
    }
  } else if (selected.setting === 'language') {
    const langPick = await vscode.window.showQuickPick(
      [
        { label: 'English', value: 'en' },
        { label: '中文 (Chinese)', value: 'zh' },
      ],
      { placeHolder: 'Select language' }
    );

    if (langPick) {
      await updateVoiceSetting('language', langPick.value);
    }
  } else {
    await updateVoiceSetting(selected.setting, selected.value);
  }

  vscode.window.showInformationMessage(
    `Voice setting "${selected.label}" updated`
  );
}
