import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
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

const isRemoteExtensionHost = (): boolean => {
    return !!vscode.env.remoteName;
};

const convertWindowsPathToWsl = (windowsPath: string): string => {
    try {
        // Use wslpath to convert Windows path to WSL path
        const wslPath = execSync(`wslpath -u "${windowsPath}"`, { encoding: 'utf-8' }).trim();
        return wslPath;
    } catch (error) {
        // If wslpath fails, try manual conversion
        // Convert C:\path\to\file to /mnt/c/path/to/file
        const normalized = windowsPath.replace(/\\/g, '/');
        const driveMatch = normalized.match(/^([A-Z]):\/(.*)$/i);
        if (driveMatch) {
            const drive = driveMatch[1].toLowerCase();
            const rest = driveMatch[2];
            return `/mnt/${drive}/${rest}`;
        }
        return windowsPath;
    }
};

const findVSCodeExecutablePath = (): string | null => {
    // Try to find the VS Code executable that's currently running
    // This works by finding the Code.exe process on Windows
    if (isWsl()) {
        try {
            // On WSL, find the Windows VS Code process using PowerShell (most reliable)
            try {
                const psCommand = 'powershell.exe -Command "Get-Process -Name Code -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Path"';
                const psOutput = execSync(psCommand, {
                    encoding: 'utf-8',
                    timeout: 5000,
                    stdio: ['ignore', 'pipe', 'ignore']
                }).trim();
                
                if (psOutput && psOutput.length > 0 && !psOutput.includes('Get-Process') && !psOutput.includes('Cannot find')) {
                    const wslExePath = convertWindowsPathToWsl(psOutput);
                    const installRoot = path.dirname(wslExePath);
                    
                    const possiblePaths = [
                        installRoot,
                        path.join(installRoot, 'resources', 'app')
                    ];
                    
                    for (const installDir of possiblePaths) {
                        const testPath = path.join(installDir, 'out', 'vs', 'code');
                        if (fs.existsSync(testPath)) {
                            return installDir;
                        }
                    }
                }
            } catch (error) {
                // PowerShell might not be available, try wmic
                try {
                    const wmicOutput = execSync('cmd.exe /c wmic process where "name=\'Code.exe\'" get ExecutablePath /format:value 2>nul', {
                        encoding: 'utf-8',
                        timeout: 5000,
                        stdio: ['ignore', 'pipe', 'ignore']
                    });
                    const match = wmicOutput.match(/ExecutablePath=(.+)/);
                    if (match && match[1]) {
                        const exePath = match[1].trim();
                        const wslExePath = convertWindowsPathToWsl(exePath);
                        const installRoot = path.dirname(wslExePath);
                        
                        const possiblePaths = [
                            installRoot,
                            path.join(installRoot, 'resources', 'app')
                        ];
                        
                        for (const installDir of possiblePaths) {
                            const testPath = path.join(installDir, 'out', 'vs', 'code');
                            if (fs.existsSync(testPath)) {
                                return installDir;
                            }
                        }
                    }
                } catch (error2) {
                    // Ignore
                }
            }
        } catch (error) {
            // Ignore
        }
    } else {
        // On native Windows, try to find from process
        try {
            if (process.execPath) {
                const execDir = path.dirname(process.execPath);
                const possibleRoot = execDir;
                const testPath = path.join(possibleRoot, 'out', 'vs', 'code');
                if (fs.existsSync(testPath)) {
                    return possibleRoot;
                }
            }
        } catch (error) {
            // Ignore
        }
    }
    return null;
};

