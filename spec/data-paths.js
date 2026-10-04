describe('collectDataPaths', function () {
  var collect = function (template) {
    return Handlebars.collectDataPaths(template);
  };
  var paths = function (template) {
    return collect(template).paths;
  };

  describe('basic reads', function () {
    it('lists a single root variable', function () {
      expect(paths('{{foo}}')).toEqual(['foo']);
    });

    it('lists nested dotted paths', function () {
      expect(paths('{{a.b.c}}')).toEqual(['a.b.c']);
    });

    it('lists bracketed literal path segments', function () {
      expect(paths('{{a.[foo bar]}}')).toEqual(['a.foo bar']);
    });

    it('includes scoped this paths', function () {
      expect(paths('{{this.foo}}')).toEqual(['foo']);
      expect(paths('{{./foo}}')).toEqual(['foo']);
    });

    it('does not include a bare context reference', function () {
      expect(paths('{{.}}')).toEqual([]);
      expect(paths('{{this}}')).toEqual([]);
    });

    it('collects mustache, raw mustache and escaped values', function () {
      expect(paths('{{foo}} {{{bar}}}')).toEqual(['bar', 'foo']);
    });

    it('treats number and boolean heads as data reads', function () {
      expect(paths('{{true}} {{123}}')).toEqual(['123', 'true']);
    });

    it('does not treat string literal heads as data reads', function () {
      expect(paths('{{"str"}}')).toEqual([]);
    });
  });

  describe('each blocks', function () {
    it('marks the iteration element with a star', function () {
      expect(paths('{{#each items}}{{name}}{{/each}}')).toEqual([
        'items',
        'items.*.name',
      ]);
    });

    it('resolves parent references', function () {
      expect(paths('{{#each items}}{{name}}{{../title}}{{/each}}')).toEqual([
        'items',
        'items.*.name',
        'title',
      ]);
    });

    it('walks into nested iterated properties', function () {
      expect(paths('{{#each items}}{{nested.deep.path}}{{/each}}')).toEqual([
        'items',
        'items.*.nested.deep.path',
      ]);
    });

    it('uses a star for object iteration too', function () {
      expect(paths('{{#each map}}{{@key}}:{{name}} {{/each}}')).toEqual([
        'map',
        'map.*.name',
      ]);
    });

    it('prefixes nested each blocks', function () {
      expect(paths('{{#each a}}{{#each b}}{{c}}{{/each}}{{/each}}')).toEqual([
        'a',
        'a.*.b',
        'a.*.b.*.c',
      ]);
    });

    it('resolves multi-level parent references', function () {
      expect(
        paths('{{#each a}}{{#each b}}{{c}}{{../../root}}{{/each}}{{/each}}')
      ).toEqual(['a', 'a.*.b', 'a.*.b.*.c', 'root']);
    });

    it('binds the value block parameter', function () {
      expect(paths('{{#each items as |item|}}{{item.name}}{{/each}}')).toEqual([
        'items',
        'items.*.name',
      ]);
    });

    it('ignores the each key/index block parameter', function () {
      expect(
        paths('{{#each items as |item i|}}{{i}}-{{item.name}}{{/each}}')
      ).toEqual(['items', 'items.*.name']);
    });

    it('analyzes the inverse branch in the parent context', function () {
      expect(
        paths('{{#each items}}{{name}}{{else}}{{empty}}{{/each}}')
      ).toEqual(['empty', 'items', 'items.*.name']);
    });
  });

  describe('with blocks', function () {
    it('shifts the context to the argument path', function () {
      expect(paths('{{#with a}}{{b}}{{/with}}')).toEqual(['a', 'a.b']);
    });

    it('binds the block parameter', function () {
      expect(paths('{{#with a as |v|}}{{v.b}}{{/with}}')).toEqual(['a', 'a.b']);
    });

    it('resolves parent references', function () {
      expect(paths('{{#with a}}{{b}}{{../x}}{{/with}}')).toEqual([
        'a',
        'a.b',
        'x',
      ]);
    });

    it('composes with nested each blocks', function () {
      expect(
        paths('{{#with a}}{{#each list}}{{name}}{{../title}}{{/each}}{{/with}}')
      ).toEqual(['a', 'a.list', 'a.list.*.name', 'a.title']);
    });
  });

  describe('plain blocks', function () {
    it('treats a path block like an each over the value', function () {
      expect(paths('{{#a.b}}{{name}}{{/a.b}}')).toEqual(['a.b', 'a.b.*.name']);
    });
  });

  describe('if and unless blocks', function () {
    it('does not introduce a new scope', function () {
      expect(paths('{{#if a}}{{x}}{{/if}}')).toEqual(['a', 'x']);
    });

    it('keeps parent depth stable across nested if blocks', function () {
      expect(
        paths('{{#with a}}{{#if b}}{{c}}{{../d}}{{/if}}{{/with}}')
      ).toEqual(['a', 'a.b', 'a.c', 'd']);
    });

    it('analyzes both the program and inverse branches', function () {
      expect(paths('{{#if a}}{{x}}{{else}}{{y}}{{/if}}')).toEqual([
        'a',
        'x',
        'y',
      ]);
    });

    it('handles unless', function () {
      expect(paths('{{#unless x}}{{a}}{{/unless}}')).toEqual(['a', 'x']);
    });

    it('follows else-if chains', function () {
      expect(
        paths('{{#with a}}{{#if b}}{{x}}{{else if c}}{{y}}{{/if}}{{/with}}')
      ).toEqual(['a', 'a.b', 'a.c', 'a.x', 'a.y']);
    });

    it('reads condition subexpression operands', function () {
      expect(paths('{{#if (gt a b)}}{{c}}{{/if}}')).toEqual([
        'a',
        'b',
        'c',
        'gt',
      ]);
    });
  });

  describe('helpers', function () {
    it('reads helper parameters', function () {
      expect(paths('{{foo bar baz}}')).toEqual(['bar', 'baz', 'foo']);
    });

    it('reads hash values', function () {
      expect(paths('{{foo x bar=baz}}')).toEqual(['baz', 'foo', 'x']);
    });

    it('does not read built-in helper names', function () {
      expect(paths('{{log foo level=x}}')).toEqual(['foo', 'x']);
      expect(paths('{{#if x}}{{/if}}')).toEqual(['x']);
    });

    it('reads parameters of subexpressions', function () {
      expect(paths('{{foo (bar a) b}}')).toEqual(['a', 'b', 'bar', 'foo']);
    });

    it('reads nested subexpression arguments', function () {
      expect(paths('{{#if (and (or a b) c)}}{{d}}{{/if}}')).toEqual([
        'a',
        'and',
        'b',
        'c',
        'd',
        'or',
      ]);
    });
  });

  describe('data variables', function () {
    it('ignores @index and @key', function () {
      expect(paths('{{#each items}}{{@index}}{{name}}{{/each}}')).toEqual([
        'items',
        'items.*.name',
      ]);
    });

    it('ignores @root references', function () {
      expect(paths('{{@root.x}}')).toEqual([]);
      expect(paths('{{#with a}}{{@root.r}} {{b}}{{/with}}')).toEqual([
        'a',
        'a.b',
      ]);
    });

    it('ignores @first and @last', function () {
      expect(
        paths('{{#each items}}{{#if @first}}{{name}}{{/if}}{{/each}}')
      ).toEqual(['items', 'items.*.name']);
    });
  });

  describe('deduplication and ordering', function () {
    it('reports each path only once', function () {
      expect(paths('{{foo}} {{foo}} {{bar}}')).toEqual(['bar', 'foo']);
    });

    it('sorts results lexicographically', function () {
      expect(paths('{{z}} {{a}} {{m}}')).toEqual(['a', 'm', 'z']);
    });
  });

  describe('depth that escapes the stack', function () {
    it('ignores references above the root context', function () {
      expect(paths('{{#each items}}{{../../escaped}}{{/each}}')).toEqual([
        'items',
      ]);
    });
  });

  describe('ambiguous reads', function () {
    it('reports reads inside a custom block helper', function () {
      var result = collect('{{#board items}}{{title}}{{/board}}');
      expect(result.paths).toEqual(['board', 'items']);
      expect(result.ambiguousReads.length).toBe(1);
      expect(result.ambiguousReads[0].kind).toBe('blockHelper');
      expect(result.ambiguousReads[0].helper).toBe('board');
      expect(result.ambiguousReads[0].reads).toEqual(['title']);
    });

    it('keeps determinable parent reads out of the ambiguous list', function () {
      var result = collect('{{#board a}}{{x}} {{../y}}{{/board}}');
      expect(result.paths).toEqual(['a', 'board', 'y']);
      expect(result.ambiguousReads[0].reads).toEqual(['x']);
    });

    it('reports a plain partial invocation', function () {
      var result = collect('{{>person user}}');
      expect(result.paths).toEqual(['user']);
      expect(result.ambiguousReads.length).toBe(1);
      expect(result.ambiguousReads[0].kind).toBe('partial');
      expect(result.ambiguousReads[0].partial).toBe('person');
      expect(result.ambiguousReads[0].context).toBe('user');
    });

    it('reads partial hash values', function () {
      var result = collect('{{>person user role=role}}');
      expect(result.paths).toEqual(['role', 'user']);
    });

    it('reports reads inside a partial block', function () {
      var result = collect('{{#>layout main}}{{headline}}{{/layout}}');
      expect(result.paths).toEqual(['main']);
      expect(result.ambiguousReads.length).toBe(1);
      expect(result.ambiguousReads[0].kind).toBe('partial');
      expect(result.ambiguousReads[0].partial).toBe('layout');
      expect(result.ambiguousReads[0].reads).toEqual(['headline']);
    });

    it('reports a dynamic partial name read', function () {
      var result = collect('{{> (which) }}');
      expect(result.paths).toEqual(['which']);
      expect(result.ambiguousReads[0].dynamic).toBe(true);
    });

    it('reports lookup operands as reads and flags the dynamic property', function () {
      var result = collect('{{lookup map key}}');
      expect(result.paths).toEqual(['key', 'map']);
      expect(result.ambiguousReads.length).toBe(1);
      expect(result.ambiguousReads[0].kind).toBe('lookup');
      expect(result.ambiguousReads[0].object).toBe('map');
      expect(result.ambiguousReads[0].key).toBe('key');
    });

    it('records a literal lookup key', function () {
      var result = collect('{{lookup map "fixed"}}');
      expect(result.ambiguousReads[0].literalKey).toBe('fixed');
      expect(result.ambiguousReads[0].key).toBe(null);
    });

    it('reports reads inside an each over a dynamic collection', function () {
      var result = collect('{{#each (pick items cat)}}{{label}}{{/each}}');
      expect(result.paths).toEqual(['cat', 'items', 'pick']);
      var block = result.ambiguousReads.find(function (m) {
        return m.kind === 'blockHelper';
      });
      expect(block.reads).toEqual(['*.label']);
    });

    it('reports reads inside an each over a lookup result', function () {
      var result = collect('{{#each (lookup items kind)}}{{name}}{{/each}}');
      expect(result.paths).toEqual(['items', 'kind']);
      expect(result.ambiguousReads.length).toBe(1);
      var marker = result.ambiguousReads[0];
      expect(marker.kind).toBe('lookup');
      expect(marker.reads).toEqual(['*.name']);
    });

    it('reports reads under a custom block with a star relative path', function () {
      var result = collect(
        '{{#board items}}{{#each .}}{{label}}{{/each}}{{/board}}'
      );
      var block = result.ambiguousReads[0];
      expect(block.reads).toEqual(['*.label']);
    });

    it('resolves dynamic-each block params relative to the marker', function () {
      var result = collect(
        '{{#each (pick items cat) as |item i|}}{{i}}:{{item.label}}{{/each}}'
      );
      expect(result.paths).toEqual(['cat', 'items', 'pick']);
      expect(result.ambiguousReads[0].reads).toEqual(['*.label']);
    });

    it('keeps parent-escaping reads out of the custom block list', function () {
      var result = collect(
        '{{#box a}}{{#with b}}{{c}}{{../../r}}{{/with}}{{/box}}'
      );
      expect(result.paths).toEqual(['a', 'box', 'r']);
      expect(result.ambiguousReads[0].reads).toEqual(['b', 'c']);
    });

    it('treats a plain nested block element read as relative to the helper', function () {
      var result = collect('{{#box a}}{{#list}}{{name}}{{/list}}{{/box}}');
      expect(result.paths).toEqual(['a', 'box']);
      expect(result.ambiguousReads[0].reads).toEqual(['*.name', 'list']);
    });

    it('treats an each/with driven by an @data variable as dynamic', function () {
      var result = collect('{{#each @root.items}}{{x}}{{/each}}');
      expect(result.paths).toEqual([]);
      expect(result.ambiguousReads[0].reads).toEqual(['*.x']);
    });

    it('includes source locations', function () {
      var result = collect('{{#board items}}{{title}}{{/board}}');
      expect(result.ambiguousReads[0].loc.start.line).toBe(1);
      expect(result.ambiguousReads[0].loc.start.column).toBe(0);
    });
  });

  describe('decorators', function () {
    it('reads decorator arguments but not the decorator name', function () {
      expect(paths('{{* d foo bar=baz}}')).toEqual(['baz', 'foo']);
    });

    it('treats an inline decorator block body as an ambiguous partial', function () {
      var result = collect('{{#* inline "p"}}{{x}}{{/inline}}');
      expect(result.paths).toEqual([]);
      expect(result.ambiguousReads.length).toBe(1);
      expect(result.ambiguousReads[0].kind).toBe('partial');
      expect(result.ambiguousReads[0].reads).toEqual(['x']);
    });
  });

  describe('input handling', function () {
    it('accepts a parsed AST', function () {
      var ast = Handlebars.parse('{{foo}}');
      expect(Handlebars.collectDataPaths(ast).paths).toEqual(['foo']);
    });

    it('throws on invalid input', function () {
      expect(function () {
        Handlebars.collectDataPaths(42);
      }).toThrowError(/string or Handlebars AST/);
    });
  });
});
