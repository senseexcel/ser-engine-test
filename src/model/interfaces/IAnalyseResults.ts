import { IReport } from "./IResult";

export interface IAnalyseResults {
    reports: IReport[];
    continue: boolean;
    countReports: number;
    errors: string[];
    warning: boolean;
}