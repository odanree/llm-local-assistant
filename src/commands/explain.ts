/**
 * Explain Command
 *
 * Generates a code explanation and renders it in a webview panel.
 */

import * as vscode from 'vscode';

/**
 * Handle /explain command
 */
export async function handleExplain(
  llm: any, // LLM provider instance
  code: string,
  context?: { file?: string; range?: vscode.Range }
): Promise<void> {
  try {
    const explanation = await generateExplanation(llm, code, context);

    const panel = vscode.window.createWebviewPanel(
      'llm-explanation',
      'Code Explanation',
      vscode.ViewColumn.Two,
      { enableScripts: true }
    );

    panel.webview.html = renderExplanationPanel(explanation);
  } catch (error) {
    vscode.window.showErrorMessage(`Explanation failed: ${String(error)}`);
  }
}

/**
 * Generate code explanation using LLM
 */
async function generateExplanation(
  llm: any,
  code: string,
  context?: { file?: string; range?: vscode.Range }
): Promise<string> {
  const prompt = `Explain this code clearly and concisely:

\`\`\`
${code}
\`\`\`

Focus on:
1. What the code does
2. Key concepts
3. Important patterns
4. Potential issues`;

  const explanation = await llm.generate(prompt);
  return explanation;
}

/**
 * Render webview panel with explanation
 */
function renderExplanationPanel(explanation: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Code Explanation</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          padding: 20px;
          line-height: 1.6;
          color: var(--vscode-foreground);
          background-color: var(--vscode-editor-background);
        }
        h2 {
          color: var(--vscode-symbolIcon-textForeground);
          margin-top: 0;
        }
        h3 {
          color: var(--vscode-symbolIcon-methodForeground);
          margin-top: 24px;
          margin-bottom: 12px;
        }
        .explanation {
          background-color: var(--vscode-editor-background);
          padding: 12px;
          border-left: 3px solid var(--vscode-symbolIcon-textForeground);
          margin: 12px 0;
          border-radius: 4px;
        }
      </style>
    </head>
    <body>
      <h2>📝 Code Explanation</h2>
      <div class="explanation">
        <h3>Explanation</h3>
        <div>${escapeHtml(explanation).replace(/\n/g, '<br>')}</div>
      </div>
      <div style="font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 32px;">
        Generated with LLM Local Assistant
      </div>
    </body>
    </html>
  `;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
