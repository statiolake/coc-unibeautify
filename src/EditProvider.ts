import * as vscode from "coc.nvim";
import cosmiconfig, {
  Config,
  CosmiconfigResult,
  ExplorerOptions,
} from "cosmiconfig";
import { extname } from "path";
import unibeautify, {
  BeautifyData,
  Language,
  LanguageOptionValues,
} from "unibeautify";
import { getTextEdits, translateTextEdits } from "./diffUtils";
import { UnibeautifyVSCodeSettings } from "./index";

export class EditProvider
  implements
    vscode.DocumentRangeFormattingEditProvider,
    vscode.DocumentFormattingEditProvider {
  public provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    options: vscode.FormattingOptions,
    token: vscode.CancellationToken,
  ): PromiseLike<vscode.TextEdit[]> {
    return this.provideDocumentRangeFormattingEdits(
      document,
      this.fullRange(document),
      options,
      token,
    );
  }

  private fullRange(document: vscode.TextDocument): vscode.Range {
    const entire = document.getText();
    return vscode.Range.create(
      document.positionAt(0),
      document.positionAt(entire.length),
    );
  }

  // tslint:disable-next-line:max-func-args
  public provideDocumentRangeFormattingEdits(
    document: vscode.TextDocument,
    range: vscode.Range,
    options: vscode.FormattingOptions,
    token: vscode.CancellationToken,
  ): PromiseLike<vscode.TextEdit[]> {
    const text: string = document.getText(range);
    return this.beautifyRange({ document, range, options, token })
      .then((newText: string) => getTextEdits(text, newText))
      .then((textEdits) => translateTextEdits(textEdits, range))
      .catch((error) => {
        console.error(error);
        return Promise.reject(error);
      });
  }

  private beautifyRange({
    document,
    range,
    options,
    token,
  }: {
    document: vscode.TextDocument;
    range: vscode.Range;
    options: vscode.FormattingOptions;
    token: vscode.CancellationToken;
  }): Promise<string> {
    console.log("FormattingOptions", options);
    const text: string = document.getText(range);
    const fileExtension = this.fileExtensionForDocument(document);
    const filePath = vscode.Uri.parse(document.uri).fsPath;
    const projectPath = vscode.workspace.rootPath;
    return EditProvider.beautifyOptions(filePath || projectPath).then(
      (beautifyOptions) => {
        const languageName = this.languageNameForDocument(document);
        const beautifyData: BeautifyData = {
          fileExtension,
          filePath,
          languageName,
          // @ts-ignore
          options: beautifyOptions,
          projectPath,
          text,
        };
        console.log("beautifyData", beautifyData);
        return unibeautify.beautify(beautifyData).catch((error) => {
          console.error(error);
          return Promise.reject(error);
        });
      },
    );
  }

  private languageNameForDocument(
    document: vscode.TextDocument,
  ): string | undefined {
    const languages = this.languagesForDocument(document);
    if (languages.length === 0) {
      return;
    }
    return languages[0].name;
  }

  private languagesForDocument(document: vscode.TextDocument): Language[] {
    return unibeautify.findLanguages({ vscodeLanguage: document.languageId });
  }

  private fileExtensionForDocument(
    document: vscode.TextDocument,
  ): string | undefined {
    const fileName = vscode.Uri.parse(document.uri).fsPath;
    if (fileName) {
      return `.${extname(fileName).slice(1)}`;
    }
    return undefined;
  }

  public static beautifyOptions(
    searchStartPath: string | undefined = vscode.workspace.rootPath,
  ): Promise<LanguageOptionValues | Config | null> {
    try {
      const vscodeSettings: UnibeautifyVSCodeSettings = <any>(
        vscode.workspace.getConfiguration("unibeautify")
      );
      const defaultConfigFile = vscodeSettings.defaultConfig;
      const cosmiOptions: ExplorerOptions = {
        stopDir: vscode.workspace.rootPath,
      };
      const explorer = cosmiconfig("unibeautify", cosmiOptions);
      const defaultConfig: LanguageOptionValues = {};

      return explorer
        .search(searchStartPath)
        .then((resultByPath: CosmiconfigResult) => {
          if (resultByPath) {
            return resultByPath.config;
          }

          // check fallback availability
          if (defaultConfigFile) {
            return explorer
              .load(defaultConfigFile)
              .then((resultByFile: CosmiconfigResult) =>
                resultByFile ? resultByFile.config : null,
              )
              .catch((error) => {
                vscode.window.showErrorMessage(
                  `We could not find your default config file: \n
                  ${defaultConfigFile} \n
                  Please correct your path, create a config in your
                  workspace or set the default to ‘null‘, otherwise
                  the plugin will not work!`,
                );
                throw error;
              });
          }

          return defaultConfig;
        });
    } catch (error) {
      return Promise.reject(error);
    }
  }
}
