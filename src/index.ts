//#region import
import { TestController } from "./model/TestController";
//#endregion

let run = () => {
    const testController = new TestController();
    testController.startTest();
}

run();
