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
	let currentFile = ""
	let commentsJson = {}
	
	//one time startup events
	if (activeEditor) {
		currentFile = activeEditor.document.fileName.split("/").pop()
		loadCommentsFromFile()
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

	//Functions
	function loadCommentsFromFile(){
        if (!fs.existsSync(workingDir + '/comments.json'))
            return

		commentsJson = JSON.parse(fs.readFileSync(workingDir + '/comments.json','utf8'))
	}

	function saveCommentsToFile(){
		fs.writeFileSync(workingDir + '/comments.json', JSON.stringify(commentsJson), 'utf8')
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

			commentsJson[currentFile][selection.active.line + 1] = newComment
		}
		else {
			delete commentsJson[currentFile][selection.active.line + 1]

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
		
		if (!commentsJson.hasOwnProperty(currentFile))
			return ""

		if (commentsJson[currentFile].hasOwnProperty(selection.active.line + 1))
			return commentsJson[currentFile][selection.active.line + 1]
		else
			return ""
	}

	function recalculateCommentLine(changes){
		//new line was added
		if (changes[0].text.includes("\n")){
			//before the line
			if (parseInt(changes[0].range._end._character) <= 0)
				modifyCommentLineNumber(1, changes[0].range._end._line, ">=")
			//after the line
			else
				modifyCommentLineNumber(1, changes[0].range._end._line, ">")
		}
		//line was removed
		else if (changes[0].text == ""){
			if (parseInt(changes[0].range._start._line) != parseInt(changes[0].range._end._line))
				modifyCommentLineNumber(-1, changes[0].range._end._line, ">=")
		}
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
