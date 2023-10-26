/* eslint-disable */
import {exec} from "child_process";
import {config} from 'dotenv';

const util = require('util')
const execProm = util.promisify(exec)
module.exports = async function () {
  // Start services that that the app needs to run (e.g. database, docker-compose, etc.).
  try {
    console.log('\nSetting up...\n');
    process.env.IS_AUTH_ENABLED = "true";

    config({path: __dirname + '/../../.env.e2e'});

    console.log('REDIS_HOST: ' + process.env.REDIS_HOST)

    if (process.env.IS_E2E_DOCKER_COMPOSE_ENABLED !== 'false') {
      await execProm('docker-compose -f resources/docker-compose.test.yml up -d')
      console.log('Docker compose up')
    }

    await execProm('nx prisma-reset lending-api --force --verbose')
    console.log('Reset completed')
    await execProm('nx prisma-seed lending-api --verbose')
    console.log('Prisma deployed')

    // Hint: Use `globalThis` to pass variables to global teardown.
    globalThis.__TEARDOWN_MESSAGE__ = '\nTearing down...\n';
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
};
