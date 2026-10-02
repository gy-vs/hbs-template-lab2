import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          include: ['spec/*.js'],
          exclude: ['spec/env/**', 'spec/.eslintrc.js'],
          setupFiles: ['spec/env/node.js'],
          globals: true,
        },
      },
      {
        test: {
          name: 'tasks',
          include: ['tasks/tests/*.test.js'],
          exclude: ['tasks/tests/publish-to-aws.test.js'],
          globals: true,
          pool: 'forks',
        },
      },
      {
        test: {
          name: 'rspack',
          include: ['tests/rspack/*.test.js'],
          globals: true,
        },
      },
      {
        test: {
          name: 'publish',
          include: ['tasks/tests/publish-to-aws.test.js'],
          globals: true,
          pool: 'forks',
        },
      },
      {
        test: {
          name: 'browser',
          include: ['spec/*.js'],
          exclude: [
            'spec/env/**',
            'spec/.eslintrc.js',
            'spec/precompiler.js',
            'spec/spec.js',
            'spec/source-map.js',
          ],
          setupFiles: [
            'spec/env/browser-vitest-pre.js',
            'spec/env/browser-vitest.js',
          ],
          globals: true,
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.js'],
      exclude: [
        'lib/handlebars/compiler/source-node.browser.js',
        'lib/handlebars/compiler/source-node.node.js',
      ],
      thresholds: {
        statements: 99,
        branches: 98,
        functions: 100,
        lines: 99,
      },
    },
  },
});
