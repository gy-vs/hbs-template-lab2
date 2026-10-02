import {
  parser as Parser,
  parse,
  parseWithoutProcessing,
  Visitor,
} from '@handlebars/parser';

import runtime from './handlebars.runtime.js';

// Compiler imports
import AST from './handlebars/compiler/ast.js';
import {
  Compiler,
  compile,
  precompile,
} from './handlebars/compiler/compiler.js';
import JavaScriptCompiler from './handlebars/compiler/javascript-compiler.js';

import noConflict from './handlebars/no-conflict.js';

let _create = runtime.create;
function create() {
  let hb = _create();

  hb.compile = function (input, options) {
    return compile(input, options, hb);
  };
  hb.precompile = function (input, options) {
    return precompile(input, options, hb);
  };

  hb.AST = AST;
  hb.Compiler = Compiler;
  hb.JavaScriptCompiler = JavaScriptCompiler;
  hb.Parser = Parser;
  hb.parse = parse;
  hb.parseWithoutProcessing = parseWithoutProcessing;

  return hb;
}

let inst = create();
inst.create = create;

noConflict(inst);

inst.Visitor = Visitor;

inst['default'] = inst;

export default inst;
