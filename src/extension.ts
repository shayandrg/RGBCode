import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { JSDOM } from 'jsdom';

const rgbColorPalettes: { [key: string]: string[] } = {
    'Sunset': ['#30ff90', '#ed2ded', '#c99826', '#30ffe6'],
    'Instagram': ['#7638fa', '#ffd600', '#ff7a00', '#ff0169', '#d300c5', '#7638fa']
};
// @ts-ignore
let config: vscode.WorkspaceConfiguration = {};

const reloadConfig = () => {
    config = vscode.workspace.getConfiguration("RGBCode");
};

const isWsl = (): boolean => {
    try {
        return fs.readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');
    } catch (err) {
        return false;
    }
};

const getWorkspaceRoot = (): string | null => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    // console.log('vscode.workspace.workspaceFolders', vscode.workspace.getWorkspaceFolder());
    
    if (workspaceFolders && workspaceFolders.length > 0) {
        return workspaceFolders[0].uri.fsPath;
    }
    return null;
};

const getHtmlFilePath = (): string => {
    const isWin = process.platform.startsWith('win');
    const workspaceRoot = process.env.VSCODE_CWD;
    
    if (!workspaceRoot) {
        throw new Error('No workspace folder found');
    }

    let base = path.resolve(workspaceRoot, 'resources', 'app', 'out', 'vs', 'code');
    const electronBase = isVSCodeBelowVersion("1.70.0") ? "electron-browser" : "electron-sandbox";

    // Adjust path if running in WSL
    // if (isWsl()) {
    //     try {
    //         const wslBase = execSync(`wslpath -u "${base}"`).toString().trim();
    //         base = execSync(`wslpath -w "${wslBase}"`).toString().trim();
    //     } catch (error) {
    //         // @ts-ignore
    //         console.error(`Failed to convert WSL path: ${error.message}`);
    //     }
    // }

    const htmlFilePath = path.join(base, electronBase, 'workbench', 'workbench.html');
    console.log(`Resolved HTML file path: ${htmlFilePath}`);

    return htmlFilePath;
};

const readHtmlFile = (filePath: string): string => {
    try {
        return fs.readFileSync(filePath, "utf-8");
    } catch (error) { // @ts-ignore
        throw new Error(`Failed to read HTML file at ${filePath}: ${error.message}`);
    }
};

const writeHtmlFile = (filePath: string, content: string): void => {
    try {
        fs.writeFileSync(filePath, content, "utf-8");
    } catch (error) { // @ts-ignore
        throw new Error(`Failed to write HTML file at ${filePath}: ${error.message}`);
    }
};

const applyStyles = (htmlContent: string, cssContent: string): string => {
    const dom = new JSDOM(htmlContent);
    const document = dom.window.document;

    document.querySelectorAll('#RGBCode-style-element').forEach(el => el.remove());

    const styleElement = document.createElement('style');
    styleElement.id = 'RGBCode-style-element';
    styleElement.type = 'text/css';
    styleElement.appendChild(document.createTextNode(cssContent));

    const head = document.head || document.getElementsByTagName('head')[0];
    head.appendChild(styleElement);

    return dom.serialize();
};

const activateExtension = () => {
    try {
        const htmlFilePath = getHtmlFilePath();
        const rawHtml = readHtmlFile(htmlFilePath);
        const cssPath = path.join(__dirname, 'main.css');
        let css = fs.readFileSync(cssPath, 'utf-8');
        // @ts-ignore
        const activePalette = rgbColorPalettes[config.get('palette')] || rgbColorPalettes.Sunset;
        css = css.replace(/\[TAB_COLORS\]/g, activePalette.join(', '));
        css = css.replace(/\[DURATION\]/g, (config.get('duration') || 3).toString());
        css = css.replace(/\[HEIGHT\]/g, (config.get('height') || 1).toString());

        const updatedHtml = applyStyles(rawHtml, css);
        writeHtmlFile(htmlFilePath, updatedHtml);

        vscode.commands.executeCommand("workbench.action.reloadWindow");
    } catch (error) {
        console.error('Error activating extension:', error);
    }
};

const deactivateExtension = () => {
    try {
        const htmlFilePath = getHtmlFilePath();
        const rawHtml = readHtmlFile(htmlFilePath);

        if (rawHtml.includes("RGBCode-style-element")) {
            const dom = new JSDOM(rawHtml);
            dom.window.document.querySelectorAll('#RGBCode-style-element').forEach(el => el.remove());
            writeHtmlFile(htmlFilePath, dom.serialize());
            vscode.commands.executeCommand("workbench.action.reloadWindow");
        }
    } catch (error) {
        console.error('Error deactivating extension:', error);
    }
};

export function activate(context: vscode.ExtensionContext) {
    reloadConfig();

    const activateCommand = vscode.commands.registerCommand('rgbcode.active', activateExtension);
    const deactivateCommand = vscode.commands.registerCommand('rgbcode.deactive', deactivateExtension);

    context.subscriptions.push(activateCommand);
    context.subscriptions.push(deactivateCommand);

    vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration("RGBCode")) {
            reloadConfig();
            activateExtension();
        }
    });
}

export function deactivate() {}

function isVSCodeBelowVersion(version: string): boolean {
    const vscodeVersion = vscode.version.split('.').map(Number);
    const versionArray = version.split('.').map(Number);

    for (let i = 0; i < versionArray.length; i++) {
        if (vscodeVersion[i] < versionArray[i]) {
            return true;
        } else if (vscodeVersion[i] > versionArray[i]) {
            return false;
        }
    }

    return false;
}
