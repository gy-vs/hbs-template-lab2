import { Exception, parse } from '@handlebars/parser';
import AST from './compiler/ast.js';

// The helpers that the compiler treats as known when no `knownHelpers`
// compile option is given (see `Compiler.compile`). A simple mustache such as
// `{{log}}` is therefore compiled as a helper call, not as a context lookup.
const KNOWN_HELPERS = {
  helperMissing: true,
  blockHelperMissing: true,
  each: true,
  if: true,
  unless: true,
  with: true,
  log: true,
  lookup: true,
};

// Block helpers whose effect on the context is defined by Handlebars itself
// and can therefore be tracked statically.
const KNOWN_BLOCK_HELPERS = {
  each: true,
  if: true,
  unless: true,
  with: true,
};

// Binding states for block params (`{{#each items as |item index|}}`):
// NOT_DATA — the value never comes from the template data (e.g. `index`),
// UNKNOWN_DATA — the value is supplied at runtime (e.g. by a custom helper),
// so reads through it cannot be mapped to a concrete data path. Any other
// binding is an array of path segments the param refers to.
const NOT_DATA = {};
const UNKNOWN_DATA = {};

/**
 * Collects the data paths that a template reads.
 *
 * Returns `{ paths, unresolved }`. `paths` lists every read that can be
 * resolved statically, as a dotted path counted from the root context; the
 * per-item context of an `{{#each}}` iteration is written as `*`. Reads that
 * depend on runtime information — the body of a custom block helper, a
 * partial, a dynamic `lookup` or a decorator — are grouped per construct in
 * `unresolved` instead of being guessed onto a path.
 *
 * @param {string | object} input A template string or a parsed Handlebars AST.
 * @returns {{ paths: string[], unresolved: object[] }}
 */
