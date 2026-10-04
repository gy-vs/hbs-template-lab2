import { Exception, Visitor } from '@handlebars/parser';
import { indexOf } from '../utils.js';

// Static analysis of the data a template reads from its input context.
//
// Resolved names are reported as root-relative, dot separated paths.
// The single element of an `each` iteration is written as `*`, so the
// `name` read inside `{{#each items}}{{name}}{{/each}}` is
// `items.*.name`.
//
// The analysis mirrors the runtime context stack: only the block forms
// that call `options.fn` with a new value (`each`, `with` and plain
// blocks) introduce a lookup depth, while `if` and `unless` do not.
// `../` is indexed against that same stack.
//
// Custom block helpers, partials and `lookup` have runtime-dependent
// context; names read inside them are returned as `ambiguousReads`
// instead of being guessed as root-relative paths.

const EACH = 'each';
const WITH = 'with';
const LOOKUP = 'lookup';
const VALUE_BLOCK_PARAM = 0;
const KEY_BLOCK_PARAM = 1;

// Built-in helpers whose name is never read from the data.
const BUILTIN_HELPERS = {
  each: true,
  with: true,
  if: true,
  unless: true,
  lookup: true,
  log: true,
};

const DYNAMIC_RESULT = Symbol('dynamicResult');

// A frame is one entry of the runtime context stack.
//
//   segments: static path of this frame's context relative to the
//             nearest unknown frame (or from the root when `unknown` is
//             null), e.g. ['items', '*']
//   unknown:  marker describing the frame when its context cannot be
//             known statically, otherwise null
function Frame(segments, unknown) {
  return { segments, unknown: unknown || null };
}

// One block parameter alias, e.g. the `item` of `as |item|`. The
// binding is either a static segments path, the each key/index, or an
// unknown-context marker.
function BlockParam(name, binding) {
  return { name, binding };
}

export function collectDataPaths(input, env) {
  let ast;
  if (typeof input === 'string') {
    ast = env.parse(input);
  } else if (input && input.type === 'Program') {
    ast = input;
  } else {
    throw new Exception(
      'You must pass a string or Handlebars AST to Handlebars.collectDataPaths. You passed ' +
        input
    );
  }

  let analyzer = new DataPathAnalyzer();
  analyzer.accept(ast);

  analyzer.ambiguousReads.forEach((marker) => {
    marker.reads = uniqueSorted(marker.reads);
  });

  return {
    paths: uniqueSorted(analyzer.paths),
    ambiguousReads: analyzer.ambiguousReads,
  };
}

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort();
}

class DataPathAnalyzer extends Visitor {
  constructor() {
    super();
    this.paths = [];
    // One entry per dynamic position. Reads are accumulated on the
    // marker that introduced the position.
    this.ambiguousReads = [];
    this.frames = [Frame([], null)];
    this.paramScopes = [];
  }

  Program(program) {
    this.paramScopes.push([]);
    program.body.forEach((statement) => this.accept(statement));
    this.paramScopes.pop();
  }

  MustacheStatement(mustache) {
    this.visitInvocation(mustache, false);
  }

  SubExpression(sexpr) {
    this.visitInvocation(sexpr, false);
  }

  Decorator(decorator) {
    // A decorator name is looked up among decorators, not the data; only
    // its arguments read from the context. It never changes the context.
    this.visitArguments(decorator);
  }

  BlockStatement(block) {
    this.visitInvocation(block, true);
  }

  DecoratorBlock(decorator) {
    // Decorator arguments are ordinary reads. The block body is not
    // rendered inline (the built-in `inline` decorator turns it into a
    // partial); where it renders depends on the decorator.
    this.visitHead(decorator.path);
    this.visitArguments(decorator);
    let marker = this.marker('partial', {
      partial:
        decorator.path && decorator.path.original
          ? String(decorator.path.original)
          : null,
      dynamic: false,
      context: null,
    });
    let frame = this.pushFrame(Frame([], marker));
    this.visitProgramBody(decorator.program, null);
    this.popFrame(frame);
  }

  PartialStatement(partial) {
    this.visitPartial(partial);
  }

  PartialBlockStatement(partial) {
    let marker = this.visitPartial(partial);
    // The block body is rendered by the partial via @partial-block, so
    // its context is whatever the partial provides.
    let frame = this.pushFrame(Frame([], marker));
    this.visitProgramBody(partial.program, null);
    this.popFrame(frame);
  }

  // ---- expression traversal ----------------------------------------

