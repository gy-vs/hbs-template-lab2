import http from 'http';

/**
 * Minimal in-memory S3-compatible server for testing.
 * Supports PutObject and GetObject via path-style requests.
 */
export function createFakeS3() {
  const buckets = new Map();

  const server = http.createServer((req, res) => {
    const { bucket, key } = parsePath(req.url);

    if (!bucket || !buckets.has(bucket)) {
      res.writeHead(404, { 'Content-Type': 'application/xml' });
      res.end('<Error><Code>NoSuchBucket</Code></Error>');
      return;
    }

    const store = buckets.get(bucket);

    if (req.method === 'PUT' && key) {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        store.set(key, Buffer.concat(chunks));
        res.writeHead(200);
        res.end();
      });
    } else if ((req.method === 'GET' || req.method === 'HEAD') && key) {
      if (!store.has(key)) {
        res.writeHead(404, { 'Content-Type': 'application/xml' });
        res.end('<Error><Code>NoSuchKey</Code></Error>');
        return;
      }
      const body = store.get(key);
      res.writeHead(200, {
        'Content-Length': body.length,
        'Content-Type': 'application/octet-stream',
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    } else {
      res.writeHead(405);
      res.end();
    }
  });

  return {
    start() {
      return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const { port } = server.address();
          resolve({
            address: `http://127.0.0.1:${port}`,
            createBucket(name) {
              if (!buckets.has(name)) buckets.set(name, new Map());
            },
            reset() {
              for (const store of buckets.values()) store.clear();
            },
            stop() {
              return new Promise((r) => server.close(r));
            },
          });
        });
      });
    },
  };
}

function parsePath(url) {
  // Path-style: /<bucket>/<key>
  const parts = new URL(url, 'http://localhost').pathname
    .replace(/^\//, '')
    .split('/');
  return {
    bucket: parts[0] || null,
    key: parts.slice(1).join('/') || null,
  };
}
