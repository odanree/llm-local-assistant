export declare const commands: {
    executeCommand: () => Promise<void>;
    registerCommand: () => void;
};
export declare const window: {
    showInformationMessage: () => Promise<void>;
    showErrorMessage: () => Promise<void>;
    createWebviewPanel: () => {
        webview: {
            html: string;
            onDidReceiveMessage: () => void;
            postMessage: () => Promise<boolean>;
        };
        onDidDispose: () => void;
    };
};
export declare const workspace: {
    getConfiguration: () => {
        get: () => undefined;
    };
    onDidChangeConfiguration: () => void;
    getWorkspaceFolder: () => undefined;
    workspaceFolders: never[];
    fs: {
        readFile: () => Promise<Uint8Array<ArrayBuffer>>;
        writeFile: () => Promise<undefined>;
    };
};
export declare const Uri: {
    file: (path: string) => {
        fsPath: string;
    };
    joinPath: (baseUri: any, relativePath: string) => {
        fsPath: string;
    };
};
export declare class ExtensionContext {
    subscriptions: unknown[];
}
export declare const ConfigurationTarget: {
    Global: number;
    Workspace: number;
};
//# sourceMappingURL=vscode.d.ts.map