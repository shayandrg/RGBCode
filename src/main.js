const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const rgbColorPalettes = {
	'Sunset': [ '#30ff90', '#ed2ded', '#c99826', '#30ffe6' ],
	'Instagram': [ '#7638fa', '#ffd600', '#ff7a00', '#ff0169', '#d300c5', '#7638fa' ]
}
var config = {};

const reloadConfig = () => {
	config = vscode.workspace.getConfiguration("rgbCode")
}
reloadConfig()

function activate(context) {

	let active = vscode.commands.registerCommand('RGBCode.active', function () {
		const isWin = /^win/.test(process.platform);
		const appDir = path.dirname(require.main.filename);
		const base = appDir + (isWin ? "\\vs\\code" : "/vs/code");
		const electronBase = isVSCodeBelowVersion("1.70.0") ? "electron-browser" : "electron-sandbox";
		const htmlFile = base + (isWin ? "\\"+electronBase+"\\workbench\\workbench.html" : "/"+electronBase+"/workbench/workbench.html");
		
		try {
			const rawHtml = fs.readFileSync(htmlFile, "utf-8");
			const isRGBCodeExist = rawHtml.includes("RGBCode-style-element");
			let css = fs.readFileSync(__dirname +'/main.css', 'utf-8');

			let activePalette = rgbColorPalettes[config.get('palette')] || rgbColorPalettes.Sunset;
			css = css.replace(/\[TAB_COLORS\]/g, activePalette.join(', '));

			const vscodeDOM = new JSDOM(rawHtml);
			if (isRGBCodeExist) {
				vscodeDOM.window.document.querySelectorAll('#RGBCode-style-element').forEach(el => el.remove())
			}

			let head = vscodeDOM.window.document.head || vscodeDOM.window.document.getElementsByTagName('head')[0];
			let style = vscodeDOM.window.document.createElement('style');
			head.appendChild(style);
			style.type = 'text/css';
			style.setAttribute("id", "RGBCode-style-element");
			style.appendChild(vscodeDOM.window.document.createTextNode(css));
	
			fs.writeFileSync(htmlFile, vscodeDOM.serialize(), "utf-8");
			vscode.commands.executeCommand("workbench.action.reloadWindow");
		} catch(e) {
			console.log('kir shodi', e);
		}
	});

	let deActive = vscode.commands.registerCommand('RGBCode.deActive', function () {

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

	context.subscriptions.push(active);
	context.subscriptions.push(deActive);

	vscode.workspace.onDidChangeConfiguration(event => {
        let affected = event.affectsConfiguration("rgbCode.palette");
        if (affected) {
			reloadConfig()
            vscode.commands.executeCommand("RGBCode.active");
        }
    })
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