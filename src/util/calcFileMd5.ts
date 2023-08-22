import * as fs from 'fs';
import { createHash } from 'crypto';

export const calcFileMd5 = (path: string) => {
  const data = fs.readFileSync(path);
  return createHash('md5').update(data).digest('base64');
};
