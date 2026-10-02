import handlebars from './handlebars.js';
import { PrintVisitor, print } from '@handlebars/parser';

handlebars.PrintVisitor = PrintVisitor;
handlebars.print = print;

// Named exports for CJS interop.
//
// When Node.js (v22+) runs require() on an ESM module, it returns the module
// namespace object — only named exports become direct properties. Without these,
// require('handlebars') would return { default: inst } and calls like
// Handlebars.precompile() or Handlebars.COMPILER_REVISION would be undefined.
//
// Tools like handlebars-loader rely on these being directly accessible via
// require('handlebars').create(), require('handlebars').COMPILER_REVISION, etc.
export const {
  create,
  compile,
  precompile,
  parse,
  parseWithoutProcessing,
  COMPILER_REVISION,
  LAST_COMPATIBLE_COMPILER_REVISION,
  REVISION_CHANGES,
  VERSION,
  AST,
  Compiler,
  JavaScriptCompiler,
  Parser,
  Visitor,
  SafeString,
  Exception,
  Utils,
  escapeExpression,
  VM,
  template,
  log,
  registerHelper,
  unregisterHelper,
  registerPartial,
  unregisterPartial,
  registerDecorator,
  unregisterDecorator,
} = handlebars;
export { PrintVisitor, print };
export default handlebars;
