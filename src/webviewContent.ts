export function getWebviewContent(): string {
  // Use a permissive CSP for the webview
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline';">`;
  const script = `
    const vscode = acquireVsCodeApi();
    const chat = document.getElementById('chat');
    const input = document.getElementById('input');
    const send = document.getElementById('send');
    const clear = document.getElementById('clear');
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
        const msgs = chat.children;
        if (msgs.length === 0 || msgs[msgs.length - 1].className === 'msg user') {
          const div = document.createElement('div');
          div.className = 'msg assistant';
          div.setAttribute('data-type', 'streaming');
          chat.appendChild(div);
        }
        const lastMsg = chat.children[chat.children.length - 1];
        lastMsg.textContent += msg.token;
        chat.scrollTop = chat.scrollHeight;
      } else if (msg.command === 'streamComplete') {
        chat.scrollTop = chat.scrollHeight;
      } else if (msg.command === 'addMessage') {
        const div = document.createElement('div');
        div.className = 'msg assistant';
        if (msg.error) {
          div.style.color = '#dc2626';
          div.style.background = 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)';
          div.style.border = '1px solid #fca5a5';
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
        div.className = 'msg assistant';
        div.style.color = '#6b7280';
        div.style.background = 'linear-gradient(135deg, rgba(249,250,251,0.8) 0%, rgba(243,244,246,0.8) 100%)';
        const em = document.createElement('em');
        em.textContent = msg.text;
        div.appendChild(em);
        chat.appendChild(div);
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
          body {
            font-family: 'Segoe UI', 'Inter', system-ui, sans-serif;
            margin: 0;
            padding: 0;
            background: linear-gradient(180deg, var(--vscode-editor-background) 60%, #23272e 100%);
            color: var(--vscode-foreground);
          }
          #app {
            display: flex;
            flex-direction: column;
            height: 100vh;
            max-width: 600px;
            margin: 0 auto;
            box-shadow: 0 2px 16px 0 rgba(0,0,0,0.08);
            background: rgba(255,255,255,0.03);
            border-radius: 16px;
            overflow: hidden;
          }
          #chat {
            flex: 1;
            overflow-y: auto;
            padding: 24px 16px 0 16px;
            background: none;
            display: flex;
            flex-direction: column;
            gap: 2px;
          }
          .msg {
            padding: 14px 18px;
            border-radius: 12px;
            margin-bottom: 12px;
            font-size: 0.95rem;
            line-height: 1.6;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08);
            word-break: break-word;
            max-width: 85%;
            transition: all 0.15s ease;
            white-space: pre-wrap;
            overflow-x: auto;
          }
          .msg:hover {
            box-shadow: 0 2px 6px rgba(0,0,0,0.12);
          }
          .user {
            align-self: flex-end;
            background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
            color: #fff;
            border-bottom-right-radius: 4px;
            box-shadow: 0 2px 6px rgba(59,130,246,0.15);
            margin-right: 0;
            margin-left: auto;
            text-align: right;
          }
          .user:hover {
            box-shadow: 0 3px 8px rgba(59,130,246,0.2);
          }
          .assistant {
            align-self: flex-start;
            background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
            color: #1f2937;
            border-bottom-left-radius: 4px;
            border: 1px solid #d1d5db;
          }
          .assistant:hover {
            background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
          }
          .input-row {
            display: flex;
            gap: 10px;
            padding: 16px;
            background: rgba(245,245,245,0.85);
            border-top: 1px solid #e5e7eb;
            align-items: center;
          }
          input[type="text"] {
            padding: 12px 14px;
            border: 1.5px solid #d1d5db;
            background: var(--vscode-input-background, #f9fafb);
            color: var(--vscode-input-foreground, #23272e);
            border-radius: 6px;
            flex: 1;
            font-size: 0.95rem;
            outline: none;
            transition: all 0.15s ease;
          }
          input[type="text"]:focus {
            border: 1.5px solid #3b82f6;
            background: var(--vscode-input-background, #fff);
            box-shadow: 0 0 0 3px rgba(59,130,246,0.1);
          }
          input[type="text"]::placeholder {
            color: #9ca3af;
          }
          button {
            padding: 0 16px;
            height: 38px;
            background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
            color: #fff;
            border: none;
            border-radius: 6px;
            font-size: 0.95rem;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 2px 4px rgba(59,130,246,0.2);
            transition: all 0.15s ease;
          }
          button:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(59,130,246,0.25);
          }
          button:active {
            transform: translateY(0);
            box-shadow: 0 1px 2px rgba(59,130,246,0.15);
          }
          button#clear {
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            color: #fff;
            border: none;
            box-shadow: 0 2px 4px rgba(239,68,68,0.2);
            margin-left: auto;
          }
          button#clear:hover {
            box-shadow: 0 4px 8px rgba(239,68,68,0.25);
          }
            margin-left: 0;
          }
          button:active {
            filter: brightness(0.95);
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
