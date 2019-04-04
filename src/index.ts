//#region import
import { TestController } from "./model/TestController";
//#endregion

async function run() {
    const testController = new TestController();
    testController.startTest();
}

run();