export function collectDataPaths(input) {
  if (
    input == null ||
    (typeof input !== 'string' && input.type !== 'Program')
  ) {
    throw new Exception(
      'You must pass a string or Handlebars AST to Handlebars.collectDataPaths. You passed ' +
        input
    );
  }

  let ast = typeof input === 'string' ? parse(input) : input;

  // Data paths read by the template, as dotted strings.
  let paths = new Set();
  // Reads that cannot be resolved statically, grouped by construct:
  // kind -> name -> entry.
  let unresolvedByKind = new Map();
  // Lexical scope stack, innermost scope last. A scope is
  // {
  //   contextPath: string[] | null — segments of the scope's context counted
  //     from the root; null when the context is only known at runtime
  //   countsForDepth: boolean — whether `../` steps out of this scope
  //   blockParams: object | null — block param bindings of this scope
  //   unknown: object | null — the unresolved entry that collects reads
  //     happening inside this scope
  // }
  let scopes = [];

  scopes.push({
    contextPath: [],
    countsForDepth: true,
    blockParams: null,
    unknown: null,
  });
  visitStatements(ast.body);

  return {
    paths: Array.from(paths).sort(),
    unresolved: sortedUnresolved(),
  };

  function visitStatements(body) {
    for (let i = 0; i < body.length; i++) {
      visitStatement(body[i]);
    }
  }

  function visitStatement(node) {
    switch (node.type) {
      case 'MustacheStatement':
        visitSexpr(node);
        break;
      case 'BlockStatement':
        visitBlock(node);
        break;
      case 'PartialStatement':
      case 'PartialBlockStatement':
        visitPartial(node);
        break;
      case 'DecoratorBlock':
        visitDecoratorBlock(node);
        break;
      case 'Decorator':
        visitDecorator(node);
        break;
      // ContentStatement and CommentStatement read no data.
      default:
        break;
    }
  }

  // Mustaches and subexpressions. Mirrors `Compiler.SubExpression` together
  // with `Compiler.classifySexpr`, so that a name is treated as a helper
  // call exactly when the compiler treats it as one.
  function visitSexpr(node) {
    let path = node.path;

    if (path.type === 'SubExpression') {
      // `{{(foo) bar}}`: the inner call is evaluated and its result is
      // invoked as a helper.
      visitSexpr(path);
      visitExpressions(node.params);
      visitHash(node.hash);
      return;
    }

    if (path.type !== 'PathExpression') {
      // A literal in helper position ({{"foo"}}) is looked up on the
      // context, see `transformLiteralToPath` in the compiler.
      path = literalToPath(path);
    }

    let isSimple = AST.helpers.simpleId(path);
    if (isSimple && lookupBlockParam(path.parts[0]) !== undefined) {
      // Block params are resolved directly; the compiler drops any params
      // and hash of such a mustache.
      collectPath(path);
      return;
    }

    if (
      AST.helpers.helperExpression(node) ||
      (isSimple && KNOWN_HELPERS[path.parts[0]])
    ) {
      // A helper call: the helper name is not read from the data, but
      // params and hash values are.
      if (isSimple && path.parts[0] === 'lookup') {
        collectLookup(node.params[0]);
      }
      visitExpressions(node.params);
      visitHash(node.hash);
      return;
    }

    collectPath(path);
  }

  function visitBlock(block) {
    let path = block.path;
    let isSimple = AST.helpers.simpleId(path);
    let isBlockParam =
      isSimple && lookupBlockParam(path.parts[0]) !== undefined;
    let isHelper = !isBlockParam && AST.helpers.helperExpression(block);
    let isEligible = !isBlockParam && (isHelper || isSimple);
    if (isEligible && !isHelper && KNOWN_HELPERS[path.parts[0]]) {
      isHelper = true;
    }

    if (isHelper && isSimple && KNOWN_BLOCK_HELPERS[path.parts[0]]) {
      visitKnownBlock(block, path.parts[0]);
      return;
    }

    if (isHelper) {
      // A definite helper call: params and hash are read in the current
      // scope, the helper name is not.
      visitExpressions(block.params);
      visitHash(block.hash);
      if (isSimple && (path.parts[0] === 'lookup' || path.parts[0] === 'log')) {
        // `lookup` and `log` never execute the block body.
        if (path.parts[0] === 'lookup') {
          collectLookup(block.params[0]);
        }
        return;
      }
      // A custom block helper decides at runtime which context the body is
      // rendered with.
      visitUnknownBody(block, 'block-helper', path.original);
      return;
    }

    if (!isEligible) {
      // {{#foo.bar}} or a block param: the path itself is read from the
      // data and `blockHelperMissing` picks the inner context at runtime.
      collectPath(path);
    }
    // An ambiguous {{#foo}} may still name a helper, so it is not counted
    // as a data read; either way the inner context is only known at
    // runtime.
    visitUnknownBody(block, 'block-helper', path.original);
  }

  // The body of `each`, `with`, `if` and `unless` is analyzed with the
  // context semantics of the respective helper.
  function visitKnownBlock(block, name) {
    if (name === 'if' || name === 'unless') {
      visitExpressions(block.params);
      visitHash(block.hash);
      // `if` and `unless` keep the current context and — unlike `each` and
      // `with` — do not add a level that `../` steps out of.
      scopes.push({
        contextPath: currentScope().contextPath,
        countsForDepth: false,
        blockParams: bindBlockParams(block.program, NOT_DATA),
        unknown: null,
      });
      visitStatements(block.program.body);
      scopes.pop();
      if (block.inverse) {
        visitStatements(block.inverse.body);
      }
      return;
    }

    // `each` and `with`: the first param is read from the data and
    // determines the inner context.
    let contextPath = null;
    if (block.params.length) {
      let segments = resolveExpression(block.params[0]);
      if (segments) {
        addPath(segments);
        contextPath = name === 'each' ? segments.concat('*') : segments;
      }
    }
    visitExpressions(block.params.slice(1));
    visitHash(block.hash);

    scopes.push({
      contextPath: contextPath,
      countsForDepth: true,
      blockParams: bindEachWithParams(block.program, contextPath),
      unknown:
        contextPath === null ? addUnresolvedEntry('block-helper', name) : null,
    });
    visitStatements(block.program.body);
    scopes.pop();
    // The inverse of `each` and `with` runs in the enclosing context.
    if (block.inverse) {
      visitStatements(block.inverse.body);
    }
  }

  // The body (and inverse) of a construct whose inner context is only known
  // at runtime: reads inside are collected as written under `entry`.
  function visitUnknownBody(block, kind, name) {
    let entry = addUnresolvedEntry(kind, name);
    visitUnknownProgram(block.program, entry);
    visitUnknownProgram(block.inverse, entry);
  }

  function visitUnknownProgram(program, entry) {
    if (!program) {
      return;
    }
    scopes.push({
      contextPath: null,
      countsForDepth: true,
      blockParams: bindBlockParams(program, UNKNOWN_DATA),
      unknown: entry,
    });
    visitStatements(program.body);
    scopes.pop();
  }

  function visitPartial(node) {
    let name = null;
    if (node.name.type === 'PathExpression') {
      name = node.name.original;
    } else {
      // A dynamic partial name: the expression is read from the data.
      visitSexpr(node.name);
    }
    // The explicit context and the hash are read in the current scope.
    visitExpressions(node.params);
    visitHash(node.hash);

    let entry = addUnresolvedEntry('partial', name);
    if (node.type === 'PartialBlockStatement') {
      // The fallback body is rendered with a context chosen by the partial
      // at runtime.
      visitUnknownProgram(node.program, entry);
    }
  }

  function visitDecoratorBlock(node) {
    let path = node.path;
    if (AST.helpers.simpleId(path) && path.parts[0] === 'inline') {
      // An inline partial: the body runs whenever the partial is invoked,
      // with the context of the invocation site.
      let param = node.params[0];
      let name = null;
      if (param && param.type === 'StringLiteral') {
        name = param.value;
      } else if (param) {
        // A non-literal partial name is evaluated from the data.
        visitExpression(param);
      }
      visitExpressions(node.params.slice(1));
      visitHash(node.hash);
      visitUnknownProgram(node.program, addUnresolvedEntry('partial', name));
      return;
    }
    visitExpressions(node.params);
    visitHash(node.hash);
    visitUnknownProgram(
      node.program,
      addUnresolvedEntry('decorator', path.original)
    );
  }

  function visitDecorator(node) {
    visitExpressions(node.params);
    visitHash(node.hash);
    addUnresolvedEntry('decorator', node.path.original);
  }

  // `lookup` reads a property whose name is only known at runtime.
  function collectLookup(param) {
    let name = null;
    if (param && param.type === 'PathExpression') {
      name = param.original;
    }
    addUnresolvedEntry('lookup', name);
  }

  function visitExpressions(exprs) {
    for (let i = 0; i < exprs.length; i++) {
      visitExpression(exprs[i]);
    }
  }

  function visitExpression(expr) {
    if (expr.type === 'PathExpression') {
      collectPath(expr);
    } else if (expr.type === 'SubExpression') {
      visitSexpr(expr);
    }
    // Literals read no data.
  }

  function visitHash(hash) {
    if (hash) {
      for (let i = 0; i < hash.pairs.length; i++) {
        visitExpression(hash.pairs[i].value);
      }
    }
  }

  // Resolves an expression to the path segments it refers to, recording any
  // reads on the way. Returns null when the value cannot be mapped to a
  // data path statically.
  function resolveExpression(expr) {
    if (expr.type === 'PathExpression') {
      return resolvePath(expr);
    }
    visitExpression(expr);
    return null;
  }

  function collectPath(path) {
    let segments = resolvePath(path);
    if (segments) {
      addPath(segments);
    }
  }

  // Resolves a path expression to segments counted from the root, the same
  // way the runtime resolves it against the context stack. Returns null
  // when the path does not read from the template data or cannot be
  // resolved statically — recording the read as unresolved in the latter
  // case.
  function resolvePath(path) {
    if (path.data) {
      // Only `@root` reaches into the template data; `@index`, `@key` and
      // friends are provided by helpers at runtime.
      return path.parts[0] === 'root' ? path.parts.slice(1) : null;
    }

    if (!path.depth && !AST.helpers.scopedId(path) && path.parts.length) {
      let binding = lookupBlockParam(path.parts[0]);
      if (binding !== undefined) {
        if (binding === NOT_DATA) {
          return null;
        }
        if (binding === UNKNOWN_DATA) {
          addUnresolved(path.original);
          return null;
        }
        return binding.concat(path.parts.slice(1));
      }
    }

    let scope = scopeAtDepth(path.depth);
    if (!scope) {
      // `../` beyond the root: the runtime reads `undefined`.
      return null;
    }
    if (scope.contextPath === null) {
      addUnresolved(path.original);
      return null;
    }
    return scope.contextPath.concat(path.parts);
  }

  function scopeAtDepth(depth) {
    for (let i = scopes.length - 1; i >= 0; i--) {
      let scope = scopes[i];
      if (!scope.countsForDepth) {
        continue;
      }
      if (depth === 0) {
        return scope;
      }
      depth--;
    }
    return null;
  }

  function lookupBlockParam(name) {
    for (let i = scopes.length - 1; i >= 0; i--) {
      let bindings = scopes[i].blockParams;
      if (bindings && name in bindings) {
        return bindings[name];
      }
    }
    return undefined;
  }

  function currentScope() {
    return scopes[scopes.length - 1];
  }

  function addPath(segments) {
    paths.add(segments.map(quoteSegment).join('.'));
  }

  // A segment containing a dot is quoted the same way it would be written
  // in a template, to keep the dotted path unambiguous.
  function quoteSegment(segment) {
    return segment.indexOf('.') === -1 ? segment : '[' + segment + ']';
  }

  function addUnresolved(asWritten) {
    // Every scope with an unknown context carries an entry, so
    // currentUnknown never returns null here.
    currentUnknown().pathSet.add(asWritten);
  }

  function currentUnknown() {
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (scopes[i].unknown) {
        return scopes[i].unknown;
      }
    }
    /* v8 ignore next -- unreachable by the invariant above */
    return null;
  }

  function addUnresolvedEntry(kind, name) {
    let byName = unresolvedByKind.get(kind);
    if (!byName) {
      byName = new Map();
      unresolvedByKind.set(kind, byName);
    }
    let entry = byName.get(name);
    if (!entry) {
      entry = { kind: kind, name: name, pathSet: new Set() };
      byName.set(name, entry);
    }
    return entry;
  }

  function sortedUnresolved() {
    let entries = [];
    unresolvedByKind.forEach(function (byName) {
      byName.forEach(function (entry) {
        entries.push(entry);
      });
    });
    entries.sort(compareEntries);
    return entries.map(function (entry) {
      return {
        kind: entry.kind,
        name: entry.name,
        paths: Array.from(entry.pathSet).sort(),
      };
    });
  }

  function compareEntries(a, b) {
    // Entries are unique per kind and name, so the keys are never equal.
    let keyA = a.kind + '\n' + (a.name === null ? '' : a.name);
    let keyB = b.kind + '\n' + (b.name === null ? '' : b.name);
    return keyA < keyB ? -1 : 1;
  }

  function bindEachWithParams(program, contextPath) {
    let bindings = bindBlockParams(program, NOT_DATA);
    if (bindings) {
      bindings[program.blockParams[0]] = contextPath || UNKNOWN_DATA;
    }
    return bindings;
  }

  function bindBlockParams(program, binding) {
    let blockParams = (program && program.blockParams) || [];
    if (!blockParams.length) {
      return null;
    }
    let bindings = Object.create(null);
    for (let i = 0; i < blockParams.length; i++) {
      bindings[blockParams[i]] = binding;
    }
    return bindings;
  }

  // Mirrors `transformLiteralToPath` in the compiler.
  function literalToPath(literal) {
    return {
      type: 'PathExpression',
      data: false,
      depth: 0,
      parts: [literal.original + ''],
      original: literal.original + '',
    };
  }
}
