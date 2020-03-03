//#region IMPORTS
import { exec } from "child_process";
import { Logger, ELoglevel, ETransportType } from "../../node_modules/letslog/src/index";
import { createGuid, delay } from "../lib/utils";
import { IConfig } from "./interfaces/IConfig";

let config: IConfig = require("../../config.json");
//#endregion

export class DockerController {

    //#region VARIABLES
    private logger: Logger = null;
    private networkName: string = "";
    private qlikContainerCount: number = 2;
    private containerNames: string[] = [];
    private volumeName: string = "";
    private qlikContainerName: string = "";
    private serContainerName: string = "";
    private testPath: string = "";
    private engineLocalTag: string = "";
    //#endregion

    constructor(testPath: string) {

        let logPath: string;
        if (process.env.appdata) {
            logPath = config.logPath?config.logPath:"%appdata%/tf_log/ReportingTestTool"
        } else {
            logPath = config.logPath?config.logPath:"/var/log"
        }

        this.logger = new Logger({
            loglvl: ELoglevel[config.loglevel],
            transports: [{
                baseComment: "TestController",
                showLoglevel: true,
                type: ETransportType.console
            }
            , {
                baseComment: `TestMoDockerControllerdel - ${testPath}`,
                logFileName: "log",
                logpath: logPath,
                type: ETransportType.filesystem,
                showBaseComment: true,
                showDate: true,
                showLoglevel: true
            }]
        });
        this.testPath = testPath;
    }

    //#region private function

