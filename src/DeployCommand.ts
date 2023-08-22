import { BaseCommand } from './BaseCommand';
import { Logger } from 'ah-logger';
import * as OSS from 'ali-oss';
import * as glob from 'glob';
import * as _ from 'lodash';
import * as pp from 'path';
import { SchemaObject, validate } from 'ah-api-type';
import { calcFileMd5 } from './util/calcFileMd5';

export type IDeployRunCfg = {
  /** default: dist */
  publicDir?: string;

  /** default: `/` */
  pathPrefix?: string;

  /** default: jpg, png, gif, ico, js, css */
  stableAssetExts?: string[];

  /** default: 20 */
  chunkSize?: number;

  rules?: {
    pattern: string;
    headers?: string[];
  }[];

  oss: { region: string; bucket: string; accessKeyId: string; accessKeySecret: string };
};

export const IDeployRunCfg: SchemaObject = {
  type: 'object',
  properties: {
    publicDir: { type: 'string' },
    pathPrefix: { type: 'string', pattern: '^\\/(.*)\\/$' },
    stableAssetExts: { type: 'array', items: { type: 'string' } },
    chunkSize: { type: 'integer' },
    rules: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
          headers: { type: 'array', items: { type: 'string', pattern: ':' } },
        },
        required: ['pattern'],
      },
    },

    oss: {
      type: 'object',
      properties: {
        region: { type: 'string' },
        bucket: { type: 'string' },
        accessKeyId: { type: 'string' },
        accessKeySecret: { type: 'string' },
      },
      required: ['region', 'bucket', 'accessKeyId', 'accessKeySecret'],
    },
  },
  required: ['oss'],
};

export class DeployCommand extends BaseCommand {
  private logger = new Logger('Deploy');

  async run(config: IDeployRunCfg) {
    // validate
    config = validate(IDeployRunCfg, config);

    const {
      publicDir = 'dist',
      pathPrefix = '/',
      stableAssetExts = ['jpg', 'png', 'gif', 'ico', 'js', 'css'],
      chunkSize = 20,
      rules = [],
      oss,
    } = config;

    this.logger.info('start deploy %s -> oss://%s', publicDir, oss.bucket + pathPrefix);

    const client = new OSS(oss);
    const localRelPaths = glob.sync('**/*', { nodir: true, cwd: publicDir });

    // 分块上传
    for (const subLocalPaths of _.chunk(localRelPaths, chunkSize)) {
      //
      const uploadPromises = subLocalPaths.map(async localRelPath => {
        const localAbsPath = pp.join(publicDir, localRelPath);

        // oss 存储路径
        const ossPath = pp.join(pathPrefix, localRelPath);

        // 开始对比 md5
        const localMd5 = calcFileMd5(localAbsPath);
        const remoteMd5: string | undefined = await client
          .head(ossPath)
          .then(rsp => (rsp.res.headers as any)['content-md5'])
          .catch(_err => {
            return undefined;
          });

        if (localMd5 === remoteMd5) {
          this.logger.info('not modified, skip: %s', localRelPath);
          return;
        }

        this.logger.info('uploading: %s', localRelPath);

        const extname = pp.extname(localRelPath);
        const isStableAssets = stableAssetExts.includes(extname);

        const matchRule = rules.find(r => new RegExp(r.pattern).test(localRelPath));

        return client.put(ossPath, localAbsPath, {
          headers: {
            'Cache-Control': isStableAssets ? `max-age=${3 * 365 * 24 * 60 * 60}` : `max-age=${2 * 60}`,
            ...matchRule?.headers?.reduce(
              (re, cur) => {
                const [k, v] = cur.split(':').map(d => d.trim());
                return { ...re, [k]: v };
              },
              {} as Record<string, string>
            ),
          },
        });
      });

      await Promise.all(uploadPromises);
    }

    this.logger.info('已上传 %s 个文件', localRelPaths.length);
  }
}
