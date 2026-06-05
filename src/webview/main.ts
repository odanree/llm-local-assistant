import { marked } from 'marked';

marked.use({ breaks: true, gfm: true });

// VS Code webview API — injected by VS Code before this script runs
interface VsCodeApi {
  postMessage(message: Record<string, unknown>): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

// DOM refs
const chat    = document.getElementById('chat')   as HTMLDivElement;
const inputEl = document.getElementById('input')  as HTMLInputElement;
const sendBtn = document.getElementById('send')   as HTMLButtonElement;
const copyBtn = document.getElementById('copy')   as HTMLButtonElement;
const clearBtn = document.getElementById('clear') as HTMLButtonElement;

// Streaming buffer
let tokenBuffer = '';
let bufferTimeout: ReturnType<typeof setTimeout> | null = null;

// Typing indicator — visible whenever the system is actively working. Each inbound
// message keeps it alive for IDLE_MS; if no message arrives in that window, the
// system is considered idle and the dots fade out. Multi-step plan executions
// stream messages continuously so the indicator persists end-to-end.
let typingIndicator: HTMLElement | null = null;
let typingIdleTimer: ReturnType<typeof setTimeout> | null = null;
// Idle safety net only — primary hide signals are explicit (completion/failure text,
// buttons appearing). This window must cover the longest possible LLM call silence
// during auto-correction. Gemma 26B correction passes can sit silent for 15–20s
// between messages. 60s gives genuine headroom without lingering forever on a true
// network hang.
const TYPING_IDLE_MS = 60000;

// Phrases that mark end-of-work — the system has finished processing the user's
// last input and is now idle. Detected in addMessage text to hide the dots
// immediately rather than waiting for the idle timer to fire.
const TASK_COMPLETE_PATTERNS = [
  /Plan execution complete/i,
  /Plan execution failed/i,
  /steps?\s+succeeded/i,
  /Step\s+\d+\s+failed after \d+ retry/i,
  /All files validated for integration consistency/i,
];

function looksLikeTaskTerminator(text: string | undefined): boolean {
  if (!text) { return false; }
  return TASK_COMPLETE_PATTERNS.some(re => re.test(text));
}

function showTypingIndicator(): void {
  if (!typingIndicator) {
    const wrapper = document.createElement('div');
    wrapper.className = 'msg assistant';
    wrapper.setAttribute('data-type', 'typing');
    const dots = document.createElement('div');
    dots.className = 'typing-indicator';
    dots.appendChild(document.createElement('span'));
    dots.appendChild(document.createElement('span'));
    dots.appendChild(document.createElement('span'));
    wrapper.appendChild(dots);
    chat.appendChild(wrapper);
    typingIndicator = wrapper;
    chat.scrollTop = chat.scrollHeight;
  }
  resetTypingIdleTimer();
}

function hideTypingIndicator(): void {
  if (typingIdleTimer) { clearTimeout(typingIdleTimer); typingIdleTimer = null; }
  if (!typingIndicator) { return; }
  typingIndicator.remove();
  typingIndicator = null;
}

function resetTypingIdleTimer(): void {
  if (typingIdleTimer) { clearTimeout(typingIdleTimer); }
  typingIdleTimer = setTimeout(() => {
    typingIdleTimer = null;
    if (typingIndicator) {
      typingIndicator.remove();
      typingIndicator = null;
    }
  }, TYPING_IDLE_MS);
}

// Re-anchor the indicator at the bottom of chat — call after appending any new
// content so the dots remain the visually-last element.
function reanchorTypingIndicator(): void {
  if (!typingIndicator) { return; }
  if (chat.lastElementChild !== typingIndicator) {
    chat.appendChild(typingIndicator);
  }
}

// Command history + tab autocomplete
let commandHistory: string[] = [];
let historyIndex = -1;
let autocompleteMatches: string[] = [];
let autocompleteIndex = -1;
let lastAutocompletePrefix = '';

const COMMANDS = [
  '/explain', '/plan', '/execute', '/refactor',
  '/context query', '/context show structure', '/context show patterns',
  '/context show dependencies', '/context find similar', '/context',
  '/check-model', '/read', '/write', '/git-commit-msg', '/git-review',
];

// ---------- helpers ----------

function flushTokenBuffer(): void {
  if (!tokenBuffer) { bufferTimeout = null; return; }

  // Find the active streaming target — most recent assistant streaming div,
  // skipping the typing indicator. If we hit a user message first, no current
  // streaming context exists and we create a new one. Without this, tokens
  // would accidentally be appended into the typing indicator's wrapper div.
  let target: HTMLElement | null = null;
  for (let i = chat.children.length - 1; i >= 0; i--) {
    const el = chat.children[i] as HTMLElement;
    if (el === typingIndicator) { continue; }
    if (el.getAttribute('data-type') === 'streaming') { target = el; break; }
    if (el.classList.contains('user')) { break; }
  }
  if (!target) {
    target = document.createElement('div');
    target.className = 'msg assistant';
    target.setAttribute('data-type', 'streaming');
    if (typingIndicator) {
      chat.insertBefore(target, typingIndicator);
    } else {
      chat.appendChild(target);
    }
  }
  target.textContent = (target.textContent ?? '') + tokenBuffer;
  chat.scrollTop = chat.scrollHeight;
  tokenBuffer = '';
  bufferTimeout = null;
}

function appendUserMessage(text: string): void {
  const div = document.createElement('div');
  div.className = 'msg user';
  div.textContent = text;
  chat.appendChild(div);
}

function sendMessage(): void {
  const msg = inputEl.value.trim();
  if (!msg) { return; }
  appendUserMessage(msg);
  showTypingIndicator();
  commandHistory.push(msg);
  historyIndex = commandHistory.length;
  inputEl.value = '';
  autocompleteMatches = [];
  autocompleteIndex = -1;
  vscode.postMessage({ command: 'sendMessage', text: msg });
}

function makeCommandRow(command: string, onClick: () => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'command-row';

  const code = document.createElement('code');
  code.style.cssText = [
    'font-family:monospace', 'margin-right:8px',
    'background:var(--vscode-textCodeBlock-background)',
    'padding:4px 8px', 'border-radius:3px',
    'user-select:all', 'cursor:text',
  ].join(';');
  code.textContent = command;

  const btn = document.createElement('button');
  btn.className = 'question-btn command-btn';
  btn.textContent = '▶ Execute';
  btn.onclick = onClick;

  row.appendChild(code);
  row.appendChild(btn);
  return row;
}

// ---------- button listeners ----------

sendBtn.addEventListener('click', sendMessage);

inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
    return;
  }

  if (e.key === 'Tab') {
    e.preventDefault();
    const cursorPos = inputEl.selectionStart ?? 0;
    const beforeCursor = inputEl.value.substring(0, cursorPos);
    const lastSlash = beforeCursor.lastIndexOf('/');
    if (lastSlash === -1) { return; }

    const partial = beforeCursor.substring(lastSlash);
    const prefix  = beforeCursor.substring(0, lastSlash);
    const changed  = !autocompleteMatches.length
      || !autocompleteMatches[0].startsWith(partial)
      || prefix !== lastAutocompletePrefix;

    if (changed) {
      autocompleteMatches = COMMANDS.filter(c => c.startsWith(partial));
      autocompleteIndex = 0;
      lastAutocompletePrefix = prefix;
    } else {
      autocompleteIndex = (autocompleteIndex + 1) % autocompleteMatches.length;
    }

    if (autocompleteMatches.length > 0) {
      const match = autocompleteMatches[autocompleteIndex];
      const after = inputEl.value.substring(cursorPos);
      inputEl.value = prefix + match + after;
      const pos = prefix.length + match.length;
      inputEl.setSelectionRange(pos, pos);
    }
    return;
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (historyIndex > 0) {
      historyIndex--;
      inputEl.value = commandHistory[historyIndex];
      setTimeout(() => inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length), 0);
    }
    autocompleteMatches = []; autocompleteIndex = -1;
    return;
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (historyIndex < commandHistory.length - 1) {
      historyIndex++;
      inputEl.value = commandHistory[historyIndex];
      setTimeout(() => inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length), 0);
    } else {
      historyIndex = commandHistory.length;
      inputEl.value = '';
    }
    autocompleteMatches = []; autocompleteIndex = -1;
  }
});

