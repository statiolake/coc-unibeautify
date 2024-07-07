/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------*/

import { Position, Range, TextEdit, Uri, WorkspaceEdit } from "coc.nvim";
import * as jsDiff from "diff";

export enum EditTypes {
  EDIT_DELETE,
  EDIT_INSERT,
  EDIT_REPLACE,
}

export class Edit {
  public action: number;
  public start: Position;
  public end: Position;
  public text: string;

  constructor(action: number, start: Position) {
    this.action = action;
    this.start = start;
    this.text = "";
  }

  // Creates TextEdit for current Edit
  public apply(): TextEdit | undefined {
    switch (this.action) {
      case EditTypes.EDIT_INSERT:
        return TextEdit.insert(this.start, this.text);

      case EditTypes.EDIT_DELETE:
        return TextEdit.del(Range.create(this.start, this.end));

      case EditTypes.EDIT_REPLACE:
        return TextEdit.replace(Range.create(this.start, this.end), this.text);
    }
  }

  // Applies Edits to given WorkspaceEdit
  public applyUsingWorkspaceEdit(
    workspaceEdit: WorkspaceEdit,
    fileUri: Uri,
  ): void {
    if (workspaceEdit.changes === undefined) workspaceEdit.changes = {};
    if (workspaceEdit.changes[fileUri.toString()] === undefined) {
      workspaceEdit.changes[fileUri.toString()] = [];
    }
    const changes = workspaceEdit.changes[fileUri.toString()];

    switch (this.action) {
      case EditTypes.EDIT_INSERT: {
        const edit = TextEdit.insert(this.start, this.text);
        changes.push(edit);
        break;
      }

      case EditTypes.EDIT_DELETE: {
        const edit = TextEdit.del(Range.create(this.start, this.end));
        changes.push(edit);
        break;
      }

      case EditTypes.EDIT_REPLACE: {
        const edit = TextEdit.replace(
          Range.create(this.start, this.end),
          this.text,
        );
        changes.push(edit);
        break;
      }
    }
  }
}

export interface FilePatch {
  fileName: string;
  edits: Edit[];
}

/**
 * Uses diff module to parse given array of IUniDiff objects and returns edits for files
 *
 * @param diffOutput jsDiff.IUniDiff[]
 *
 * @returns Array of FilePatch objects, one for each file
 */
function parseUniDiffs(diffOutput: jsDiff.ParsedDiff[]): FilePatch[] {
  const filePatches: FilePatch[] = [];
  diffOutput.forEach((uniDiff: jsDiff.ParsedDiff) => {
    let edit: Edit | null = null;
    const edits: Edit[] = [];
    uniDiff.hunks.forEach((hunk: jsDiff.Hunk) => {
      let startLine = hunk.oldStart;
      hunk.lines.forEach((line) => {
        switch (line.substr(0, 1)) {
          case "-":
            if (edit == null) {
              edit = new Edit(
                EditTypes.EDIT_DELETE,
                Position.create(startLine - 1, 0),
              );
            }
            edit.end = Position.create(startLine, 0);
            startLine++;
            break;
          case "+":
            if (edit == null) {
              edit = new Edit(
                EditTypes.EDIT_INSERT,
                Position.create(startLine - 1, 0),
              );
            } else if (edit.action === EditTypes.EDIT_DELETE) {
              edit.action = EditTypes.EDIT_REPLACE;
            }
            edit.text += line.substr(1) + "\n";
            break;
          case " ":
            startLine++;
            if (edit != null) {
              edits.push(edit);
            }
            edit = null;
            break;
        }
      });
      if (edit != null) {
        edits.push(edit);
      }
    });

    const fileName = uniDiff.oldFileName || "";
    filePatches.push({ fileName, edits });
  });

  return filePatches;
}

/**
 * Returns a FilePatch object by generating diffs between given oldStr and newStr using the diff module
 *
 * @param fileName string: Name of the file to which edits should be applied
 * @param oldStr string
 * @param newStr string
 *
 * @returns A single FilePatch object
 */
function getEdits(fileName: string, oldStr: string, newStr: string): FilePatch {
  const isWindows = process.platform === "win32";
  const unifiedDiffs: jsDiff.ParsedDiff = jsDiff.structuredPatch(
    fileName,
    fileName,
    isWindows ? oldStr.split("\r\n").join("\n") : oldStr,
    isWindows ? newStr.split("\r\n").join("\n") : newStr,
    "",
    "",
  );
  const filePatches: FilePatch[] = parseUniDiffs([unifiedDiffs]);
  return filePatches[0];
}

export function getTextEdits(oldStr: string, newStr: string): TextEdit[] {
  const filename = "undefined";
  const filePatch = getEdits(filename, oldStr, newStr);
  return filePatch.edits.map((edit) => edit.apply()).filter(notEmpty);
}

export function translateTextEdits(
  textEdits: TextEdit[],
  offset: Range,
): TextEdit[] {
  return textEdits.map((edit) => {
    const range = translateRange(edit.range, offset.start);
    return TextEdit.replace(range, edit.newText);
  });
}

export function translateRange(range: Range, offset: Position): Range {
  const start = Position.create(
    range.start.line + offset.line,
    range.start.character + offset.character,
  );
  const end = Position.create(
    range.end.line + offset.line,
    range.end.character + offset.character,
  );
  return Range.create(start, end);
}

function notEmpty<TValue>(value: TValue | null | undefined): value is TValue {
  return value !== null && value !== undefined;
}
