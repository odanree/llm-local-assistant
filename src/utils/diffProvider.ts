/**
 * DiffProvider: Human-in-the-Loop Change Approval
 * 
 * Danh's "Senior" Fix: Interactive diff viewer for write operations
 * Shows proposed changes before applying them to the filesystem.
 * 
 * Pattern: Tolerant Receiver → Liberal Input + Human Oversight
 * - Accept LLM-generated content without immediate validation
 * - Present to user for manual approval/rejection
 * - Only write if explicitly approved
 */

export class DiffProvider {
  private webviewPanel: any; // vscode.WebviewPanel
  private onApprove: ((content: string) => void) | null = null;
  private onReject: (() => void) | null = null;

  constructor(webviewPanel: any) {
    this.webviewPanel = webviewPanel;
  }

  /**
   * Show a diff for user approval
   * @param path File path being written
   * @param oldContent Existing content (empty for new files)
   * @param newContent Generated content from LLM
   */
  showDiff(
    path: string,
    oldContent: string | undefined,
    newContent: string
  ): Promise<boolean> {
    return new Promise((resolve) => {
      // Setup callbacks
      this.onApprove = (content: string) => {
        resolve(true);
      };
      this.onReject = () => {
        resolve(false);
      };

      // Generate diff HTML
      const html = this.generateDiffHtml(path, oldContent || '', newContent);

      // Post to webview
      this.webviewPanel.webview.postMessage({
        command: 'showDiff',
        data: {
          path,
          oldContent: oldContent || '(New File)',
          newContent,
          html,
        },
      });
    });
  }

  /**
   * Generate side-by-side diff HTML
   * Shows before/after comparison with line numbers
   */
  private generateDiffHtml(
    path: string,
    oldContent: string,
    newContent: string
  ): string {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');

    // Simple line-by-line diff (not a sophisticated algorithm, but good enough for review)
    let diffHtml = `
      <div class="diff-container">
        <div class="diff-header">
          <span class="diff-title">📝 Proposed Changes</span>
          <span class="diff-path"><strong>${this.escapeHtml(path)}</strong></span>
          <div class="diff-actions">
            <button class="diff-btn approve" onclick="vscode.postMessage({command: 'approveDiff'})">
              ✅ Apply Changes
            </button>
            <button class="diff-btn reject" onclick="vscode.postMessage({command: 'rejectDiff'})">
              ❌ Decline
            </button>
          </div>
        </div>
        <div class="diff-body">
          <div class="diff-column old">
            <div class="column-header">Before</div>
            <div class="code-content">
              ${this.formatCode(oldContent || '(New File)')}
            </div>
          </div>
          <div class="diff-column new">
            <div class="column-header">After</div>
            <div class="code-content">
              ${this.formatCode(newContent)}
            </div>
          </div>
        </div>
      </div>
    `;

    return diffHtml;
  }

  /**
   * Format code with line numbers and syntax highlighting
   */
  private formatCode(content: string): string {
    const lines = content.split('\n');
    return lines
      .map((line, idx) => {
        const lineNum = idx + 1;
        return `<div class="code-line">
          <span class="line-number">${lineNum}</span>
          <span class="line-content">${this.escapeHtml(line)}</span>
        </div>`;
      })
      .join('');
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * Get CSS for diff viewer
   */
  static getDiffStyles(): string {
    return `
      <style>
        .diff-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
          background-color: var(--vscode-editor-background);
          color: var(--vscode-editor-foreground);
        }

        .diff-header {
          padding: 12px 16px;
          background-color: var(--vscode-editor-lineHighlightBackground);
          border-bottom: 1px solid var(--vscode-editorGroup-border);
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .diff-title {
          font-weight: bold;
          font-size: 14px;
        }

        .diff-path {
          flex: 1;
          font-size: 12px;
          color: var(--vscode-descriptionForeground);
          word-break: break-word;
        }

        .diff-actions {
          display: flex;
          gap: 8px;
        }

        .diff-btn {
          padding: 6px 12px;
          border: none;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .diff-btn.approve {
          background-color: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
        }

        .diff-btn.approve:hover {
          background-color: var(--vscode-button-hoverBackground);
        }

        .diff-btn.reject {
          background-color: var(--vscode-editorError-background);
          color: var(--vscode-editorError-foreground);
          opacity: 0.8;
        }

        .diff-btn.reject:hover {
          opacity: 1;
        }

        .diff-body {
          display: flex;
          flex: 1;
          overflow: hidden;
          border-bottom: 1px solid var(--vscode-editorGroup-border);
        }

        .diff-column {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: auto;
          border-right: 1px solid var(--vscode-editorGroup-border);
        }

        .diff-column:last-child {
          border-right: none;
        }

        .column-header {
          position: sticky;
          top: 0;
          padding: 8px 12px;
          background-color: var(--vscode-editorGroupHeader-tabsBackground);
          border-bottom: 1px solid var(--vscode-editorGroup-border);
          font-weight: 600;
          font-size: 12px;
          z-index: 10;
        }

        .code-content {
          padding: 12px 0;
          font-size: 12px;
          line-height: 1.6;
        }

        .code-line {
          display: flex;
          padding: 0 8px;
          white-space: pre-wrap;
          word-wrap: break-word;
        }

        .code-line:hover {
          background-color: var(--vscode-editor-lineHighlightBackground);
        }

        .line-number {
          display: inline-block;
          width: 40px;
          padding-right: 8px;
          text-align: right;
          color: var(--vscode-editorLineNumber-foreground);
          user-select: none;
          flex-shrink: 0;
        }

        .line-content {
          flex: 1;
          color: var(--vscode-editor-foreground);
        }

        /* Syntax highlighting hints */
        .code-line:has(.line-content:contains("import")) {
          color: var(--vscode-keyword-foreground);
        }

        .code-line:has(.line-content:contains("function")) {
          color: var(--vscode-keyword-foreground);
        }

        .code-line:has(.line-content:contains("const")) {
          color: var(--vscode-keyword-foreground);
        }
      </style>
    `;
  }
}
