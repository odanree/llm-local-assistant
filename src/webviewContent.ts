export function getWebviewContent(): string {
  // Use a permissive CSP for the webview
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline';">`;
  const script = `
    const vscode = acquireVsCodeApi();
    const chat = document.getElementById('chat');
    const input = document.getElementById('input');
    const send = document.getElementById('send');
    const clear = document.getElementById('clear');
    let tokenBuffer = '';
    let bufferTimeout = null;
    function flushTokenBuffer() {
      if (tokenBuffer) {
        const msgs = chat.children;
        if (msgs.length === 0 || msgs[msgs.length - 1].className === 'msg user') {
          const div = document.createElement('div');
          div.className = 'msg assistant';
          div.setAttribute('data-type', 'streaming');
          chat.appendChild(div);
        }
        const lastMsg = chat.children[chat.children.length - 1];
        lastMsg.textContent += tokenBuffer;
        chat.scrollTop = chat.scrollHeight;
        tokenBuffer = '';
      }
      bufferTimeout = null;
    }
    function sendMessage() {
      const msg = input.value.trim();
      if (msg) {
        chat.innerHTML += '<div class="msg user">' + msg + '</div>';
        input.value = '';
        vscode.postMessage({ command: 'sendMessage', text: msg });
      }
    }
    send.addEventListener('click', sendMessage);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        sendMessage();
      }
    });
    clear.addEventListener('click', () => {
      chat.innerHTML = '';
      vscode.postMessage({ command: 'clearChat' });
    });
    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.command === 'streamToken') {
        // Buffer tokens for batch DOM updates (every ~10 tokens)
        tokenBuffer += msg.token;
        if (tokenBuffer.length >= 10) {
          flushTokenBuffer();
        } else if (!bufferTimeout) {
          // Ensure buffer flushes even if we get fewer than 10 tokens
          bufferTimeout = setTimeout(flushTokenBuffer, 50);
        }
      } else if (msg.command === 'streamComplete') {
        // Flush any remaining buffered tokens
        if (bufferTimeout) {
          clearTimeout(bufferTimeout);
        }
        flushTokenBuffer();
        chat.scrollTop = chat.scrollHeight;
      } else if (msg.command === 'addMessage') {
        const div = document.createElement('div');
        div.className = 'msg assistant';
        if (msg.error) {
          div.className = 'msg assistant error';
          const strong = document.createElement('strong');
          strong.textContent = '⚠ Error: ';
          const span = document.createElement('span');
          span.textContent = msg.error;
          div.appendChild(strong);
          div.appendChild(span);
        } else if (msg.text) {
          div.textContent = msg.text;
        }
        chat.appendChild(div);
        chat.scrollTop = chat.scrollHeight;
      } else if (msg.command === 'status') {
        const div = document.createElement('div');
        div.className = 'msg assistant status';
        const em = document.createElement('em');
        em.textContent = msg.text;
        div.appendChild(em);
        chat.appendChild(div);
      } else if (msg.command === 'question') {
        // Display question with options
        console.log('[Webview] Received question message:', msg);
        const div = document.createElement('div');
        div.className = 'msg assistant question';
        const q = document.createElement('p');
        q.style.marginTop = '0';
        q.textContent = msg.question;
        div.appendChild(q);
        
        // Create button container for options
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'question-buttons';
        
        msg.options.forEach((option, idx) => {
          const btn = document.createElement('button');
          btn.className = 'question-btn';
          btn.textContent = option;
          btn.onclick = () => {
            console.log('[Webview] User clicked option:', option);
            // Disable all buttons
            Array.from(buttonContainer.querySelectorAll('.question-btn')).forEach(b => {
              b.disabled = true;
              b.style.opacity = '0.5';
            });
            // Send response to extension
            vscode.postMessage({ command: 'answerQuestion', answer: option });
          };
          buttonContainer.appendChild(btn);
        });
        
        div.appendChild(buttonContainer);
        chat.appendChild(div);
        chat.scrollTop = chat.scrollHeight;
      }
    });
    input.focus();
  `;
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
            padding: 10px;
            border-radius: 4px;
            overflow-x: auto;
            overflow-y: auto;
            max-width: 100%;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 12px;
            margin: 6px 0;
            word-break: break-word;
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
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 12px;
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
          button#clear {
            background: transparent;
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-button-border);
            margin-left: auto;
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
            <button id="clear">Clear</button>
          </div>
        </div>
        <script>${script}</script>
      </body>
    </html>`;
  return html;
}