const findLocalVSCodeInstallation = (): string | null => {
    const commonPaths: string[] = [];
    const platform = process.platform;
    const isWslEnv = isWsl();

    // Strategy 1: Try to find running VS Code executable (most reliable)
    const exePath = findVSCodeExecutablePath();
    if (exePath) {
        return exePath;
    }

    // Strategy 2: WSL-specific paths (Windows VS Code accessed from WSL)
    if (isWslEnv) {
        
        // Get Windows username - try multiple methods
        const windowsUsernames: string[] = [];
        
        // Method 1: Use WSLENV to get Windows username
        try {
            if (process.env['USERPROFILE']) {
                const userProfile = process.env['USERPROFILE'];
                const match = userProfile.match(/[\\/]Users[\\/]([^\\/]+)/i);
                if (match) {
                    windowsUsernames.push(match[1]);
                }
            }
        } catch (error) {
            // Ignore
        }
        
        // Method 2: Check /mnt/c/Users directory (most reliable in WSL)
        try {
            const usersDir = '/mnt/c/Users';
            if (fs.existsSync(usersDir)) {
                const users = fs.readdirSync(usersDir);
                for (const user of users) {
                    if (user !== 'Public' && user !== 'Default' && user !== 'All Users' && !user.startsWith('.')) {
                        if (!windowsUsernames.includes(user)) {
                            windowsUsernames.push(user);
                        }
                    }
                }
            }
        } catch (error) {
            // Ignore
        }
        
        // Method 3: Try to get username from Windows
        try {
            const wslUser = execSync('cmd.exe /c echo %USERNAME% 2>nul', { encoding: 'utf-8', timeout: 2000 }).trim();
            if (wslUser && !windowsUsernames.includes(wslUser)) {
                windowsUsernames.push(wslUser);
            }
        } catch (error) {
            // Ignore - cmd.exe might not be available
        }

        // Build paths for each Windows username found
        for (const username of windowsUsernames) {
            const userPath = `/mnt/c/Users/${username}/AppData/Local/Programs/Microsoft VS Code`;
            if (!commonPaths.includes(userPath)) {
                commonPaths.push(userPath);
            }
        }

        // Also check all users in /mnt/c/Users (in case username detection failed)
        try {
            const usersDir = '/mnt/c/Users';
            if (fs.existsSync(usersDir)) {
                const users = fs.readdirSync(usersDir);
                for (const user of users) {
                    if (user !== 'Public' && user !== 'Default' && user !== 'All Users' && !user.startsWith('.')) {
                        const userPath = `/mnt/c/Users/${user}/AppData/Local/Programs/Microsoft VS Code`;
                        if (!commonPaths.includes(userPath)) {
                            commonPaths.push(userPath);
                        }
                    }
                }
            }
        } catch (error) {
            // Ignore
        }
        
        // System-wide installation paths
        commonPaths.push('/mnt/c/Program Files/Microsoft VS Code');
        commonPaths.push('/mnt/c/Program Files (x86)/Microsoft VS Code');
        
        // Check other common drive letters (D, E, F)
        for (const drive of ['d', 'e', 'f']) {
            commonPaths.push(`/mnt/${drive}/Program Files/Microsoft VS Code`);
            commonPaths.push(`/mnt/${drive}/Program Files (x86)/Microsoft VS Code`);
        }
    }
    
    // Strategy 3: Platform-specific paths
    if (platform === 'win32' && !isWslEnv) {
        // Windows native
        if (process.env['LOCALAPPDATA']) {
            commonPaths.push(path.join(process.env['LOCALAPPDATA'], 'Programs', 'Microsoft VS Code'));
        }
        if (process.env['PROGRAMFILES']) {
            commonPaths.push(path.join(process.env['PROGRAMFILES'], 'Microsoft VS Code'));
        }
        if (process.env['PROGRAMFILES(X86)']) {
            commonPaths.push(path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft VS Code'));
        }
    } else if (platform === 'darwin') {
        // macOS
        commonPaths.push('/Applications/Visual Studio Code.app/Contents/Resources/app');
        const homeDir = process.env['HOME'];
        if (homeDir) {
            commonPaths.push(path.join(homeDir, 'Applications', 'Visual Studio Code.app', 'Contents', 'Resources', 'app'));
        }
    } else if (platform === 'linux' && !isWslEnv) {
        // Linux native
        commonPaths.push('/usr/share/code');
        commonPaths.push('/opt/visual-studio-code');
        const homeDir = process.env['HOME'];
        if (homeDir) {
            commonPaths.push(path.join(homeDir, '.vscode'));
            commonPaths.push(path.join(homeDir, 'vscode'));
        }
    }

    // Strategy 4: Try to derive from appRoot if it's a local installation
    // (This won't work for remote, but worth trying)
    try {
        const appRoot = vscode.env.appRoot;
        if (appRoot && !appRoot.includes('.vscode-server') && !appRoot.includes('vscode-server')) {
            // appRoot is typically the 'resources/app' directory, go up to installation root
            const possibleRoot = path.resolve(appRoot, '..', '..');
            if (!commonPaths.includes(possibleRoot)) {
                commonPaths.push(possibleRoot);
            }
        }
    } catch (error) {
        // Ignore
    }

    // Strategy 5: Try to find from process.execPath (if available and relevant)
    try {
        if (process.execPath && !isWslEnv) {
            // On native platforms, execPath might point to the executable
            // For VS Code, this could be in the installation directory
            const execDir = path.dirname(process.execPath);
            const possibleRoot = path.resolve(execDir, '..');
            if (!commonPaths.includes(possibleRoot)) {
                commonPaths.push(possibleRoot);
            }
        }
    } catch (error) {
        // Ignore
    }

    // Try each path and verify it contains the expected structure
    for (const basePath of commonPaths) {
        if (!basePath) continue;
        
        try {
            const testPaths = [
                path.join(basePath, 'out', 'vs', 'code'),
                path.join(basePath, 'resources', 'app', 'out', 'vs', 'code')
            ];
            
            for (const testPath of testPaths) {
                if (fs.existsSync(testPath)) {
                    const installDir = testPath.includes('resources/app') 
                        ? path.join(basePath, 'resources', 'app')
                        : basePath;
                    return installDir;
                }
            }
        } catch (error) {
            // Continue to next path
        }
    }

    return null;
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
    const isRemote = isRemoteExtensionHost();
    const isWslEnv = isWsl();
    let workspaceRoot: string | null = null;

    const appRoot = vscode.env.appRoot;
    const isAppRootRemote = appRoot && (appRoot.includes('.vscode-server') || appRoot.includes('vscode-server'));

    // If appRoot is valid and points to local installation, use it
    if (appRoot && !isAppRootRemote && !isRemote) {
        // For local installations, appRoot is typically 'resources/app', need to go up
        const possibleRoot = path.resolve(appRoot, '..', '..');
        const testPath = path.join(possibleRoot, 'out', 'vs', 'code');
        if (fs.existsSync(testPath)) {
            workspaceRoot = possibleRoot;
        }
    }

    if (!workspaceRoot && (isRemote || isAppRootRemote || isWslEnv)) {
        workspaceRoot = findLocalVSCodeInstallation();
    }
    
    if (!workspaceRoot && appRoot && !isAppRootRemote) {
        workspaceRoot = appRoot;
    }
    
    if (!workspaceRoot) {
        const errorMsg = 'Could not find VS Code installation automatically. ' +
            'The extension tried to find it dynamically but failed.\n' +
            'Please check that VS Code is installed in a standard location.\n' +
            'Common locations:\n' +
            '  Windows: C:\\Users\\YourUsername\\AppData\\Local\\Programs\\Microsoft VS Code\n' +
            '  macOS: /Applications/Visual Studio Code.app/Contents/Resources/app\n' +
            '  Linux: /usr/share/code';
        throw new Error(errorMsg);
    }

    let base = path.resolve(workspaceRoot, 'out', 'vs', 'code');
    const electronBase = isVSCodeBelowVersion("1.70.0") ? "electron-browser" : "electron-sandbox";

    const htmlFilePath = path.join(base, electronBase, 'workbench', 'workbench.html');

    // Verify the file exists before returning
    if (!fs.existsSync(htmlFilePath)) {
        throw new Error(`Workbench HTML file not found at: ${htmlFilePath}.\n` +
            `Installation root: ${workspaceRoot}\n` +
            `Please verify your VS Code installation path or set VSCODE_PATH environment variable.`);
    }

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
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error activating extension:', error);
        vscode.window.showErrorMessage(`RGBCode: Failed to activate. ${errorMessage}`);
    }
};

