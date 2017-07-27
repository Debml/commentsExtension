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

	vscode.commands.registerCommand('extension.toggleComments',() => {
		toggleShowComments()
	})

	//Global variables
	let activeEditor = vscode.window.activeTextEditor
	let workingDir = vscode.workspace.rootPath
	let commentsFile = workingDir + '/comments.ce.json'
	let currentFile = ""
	let commentsJson = {}
	let showComments = false
	
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

	//one time startup events
	if (activeEditor) {
		currentFile = activeEditor.document.fileName.split("/").pop()
		loadAllComments()
		setCommentsOnCode()
	}

	//Listeners
	vscode.workspace.onDidSaveTextDocument(file => {
		saveCommentsToFile()
	})

	vscode.window.onDidChangeActiveTextEditor(editor => {
		activeEditor = editor
		currentFile = activeEditor.document.fileName.split("/").pop()

		setCommentsOnCode()
	}, null, context.subscriptions)

	vscode.workspace.onDidChangeTextDocument(event => {
		if (activeEditor && event.document === activeEditor.document && event.contentChanges.length != 0) {
			recalculateCommentLine(event.contentChanges)
			setCommentsOnCode()
		}
	}, null, context.subscriptions)
	
	vscode.workspace.onDidCloseTextDocument(file => {
		loadPartialCommentsFromFile(file.fileName.split("/").pop())
	})

	//Functions
	function loadAllComments(){
		commentsJson = readCommentsFromFile()
	}

	function readCommentsFromFile(){
		if (!fs.existsSync(commentsFile))
			return

		return JSON.parse(fs.readFileSync(commentsFile,'utf8'))
	}
	
	function loadPartialCommentsFromFile(fileName){
		let tempCommentsJson = readCommentsFromFile

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
		let tempCommentsJson = readCommentsFromFile()

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
		//esc was pressed (cancel)
		if (newComment == undefined)
			return

		let selection = vscode.window.activeTextEditor.selection

		//if the comment has text
		if (newComment != "") {
			//first comment for the file, add the object for the file first
			if (!commentsJson.hasOwnProperty(currentFile))
				commentsJson[currentFile] = {}

			commentsJson[currentFile][selection.start.line + 1] = newComment
		}
		//adding empty comment (delete)
		else {
			delete commentsJson[currentFile][selection.start.line + 1]

			if (Object.keys(commentsJson[currentFile]).length === 0)
				delete commentsJson[currentFile]
		}

		setCommentsOnCode()
		saveCommentsToFileIfNotDirty()
	}

	function setDecorations(file){
		const commentedLines: vscode.DecorationOptions[] = []

		if (showComments){
			for (let lineNo in commentsJson[file]){
				const intLineNo = parseInt(lineNo)
				const lineText = vscode.window.activeTextEditor.document.lineAt(intLineNo - 1).text

				const startPos = new vscode.Position(intLineNo - 1, 0)
				const endPos = new vscode.Position(intLineNo - 1, lineText.length)

				const decoration = { 
					range: new vscode.Range(startPos, endPos), 
					hoverMessage: commentsJson[file][lineNo] 
				}

				commentedLines.push(decoration)
			}
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
		const newLines = countNewLines(changes[0].text)
		const startLine = parseInt(changes[0].range._start._line)
		const endLine = parseInt(changes[0].range._end._line)

		//line(s) added
		if (newLines > 0){
			//added before the text
			if (activeEditor.document.lineAt(startLine).isEmptyOrWhitespace)
				shiftCommentDown(newLines, endLine, ">=")
			//added after the text
			else
				shiftCommentDown(newLines, endLine, ">")
		}
		//line(s) removed
		else if (changes[0].text == ""){
			//deleteCommentsIfNeeded(startLine, endLine)

			//if (startLine != endLine)
				//modifyCommentLineNumber(-(endLine - startLine), changes[0].range._end._line, ">=")
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

	function shiftCommentDown(delta, lineModified, operator){
		let operatorFactor = getOperatorFactor(operator)
		var commentsKeys = Object.keys(commentsJson[currentFile]).sort(function(a, b) {
			return parseInt(b) - parseInt(a)
		})

		for (const lineNo in commentsKeys){
			let intLineNo = parseInt(commentsKeys[lineNo])

			if (intLineNo - 1 > lineModified + operatorFactor) {
				commentsJson[currentFile][intLineNo + delta] = commentsJson[currentFile][intLineNo]
				delete commentsJson[currentFile][intLineNo]
			}
		}
	}

	function getOperatorFactor(operator){
		switch (operator) {
			case ">":
				return 0
			case ">=":
				return -1
			default:
				return 0
		}
	}

	function setCommentsOnCode() {
		if (!activeEditor)
			return

		setDecorations(currentFile)
	}

	function toggleShowComments() {
		showComments = !showComments
		setCommentsOnCode()
	}
}