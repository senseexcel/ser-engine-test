# ser-engien-test

run automated test for sense excel reporting in separated started docker enviroments to ensure to have no side effects in between the tests.

## Requirements
- have docker (docker-compose) installed on your system
- have node.js installed on your system (node.js > 6.x)

## How to use this example
- clone or download this repository to a enviroment where docker and node.js is installed
- run "npm install" inside the cloned/downloaded repository
- run "npm run start"

## IMPORTANT
If error occured, please check the qlik engine version in the config.json. You can find the resently updated Versions of the Qlik Engine on the following website: https://hub.docker.com/r/qlikcore/engine/tags.


### options for top level


| options                  | Type       | Default Values    | Mandatory     |
|--------------------------|------------|-------------------|---------------|
| runParallel              | string     | none              | mandatory     |
| loglevel                 | string     | none              | mandatory     |
| qlikEngineContainer      | string     | none              | mandatory     |
| reportingEngineContainer | string     | none              | mandatory     |
| reportingEngineStartPort | number     | none              | mandatory     |
| tests                    | string[]   | none              | mandatory     |
| removeDockerEnviroment   | boolean    | none              | mandatory     |
| testPath                 | string     | none              | mandatory     |
| useLocalRest             | boolean    | none              | mandatory     |
| enginePath               | string     | none              | mandatory     |
| cpuCount                 | number     | none              | mandatory     |
| logPath                  | string     | none              | optional      |