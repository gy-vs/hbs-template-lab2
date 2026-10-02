/* eslint-disable no-console */
import fs from 'fs';
import { S3, PutObjectCommand } from '@aws-sdk/client-s3';
import * as git from './util/git.js';
import semver from 'semver';

export const PUBLISHED_FILES = [
  'handlebars.js',
  'handlebars.min.js',
  'handlebars.runtime.js',
  'handlebars.runtime.min.js',
];

let s3Client;

async function main() {
  console.log('remotes: ' + (await git.remotes()));
  console.log('branches: ' + (await git.branches()));

  const commitInfo = await git.commitInfo();
  console.log('tag: ', commitInfo.tagName);

  const suffixes = buildSuffixes(commitInfo);

  if (suffixes.length > 0) {
    validateS3Env();
    console.log('publishing file-suffixes: ' + JSON.stringify(suffixes));
    await publish(suffixes);
  }
}

export function buildSuffixes(commitInfo) {
  const suffixes = [];

  if (commitInfo.isMaster) {
    suffixes.push('-latest');
    suffixes.push('-' + commitInfo.headSha);
  }

  if (commitInfo.tagName != null && semver.valid(commitInfo.tagName)) {
    suffixes.push('-' + commitInfo.tagName);
  }

  return suffixes;
}

export function validateS3Env() {
  const bucket = process.env.S3_BUCKET_NAME,
    region = process.env.S3_REGION,
    key = process.env.S3_ACCESS_KEY_ID,
    secret = process.env.S3_SECRET_ACCESS_KEY;

  if (!bucket || !region || !key || !secret) {
    throw new Error('Missing S3 config values');
  }
}

export async function publish(suffixes, overrides) {
  const publishPromises = suffixes.map((suffix) =>
    publishSuffix(suffix, overrides)
  );
  return Promise.all(publishPromises);
}

async function publishSuffix(suffix, overrides) {
  const publishPromises = PUBLISHED_FILES.map(async (filename) => {
    const nameInBucket = getNameInBucket(filename, suffix);
    const localFile = getLocalFile(filename);
    await uploadToBucket(localFile, nameInBucket, overrides);
    console.log(`Published ${localFile} to build server (${nameInBucket})`);
  });
  return Promise.all(publishPromises);
}

async function uploadToBucket(localFile, nameInBucket, overrides) {
  const s3 = overrides?.s3Client ?? getS3Client();
  const bucket = overrides?.bucket ?? process.env.S3_BUCKET_NAME;

  return s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: nameInBucket,
      Body: fs.readFileSync(localFile, 'utf8'),
    })
  );
}

function getS3Client() {
  if (!s3Client) {
    s3Client = new S3({
      region: process.env.S3_REGION,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

export function getNameInBucket(filename, suffix) {
  return filename.replace(/\.js$/, suffix + '.js');
}

export function getLocalFile(filename) {
  return 'dist/' + filename;
}

import { fileURLToPath } from 'url';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
