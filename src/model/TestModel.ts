//#region IMPORTS
import { post, get } from "request";
import { readdir, writeFileSync } from "fs";
import { ISerConfig } from "../../node_modules/ser.api/index";
import { ResultModel, ITestError, ITestInfo, ITestResult } from "./ResultModel";
import { Logger, ELoglevel, ETransportType } from "../../node_modules/letslog/src/index";
import { IAnalyseResults } from "./interfaces/IAnalyseResults";
import { IResponse } from "./interfaces/IResponse";
import { IResult } from "./interfaces/IResult";
import { IConfig } from "./interfaces/IConfig";
import { delay } from "../lib/utils";
import { IFileResponse } from "./interfaces/IFileRspose";
import * as AdmZip from "adm-zip";
import { isNullOrUndefined } from "util";

let config: IConfig = require("../../config.json");
//#endregion

export class TestModel {

    //#region VARIABLES
    private job: ISerConfig = null;
    private expectedResults = 0;
    private recievedResults = 0;
    private testName: string = "";
    private templatePath: string = "";
    private resultModel: ResultModel;
    private logger: Logger = null;
    private responseTimeout: number = 10000
    private port: number = 8099;
    //#endregion

    constructor(testName: string, job: ISerConfig, resultModel: ResultModel) {

        let logPath: string;
        if (process.env.appdata) {
            logPath = config.logPath ? config.logPath : "%appdata%/tf_log/ReportingTestTool"
        } else {
            logPath = config.logPath ? config.logPath : "/var/log"
        }

        this.logger = new Logger({
            loglvl: ELoglevel[config.loglevel],
            transports: [{
                baseComment: "TestModel",
                showLoglevel: true,
                type: ETransportType.console
            }, {
                baseComment: `TestModel - ${testName}`,
                logFileName: "log",
                logpath: logPath,
                type: ETransportType.filesystem,
                showBaseComment: true,
                showDate: true,
                showLoglevel: true
            }]
        })

        this.job = job;
        this.testName = testName;
        this.templatePath = `${config.testPath}/${testName}/`;
        this.resultModel = resultModel;

        try {
            for (const key in job.tasks) {
                if (job.tasks.hasOwnProperty(key)) {
                    const task = job.tasks[key];
                    for (const key in task.reports) {
                        if (task.reports.hasOwnProperty(key)) {
                            this.expectedResults++;
                        }
                    }
                }
            }
        } catch (error) {
            this.logger.debug(error);
            const errorObject: ITestError = {
                name: "Expectet Result Count Error",
                occurence: "TestModel - contructor",
                msg: "error while calculating expected results"
            }
            this.resultModel.addError(errorObject);
        }
    }

    //#region PRIVATE VARIABLES

    private async loadFileAsZip(): Promise<Buffer> {
        return new Promise<Buffer>((resolve, reject) => {
            let zip = new AdmZip();
            readdir(this.templatePath, (err, files) => {
                if (err) {
                    this.logger.debug(err);
                    reject("Error in: loadFileAsZip - problems with readdir");
                    return;
                }
                for (const file of files) {
                    if (file.indexOf("\.xlsx") > 0 || file.indexOf("\.ttf") > 0 || file.indexOf("\.key") > 0) {
                        try {
                            zip.addLocalFile(`${this.templatePath}${file}`);
                        } catch (error) {
                            this.logger.debug(err);
                            reject("Error in: loadFileAsZip - problems add local fiels");
                            return;
                        }
                    }
                }
                resolve(zip.toBuffer());
            });
        })
    }

    private async postFile(data: Buffer): Promise<string> {
        this.logger.trace("in postFile");
        return new Promise<string>((resolve, reject) => {
            let options = {
                headers: {
                    "filename": "upload.zip",
                    "unzip": true,
                    "Content-Type": "application/octet-stream"
                }
            }
            this.logger.debug("post file", `http://localhost:${this.port}/api/v1/file`);
            let req = post(`http://localhost:${this.port}/api/v1/file`, options, (err, res, body) => {
                if (err || !body) {
                    this.logger.debug(err);
                    reject("Error in: POST - /api/v1/file");
                    return;
                }
                let response: IResponse = null;
                try {
                    response = JSON.parse(body);
                } catch (error) {
                    this.logger.debug(error);
                    reject("Erroi in postFile: problems while parse body");
                    return;
                }
                if (!response.success) {
                    reject("Error in: POST - /api/v1/file - response was not successfull");
                    return;
                }
                resolve(response.operationId);
            });
            req.body = data;
            req.timeout = this.responseTimeout;
        });
    }

    private async postTask(fileId: string): Promise<string> {
        this.logger.trace("in postTask");
        return new Promise<string>((resolve, reject) => {
            const serJson = this.job
            serJson["uploadGuids"] = [fileId];
            const options = {
                headers: {
                    "Content-Type": "application/json"
                }
            }
            let req = post(`http://localhost:${this.port}/api/v1/task`, options, (err, res, body) => {
                if (err || !body) {
                    this.logger.debug(err);
                    reject("Error in: POST - /api/v1/task");
                    return;
                }
                let response: IResponse = null;
                try {
                    response = JSON.parse(body);
                } catch (error) {
                    this.logger.debug(error);
                    reject("Erroi in postTask: problems while parse body");
                    return;
                }
                if (!response.success) {
                    reject("Error in: POST - /api/v1/task - response was not successfull");
                    return;
                }
                resolve(response.operationId);
            });
            req.body = JSON.stringify(serJson);
            req.timeout = this.responseTimeout;
        });
    }

