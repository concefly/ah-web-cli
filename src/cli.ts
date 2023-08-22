#!/usr/bin/env node

import * as yargs from 'yargs';
import * as dotenv from 'dotenv';
import { DeployCommand, IDeployRunCfg } from '.';
import * as yamljs from 'yamljs';
import * as fs from 'fs';
import * as _ from 'lodash';
import { validate } from 'ah-api-type';

dotenv.config();

type DeepPartial<T> = { [k in keyof T]?: DeepPartial<T[k]> };

//#region
const env = process.env as Partial<
  Record<
    | 'DEPLOY_PUBLIC_DIR'
    | 'DEPLOY_PATH_PREFIX'
    | 'DEPLOY_STABLE_ASSETS_EXTS'
    | 'DEPLOY_CHUNK_SIZE'
    | 'DEPLOY_OSS_REGION'
    | 'DEPLOY_OSS_BUCKET'
    | 'DEPLOY_OSS_AK'
    | 'DEPLOY_OSS_SK',
    string
  >
>;
//#endregion

const handleCatch = (err: any) => {
  console.error(err);
  process.exit(1);
};

yargs.command(
  'deploy',
  'DeployCommand',
  iy => {
    return iy
      .option('publicDir', { type: 'string' })
      .option('pathPrefix', { type: 'string' })
      .option('stableAssetExts', { type: 'string' })
      .option('chunkSize', { type: 'number' })
      .option('oss_region', { type: 'string' })
      .option('oss_bucket', { type: 'string' })
      .option('oss_accessKeyId', { type: 'string' })
      .option('oss_accessKeySecret', { type: 'string' })
      .option('config', { alias: 'c', type: 'string', default: '.webcli.yaml' });
  },
  argv => {
    const cmd = new DeployCommand();

    const configFromFile: DeepPartial<IDeployRunCfg> = fs.existsSync(argv.config)
      ? yamljs.load(argv.config)
      : undefined;

    const configFromCli: DeepPartial<IDeployRunCfg> = {
      ...argv,
      ...(argv.stableAssetExts && {
        stableAssetExts: argv.stableAssetExts.split(',').map(s => s.trim()) as any,
      }),
      oss: {
        ...(argv.oss_region && { region: argv.oss_region }),
        ...(argv.oss_bucket && { bucket: argv.oss_bucket }),
        ...(argv.oss_accessKeyId && { accessKeyId: argv.oss_accessKeyId }),
        ...(argv.oss_accessKeySecret && { accessKeySecret: argv.oss_accessKeySecret }),
      },
    };

    const configFromEnv: DeepPartial<IDeployRunCfg> = {
      ...(env.DEPLOY_PUBLIC_DIR && { publicDir: env.DEPLOY_PUBLIC_DIR }),
      ...(env.DEPLOY_PATH_PREFIX && { pathPrefix: env.DEPLOY_PATH_PREFIX }),
      ...(env.DEPLOY_STABLE_ASSETS_EXTS && {
        stableAssetExts: env.DEPLOY_STABLE_ASSETS_EXTS.split(',').map(s => s.trim()),
      }),
      ...(env.DEPLOY_CHUNK_SIZE && { chunkSize: +env.DEPLOY_CHUNK_SIZE }),
      oss: {
        ...(env.DEPLOY_OSS_REGION && { region: env.DEPLOY_OSS_REGION }),
        ...(env.DEPLOY_OSS_BUCKET && { bucket: env.DEPLOY_OSS_BUCKET }),
        ...(env.DEPLOY_OSS_AK && { accessKeyId: env.DEPLOY_OSS_AK }),
        ...(env.DEPLOY_OSS_SK && { accessKeySecret: env.DEPLOY_OSS_SK }),
      },
    };

    // merge and validate config
    const config: IDeployRunCfg = validate(IDeployRunCfg, _.merge(configFromEnv, configFromFile, configFromCli)) as any;

    cmd.run(config).catch(handleCatch);
  }
).argv;
