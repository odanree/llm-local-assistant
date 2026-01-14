import * as vscode from 'vscode';
export interface ProjectAnalysis {
    projectName: string;
    description: string;
    features: string[];
    commands: string[];
    setup: string[];
    fileCount: number;
    directories: string[];
}
/**
 * DocsGenerator analyzes project structure and generates documentation
 */
export declare class DocsGenerator {
    private workspaceFolder;
    constructor(workspaceFolder: vscode.Uri);
    /**
     * Generate comprehensive README.md
     */
    generateReadme(analysis: ProjectAnalysis): Promise<string>;
    /**
     * Generate CONTRIBUTING.md
     */
    generateContributing(): Promise<string>;
    /**
     * Generate PROJECT_OVERVIEW.md
     */
    generateProjectOverview(): Promise<string>;
    /**
     * Analyze project and generate all documentation
     */
    analyzeAndGenerate(): Promise<{
        readme: string;
        contributing: string;
        overview: string;
    }>;
    /**
     * Get project analysis
     */
    private getProjectAnalysis;
}
//# sourceMappingURL=docsGenerator.d.ts.map