    private async createNetwork(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const name = `ser-network-${createGuid()}`;
            this.logger.debug("Create Network Name: ", name);
            exec(`docker network create ${name}`, (err) => {
                if (err) {
                    this.logger.debug(err);
                    reject(err);
                }
                this.networkName = name;
                resolve();
            })
        });
    }

    private async createVolume(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const name = `ser-volume-${createGuid()}`;
            this.logger.debug("Create Volume Name: ", name);
            exec(`docker volume create ${name}`, (err) => {
                if (err) {
                    this.logger.debug(err);
                    reject(err);
                }
                this.volumeName = name;
                resolve();
            });
        });
    }

    private async createQlikContainer(i: number): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const name = `ser-qlik-container-${createGuid()}`;
            this.logger.debug("Create Qlik Container Name: ", name);
            this.qlikContainerName = name;
            const cmd = ["docker container create",
                "--network-alias engine",
                `--mount source=${this.volumeName},target=/apps`,
                `--network ${this.networkName}`,
                `--name ${name}`,
                `--cpus="1"`,
                `-p ${9076+i}:9076`,
                config.qlikEngineContainer,
                "-S DocumentDirectory=/apps -S AcceptEULA=yes -S SessionLogVerbosity=5"];

            exec(cmd.join(" "), (err) => {
                if (err) {
                    this.logger.debug(err);
                    reject(err);
                }
                this.containerNames.push(name);
                resolve();
            });
        });
    }

    private async createSERContainer(port: number): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const name = `ser-reporting-container-${createGuid()}`;
            this.serContainerName = name;
            this.logger.debug("Create SER Container Name: ", name);
            this.logger.debug("Running on Port: ", port);
            const cmd = ["docker container create",
                `--network ${this.networkName}`,
                `--name ${name}`,
                `--cpus="${config.cpuCount}"`,
                `-p ${port}:80`,
                config.useLocalRest?`senseexcel/ser-engine:${this.engineLocalTag}`:config.reportingEngineContainer];

            this.logger.debug("cmd for create ser container: ", cmd.join(" "));

            exec(cmd.join(" "), (err) => {
                if (err) {
                    this.logger.debug(err);
                    reject(err);
                }
                this.containerNames.push(name);
                resolve();
            });
        });
    }

    private async destroyContainer(name: string): Promise<void> {
        this.logger.debug("Destroy Container Name: ", name);
        return new Promise<void>((resolve, reject) => {
            exec(`docker container rm ${name}`, (err) => {
                if (err) {
                    this.logger.debug(err);
                    reject(err);
                }
                resolve();
            })
        });
    }

    private async destroyNetwork(): Promise<void> {
        this.logger.debug("Destroy Network Name: ", this.networkName);
        return new Promise<void>((resolve, reject) => {
            exec(`docker network rm ${this.networkName}`, (err) => {
                if (err) {
                    this.logger.debug(err);
                    reject(err);
                }
                resolve();
            })
        });
    }

    private async destroyVolume(): Promise<void> {
        this.logger.debug("Destroy Volume Name: ", this.volumeName);
        return new Promise<void>((resolve, reject) => {
            exec(`docker volume rm ${this.volumeName}`, (err) => {
                if (err) {
                    this.logger.debug(err);
                    reject(err);
                }
                resolve();
            })
        });
    }

    private async stopContainer(name: string): Promise<void> {
        this.logger.debug("Stop Container Name: ", name);
        return new Promise<void>((resolve, reject) => {
            exec(`docker container stop ${name}`, (err) => {
                if (err) {
                    this.logger.debug(err);
                    reject(err);
                }
                resolve();
            })
        });
    }

    private async uploadQfvFile(path: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            exec(`docker container cp "${path}" ${this.qlikContainerName}:apps/`, (err) => {
                if (err) {
                    this.logger.debug(err)
                    reject(err);
                }
                resolve();
            })
        });
    }

    private async uploadQvfFiles(paths: string[]): Promise<void[]> {
        return Promise.all(
            paths.map(path => this.uploadQfvFile(path))
        )
    }

    private async startContainer(name: string): Promise<void> {
        this.logger.debug("Start Container Name: ", name);
        return new Promise<void>((resolve, reject) => {
            exec(`docker container start ${name}`, (err) => {
                if (err) {
                    this.logger.debug(err);
                    reject(err);
                }
                resolve();
            })
        });
    }

    private async createRestContainer(): Promise<void> {
        if (config.useLocalRest) {
            return new Promise<void>((resolve, reject) => {
                const tag = "serRestServiceLocal";
                this.logger.debug("Create Docker Image: ", tag);
                exec(`docker build -t senseexcel/ser-engine:${tag} ${config.enginePath}`, (err) => {
                    if (err) {
                        this.logger.debug(err);
                        reject(err);
                    }
                    this.engineLocalTag = tag;
                    resolve();
                })
            });
        }
        return;
    }

    public async copyLogFile(): Promise<void> {
        this.logger.debug("Copy log from ser");
        return new Promise<void>((resolve, reject) => {
            exec(`docker container cp ${this.serContainerName}:/root/senseexcel/ser-engine-rest/ser-engine-rest-reporting.log ${this.testPath}/output/`, (err) => {
                if (err) {
                    this.logger.debug(err);
                    reject(err);
                }
                resolve();
            });
        })
    }

    //#endregion

    //#region public functions

    /**
     * createEnviroment
     */
    public async createEnviroment(port: number, qvfFiles: string[]): Promise<boolean> {
        this.logger.debug("## createEnviroment ##");
        try {
            await Promise.all([
                this.createVolume(),
                this.createNetwork()
            ]);

            let a: Promise<void>[] = []
            for (let i = 0; i < this.qlikContainerCount; i++) {
                a.push(this.createQlikContainer(i))
            };
            a.push(this.createSERContainer(port));
            await Promise.all(a);

            a = [];
            for (const name of this.containerNames) {
                a.push(this.startContainer(name));
            }
            await Promise.all(a);

            await this.uploadQvfFiles(qvfFiles);

            return true;
        } catch (error) {
            this.logger.error(error);
            return false;
        }
    }

    /**
     * clearEnviroment
     */
    public async clearEnviroment(): Promise<boolean> {
        this.logger.debug("## clearEnviroment ##");
        try {
            let a: Promise<void>[] = [];
            for (const name of this.containerNames) {
                a.push(this.stopContainer(name));
            }
            await Promise.all(a);

            a = [];
            for (const name of this.containerNames) {
                a.push(this.destroyContainer(name));
            }
            await Promise.all(a);

            this.destroyNetwork();
            this.destroyVolume();
            return true;
        } catch (error) {
            this.logger.error(error);
            return false;
        }
    }

    public async init(): Promise<boolean> {
        try {
            await this.createRestContainer();
            return true;
        } catch (error) {
            this.logger.error("ERROR", error);
            return false;
        }
    }

    //#endregion

}