  // Resolves any value expression: paths are reads, subexpressions are
  // invocations, literals contribute nothing.
  visitValue(node) {
    if (!node) {
      return;
    }
    if (node.type === 'PathExpression') {
      this.resolveDataPath(node);
    } else if (node.type === 'SubExpression') {
      this.visitInvocation(node, false);
    }
    // literals: nothing
  }

  visitHead(node) {
    if (!node) {
      return;
    }
    if (node.type === 'SubExpression') {
      this.visitInvocation(node, false);
    }
    // A path head is resolved explicitly by the caller where needed.
  }

  visitArguments(node, skipFirstParam) {
    let params = node.params || [];
    for (let i = skipFirstParam ? 1 : 0; i < params.length; i++) {
      this.visitValue(params[i]);
    }
    if (node.hash) {
      node.hash.pairs.forEach((pair) => this.visitValue(pair.value));
    }
  }

  // ---- invocations -------------------------------------------------

  visitInvocation(node, isBlock) {
    let head = normalizeHead(node.path);
    let name = simpleHeadName(head);

    if (name === LOOKUP) {
      return this.visitLookupInvocation(node, isBlock);
    }

    if (isBlock && (name === EACH || name === WITH)) {
      return this.visitContextHelperBlock(node, name === EACH);
    }

    if (isBlock && (name === 'if' || name === 'unless' || name === 'log')) {
      // These built-ins neither read their name from the data nor change
      // the body's context. Both branches are analyzed because which one
      // renders is data dependent.
      this.visitHead(head);
      this.visitArguments(node);
      this.visitProgramBody(node.program, null);
      this.visitProgramBody(node.inverse, null);
      return;
    }

    if (!isBlock && BUILTIN_HELPERS[name]) {
      this.visitHead(head);
      this.visitArguments(node);
      return;
    }

    if (isBlock && head.type === 'PathExpression' && isSimpleBlock(node)) {
      // Plain block: `{{#a.b}}...{{/a.b}}` enters/iterates the head
      // value, exactly like `each`.
      let resolved = this.resolveDataPath(head);
      let segments = (resolved ? resolved.split('.') : []).concat('*');
      let frame = this.pushFrame(Frame(segments, this.nearestUnknown()));
      this.visitArguments(node);
      this.visitProgramBody(node.program, {
        kind: EACH,
        contextSegments: segments,
        unknown: frame.unknown,
      });
      this.popFrame(frame);
      this.visitProgramBody(node.inverse, null);
      return;
    }

    // Generic invocation. A path head's non-helper value is computed at
    // runtime before helper disambiguation, so it is a data read unless
    // it is a definite built-in. A subexpression head is its own call.
    if (head.type === 'SubExpression') {
      this.visitInvocation(head, false);
    } else if (head.type === 'PathExpression' && !BUILTIN_HELPERS[name]) {
      this.resolveDataPath(head);
    }
    this.visitArguments(node);

    if (isBlock) {
      this.visitUnknownBlock(node);
    }
  }

  // {{#each X}} and {{#with X}}.
  visitContextHelperBlock(node, isEach) {
    let param = node.params && node.params[0];
    let frame;
    let contextSegments = null;
    let parentUnknown = this.nearestUnknown();

    if (param && param.type === 'PathExpression' && !param.data) {
      let resolved = this.resolveDataPath(param);
      let segments = resolved ? resolved.split('.') : [];
      if (isEach) {
        // Even `{{#each .}}` adds an element layer (`*`); for a bare
        // context reference the collection itself needs no separate read
        // but segments still describe the iterated element.
        segments = segments.concat('*');
      }
      contextSegments = segments;
      // A known static path inside an unknown frame stays ambiguous:
      // chain the parent marker.
      frame = this.pushFrame(Frame(segments, parentUnknown));
    } else {
      // Dynamic collection/context, e.g. `{{#each (helper x)}}`.
      if (param) {
        this.visitValue(param);
      }
      // A `lookup` subexpression carries a marker describing the
      // dynamic property; reuse it instead of adding a second one.
      let marker =
        (param &&
          (param[DYNAMIC_RESULT] ||
            (param.path && param.path[DYNAMIC_RESULT]))) ||
        null;
      if (!marker) {
        marker = this.marker('blockHelper', {
          helper: isEach ? EACH : WITH,
          expression: describeNode(param),
        });
      }
      contextSegments = isEach ? ['*'] : [];
      frame = this.pushFrame(Frame(contextSegments, marker));
    }

    this.visitArguments(node, true);
    this.visitProgramBody(node.program, {
      kind: isEach ? EACH : WITH,
      contextSegments,
      unknown: frame.unknown,
    });
    this.popFrame(frame);

    // The inverse branch (empty case, else chains) runs in the
    // surrounding context.
    this.visitProgramBody(node.inverse, null);
  }

