import { IResult } from "./IResult";

export interface IResponse {
    success: boolean;
    operationId?: string;
    results?: IResult[];
}