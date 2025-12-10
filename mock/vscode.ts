// Mock vscode module for testing
export const commands = {
  executeCommand: () => Promise.resolve(),
  registerCommand: () => {},
};

export const window = {
  showInformationMessage: () => Promise.resolve(),
  showErrorMessage: () => Promise.resolve(),
  createWebviewPanel: () => ({
    webview: {
      html: '',
      onDidReceiveMessage: () => {},
      postMessage: () => Promise.resolve(true),
    },
    onDidDispose: () => {},
  }),
};

export const workspace = {
  getConfiguration: () => ({
    get: () => undefined,
  }),
  onDidChangeConfiguration: () => {},
  getWorkspaceFolder: () => undefined,
  workspaceFolders: [],
  fs: {
    readFile: async () => new Uint8Array(),
    writeFile: async () => undefined,
  },
};

export const Uri = {
  file: (path: string) => ({ fsPath: path }),
  joinPath: (baseUri: any, relativePath: string) => ({ fsPath: `${baseUri.fsPath}/${relativePath}` }),
};

export class ExtensionContext {
  subscriptions: unknown[] = [];
}

export const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
};
