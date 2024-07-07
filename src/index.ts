import * as vscode from "coc.nvim";
import unibeautify, { LanguageOptionValues } from "unibeautify";
import { EditProvider } from "./EditProvider";
import { beautifiers } from "./beautifiers";

export function activate(context: vscode.ExtensionContext) {
  if (!isEnabled()) {
    console.log("Unibeautify is disabled");
    return;
  }
  unibeautify.loadBeautifiers(beautifiers);
  const { supportedLanguages } = unibeautify;
  return EditProvider.beautifyOptions().then(
    (options: LanguageOptionValues) => {
      console.log("Supported languages", supportedLanguages);
      const enabledLanguages = supportedLanguages.filter(
        // @ts-ignore
        (lang) => options[lang.name] !== false,
      );
      console.log("Options", options);
      console.log("Enabled languages", enabledLanguages);
      const languageFilters: vscode.DocumentFilter[] = enabledLanguages.reduce(
        (filters, { vscodeLanguages = [] }) => {
          const languages: vscode.DocumentFilter[] = vscodeLanguages.map(
            (language) => ({ language, scheme: "file" }),
          );
          return [...filters, ...languages];
        },
        [] as vscode.DocumentFilter[],
      );
      const patternFilters: vscode.DocumentFilter[] = enabledLanguages
        .filter((language) => language.extensions.length > 0)
        .map((language) => ({
          pattern: `**/*{${language.extensions.join(",")}}`,
          scheme: "file",
        }));
      const documentSelector: vscode.DocumentSelector = [
        ...languageFilters,
        ...patternFilters,
      ];
      console.log("Unibeautify documentSelector", documentSelector);
      const priority = vscodeSettings().priority;
      console.log("Unibeautify priority", priority);
      const editProvider = new EditProvider();
      context.subscriptions.push(
        vscode.languages.registerDocumentFormatProvider(
          documentSelector,
          editProvider,
          priority,
        ),
        vscode.languages.registerDocumentRangeFormatProvider(
          documentSelector,
          editProvider,
          priority,
        ),
      );
    },
  );
}

// tslint:disable-next-line:no-empty
export function deactivate() {}

function isEnabled(): boolean {
  return Boolean(vscodeSettings().enabled);
}

function vscodeSettings(): UnibeautifyVSCodeSettings {
  return vscode.workspace.getConfiguration("unibeautify") as any;
}

export interface UnibeautifyVSCodeSettings {
  priority: number;
  defaultConfig: string | null;
  enabled: boolean;
}
