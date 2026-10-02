import { Exception } from '@handlebars/parser';
import * as base from './handlebars/base.js';

// Each of these augment the Handlebars object. No need to setup here.
// (This is done to easily share code between module systems and browser envs)
import SafeString from './handlebars/safe-string.js';
import * as Utils from './handlebars/utils.js';
import * as runtime from './handlebars/runtime.js';

import noConflict from './handlebars/no-conflict.js';

// For compatibility and usage outside of module systems, make the Handlebars object a namespace
function create() {
  let hb = new base.HandlebarsEnvironment();

  Utils.extend(hb, base);
  hb.SafeString = SafeString;
  hb.Exception = Exception;
  hb.Utils = Utils;
  hb.escapeExpression = Utils.escapeExpression;

  // Spread into a plain object so that runtime functions (e.g. checkRevision)
  // can be overridden by consumers. ES module namespace objects are sealed with
  // getter-only properties per spec, which would prevent monkey-patching.
  hb.VM = { ...runtime };
  hb.template = function (spec) {
    return runtime.template(spec, hb);
  };

  return hb;
}

let inst = create();
inst.create = create;

noConflict(inst);

inst['default'] = inst;

// Named re-exports for CJS interop.
// See the comment in lib/index.js for the full explanation. In short:
// require('handlebars/runtime').COMPILER_REVISION must be directly accessible
// for tools like handlebars-loader that compare compiler and runtime revisions.
export {
  VERSION,
  COMPILER_REVISION,
  LAST_COMPATIBLE_COMPILER_REVISION,
  REVISION_CHANGES,
} from './handlebars/base.js';

export default inst;