const deactivateExtension = () => {
    try {
        const htmlFilePath = getHtmlFilePath();
        
        // Check if file exists before trying to read it
        if (!fs.existsSync(htmlFilePath)) {
            console.warn(`Workbench HTML file not found at: ${htmlFilePath}. Extension may have already been deactivated or VS Code was reinstalled.`);
            return;
        }
        
        const rawHtml = readHtmlFile(htmlFilePath);

        if (rawHtml.includes("RGBCode-style-element")) {
            const dom = new JSDOM(rawHtml);
            dom.window.document.querySelectorAll('#RGBCode-style-element').forEach(el => el.remove());
            writeHtmlFile(htmlFilePath, dom.serialize());
            vscode.commands.executeCommand("workbench.action.reloadWindow");
        }
    } catch (error) {
        // Don't throw error, just log it - deactivation should be graceful
        console.error('Error deactivating extension:', error);
        vscode.window.showWarningMessage(`RGBCode: Could not deactivate extension. ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
};

export function activate(context: vscode.ExtensionContext) {
    const activateCommand = vscode.commands.registerCommand('rgbcode.active', activateExtension);
    const deactivateCommand = vscode.commands.registerCommand('rgbcode.deactive', deactivateExtension);

    context.subscriptions.push(activateCommand);
    context.subscriptions.push(deactivateCommand);

    // Load configuration
    reloadConfig();

    // Listen for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration("RGBCode")) {
                reloadConfig();
            }
        })
    );
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
