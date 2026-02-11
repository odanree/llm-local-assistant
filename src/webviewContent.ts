export function getWebviewContent(): string {
  // Use a permissive CSP for the webview
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; media-src data:; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline';">`;
  const script = `
    const vscode = acquireVsCodeApi();
    const chat = document.getElementById('chat');
    const input = document.getElementById('input');
    const send = document.getElementById('send');
    const clear = document.getElementById('clear');
    let tokenBuffer = '';
    let bufferTimeout = null;
    
    // Command history & autocomplete
    let commandHistory = [];
    let historyIndex = -1;
    let autocompleteMatches = [];
    let autocompleteIndex = -1;
    let lastAutocompletePrefix = '';
    const availableCommands = [
      '/explain',
      '/plan',
      '/execute',
      '/approve',
      '/reject',
      '/refactor',
      '/extract-service',
      '/design-system',
      '/rate-architecture',
      '/suggest-patterns',
      '/context',
      '/check-model',
      '/read',
    ];
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
        commandHistory.push(msg);
        historyIndex = commandHistory.length;
        input.value = '';
        autocompleteMatches = [];
        autocompleteIndex = -1;
        vscode.postMessage({ command: 'sendMessage', text: msg });
      }
    }
    send.addEventListener('click', sendMessage);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        // Tab: autocomplete or cycle through matches
        const currentInput = input.value;
        const cursorPos = input.selectionStart;
        const beforeCursor = currentInput.substring(0, cursorPos);
        
        // Find the current command being typed
        const lastSlash = beforeCursor.lastIndexOf('/');
        if (lastSlash !== -1) {
          const partialCommand = beforeCursor.substring(lastSlash);
          
          // Check if input changed since last tab press
          const inputChanged = !autocompleteMatches.length || 
            !autocompleteMatches[0].startsWith(partialCommand) ||
            beforeCursor.substring(0, lastSlash) !== lastAutocompletePrefix;
          
          // First tab or input changed: get all matching commands
          if (inputChanged) {
            autocompleteMatches = availableCommands.filter(cmd => cmd.startsWith(partialCommand));
            autocompleteIndex = 0;
            lastAutocompletePrefix = beforeCursor.substring(0, lastSlash);
          } else {
            // Subsequent tabs: cycle through matches
            autocompleteIndex = (autocompleteIndex + 1) % autocompleteMatches.length;
          }
          
          if (autocompleteMatches.length > 0) {
            const match = autocompleteMatches[autocompleteIndex];
            const newInput = beforeCursor.substring(0, lastSlash) + match + currentInput.substring(cursorPos);
            input.value = newInput;
            input.setSelectionRange(beforeCursor.substring(0, lastSlash).length + match.length, beforeCursor.substring(0, lastSlash).length + match.length);
          }
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        // ArrowUp: restore previous command
        if (historyIndex > 0) {
          historyIndex--;
          input.value = commandHistory[historyIndex];
          setTimeout(() => input.setSelectionRange(input.value.length, input.value.length), 0);
        }
        autocompleteMatches = [];
        autocompleteIndex = -1;
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        // ArrowDown: go to next command in history
        if (historyIndex < commandHistory.length - 1) {
          historyIndex++;
          input.value = commandHistory[historyIndex];
          setTimeout(() => input.setSelectionRange(input.value.length, input.value.length), 0);
        } else {
          historyIndex = commandHistory.length;
          input.value = '';
        }
        autocompleteMatches = [];
        autocompleteIndex = -1;
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
          
          // Add embedded audio player if audio data is provided (from /explain with voice)
          if (msg.audioBase64 && msg.audioMetadata) {
            console.log('[Webview] Received audio base64 length:', msg.audioBase64.length);
            console.log('[Webview] Audio metadata:', msg.audioMetadata);
            
            const audioContainer = document.createElement('div');
            audioContainer.style.marginTop = '12px';
            audioContainer.style.padding = '12px';
            audioContainer.style.backgroundColor = 'rgba(0, 102, 204, 0.1)';
            audioContainer.style.borderRadius = '4px';
            audioContainer.style.borderLeft = '3px solid #0066cc';
            
            const audioLabel = document.createElement('div');
            audioLabel.style.fontSize = '12px';
            audioLabel.style.fontWeight = '500';
            audioLabel.style.marginBottom = '8px';
            audioLabel.textContent = '🎧 Voice Narration';
            audioContainer.appendChild(audioLabel);
            
            const audio = document.createElement('audio');
            audio.controls = true;
            audio.style.width = '100%';
            audio.src = 'data:audio/mpeg;base64,' + msg.audioBase64;
            audioContainer.appendChild(audio);
            
            const audioInfo = document.createElement('div');
            audioInfo.style.fontSize = '11px';
            audioInfo.style.color = '#666';
            audioInfo.style.marginTop = '6px';
            const duration = msg.audioMetadata.duration || 0;
            audioInfo.textContent = duration > 0 ? 'Duration: ' + duration.toFixed(1) + 's' : 'Synthesized with edge-tts';
            audioContainer.appendChild(audioInfo);
            
            div.appendChild(audioContainer);
          }
        }
        
        // Add buttons if options are provided
        if (msg.options && msg.options.length > 0) {
          const buttonContainer = document.createElement('div');
          buttonContainer.className = 'question-buttons';
          buttonContainer.style.marginTop = '12px';
          
          msg.options.forEach((option) => {
            // Check if this is a special execute/reject button for plan approval
            const isApprovalButton = ['Execute', 'Reject'].includes(option);
            
            if (isApprovalButton) {
              // Create approval button (Execute/Reject from plan)
              const btn = document.createElement('button');
              btn.className = 'question-btn';
              btn.textContent = option === 'Execute' ? '▶ Execute Plan' : '✕ Reject Plan';
              btn.style.marginRight = '8px';
              btn.onclick = () => {
                console.log('[Webview] User clicked:', option);
                vscode.postMessage({ command: 'buttonPressed', buttonName: option });
              };
              buttonContainer.appendChild(btn);
            } else {
              // Check if this is an Execute button (for commands)
              const isExecuteButton = option.startsWith('Execute: ');
              
              if (isExecuteButton) {
                // Create row with command + button
                const row = document.createElement('div');
                row.className = 'command-row';
                
                // Extract command from "Execute: /refactor ..."
                const command = option.substring('Execute: '.length);
                
                // Command code (left side, copyable)
                const code = document.createElement('code');
                code.style.fontFamily = 'monospace';
                code.style.marginRight = '8px';
                code.style.backgroundColor = 'var(--vscode-textCodeBlock-background)';
                code.style.padding = '4px 8px';
                code.style.borderRadius = '3px';
                code.style.userSelect = 'all';
                code.style.cursor = 'text';
                code.textContent = command;
                row.appendChild(code);
                
                // Button - send /refactor command to trigger analysis + pattern detection
                const btn = document.createElement('button');
                btn.className = 'question-btn command-btn';
                btn.textContent = '▶ Execute';
                btn.onclick = () => {
                  console.log('[Webview] Execute button from /suggest-patterns:', command);
                  // Send /refactor command - this will run pattern detection
                  chat.innerHTML += '<div class="msg user">' + command + '</div>';
                  commandHistory.push(command);
                  historyIndex = commandHistory.length;
                  vscode.postMessage({ command: 'sendMessage', text: command });
                };
                row.appendChild(btn);
                
                buttonContainer.appendChild(row);
              } else {
                // Regular button
                const btn = document.createElement('button');
                btn.className = 'question-btn';
                btn.textContent = option;
                btn.onclick = () => {
                  input.value = option.replace('Execute: ', '');
                  input.focus();
                };
                buttonContainer.appendChild(btn);
              }
            }
          });
          
          div.appendChild(buttonContainer);
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
          // Check if option starts with "Execute: " (special handling for command buttons)
          const isExecuteButton = option.startsWith('Execute: ');
          
          if (isExecuteButton) {
            // Create row with command + button
            const row = document.createElement('div');
            row.className = 'command-row';
            
            // Extract command from "Execute: /refactor ..."
            const command = option.substring('Execute: '.length);
            
            // Command code (left side, copyable)
            const code = document.createElement('code');
            code.style.fontFamily = 'monospace';
            code.style.marginRight = '8px';
            code.style.backgroundColor = 'var(--vscode-textCodeBlock-background)';
            code.style.padding = '4px 8px';
            code.style.borderRadius = '3px';
            code.style.userSelect = 'all';
            code.style.cursor = 'text';
            code.textContent = command;
            row.appendChild(code);
            
            // Button clicks - trigger refactoring action (not just re-run analyze)
            const btn = document.createElement('button');
            btn.className = 'question-btn command-btn';
            btn.textContent = '▶ Execute';
            btn.onclick = () => {
              console.log('[Webview] User clicked execute button, triggering refactoring');
              // Send answerQuestion with special marker so extension knows to refactor
              vscode.postMessage({ command: 'answerQuestion', answer: '🔧 Refactor Now' });
            };
            row.appendChild(btn);
            
            buttonContainer.appendChild(row);
          } else {
            // Regular button (no command)
            const btn = document.createElement('button');
            btn.className = 'question-btn';
            btn.textContent = option;
            btn.onclick = () => {
              console.log('[Webview] User clicked option:', option);
              vscode.postMessage({ command: 'answerQuestion', answer: option });
            };
            buttonContainer.appendChild(btn);
          }
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
