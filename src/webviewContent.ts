import * as fs from 'fs';
import * as path from 'path';

export function getWebviewContent(): string {
  // Script compiled separately by esbuild (src/webview/main.ts → dist/webviewScript.js)
  const scriptContent = fs.readFileSync(path.join(__dirname, 'webviewScript.js'), 'utf-8');
  // marked is bundled into webviewScript.js — no CDN needed
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; script-src 'unsafe-inline'; style-src 'unsafe-inline';">`;
  const html = `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>LLM Assistant</title>
        ${csp}
        <style>
          * {
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            margin: 0;
            padding: 0;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-size: 13px;
            line-height: 1.5;
          }
          #app {
            display: flex;
            flex-direction: column;
            height: 100vh;
            background: var(--vscode-editor-background);
          }
          #chat {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            background: var(--vscode-editor-background);
          }
          #chat::-webkit-scrollbar {
            width: 10px;
          }
          #chat::-webkit-scrollbar-track {
            background: transparent;
          }
          #chat::-webkit-scrollbar-thumb {
            background: var(--vscode-scrollbarSlider-background);
            border-radius: 5px;
          }
          #chat::-webkit-scrollbar-thumb:hover {
            background: var(--vscode-scrollbarSlider-hoverBackground);
          }
          .msg {
            padding: 12px 14px;
            border-radius: 6px;
            word-break: break-word;
            white-space: pre-wrap;
            overflow-wrap: break-word;
            word-wrap: break-word;
            line-height: 1.6;
          }
          .msg code {
            background: var(--vscode-textCodeBlock-background);
            color: var(--vscode-textPreformat-foreground);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 12px;
            word-break: break-all;
          }
          .msg pre {
            background: var(--vscode-textCodeBlock-background);
            color: var(--vscode-textPreformat-foreground);
            padding: 8px;
            border-radius: 4px;
            overflow-x: auto;
            overflow-y: auto;
            max-width: 100%;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 12px;
            margin: 2px 0;
            word-break: break-word;
          }
          /* Markdown heading styles */
          .msg h1 {
            margin: 4px 0 2px 0;
            font-size: 24px;
            font-weight: 700;
            border-bottom: 1px solid var(--vscode-textSeparator-foreground);
            padding-bottom: 2px;
            line-height: 1.3;
          }
          .msg h2 {
            margin: 3px 0 1px 0;
            font-size: 20px;
            font-weight: 600;
            line-height: 1.3;
          }
          .msg h3 {
            margin: 2px 0 1px 0;
            font-size: 16px;
            font-weight: 600;
            line-height: 1.3;
          }
          .msg h4, .msg h5, .msg h6 {
            margin: 2px 0 1px 0;
            font-size: 14px;
            font-weight: 600;
            line-height: 1.3;
          }
          .msg p {
            margin: 0.5px 0;
            line-height: 1.4;
          }
          .msg ul, .msg ol {
            margin: 2px 0;
            padding-left: 20px;
            line-height: 1.4;
          }
          .msg li {
            margin: 0px 0;
          }
          .msg strong {
            font-weight: 600;
            color: #e0e0e0;
          }
          .msg em {
            font-style: italic;
            color: #e0e0e0;
          }
          .msg blockquote {
            margin: 2px 0;
            padding: 4px 8px;
            border-left: 3px solid var(--vscode-textSeparator-foreground);
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            background: rgba(128, 128, 128, 0.1);
            border-radius: 2px;
          }
          .msg table {
            border-collapse: collapse;
            margin: 2px 0;
            width: 100%;
          }
          .msg table th, .msg table td {
            border: 1px solid var(--vscode-textSeparator-foreground);
            padding: 6px;
            text-align: left;
          }
          .msg table th {
            background: rgba(128, 128, 128, 0.1);
            font-weight: 600;
          }
            width: 100%;
          }
          .msg table th, .msg table td {
            border: 1px solid var(--vscode-textSeparator-foreground);
            padding: 8px;
            text-align: left;
          }
          .msg table th {
            background: rgba(128, 128, 128, 0.1);
            font-weight: 600;
          }
          .msg a {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
          }
          .msg a:hover {
            text-decoration: underline;
          }
          .user {
            align-self: flex-end;
            max-width: 85%;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-radius: 6px;
            margin-left: auto;
            text-align: right;
          }
          .assistant {
            align-self: flex-start;
            max-width: 100%;
            background: transparent;
            color: #e0e0e0;
            border-left: 3px solid var(--vscode-textSeparator-foreground);
            padding-left: 12px;
          }
          .assistant.explanation {
            background: rgba(60, 60, 60, 0.4);
            border-radius: 4px;
            padding: 10px 12px;
            padding-left: 12px;
          }
          .assistant.error {
            border-left-color: #d32f2f;
            color: #d32f2f;
            background: transparent;
          }
          .assistant.error strong {
            font-weight: 600;
          }
          .assistant.status {
            border-left-color: var(--vscode-textSeparator-foreground);
            color: #e0e0e0;
            font-style: italic;
          }
          .assistant.question {
            border-left-color: var(--vscode-inputValidation-infoBorder);
            background: transparent;
            color: #e0e0e0;
          }
          .question-buttons {
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin-top: 12px;
            align-items: flex-start;
          }
          .question-btn {
            padding: 8px 14px;
            border: 1px solid var(--vscode-button-border);
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            transition: all 0.2s ease;
          }
          .question-btn:hover {
            background: var(--vscode-button-hoverBackground);
          }
          .question-btn:disabled {
            cursor: not-allowed;
            opacity: 0.6;
          }
          .command-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 6px;
          }
          .command-row code {
            background: var(--vscode-textCodeBlock-background);
            padding: 4px 8px;
            border-radius: 3px;
            font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
            font-size: 11px;
            user-select: all;
            cursor: text;
          }
          .command-btn {
            white-space: nowrap;
            flex-shrink: 0;
          }
          .input-row {
            display: flex;
            gap: 8px;
            padding: 12px 16px;
            background: var(--vscode-input-background);
            border-top: 1px solid var(--vscode-panel-border);
            align-items: center;
          }
          input[type="text"] {
            padding: 10px 12px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 4px;
            flex: 1;
            font-size: 13px;
            font-family: inherit;
            outline: none;
            transition: border-color 0.1s ease;
          }
          input[type="text"]:focus {
            border: 1px solid var(--vscode-focusBorder);
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: -1px;
          }
          input[type="text"]::placeholder {
            color: var(--vscode-input-placeholderForeground);
          }
          button {
            padding: 6px 14px;
            height: 32px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: background-color 0.1s ease;
            font-family: inherit;
          }
          button:hover {
            background: var(--vscode-button-hoverBackground);
          }
          button:active {
            background: var(--vscode-button-background);
            opacity: 0.8;
          }
          button#copy {
            background: transparent;
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-button-border);
            margin-left: auto;
          }
          button#copy:hover {
            background: var(--vscode-button-secondaryHoverBackground);
          }
          button#clear {
            background: transparent;
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-button-border);
          }
          button#clear:hover {
            background: var(--vscode-button-secondaryHoverBackground);
          }
        </style>
      </head>
      <body>
        <div id="app">
          <div id="chat"></div>
          <div class="input-row">
            <input type="text" id="input" placeholder="Ask me..." autocomplete="off"/>
            <button id="send">Send</button>
            <button id="copy">Copy</button>
            <button id="clear">Clear</button>
          </div>
        </div>
        <script>${scriptContent}</script>
      </body>
    </html>`;
  return html;
}
