export interface IResult {
    taskId: string;
    startTime: string;
    runTime: string;
    status: string;
    count: number;
    reports? :IReport[];
}

export interface IReport {
    name: string;
    paths: string[];
}