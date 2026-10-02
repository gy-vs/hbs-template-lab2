import { rspack } from '@rspack/core';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')
);
const license = fs.readFileSync(path.resolve(__dirname, 'LICENSE'), 'utf8');
const banner = `/*!

 @license magnet:?xt=urn:btih:d3d9a9a6595521f9666a5e94cc830dab83b65699&dn=expat.txt Expat
 ${pkg.name} v${pkg.version}

${license}
*/`;

function createConfig(entry, filename, minimize) {
  const plugins = [];

  if (!minimize) {
    // For non-minified builds, use BannerPlugin to add the license header
    plugins.push(new rspack.BannerPlugin({ banner, raw: true }));
  }

  return {
    mode: minimize ? 'production' : 'none',
    context: __dirname,
    entry,
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename,
      library: {
        name: 'Handlebars',
        type: 'self',
        export: 'default',
      },
      clean: false,
    },
    optimization: {
      minimize,
      minimizer: minimize
        ? [
            new rspack.SwcJsMinimizerRspackPlugin({
              extractComments: false,
              minimizerOptions: {
                compress: { passes: 2 },
                mangle: true,
                format: {
                  comments: false,
                  // Prepend the license banner in the minified output
                  preamble: banner,
                },
              },
            }),
          ]
        : [],
    },
    plugins,
    resolve: {
      extensions: ['.js', '.json'],
      mainFields: ['main'],
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          resolve: {
            fullySpecified: false,
          },
        },
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'builtin:swc-loader',
            options: {
              jsc: {
                parser: { syntax: 'ecmascript' },
              },
            },
          },
        },
      ],
    },
    target: ['web', 'browserslist'],
    devtool: false,
  };
}

export default [
  createConfig('./lib/handlebars.js', 'handlebars.js', false),
  createConfig('./lib/handlebars.runtime.js', 'handlebars.runtime.js', false),
  createConfig('./lib/handlebars.js', 'handlebars.min.js', true),
  createConfig(
    './lib/handlebars.runtime.js',
    'handlebars.runtime.min.js',
    true
  ),
];
