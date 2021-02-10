//#region IMPORTS
import { post, get } from "request";
import { readdir, writeFileSync, createReadStream, renameSync } from "fs";
import { ISerConfig, ISerReport, ISerSenseSelection } from "../../node_modules/ser.api/index";
import { ResultModel, ITestError, ITestInfo, ITestResult } from "./ResultModel";
import { Logger, ELoglevel, ETransportType } from "../../node_modules/letslog/src/index";
import { IAnalyseResults } from "./interfaces/IAnalyseResults";
import { IResult } from "./interfaces/IResult";
import { IConfig } from "./interfaces/IConfig";
import { delay } from "../lib/utils";
import { IFileResponse } from "./interfaces/IFileRspose";
import * as AdmZip from "adm-zip";
import * as websocket from "ws";
import * as enigmajs from "enigma.js";
import * as url from "url";
import * as FormData from 'form-data';
import { request } from 'http';

let config: IConfig = require("../../config.json");
let schema = require("../../node_modules/enigma.js/schemas/12.34.11.json");
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
        this.templatePath = `${config.testPath}${testName}/`;
        this.resultModel = resultModel;
    }

    //#region PRIVATE VARIABLES

    private async getDynCount(report: ISerReport): Promise<number> {
        if (typeof(report.template.selections) === "undefined") {
            return 0
        }
        const staticFilters = report.template.selections.filter(value => value.type.toString() === "static")
        const dynamicFilters = report.template.selections.filter(value => value.type.toString() === "dynamic")
        let count = 0

        if (dynamicFilters.length === 0) {
            return 0
        }
        const configQlik = await this.getConfigToDesktop();
        const session = enigmajs.create(configQlik);
        try {
            const global = await session.open();
            const app = await (global as EngineAPI.IGlobal).openDoc(report.connections[0].app)

            await this.setStaticFilter(staticFilters, app);

            if (dynamicFilters[0].values && dynamicFilters[0].values.length > 0) {
                await this.setDynamicFilter(dynamicFilters[0], app);
            }

            var parameter: EngineAPI.IGenericObjectProperties = {
                "qInfo": {
                    "qType": "ListObject"
                },
                "qListObjectDef": {
                    "qDef": {
                        "qFieldDefs": [`${dynamicFilters[0].name}`],
                        "qGrouping": "N",
                        "autoSort": false,
                        "qActiveField": 0,
                        "qFieldLabels": [`${dynamicFilters[0].name}`]
                    },
                    "qShowAlternatives": true,
                    "qInitialDataFetch": [
                        {
                            "qTop": 0,
                            "qLeft": 0,
                            "qHeight": 0,
                            "qWidth": 0
                        }
                    ]
                }
            };

            const sessionObject = await app.createSessionObject(parameter)
            const layout = await sessionObject.getLayout();
            count = (layout as EngineAPI.IGenericListLayout).qListObject.qDimensionInfo.qStateCounts.qSelected;
            if (count === 0) {
                count = (layout as EngineAPI.IGenericListLayout).qListObject.qDimensionInfo.qStateCounts.qOption;
            }
        } catch (error) {
            this.logger.error("ERROR", error);
        }

        return count

    }

    private async setDynamicFilter(dynamicFilter: ISerSenseSelection, app: EngineAPI.IApp): Promise<void> {
        const field = await app.getField(dynamicFilter.name)
        let count = await field.getCardinal();
        await dynamicFilter.values.forEach(async (value) => {
            await field. toggleSelect(value);
            let count = await field.getCardinal();
        })
        return;
    }

    private async setStaticFilter(staticFilters: ISerSenseSelection[], app: EngineAPI.IApp): Promise<void> {
        if (staticFilters.length === 0) {
            return;
        }

        let currentFilter = staticFilters[0];
        let newFilters = staticFilters.slice(1);

        const field = await app.getField(currentFilter.name);
        await currentFilter.values.forEach(async (value) => {
            await field.toggleSelect(value);
        });

        await this.setStaticFilter(newFilters, app);

    }

    private getConfigToDesktop(): Promise<enigmaJS.IConfig> {
        this.logger.trace("getConfigToDesktop");

        return new Promise((resolve, reject) => {
            try {
                const serverConfig = {
                    schema: schema,
                    url: "ws://localhost:9076/app/engineData",
                    createSocket: url => new websocket(url)
                }
                resolve(serverConfig);
            } catch (error) {
                reject(error);
            }
        });

    }

    private async loadFileAsZip(): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            let zip = new AdmZip();
            readdir(this.templatePath, (err, files) => {
                if (err) {
                    this.logger.debug(err);
                    reject("Error in: loadFileAsZip - problems with readdir");
                    return;
                }
                for (const file of files) {
                    if (file.indexOf("\.xlsx") > 0 || file.indexOf("\.ttf") > 0 || file.indexOf("\.key") > 0 || file.indexOf("\.xlsb") > 0 ) {
                        try {
                            zip.addLocalFile(`${this.templatePath}${file}`);
                        } catch (error) {
                            this.logger.debug(err);
                            reject("Error in: loadFileAsZip - problems add local fiels");
                            return;
                        }
                    }
                }
                zip.writeZip(`${this.templatePath}temp.zip`, () => {
                    resolve(`${this.templatePath}temp.zip`);
                })
                
            });
        })
    }

    private async postFile(file: any): Promise<string> {
        this.logger.trace("in postFile");
        return new Promise<string>((resolve, reject) => {

            try {
                
                this.logger.debug("post file ", `http://localhost:${this.port}/upload`);
                const form = new FormData();
                form.append('file', file);


                const req = request(
                    {
                        host: 'localhost',
                        port: this.port,
                        path: '/upload',
                        method: 'POST',
                        headers: form.getHeaders(),
                    },
                    response => {

                        response.on("data", (data) => {
                            this.logger.debug("post file", `http://localhost:${this.port}/upload: `, JSON.parse(data.toString()));
                            
                            resolve(JSON.parse(data.toString()));
                        })

                    }
                );
                form.pipe(req);

            } catch(error) {
                reject(error)
            }
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
            let req = post(`http://localhost:${this.port}/task`, options, (err, res, body) => {
                if (err || !body) {
                    this.logger.debug(err);
                    reject("Error in: POST - /task");
                    return;
                }
                let response = null;
                try {
                    response = JSON.parse(body);
                } catch (error) {
                    this.logger.debug(error);
                    reject("Error in postTask: problems while parse body");
                    return;
                }
                resolve(response);
            });
            req.body = '"' + JSON.stringify(serJson).replace(/"/g, '\\"')+ '"';
            req.timeout = this.responseTimeout;
        });
    }

    private async getTask(id): Promise<IResult[]> {
        this.logger.trace("in getTask");
        return new Promise<IResult[]>((resolve, reject) => {
            let req = get(`http://localhost:${this.port}/task/${id}`, (err, res, body) => {
                if (err || !body) {
                    this.logger.debug(err);
                    reject("Error in: GET - /task");
                    return;
                }
                let response: IResult[] = null;
                try {
                    this.logger.trace("Body: ", body);
                    response = JSON.parse(JSON.parse(body));                    
                    if (response === null || response === undefined) {
                        this.logger.warn("null results recieved");
                    }
                } catch (error) {
                    this.logger.debug(error);
                    reject("Error in getTask: problems while parse body");
                    return;
                }
                resolve(response);
            });
            req.timeout = this.responseTimeout;
        });
    }

    private async getFile(id: string): Promise<IFileResponse> {
        this.logger.trace("in getFile");
        return new Promise<IFileResponse>((resolve, reject) => {
            let req = get(`http://localhost:${this.port}/download/${id}`);
            let bufferArray = [];
            req.on("data", (res: Buffer) => {
                bufferArray.push(res);
            })
            req.on("complete", () => {
                resolve({
                    buffer: Buffer.concat(bufferArray),
                    name: `output.zip`
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
        this.logger.trace("in analyseResults: ", results);


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

                if (result === null || result === undefined) {
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

            const readStream = createReadStream(zipBuffer);
            let fileId = await this.postFile(readStream);
            this.logger.trace("fileIds: ", fileId);
            let infoObject: ITestInfo = {
                name: "File Id",
                value: fileId
            }
            this.resultModel.addInfo(infoObject);

            // include a delay, so the server can unzip the sended file
            await delay(1000);

            try {
                for (const key in this.job.tasks) {
                    if (this.job.tasks.hasOwnProperty(key)) {
                        const task = this.job.tasks[key];
                        for (const key in task.reports) {
                            if (task.reports.hasOwnProperty(key)) {
                                let a = task.reports[key]
                                let b = await this.getDynCount(a)
                                if (b === 0) {
                                    this.expectedResults++;
                                } else {
                                    this.expectedResults += b;
                                }
                                
                            }
                        }
                    }
                }
            } catch (error) {
                this.logger.error("error", error);
            }

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

            const outzip = await this.getFile(taskId)
            writeFileSync(`${config.testPath}/${this.testName}/output/${outzip.name}`, outzip.buffer);

            var zip = new AdmZip(`${config.testPath}/${this.testName}/output/${outzip.name}`);
            var zipEntries = zip.getEntries(); // an array of ZipEntry records

            zip.extractAllTo(`${config.testPath}/${this.testName}/output/`, true);

            
            for (const report of analyseResult.reports) {
                let count = 0;
                for (const path of report.paths) {
                    let filename = path.split("/").pop();
                    let assistArr = filename.split(".");
                    let format = assistArr[assistArr.length-1]

                    renameSync(
                        `${config.testPath}/${this.testName}/output/${filename}`, 
                        `${config.testPath}/${this.testName}/output/${count}_${report.name}.${format}`
                    )

                    count++;
                }
            }


            // TODO

            // let arr = []
            // for (const report of analyseResult.reports) {
            //     let count = 0;
            //     for (const path of report.paths) {
            //         let filename = path.split("/").pop();
            //         arr.push(await this.getFile(taskId, filename, `${count}_${report.name}`));
            //         count++;
            //     }
            // }

            // let fileResponses: IFileResponse[] = await Promise.all(arr);

            // for (const fileResponse of fileResponses) {
            //     writeFileSync(`${config.testPath}/${this.testName}/output/${fileResponse.name}`, fileResponse.buffer);
            // }
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
        return;
    }
    //#endregion

}
