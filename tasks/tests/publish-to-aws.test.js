import fs from 'fs';
import { S3, GetObjectCommand } from '@aws-sdk/client-s3';
import { createFakeS3 } from './fake-s3.js';

const BUCKET = 'test-bucket';

import {
  PUBLISHED_FILES,
  buildSuffixes,
  validateS3Env,
  publish,
  getNameInBucket,
  getLocalFile,
} from '../publish-to-aws.js';

let server;
let s3Client;

beforeAll(async () => {
  server = await createFakeS3().start();
  server.createBucket(BUCKET);

  s3Client = new S3({
    endpoint: server.address,
    region: 'us-east-1',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    forcePathStyle: true,
  });
});

afterAll(async () => {
  await server?.stop();
});

beforeEach(() => {
  server.reset();
});

async function getObjectBody(key) {
  const response = await s3Client.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key })
  );
  return response.Body.transformToString();
}

describe('buildSuffixes', () => {
  it('should add -latest and commit sha for master', () => {
    const result = buildSuffixes({
      isMaster: true,
      headSha: 'abc123',
      tagName: null,
    });
    expect(result).toEqual(['-latest', '-abc123']);
  });

  it('should add tag suffix for valid semver tag', () => {
    const result = buildSuffixes({
      isMaster: false,
      headSha: 'abc123',
      tagName: '4.7.0',
    });
    expect(result).toEqual(['-4.7.0']);
  });

  it('should add both master and tag suffixes when on master with a tag', () => {
    const result = buildSuffixes({
      isMaster: true,
      headSha: 'abc123',
      tagName: '4.7.0',
    });
    expect(result).toEqual(['-latest', '-abc123', '-4.7.0']);
  });

  it('should return empty array for non-master with no valid tag', () => {
    const result = buildSuffixes({
      isMaster: false,
      headSha: 'abc123',
      tagName: null,
    });
    expect(result).toEqual([]);
  });

  it('should ignore invalid semver tags', () => {
    const result = buildSuffixes({
      isMaster: false,
      headSha: 'abc123',
      tagName: 'not-semver',
    });
    expect(result).toEqual([]);
  });
});

describe('getNameInBucket', () => {
  it('should insert suffix before .js extension', () => {
    expect(getNameInBucket('handlebars.js', '-latest')).toBe(
      'handlebars-latest.js'
    );
  });

  it('should handle .min.js files', () => {
    expect(getNameInBucket('handlebars.min.js', '-4.7.0')).toBe(
      'handlebars.min-4.7.0.js'
    );
  });

  it('should handle runtime files', () => {
    expect(getNameInBucket('handlebars.runtime.js', '-abc123')).toBe(
      'handlebars.runtime-abc123.js'
    );
  });
});

describe('getLocalFile', () => {
  it('should prefix with dist/', () => {
    expect(getLocalFile('handlebars.js')).toBe('dist/handlebars.js');
  });
});

describe('validateS3Env', () => {
  const S3_KEYS = [
    'S3_BUCKET_NAME',
    'S3_REGION',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
  ];
  const saved = {};

  beforeEach(() => {
    for (const key of S3_KEYS) {
      saved[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const key of S3_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  it('should throw when S3 env vars are missing', () => {
    for (const key of S3_KEYS) {
      delete process.env[key];
    }

    expect(() => validateS3Env()).toThrow('Missing S3 config values');
  });

  it('should not throw when all S3 env vars are set', () => {
    process.env.S3_BUCKET_NAME = 'test-bucket';
    process.env.S3_REGION = 'us-east-1';
    process.env.S3_ACCESS_KEY_ID = 'key';
    process.env.S3_SECRET_ACCESS_KEY = 'secret';

    expect(() => validateS3Env()).not.toThrow();
  });
});

describe('publish to S3', () => {
  const overrides = {};

  beforeAll(() => {
    overrides.s3Client = s3Client;
    overrides.bucket = BUCKET;
  });

  it('should upload all 4 files for a single suffix', async () => {
    await publish(['-latest'], overrides);

    for (const filename of PUBLISHED_FILES) {
      const key = getNameInBucket(filename, '-latest');
      const body = await getObjectBody(key);
      const localContent = fs.readFileSync(getLocalFile(filename), 'utf8');
      expect(body).toBe(localContent);
    }
  });

  it('should upload files for multiple suffixes', async () => {
    await publish(['-latest', '-abc123'], overrides);

    for (const suffix of ['-latest', '-abc123']) {
      for (const filename of PUBLISHED_FILES) {
        const key = getNameInBucket(filename, suffix);
        const body = await getObjectBody(key);
        expect(body).toBeTruthy();
      }
    }
  });

  it('should upload correct content from dist/', async () => {
    await publish(['-v1.0.0'], overrides);

    const key = getNameInBucket('handlebars.js', '-v1.0.0');
    const uploaded = await getObjectBody(key);
    const local = fs.readFileSync('dist/handlebars.js', 'utf8');
    expect(uploaded).toBe(local);
  });

  it('should produce correct keys for a version tag', async () => {
    await publish(['-4.7.0'], overrides);

    const expectedKeys = PUBLISHED_FILES.map((f) =>
      getNameInBucket(f, '-4.7.0')
    );

    for (const key of expectedKeys) {
      const body = await getObjectBody(key);
      expect(body).toBeTruthy();
    }

    expect(expectedKeys).toEqual([
      'handlebars-4.7.0.js',
      'handlebars.min-4.7.0.js',
      'handlebars.runtime-4.7.0.js',
      'handlebars.runtime.min-4.7.0.js',
    ]);
  });
});
