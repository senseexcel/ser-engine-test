export interface IConfig {
    runParallel: boolean;
    loglevel: string;
    qlikEngineContainer: string;
    reportingEngineContainer: string;
    reportingEngineStartPort: number;
    tests: string[];
    removeDockerEnviroment: boolean;
    testPath: string;
    useLocalRest: boolean;
    enginePath: string;
    cpuCount: number;
}