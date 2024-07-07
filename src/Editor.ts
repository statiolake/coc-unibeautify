import * as vscode from "coc.nvim";

export class Editor {
  constructor(private textEditor: vscode.TextEditor) {}

  static get activeTextEditor(): Editor | undefined {
    const textEditor = vscode.window.activeTextEditor;
    return textEditor ? new Editor(textEditor) : undefined;
  }

  static get activeDocument(): vscode.TextDocument | undefined {
    const textEditor = this.activeTextEditor;
    if (textEditor) {
      return textEditor.document;
    }
    return undefined;
  }

  get document(): vscode.TextDocument | undefined {
    return this.textEditor.document.textDocument;
  }

  get text(): string | undefined {
    if (this.document) {
      return this.document.getText();
    }
    return undefined;
  }

  public setText(newText: string, range: vscode.Range = this.fullRange) {
    return vscode.TextEdit.replace(range, newText);
  }

  get fullRange(): vscode.Range {
    if (this.document) {
      const entire = this.document.getText();
      return vscode.Range.create(
        this.document.positionAt(0),
        this.document.positionAt(entire.length),
      );
    }
    return vscode.Range.create(0, 0, 0, 0);
  }
}
