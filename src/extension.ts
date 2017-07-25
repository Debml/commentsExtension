import * as vscode from 'vscode';
import fs = require('fs');

// this method is called when vs code is activated
export function activate(context: vscode.ExtensionContext) {
    vscode.commands.registerCommand('extension.addComment', () => {
        vscode.window.showInputBox({placeHolder: 'Type your comment here', value: getCommentByFileAndCurrentLine()})
            .then(newComment => addCommentToFile(newComment));
    });

    function getCommentByFileAndCurrentLine(){
        const workingDir = vscode.workspace.rootPath
        var comments = fs.readFileSync(workingDir + '/comments.json','utf8');
        comments = JSON.parse(comments)

        let currentFileWithPath = activeEditor.document.fileName
        let currentFile = currentFileWithPath.split("/").pop()

        var editor = vscode.window.activeTextEditor;
        var selection = editor.selection;

        if (comments[currentFile].hasOwnProperty(selection.active.line + 1))
            return comments[currentFile][selection.active.line + 1]
        else
            return ""
    }

    function addCommentToFile(newComment){
        if (newComment == undefined)
            return

        const workingDir = vscode.workspace.rootPath
        var comments = fs.readFileSync(workingDir + '/comments.json','utf8');
        comments = JSON.parse(comments)

        let currentFileWithPath = activeEditor.document.fileName
        let currentFile = currentFileWithPath.split("/").pop()

        var editor = vscode.window.activeTextEditor;
        var selection = editor.selection;

        if (newComment != "")
            comments[currentFile][selection.active.line + 1] = newComment
        else
            delete comments[currentFile][selection.active.line + 1]

        fs.writeFileSync(workingDir + '/comments.json', JSON.stringify(comments), 'utf8')
        triggerUpdateDecorations()
    }

	// create a decorator type that we use to decorate small numbers
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
	});

    let activeEditor = vscode.window.activeTextEditor;
    
	if (activeEditor) {
		triggerUpdateDecorations();
	}

	vscode.window.onDidChangeActiveTextEditor(editor => {
		activeEditor = editor;
		if (editor) {
			triggerUpdateDecorations()
		}
	}, null, context.subscriptions);

	vscode.workspace.onDidChangeTextDocument(event => {
		if (activeEditor && event.document === activeEditor.document) {
            updateCommentsFile(event.contentChanges)
			triggerUpdateDecorations()
		}
	}, null, context.subscriptions);

	var timeout = null;
	function triggerUpdateDecorations() {
		if (timeout) {
			clearTimeout(timeout);
		}
        timeout = setTimeout(updateDecorations, 500);
    }

    function updateCommentsFile(changes){
        const workingDir = vscode.workspace.rootPath
        var comments = fs.readFileSync(workingDir + '/comments.json','utf8');
        comments = JSON.parse(comments)

        if (changes[0].text.includes("\n")){
            if (parseInt(changes[0].range._end._character) <= 0)
                modifyCommentLineNumber(comments, 1, changes[0].range._end._line, ">=")
            else
                modifyCommentLineNumber(comments, 1, changes[0].range._end._line, ">")
        }
        else if (changes[0].text == ""){
            if (parseInt(changes[0].range._start._line) != parseInt(changes[0].range._end._line))
                modifyCommentLineNumber(comments, -1, changes[0].range._end._line, ">=")
        }
    }

    function modifyCommentLineNumber(comments, delta, lineModified, operator){
        let currentFileWithPath = activeEditor.document.fileName
        let currentFile = currentFileWithPath.split("/").pop()

        var fileComments = comments[currentFile]
        var fileCommentsAsString = JSON.stringify(fileComments);

        for (const lineNo in fileComments){
            switch (operator)
            {
                case ">":
                    if (parseInt(lineNo) - 1 > lineModified){
                        fileCommentsAsString = fileCommentsAsString.replace(lineNo, String(parseInt(lineNo) + delta));
                    }
                break;
                case ">=":
                    if (parseInt(lineNo) - 1 >= lineModified){
                        fileCommentsAsString = fileCommentsAsString.replace(lineNo, String(parseInt(lineNo) + delta));
                    }
                break;
            }

        }

        const fileCommentsAsJson = JSON.parse(fileCommentsAsString)
        comments[currentFile] = fileCommentsAsJson
        
        const workingDir = vscode.workspace.rootPath
        fs.writeFileSync(workingDir + '/comments.json', JSON.stringify(comments), 'utf8')
    }

	function updateDecorations() {
		if (!activeEditor) {
			return;
        }

        let comments = JSON.parse(loadCommentsFile())
        let files = vscode.workspace.textDocuments
        let currentFileWithPath = activeEditor.document.fileName
        let currentFile = currentFileWithPath.split("/").pop()

        files.forEach(function (file){ 
            if (currentFileWithPath == file.fileName)
                loadCurrentFileComments(comments[currentFile])
        });
    }

    function loadCommentsFile(){
        const workingDir = vscode.workspace.rootPath
        const jsonText = fs.readFileSync(workingDir + '/comments.json','utf8');
        return jsonText
    }
    
    function loadCurrentFileComments(comments){
        const commentedLines: vscode.DecorationOptions[] = [];

        for (let lineNo in comments){
            const lineText = vscode.window.activeTextEditor.document.lineAt(parseInt(lineNo) - 1).text

            const startPos = new vscode.Position(parseInt(lineNo) - 1, 0)
            const endPos = new vscode.Position(parseInt(lineNo) - 1, lineText.length)

            const decoration = { 
                range: new vscode.Range(startPos, endPos), 
                hoverMessage: comments[lineNo] 
            };

            commentedLines.push(decoration);
        }

        activeEditor.setDecorations(textHighlightDecoration, commentedLines);
    }
}
