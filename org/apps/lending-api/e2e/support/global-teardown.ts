/* eslint-disable */

import {exec} from "child_process";
const util = require('util')
const execProm = util.promisify(exec)

module.exports = async function () {
  // Put clean up logic here (e.g. stopping services, docker-compose, etc.).
  // Hint: `globalThis` is shared between setup and teardown.
  if (process.env.IS_E2E_DOCKER_COMPOSE_ENABLED !== 'false') {
    await execProm('docker-compose -f resources/docker-compose.test.yml down')
    console.log('Docker compose down')
  }

  console.log(globalThis.__TEARDOWN_MESSAGE__);
};
