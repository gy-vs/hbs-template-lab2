import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('spec', function () {
  // NOP Under non-node environments
  if (typeof process === 'undefined') {
    return;
  }

  var specDir = __dirname + '/mustache/specs/';
  var specs = fs.readdirSync(specDir).filter((name) => /.*\.json$/.test(name));

  specs.forEach(function (name) {
    var spec = JSON.parse(fs.readFileSync(specDir + name, 'utf8'));
    spec.tests.forEach(function (test) {
      // Our lambda implementation knowingly deviates from the optional Mustache lambda spec
      // We also do not support alternative delimiters
      if (
        name === '~lambdas.json' ||
        // We also choose to throw if partials are not found
        (name === 'partials.json' && test.name === 'Failed Lookup') ||
        // We nest the entire response from partials, not just the literals
        (name === 'partials.json' && test.name === 'Standalone Indentation') ||
        /\{\{=/.test(test.template) ||
        Object.values(test.partials || {}).some((value) => /\{\{=/.test(value))
      ) {
        it.skip(name + ' - ' + test.name);
        return;
      }

      var data = Object.assign({}, test.data); // Shallow copy
      if (data.lambda) {
        // Blergh
        /* eslint-disable-next-line no-eval */
        data.lambda = eval('(' + data.lambda.js + ')');
      }
      it(name + ' - ' + test.name, function () {
        expectTemplate(test.template)
          .withInput(data)
          .withPartials(test.partials || {})
          .withCompileOptions({ compat: true })
          .withMessage(test.desc + ' "' + test.template + '"')
          .toCompileTo(test.expected);
      });
    });
  });
});