  visitUnknownBlock(node) {
    let marker = this.marker('blockHelper', {
      helper: describeNode(node.path),
    });

    [node.program, node.inverse].forEach((program) => {
      if (!program) {
        return;
      }
      let frame = this.pushFrame(Frame([], marker));
      this.visitProgramBody(program, null);
      this.popFrame(frame);
    });
  }

  visitPartial(partial) {
    let nameNode = partial.name;
    let partialName =
      nameNode.type === 'PathExpression' ? nameNode.original : null;

    if (nameNode.type === 'SubExpression') {
      // Dynamic partial name: the expression is evaluated against data.
      this.visitInvocation(nameNode, false);
    }

    let contextPath = null;
    let params = partial.params || [];
    if (params[0]) {
      if (params[0].type === 'PathExpression' && !params[0].data) {
        contextPath = this.resolveDataPath(params[0]);
      } else {
        this.visitValue(params[0]);
      }
    }
    for (let i = 1; i < params.length; i++) {
      this.visitValue(params[i]);
    }
    if (partial.hash) {
      partial.hash.pairs.forEach((pair) => this.visitValue(pair.value));
    }

    // The partial body is external to this template, so its reads
    // cannot be enumerated. The marker is reported even when no reads
    // are visible here so callers know the context is consumed by an
    // external template.
    return this.marker('partial', {
      partial: partialName,
      dynamic: nameNode.type === 'SubExpression',
      context: contextPath,
    });
  }

  // {{lookup obj key}}: both operands are ordinary reads, but the
  // selected property is only known at runtime.
  visitLookupInvocation(node, isBlock) {
    let objNode = node.params && node.params[0],
      keyNode = node.params && node.params[1];

    let objectPath = null;
    if (objNode) {
      if (objNode.type === 'PathExpression' && !objNode.data) {
        objectPath = this.resolveDataPath(objNode);
      } else {
        this.visitValue(objNode);
      }
    }
    let keyPath = null;
    let literalKey = null;
    if (keyNode) {
      if (keyNode.type === 'PathExpression' && !keyNode.data) {
        keyPath = this.resolveDataPath(keyNode);
      } else if (keyNode.type === 'StringLiteral') {
        literalKey = keyNode.value;
      } else {
        this.visitValue(keyNode);
      }
    }
    this.visitArguments(node, true);

    let marker = this.marker('lookup', {
      object: objectPath,
      key: keyPath,
      literalKey,
    });
    node[DYNAMIC_RESULT] = marker;

    if (isBlock) {
      // A block `lookup` behaves like an unknown block helper.
      let frame = this.pushFrame(Frame([], marker));
      this.visitProgramBody(node.program, null);
      this.popFrame(frame);
      this.visitProgramBody(node.inverse, null);
    }
  }

  // ---- programs & block params -------------------------------------

  visitProgramBody(program, blockInfo) {
    if (!program) {
      return;
    }
    let params = [];
    if (blockInfo) {
      let names = program.blockParams || [];
      if (names[VALUE_BLOCK_PARAM] != null) {
        params.push(
          BlockParam(names[VALUE_BLOCK_PARAM], this.valueBinding(blockInfo))
        );
      }
      if (blockInfo.kind === EACH && names[KEY_BLOCK_PARAM] != null) {
        // Iteration index/key is provided by the helper, not the data.
        params.push(BlockParam(names[KEY_BLOCK_PARAM], { kind: 'key' }));
      }
    }
    this.paramScopes.push(params);
    program.body.forEach((statement) => this.accept(statement));
    this.paramScopes.pop();
  }

  valueBinding(blockInfo) {
    let segments = blockInfo.contextSegments;
    if (segments == null) {
      return {
        kind: 'unknown',
        marker: this.nearestUnknown(),
        segments: [],
      };
    }
    if (blockInfo.unknown) {
      return { kind: 'unknown', marker: blockInfo.unknown, segments };
    }
    return { kind: 'path', segments };
  }

  // ---- path resolution ---------------------------------------------

