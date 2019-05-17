import { getFilesFromType, loadFile } from "../lib/fileUtils";
import { ITestError, ResultModel, ITestResult } from "./ResultModel";
import { IConfig } from "./interfaces/IConfig";
let config: IConfig = require("../config.json");

interface IResult {
    name: string;
    content: string;
}

export class CompareModel {

    private testName: string;
    private filetype: string;
    private rootPath: string = config.testPath;
    private resultModel: ResultModel;

    public numberOfResultFiles: number
    

    constructor(testName: string, filetype: string, resultModel: ResultModel) {
        this.testName = testName;
        this.filetype = filetype;
        this.resultModel = resultModel;
    }

    private async loadFiles(path: string): Promise<IResult[]> {
        try {
            const files = await getFilesFromType(path, this.filetype);
            const loadFilePromises: Promise<Buffer>[] = [];
            for (const file of files) {
                loadFilePromises.push(loadFile(`${path}/${file}`));
            }
            const loadedFiles = await Promise.all(loadFilePromises);
    
            const results: IResult[] = [];
            for (let i = 0; i < loadedFiles.length; i++) {
                const b = loadedFiles[i];
                const name = files[i];
                results.push({
                    content: b.toString("utf8"),
                    name: name
                });
            }
            return results;
        } catch (error) {
            const errorObject: ITestError = {
                name: "File Load Error",
                occurence: "CompareModel - loadFiles",
                msg: "error while loading file"
            }
            this.resultModel.addError(errorObject);
            return [];
        }
    }

    private compareResults(prevResults: IResult[], currentResults: IResult[]): void {
        const numberOfResultFiles = prevResults.length;
        let numberOfEquals = 0;

        for (const prevResult of prevResults) {
            for (const currentResult of currentResults) {
                if (prevResult.name === currentResult.name && prevResult.content === currentResult.content) {
                    numberOfEquals++;
                }
            }
        }

        const resultObject: ITestResult = {
            expected: numberOfResultFiles,
            recieved: numberOfEquals,
            name: `Compare Result Test - ${this.filetype}`
        };
        this.resultModel.addResult(resultObject);
        return;
    }

    public async run(): Promise<void> {
        try {
            const promArr = [
                this.loadFiles(`${this.rootPath}${this.testName}`),
                this.loadFiles(`${this.rootPath}${this.testName}/output`)
            ];
            const [prevResult, currentResult] = await Promise.all(promArr);
            if (prevResult.length === 0) {
                return;
            }
            this.compareResults(prevResult, currentResult);
            return;
        } catch (error) {
            return;
        }
    }
}