    private async getTask(id): Promise<IResult[]> {
        this.logger.trace("in getTask");
        return new Promise<IResult[]>((resolve, reject) => {
            let req = get(`http://localhost:${this.port}/api/v1/task/${id}`, (err, res, body) => {
                if (err || !body) {
                    this.logger.debug(err);
                    reject("Error in: GET - /api/v1/task");
                    return;
                }
                let response: IResponse = null;
                try {
                    this.logger.trace("Body: ", body);
                    response = JSON.parse(body);
                    if (isNullOrUndefined(response.results[0])) {
                        this.logger.warn("null results recieved");
                    }
                } catch (error) {
                    this.logger.debug(error);
                    reject("Error in getTask: problems while parse body");
                    return;
                }
                if (!response.success) {
                    reject("Error in: GET - /api/v1/task - response was not successfull");
                    return;
                }
                resolve(response.results);
            });
            req.timeout = this.responseTimeout;
        });
    }

    private async getFile(id: string, filename: string, name: string): Promise<IFileResponse> {
        this.logger.trace("in getFile");
        return new Promise<IFileResponse>((resolve, reject) => {
            let options = {
                headers: {
                    "filename": filename
                }
            }
            let req = get(`http://localhost:${this.port}/api/v1/file/${id}`, options);
            let bufferArray = [];
            req.on("data", (res: Buffer) => {
                bufferArray.push(res);
            })
            req.on("complete", () => {
                resolve({
                    buffer: Buffer.concat(bufferArray),
                    name: `${name}.${filename.split(".").slice(-1)[0]}`
                });
            })
            req.on("error", (err) => {
                this.logger.debug(err);
                reject("Error in getFile")
            })
            req.end();
        });
    }

    private analyseResults(results: IResult[]): IAnalyseResults {
        this.logger.trace("in analyseResults");

        let analyseResult: IAnalyseResults = {
            continue: false,
            countReports: 0,
            errors: [],
            reports: [],
            warning: false
        };

        if (results.length === 0) {
            analyseResult.continue = true;
        }
        try {

            for (const result of results) {
                if (isNullOrUndefined(result)) {
                    analyseResult.continue = true;
                } else {
                    if (result.status === "ABORT") {
                        analyseResult.continue = true;
                    }
                    if (result.status === "ERROR" || result.status === "RETRYERROR") {
                        analyseResult.errors.push(`${result.status} in Task: ${result.taskId}`);
                    }
                    if (result.status === "SUCCESS") {
                        analyseResult.reports = analyseResult.reports.concat(result.reports);
                    }
                    if (result.status === "WARNING") {
                        analyseResult.warning = true;
                        analyseResult.reports = analyseResult.reports.concat(result.reports);
                    }
                }

                analyseResult.countReports += result.count;
            }
        } catch (error) {
            throw "result.status errors";
        }

        return analyseResult;
    }

    //#endregion

    //#region PUBLIC VARIABLES

    public async run(port) {
        this.port = port;
        let analyseResult: IAnalyseResults = null;
        try {
            let zipBuffer = await this.loadFileAsZip();

            let fileId = await this.postFile(zipBuffer)
            this.logger.trace("fileIds: ", fileId);
            let infoObject: ITestInfo = {
                name: "File Id",
                value: fileId
            }
            this.resultModel.addInfo(infoObject);

            // include a delay, so the server can unzip the sended file
            await delay(1000);

            const taskId = await this.postTask(fileId);
            infoObject = {
                name: "Task Id",
                value: taskId
            }
            this.resultModel.addInfo(infoObject);
            this.logger.trace("taskId: ", taskId);

            await (async () => {
                while (true) {
                    await delay(1000);
                    try {
                        const results = await this.getTask(taskId);
                        analyseResult = this.analyseResults(results);
                        if (!analyseResult.continue) {
                            if (analyseResult.errors.length > 0) {
                                const errorObject: ITestError = {
                                    name: "Analyse Error",
                                    occurence: "TestModel - run",
                                    msg: analyseResult.errors.join("\n")
                                }
                                this.resultModel.addError(errorObject);
                            }
                            break;
                        }
                    } catch (error) {
                        this.logger.warn("error while getTask", error);
                    }
                }
            })();
            this.logger.trace("task finished", analyseResult);
            this.recievedResults = analyseResult.countReports;
            let arr = []
            for (const report of analyseResult.reports) {
                let count = 0;
                for (const path of report.paths) {
                    let filename = path.split("/").pop();
                    arr.push(await this.getFile(taskId, filename, `${count}_${report.name}`));
                    count++;
                }
            }

            let fileResponses: IFileResponse[] = await Promise.all(arr);

            for (const fileResponse of fileResponses) {
                writeFileSync(`${config.testPath}/${this.testName}/output/${fileResponse.name}`, fileResponse.buffer);
            }
            this.logger.trace("File saved");

            const resultObject: ITestResult = {
                expected: this.expectedResults,
                recieved: this.recievedResults,
                warning: analyseResult.warning,
                name: `Count Result Test`
            };
            this.resultModel.addResult(resultObject);

        } catch (error) {
            this.logger.error("Error in run", error);
            const errorObject: ITestError = {
                name: "Run Error",
                occurence: "TestModel - run",
                msg: "error while running test"
            }
            this.resultModel.addError(errorObject);
        }

        // this.logger.info(this.resultModel.getResults());
        return;
    }

    //#endregion

}
