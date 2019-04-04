export interface ITestResult {
    name: string;
    warning?: boolean;
    expected?: number;
    recieved?: number;
    testFailed?: boolean;
}

export interface ITestError {
    name: string;
    msg: string;
    occurence: string;
}

export interface ITestInfo {
    name: string;
    value: string;
}

export class ResultModel {

    //#region VARIABLES
    private testResults: string[] = [];
    private testErrors: string[] = [];
    private testInfos: string[] = [];
    private name: string = "";
    //#endregion

    constructor(name) {
        this.name = name;
    }

    private arrayToString(arr: string[]) {
        let string= "\n";
        for (const element of arr) {
            string += `\t\t${element} \n`
        }
        return string
    }

    public addError(errorObject: ITestError): void {
        this.testErrors.push(`${errorObject.name}: ${errorObject.occurence} - ${errorObject.msg}`);
    }

    public addInfo(infoObject: ITestInfo): void {
        this.testInfos.push(`${infoObject.name}: ${infoObject.value}`);
    }

    public addResult(resultObject: ITestResult) {
        let success: boolean;
        if (!resultObject.expected || !resultObject.recieved) {
            success = false
        } else {
            success = resultObject.expected === resultObject.recieved;
        }
        const testStatus = success?!resultObject.warning?"\x1b[32mTest Passed\x1b[0m":"\x1b[33mTest Passed with Warnings\x1b[0m": "\x1b[31mTest Failed\x1b[0m";
        this.testResults.push(`${resultObject.name}: expected ${resultObject.expected}, recieved ${resultObject.recieved} - ${testStatus}`);
    }

    /**
     * getResults: return the final result in a string representation
     */
    public getResults(): string {
        return `----- ${this.name} -----\r\n
        Test Results: ${this.arrayToString(this.testResults)}\r
        Info:  ${this.arrayToString(this.testInfos)}\r
        Errors: ${this.arrayToString(this.testErrors)}\r
        `;
    }

}
