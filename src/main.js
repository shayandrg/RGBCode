const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

function activate(context) {
	vscode.window.showInformationMessage('kosssssssssssssssss');

	let disposable = vscode.commands.registerCommand('test2.helloWorld', function () {
		// The code you place here will be executed every time your command is executed
		console.log('Congratulations, your extension "test2" is now active!');
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from test2!');
	});

	let active = vscode.commands.registerCommand('test2.active', function () {
		const isWin = /^win/.test(process.platform);
		const appDir = path.dirname(require.main.filename);
		const base = appDir + (isWin ? "\\vs\\code" : "/vs/code");
		const electronBase = isVSCodeBelowVersion("1.70.0") ? "electron-browser" : "electron-sandbox";
		const htmlFile = base + (isWin ? "\\"+electronBase+"\\workbench\\workbench.html" : "/"+electronBase+"/workbench/workbench.html");
		
		try {
			const rawHtml = fs.readFileSync(htmlFile, "utf-8");
			const isRGBCodeExist = rawHtml.includes("RGBCode-style-element");
			const css = fs.readFileSync(__dirname +'/main.css', 'utf-8');

			if (!isRGBCodeExist) {
				const vscodeDOM = new JSDOM(rawHtml);
				let head = vscodeDOM.window.document.head || vscodeDOM.window.document.getElementsByTagName('head')[0];
				let style = vscodeDOM.window.document.createElement('style');
				head.appendChild(style);
				style.type = 'text/css';
				style.setAttribute("id", "RGBCode-style-element");
				style.appendChild(vscodeDOM.window.document.createTextNode(css));
		
				fs.writeFileSync(htmlFile, vscodeDOM.serialize(), "utf-8");
				vscode.commands.executeCommand("workbench.action.reloadWindow");
			}
		} catch(e) {
			console.log('kir shodi', e);
		}
	});

	let deActive = vscode.commands.registerCommand('test2.deActive', function () {

		const isWin = /^win/.test(process.platform);
		const appDir = path.dirname(require.main.filename);
		const base = appDir + (isWin ? "\\vs\\code" : "/vs/code");
		const electronBase = isVSCodeBelowVersion("1.70.0") ? "electron-browser" : "electron-sandbox";
		const htmlFile = base + (isWin ? "\\"+electronBase+"\\workbench\\workbench.html" : "/"+electronBase+"/workbench/workbench.html");
		
		try {
			const rawHtml = fs.readFileSync(htmlFile, "utf-8");
			const isRGBCodeExist = rawHtml.includes("RGBCode-style-element");

			if (isRGBCodeExist) {
				const vscodeDOM = new JSDOM(rawHtml);
				vscodeDOM.window.document.querySelectorAll('#RGBCode-style-element').forEach(el => el.remove())
		
				fs.writeFileSync(htmlFile, vscodeDOM.serialize(), "utf-8");
				vscode.commands.executeCommand("workbench.action.reloadWindow");
			}
		} catch(e) {
			console.log('kir shodi', e);
		}
	});

	context.subscriptions.push(disposable);
	context.subscriptions.push(active);
	context.subscriptions.push(deActive);
}

// This method is called when your extension is deactivated
function deactivate() {

}

function isVSCodeBelowVersion(version) {
	const vscodeVersion = vscode.version;
	const vscodeVersionArray = vscodeVersion.split('.');
	const versionArray = version.split('.');
	
	for (let i = 0; i < versionArray.length; i++) {
		if (vscodeVersionArray[i] < versionArray[i]) {
			return true;
		}
	}

	return false;
}

module.exports = {
	activate,
	deactivate
}