  // Resolves a data (non-@) PathExpression against the current frame
  // stack, records the read and returns the dotted root-relative path
  // (or null when it lands on an unknown frame / escapes the stack).
  resolveDataPath(path) {
    if (path.data || path.type !== 'PathExpression') {
      return null;
    }

    let parts = path.parts.map(String);

    // Block parameters shadow context names at depth 0.
    if (!path.depth) {
      let blockParam = this.findBlockParam(parts[0]);
      if (blockParam) {
        return this.resolveBlockParamPath(blockParam, parts);
      }
    }

    let frameIndex = this.frames.length - 1 - path.depth;
    if (frameIndex < 0) {
      // Escapes the root stack, e.g. `../../x` inside a single each.
      return null;
    }

    let frame = this.frames[frameIndex];

    if (!parts.length) {
      return this.reportFrameContext(frame);
    }

    if (frame.unknown) {
      // Report relative to the frame the marker introduced, so e.g. an
      // `each` over a dynamic value shows the read of its element
      // property as `*.name`.
      this.reportAmbiguousRead(frame.unknown, frame.segments.concat(parts));
      return null;
    }

    let dotted = joinSegments(frame.segments.concat(parts));
    this.paths.push(dotted);
    return dotted;
  }

  reportFrameContext(frame) {
    if (frame.unknown) {
      // `{{this}}` in an unknown context: the context object itself is
      // consumed (the element of a dynamic each, etc.).
      this.reportAmbiguousRead(frame.unknown, frame.segments);
      return null;
    }
    let dotted = joinSegments(frame.segments);
    if (dotted) {
      this.paths.push(dotted);
    }
    return dotted;
  }

  resolveBlockParamPath(blockParam, parts) {
    let binding = blockParam.binding;
    let tail = parts.slice(1);

    if (binding.kind === 'path') {
      let dotted = joinSegments(binding.segments.concat(tail));
      if (dotted) {
        this.paths.push(dotted);
      }
      return dotted;
    }
    if (binding.kind === 'key') {
      return null;
    }
    // Block param of an unknown block. The name of the alias itself is
    // not a data field, so the read is reported relative to the marker
    // via the bound segments (e.g. `*.label` for an each item alias).
    let relativeParts = binding.segments.concat(tail);
    let relative = joinSegments(relativeParts);
    if (relative) {
      this.reportAmbiguousRead(
        binding.marker || this.nearestUnknown(),
        relativeParts
      );
    }
    return null;
  }

  reportAmbiguousRead(marker, relativeParts) {
    if (!marker) {
      marker = this.marker('blockHelper', { helper: null });
    }
    let relative = joinSegments(relativeParts);
    // A bare context reference adds no field name; nothing for the
    // caller to verify beyond the marker itself.
    if (!relative) {
      return;
    }
    if (marker.reads.indexOf(relative) === -1) {
      marker.reads.push(relative);
    }
  }

  findBlockParam(name) {
    if (!name) {
      return null;
    }
    for (let i = this.paramScopes.length - 1; i >= 0; i--) {
      let params = this.paramScopes[i],
        idx = indexOf(
          params.map((p) => p.name),
          name
        );
      if (idx >= 0) {
        return params[idx];
      }
    }
    return null;
  }

  // ---- frames & markers --------------------------------------------

  pushFrame(frame) {
    this.frames.push(frame);
    return frame;
  }

  popFrame(frame) {
    if (frame && this.frames[this.frames.length - 1] === frame) {
      this.frames.pop();
    }
  }

  nearestUnknown() {
    for (let i = this.frames.length - 1; i >= 0; i--) {
      if (this.frames[i].unknown) {
        return this.frames[i].unknown;
      }
    }
    return null;
  }

  marker(kind, details) {
    let marker = Object.assign(
      {
        kind,
        loc: this.current && this.current.loc,
        reads: [],
      },
      details
    );
    this.ambiguousReads.push(marker);
    return marker;
  }
}

// Mirrors compile-time handling (see transformLiteralToPath in the
// compiler): number/boolean/null heads of mustaches are looked up on
// the data, while string heads are literal strings and subexpression
// heads stay expressions.
function normalizeHead(path) {
  if (!path || path.type === 'PathExpression') {
    return path;
  }
  switch (path.type) {
    case 'StringLiteral':
      return path;
    case 'NumberLiteral':
    case 'BooleanLiteral':
    case 'NullLiteral':
    case 'UndefinedLiteral':
      return {
        type: 'PathExpression',
        data: false,
        depth: 0,
        parts: [String(path.original)],
        original: String(path.original),
        loc: path.loc,
      };
    default:
      return path;
  }
}

function isSimpleBlock(node) {
  return (!node.params || !node.params.length) && !node.hash;
}

function simpleHeadName(path) {
  if (path && path.type === 'PathExpression' && !path.depth) {
    return path.parts[0] != null ? String(path.parts[0]) : null;
  }
  return null;
}

function joinSegments(segments) {
  return segments.filter((s) => s !== '').join('.');
}

function describeNode(node) {
  if (!node) {
    return null;
  }
  if (node.type === 'SubExpression') {
    return '(' + node.path.original + ')';
  }
  return node.original != null ? String(node.original) : null;
}

export default collectDataPaths;
