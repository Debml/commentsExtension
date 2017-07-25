import * as vscode from 'vscode'
import fs = require('fs')

// this method is called when vs code is activated
export function activate(context: vscode.ExtensionContext) {
    //Commands
    vscode.commands.registerCommand('extension.addComment', () => {
        vscode.window.showInputBox({placeHolder: 'Type your comment here', value: getCommentByFileAndCurrentLine()})
            .then(newComment => updateCommentLocally(newComment))
    })

    //Global variables
    let timeout = null
    let activeEditor = vscode.window.activeTextEditor
    let workingDir = vscode.workspace.rootPath
    let currentFile
    let commentsJson

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
        commentsJson = JSON.parse(fs.readFileSync(workingDir + '/comments.json','utf8'))
    }

    function saveCommentsToFile(){
        fs.writeFileSync(workingDir + '/comments.json', JSON.stringify(commentsJson), 'utf8')
    }

    function saveCommentsToFileIfNotDirty(){
        if (!activeEditor.document.isDirty)
            saveCommentsToFile()
    }

    function updateCommentLocally(newComment){
        if (newComment == undefined)
            return

        let selection = vscode.window.activeTextEditor.selection

        if (newComment != "")
            commentsJson[currentFile][selection.active.line + 1] = newComment
        else
            delete commentsJson[currentFile][selection.active.line + 1]

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

        if (commentsJson[currentFile].hasOwnProperty(selection.active.line + 1))
            return commentsJson[currentFile][selection.active.line + 1]
        else
            return ""
    }

    function recalculateCommentLine(changes){
        if (changes[0].text.includes("\n")){
            if (parseInt(changes[0].range._end._character) <= 0)
                modifyCommentLineNumber(1, changes[0].range._end._line, ">=")
            else
                modifyCommentLineNumber(1, changes[0].range._end._line, ">")
        }
        else if (changes[0].text == ""){
            if (parseInt(changes[0].range._start._line) != parseInt(changes[0].range._end._line))
                modifyCommentLineNumber(-1, changes[0].range._end._line, ">=")
        }
    }

    function modifyCommentLineNumber(delta, lineModified, operator){
        var fileComments = commentsJson[currentFile]
        var fileCommentsAsString = JSON.stringify(fileComments)

        for (const lineNo in fileComments){
            switch (operator)
            {
                case ">":
                    if (parseInt(lineNo) - 1 > lineModified){
                        fileCommentsAsString = fileCommentsAsString.replace(lineNo, String(parseInt(lineNo) + delta))
                    }
                break
                case ">=":
                    if (parseInt(lineNo) - 1 >= lineModified){
                        fileCommentsAsString = fileCommentsAsString.replace(lineNo, String(parseInt(lineNo) + delta))
                    }
                break
            }
        }

        const fileCommentsAsJson = JSON.parse(fileCommentsAsString)
        commentsJson[currentFile] = fileCommentsAsJson
    }

	function triggerUpdateDecorations() {
		if (timeout) 
			clearTimeout(timeout)
        
        timeout = setTimeout(updateDecorations, 500)
    }

	function updateDecorations() {
		if (!activeEditor)
			return

        if (commentsJson.hasOwnProperty(currentFile))
            loadCommentsToCode(currentFile)
    }

    //one time startup events
	if (activeEditor) {
        currentFile = activeEditor.document.fileName.split("/").pop()
        loadCommentsFromFile()
		triggerUpdateDecorations()
	}
}
