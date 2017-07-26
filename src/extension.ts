import * as vscode from 'vscode'
import fs = require('fs')

// this method is called when vs code is activated
export function activate(context: vscode.ExtensionContext) {
	//Commands
	vscode.commands.registerCommand('extension.addComment', () => {
		vscode.window.showInputBox({placeHolder: 'Type your comment here', 
									value: getCommentByFileAndCurrentLine()})
			.then(newComment => addOrModifyComment(newComment))
	})

	//Global variables
	let timeout = null
	let activeEditor = vscode.window.activeTextEditor
	let workingDir = vscode.workspace.rootPath
	let commentsFile = workingDir + '/comments.ce.json'
	let currentFile = ""
	let commentsJson = {}
	
	//one time startup events
	if (activeEditor) {
		currentFile = activeEditor.document.fileName.split("/").pop()
		loadAllCommentsFromFile()
		triggerUpdateDecorations()
	}

	//Decorator that highlights a line of code that contains a comment
	const textHighlightDecoration = vscode.window.createTextEditorDecorationType({
		borderWidth: '1px',
		borderStyle: 'solid',
		overviewRulerColor: 'blue',
		overviewRulerLane: vscode.OverviewRulerLane.Right,
		light: {
			// this color will be used in light color themes
			borderColor: 'darkblue'
		},
		dark: {
			// this color will be used in dark color themes
			borderColor: 'lightblue'
		},
		backgroundColor: 'blue',
		cursor : 'pointer'
	})

	//Listeners
	vscode.workspace.onDidSaveTextDocument(file => {
		saveCommentsToFile()
	})

	vscode.window.onDidChangeActiveTextEditor(editor => {
		activeEditor = editor
		currentFile = activeEditor.document.fileName.split("/").pop()

		if (editor)
			triggerUpdateDecorations()
	}, null, context.subscriptions)

	vscode.workspace.onDidChangeTextDocument(event => {
		if (activeEditor && event.document === activeEditor.document) {
			recalculateCommentLine(event.contentChanges)
			triggerUpdateDecorations()
		}
	}, null, context.subscriptions)
	
	vscode.workspace.onDidCloseTextDocument(file => {
		loadPartialCommentsFromFile(file.fileName.split("/").pop())
	})

	//Functions
	function loadAllCommentsFromFile(){
		if (!fs.existsSync(commentsFile))
			return

		commentsJson = JSON.parse(fs.readFileSync(commentsFile,'utf8'))
	}
	
	function loadPartialCommentsFromFile(fileName){
		if (!fs.existsSync(commentsFile))
			return

		let tempCommentsJson = JSON.parse(fs.readFileSync(commentsFile,'utf8'))

		//if the file does not exist, exit the method
		if (!tempCommentsJson.hasOwnProperty(fileName) && !commentsJson.hasOwnProperty(fileName)) {
			return
		}
		// if the local version of comments has one for the file but the one saved doesn't
		else if (!tempCommentsJson.hasOwnProperty(fileName) && commentsJson.hasOwnProperty(fileName)) {
			delete commentsJson[fileName]
		}
		// copy previously saved values to local copy
		else {
			if (!commentsJson.hasOwnProperty(fileName))
				commentsJson[fileName] = {}

			commentsJson[fileName] = tempCommentsJson[fileName]
		}
	}

	function saveCommentsToFile(){
		let tempCommentsJson = JSON.parse(fs.readFileSync(commentsFile,'utf8'))

		if (!commentsJson.hasOwnProperty(currentFile))
			delete tempCommentsJson[currentFile]
		else {
			if (!tempCommentsJson.hasOwnProperty(currentFile))
				tempCommentsJson[currentFile] = {}

			tempCommentsJson[currentFile] = commentsJson[currentFile]
		}
		
		fs.writeFileSync(commentsFile, JSON.stringify(tempCommentsJson), 'utf8')
	}

	function saveCommentsToFileIfNotDirty(){
		if (!activeEditor.document.isDirty)
			saveCommentsToFile()
	}

	function addOrModifyComment(newComment){
		if (newComment == undefined)
			return

		let selection = vscode.window.activeTextEditor.selection

		if (newComment != "") {
			//first comment for the file, add the object for the file first
			if (!commentsJson.hasOwnProperty(currentFile))
				commentsJson[currentFile] = {}

			commentsJson[currentFile][selection.start.line + 1] = newComment
		}
		else {
			delete commentsJson[currentFile][selection.start.line + 1]

			if (Object.keys(commentsJson[currentFile]).length === 0)
				delete commentsJson[currentFile]
		}

		triggerUpdateDecorations()
		saveCommentsToFileIfNotDirty()
	}

	function loadCommentsToCode(file){
		const commentedLines: vscode.DecorationOptions[] = []

		for (let lineNo in commentsJson[file]){
			const lineText = vscode.window.activeTextEditor.document.lineAt(parseInt(lineNo) - 1).text

			const startPos = new vscode.Position(parseInt(lineNo) - 1, 0)
			const endPos = new vscode.Position(parseInt(lineNo) - 1, lineText.length)

			const decoration = { 
				range: new vscode.Range(startPos, endPos), 
				hoverMessage: commentsJson[file][lineNo] 
			}

			commentedLines.push(decoration)
		}

		activeEditor.setDecorations(textHighlightDecoration, commentedLines)
	}

	function getCommentByFileAndCurrentLine(){
		let selection = vscode.window.activeTextEditor.selection
		
		if (!commentsJson.hasOwnProperty(currentFile) 
			|| !commentsJson[currentFile].hasOwnProperty(selection.start.line + 1))
			return ""
		else
			return commentsJson[currentFile][selection.start.line + 1]
	}

	function recalculateCommentLine(changes){
		//new line(s) was added
		if (changes[0].text.includes("\n")){
			//before the line
			if (parseInt(changes[0].range._end._character) <= 0)
				modifyCommentLineNumber(countNewLines(changes[0].text), changes[0].range._end._line, ">=")
			//after the line
			else
				modifyCommentLineNumber(countNewLines(changes[0].text), changes[0].range._end._line, ">")
		}
		//line(s) was removed
		else if (changes[0].text == ""){
			deleteCommentsIfNeeded(parseInt(changes[0].range._start._line), 
								parseInt(changes[0].range._end._line))

			if (parseInt(changes[0].range._start._line) != parseInt(changes[0].range._end._line))
				modifyCommentLineNumber(-changes[0].rangeLength, changes[0].range._end._line, ">=")
		}
	}

	function countNewLines(changesText){
		return changesText.split("\n").length - 1
	}
	
	function deleteCommentsIfNeeded(startLine, endLine){
		for (let lineNo in commentsJson[currentFile]){
			if (parseInt(lineNo) - 1 >= startLine && parseInt(lineNo) - 1 <= endLine)
				delete commentsJson[currentFile][lineNo]
		}

		if (Object.keys(commentsJson[currentFile]).length === 0)
			delete commentsJson[currentFile]
	}

	function modifyCommentLineNumber(delta, lineModified, operator){
		let fileComments = commentsJson[currentFile]
		let operatorFactor
		
		//assigns a factor to calculate the correct operator without writing several conditions
		switch (operator) {
			case ">":
				operatorFactor = 0
			break
			case ">=":
				operatorFactor = -1
			break
		}

		//copies the value of the old line into the new line
		for (const lineNo in fileComments){
			let intLineNo = parseInt(lineNo)

			if (intLineNo - 1 > lineModified + operatorFactor) {
				fileComments[intLineNo + delta] = fileComments[lineNo]
				delete fileComments[lineNo]
			}
		}
	}

	function triggerUpdateDecorations() {
		if (timeout) 
			clearTimeout(timeout)
		
		timeout = setTimeout(updateDecorations, 500)
	}

	function updateDecorations() {
		if (!activeEditor)
			return

		loadCommentsToCode(currentFile)
	}
}