copyBtn.addEventListener('click', () => {
  const msgs = chat.querySelectorAll('.msg');
  let text = msgs.length === 0 ? chat.innerText.trim() : '';
  for (const el of msgs) {
    const role = el.classList.contains('user') ? 'User' : 'Assistant';
    const t = (el as HTMLElement).innerText?.trim();
    if (t) { text += '[' + role + ']\n' + t + '\n\n'; }
  }
  text = text.trim();
  if (!text) { return; }

  navigator.clipboard.writeText(text).then(() => {
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
  }).catch(() => {
    // execCommand fallback for restricted webview contexts
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
  });
});

clearBtn.addEventListener('click', () => {
  chat.innerHTML = '';
  typingIndicator = null;
  vscode.postMessage({ command: 'clearChat' });
});

// ---------- message types ----------

interface AddMessageMsg {
  command: 'addMessage';
  text?: string;
  error?: string;
  isMarkdown?: boolean;
  isExplanation?: boolean;
  options?: string[];
}
interface StreamTokenMsg   { command: 'streamToken';    token: string; }
interface StreamCompleteMsg { command: 'streamComplete'; }
interface StatusMsg         { command: 'status';         text: string; }
interface QuestionMsg       { command: 'question';       question: string; options: string[]; }

type InboundMsg = AddMessageMsg | StreamTokenMsg | StreamCompleteMsg | StatusMsg | QuestionMsg;

// ---------- message handler ----------

const APPROVAL_BTNS = ['Execute', 'Reject', 'WaitRAG', 'SkipRAG'];
const APPROVAL_LABELS: Record<string, string> = {
  Execute: '▶ Execute Plan',
  Reject:  '✕ Reject Plan',
  WaitRAG: '⏳ Wait for RAG Index',
  SkipRAG: '▶ Skip RAG',
};

function renderMarkdown(text: string): HTMLElement {
  // Escape TS generics like <Type> so marked doesn't treat them as HTML
  const safe = text.replace(
    /<([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)>/g,
    '&lt;$1&gt;'
  );
  const container = document.createElement('div');
  try {
    container.innerHTML = marked.parse(safe) as string;
  } catch {
    container.textContent = text;
  }
  return container;
}

window.addEventListener('message', (e: MessageEvent<InboundMsg>) => {
  const msg = e.data;

  // Indicator visibility rules:
  //   1. Buttons appear (addMessage/question with options) → system waiting on user → hide
  //   2. addMessage text OR error matches a task-terminator phrase → system done → hide
  //   3. Anything else (including non-terminal step failures that will be retried) →
  //      keep alive, reset idle timer
  //
  // Note: a step failure mid-plan ("Step 2 failed. Retrying...") is NOT terminal — the
  // executor will retry. Only the final "Plan execution complete/failed" addMessage is.
  const hasButtons = (msg.command === 'addMessage' || msg.command === 'question') &&
                     ((msg as AddMessageMsg).options?.length ?? 0) > 0;
  const addMsg = msg.command === 'addMessage' ? (msg as AddMessageMsg) : null;
  const isTerminator = addMsg !== null &&
                       (looksLikeTaskTerminator(addMsg.text) ||
                        looksLikeTaskTerminator(addMsg.error));
  if (hasButtons || isTerminator) {
    hideTypingIndicator();
  } else if (typingIndicator) {
    resetTypingIdleTimer();
  }

  switch (msg.command) {
    case 'streamToken': {
      tokenBuffer += msg.token;
      if (tokenBuffer.length >= 10) {
        flushTokenBuffer();
      } else if (!bufferTimeout) {
        bufferTimeout = setTimeout(flushTokenBuffer, 50);
      }
      break;
    }

    case 'streamComplete': {
      if (bufferTimeout) { clearTimeout(bufferTimeout); }
      flushTokenBuffer();
      chat.scrollTop = chat.scrollHeight;
      break;
    }

    case 'addMessage': {
      const div = document.createElement('div');
      div.className = msg.error ? 'msg assistant error' : 'msg assistant';
      if (msg.isExplanation) { div.classList.add('explanation'); }

      if (msg.error) {
        const strong = document.createElement('strong');
        strong.textContent = '⚠ Error: ';
        const span = document.createElement('span');
        span.textContent = msg.error;
        div.appendChild(strong);
        div.appendChild(span);
      } else if (msg.text) {
        if (msg.isMarkdown) {
          div.appendChild(renderMarkdown(msg.text));
        } else {
          div.textContent = msg.text;
        }
      }

      if (msg.options?.length) {
        const btns = document.createElement('div');
        btns.className = 'question-buttons';
        btns.style.marginTop = '12px';

        for (const option of msg.options) {
          if (APPROVAL_BTNS.includes(option)) {
            const btn = document.createElement('button');
            btn.className = 'question-btn';
            btn.textContent = APPROVAL_LABELS[option] ?? option;
            btn.style.marginRight = '8px';
            btn.onclick = () => {
              // System about to start working again — bring the dots back.
              showTypingIndicator();
              vscode.postMessage({ command: 'buttonPressed', buttonName: option });
            };
            btns.appendChild(btn);
          } else if (option.startsWith('Execute: ')) {
            const cmd = option.slice('Execute: '.length);
            btns.appendChild(makeCommandRow(cmd, () => {
              appendUserMessage(cmd);
              showTypingIndicator();
              commandHistory.push(cmd);
              historyIndex = commandHistory.length;
              vscode.postMessage({ command: 'sendMessage', text: cmd });
            }));
          } else {
            const btn = document.createElement('button');
            btn.className = 'question-btn';
            btn.textContent = option;
            btn.onclick = () => { inputEl.value = option; inputEl.focus(); };
            btns.appendChild(btn);
          }
        }
        div.appendChild(btns);
      }

      chat.appendChild(div);
      chat.scrollTop = chat.scrollHeight;
      break;
    }

    case 'status': {
      const div = document.createElement('div');
      div.className = 'msg assistant status';
      const em = document.createElement('em');
      em.textContent = msg.text;
      div.appendChild(em);
      // Keep the typing indicator anchored at the bottom — slot status messages above it.
      if (typingIndicator) {
        chat.insertBefore(div, typingIndicator);
      } else {
        chat.appendChild(div);
      }
      chat.scrollTop = chat.scrollHeight;
      break;
    }

    case 'question': {
      const div = document.createElement('div');
      div.className = 'msg assistant question';
      const q = document.createElement('p');
      q.style.marginTop = '0';
      q.textContent = msg.question;
      div.appendChild(q);

      const btns = document.createElement('div');
      btns.className = 'question-buttons';

      for (const option of msg.options) {
        if (option.startsWith('Execute: ')) {
          const cmd = option.slice('Execute: '.length);
          btns.appendChild(makeCommandRow(cmd, () => {
            showTypingIndicator();
            vscode.postMessage({ command: 'answerQuestion', answer: '🔧 Refactor Now' });
          }));
        } else {
          const btn = document.createElement('button');
          btn.className = 'question-btn';
          btn.textContent = option;
          btn.onclick = () => {
            showTypingIndicator();
            vscode.postMessage({ command: 'answerQuestion', answer: option });
          };
          btns.appendChild(btn);
        }
      }

      div.appendChild(btns);
      chat.appendChild(div);
      chat.scrollTop = chat.scrollHeight;
      break;
    }
  }

  // Keep the dots visually last so they read as "more is coming".
  reanchorTypingIndicator();
});

inputEl.focus();
