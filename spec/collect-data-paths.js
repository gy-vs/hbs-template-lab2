describe('collectDataPaths', function () {
  function collect(template) {
    return Handlebars.collectDataPaths(template);
  }

  function paths(template) {
    return collect(template).paths;
  }

  it('returns empty results for templates without data reads', function () {
    expect(collect('')).toEqual({ paths: [], unresolved: [] });
    expect(collect('plain text')).toEqual({ paths: [], unresolved: [] });
    expect(collect('{{! a comment}}')).toEqual({ paths: [], unresolved: [] });
    expect(collect('{{"literal"}}')).toEqual({
      paths: ['literal'],
      unresolved: [],
    });
  });

  it('collects simple mustache paths', function () {
    expect(paths('{{name}}')).toEqual(['name']);
    expect(paths('{{user.email}}')).toEqual(['user.email']);
    expect(paths('{{a}} {{b}} {{a}}')).toEqual(['a', 'b']);
  });

  it('sorts paths lexicographically and de-duplicates them', function () {
    expect(paths('{{b}} {{a}} {{b.x}} {{a}} {{ab}}')).toEqual([
      'a',
      'ab',
      'b',
      'b.x',
    ]);
  });

  it('resolves this and . against the current context', function () {
    expect(paths('{{this.name}}')).toEqual(['name']);
    expect(paths('{{#with user}}{{this.name}} {{.}}{{/with}}')).toEqual([
      'user',
      'user.name',
    ]);
    expect(paths('{{this}}')).toEqual(['']);
  });

  it('resolves {{#each}} item contexts with a * segment', function () {
    expect(paths('{{#each items}}{{name}}{{/each}}')).toEqual([
      'items',
      'items.*.name',
    ]);
    expect(paths('{{#each items}}{{this}}{{/each}}')).toEqual([
      'items',
      'items.*',
    ]);
  });

  it('resolves ../ against the enclosing context', function () {
    expect(paths('{{#each items}}{{name}} {{../title}}{{/each}}')).toEqual([
      'items',
      'items.*.name',
      'title',
    ]);
    expect(
      paths('{{#each a}}{{#each b}}{{../../x}}{{/each}}{{/each}}')
    ).toEqual(['a', 'a.*.b', 'x']);
  });

  it('does not add a context level for {{#if}} and {{#unless}}', function () {
    expect(paths('{{#with a}}{{#if b}}{{../x}}{{/if}}{{/with}}')).toEqual([
      'a',
      'a.b',
      'x',
    ]);
    expect(
      paths('{{#each items}}{{#unless c}}{{../t}}{{/unless}}{{/each}}')
    ).toEqual(['items', 'items.*.c', 't']);
    expect(paths('{{#if c}}{{yes}}{{else}}{{no}}{{/if}}')).toEqual([
      'c',
      'no',
      'yes',
    ]);
  });

  it('resolves {{#with}} contexts', function () {
    expect(paths('{{#with a.b}}{{c}}{{/with}}')).toEqual(['a.b', 'a.b.c']);
    expect(paths('{{#with a}}{{else}}{{b}}{{/with}}')).toEqual(['a', 'b']);
  });

  it('runs the inverse of {{#each}} in the enclosing context', function () {
    expect(paths('{{#each items}}{{else}}{{empty}}{{/each}}')).toEqual([
      'empty',
      'items',
    ]);
  });

  it('resolves block params of {{#each}} and {{#with}}', function () {
    expect(
      paths('{{#each items as |item index|}}{{item.name}} {{index}}{{/each}}')
    ).toEqual(['items', 'items.*.name']);
    expect(paths('{{#with a.b as |c|}}{{c.d}}{{/with}}')).toEqual([
      'a.b',
      'a.b.d',
    ]);
  });

  it('resolves block params across nested scopes', function () {
    expect(
      paths(
        '{{#each items as |it|}}{{#each it.children as |child|}}' +
          '{{child.name}} {{it.title}}{{/each}}{{/each}}'
      )
    ).toEqual([
      'items',
      'items.*.children',
      'items.*.children.*.name',
      'items.*.title',
    ]);
  });

  it('lets block params shadow data fields', function () {
    expect(paths('{{#each items as |name|}}{{name}}{{/each}}')).toEqual([
      'items',
      'items.*',
    ]);
  });

  it('does not count block params of {{#if}} as data reads', function () {
    // `if` passes no block params at runtime, so `v` is undefined there.
    expect(paths('{{#if c as |v|}}{{v}}{{/if}}')).toEqual(['c']);
  });

  it('ignores the params of a mustache that names a block param', function () {
    // The compiler drops the params of `{{it x}}` when `it` is a block
    // param, so `x` is never evaluated at render time.
    expect(paths('{{#each items as |it|}}{{it x}}{{/each}}')).toEqual([
      'items',
      'items.*',
    ]);
  });

  it('resolves @root against the root context and ignores other @vars', function () {
    expect(paths('{{#each items}}{{@root.title}} {{@index}}{{/each}}')).toEqual(
      ['items', 'title']
    );
    expect(paths('{{@root.a.b}} {{@key}} {{@first}} {{@custom}}')).toEqual([
      'a.b',
    ]);
  });

  it('counts params and hash values of helpers as reads', function () {
    expect(paths('{{format user.name when=now}}')).toEqual([
      'now',
      'user.name',
    ]);
    expect(paths('{{helper (sub x.y) z}}')).toEqual(['x.y', 'z']);
    expect(paths('{{#if cond includeZero=zero}}a{{/if}}')).toEqual([
      'cond',
      'zero',
    ]);
    expect(paths('{{log message}}')).toEqual(['message']);
  });

  it('does not count helper names as reads', function () {
    expect(paths('{{format user.name}}')).toEqual(['user.name']);
    // a dotted path with params is a helper call, not a context lookup
    expect(paths('{{foo.bar baz}}')).toEqual(['baz']);
  });

  it('treats literal mustache paths like the compiler does', function () {
    // {{"foo"}} is looked up on the context at render time.
    expect(paths('{{"foo"}}')).toEqual(['foo']);
    // literal params read nothing
    expect(paths('{{helper "lit" 42 true}}')).toEqual([]);
  });

  it('handles built-in block helpers without a context param', function () {
    // {{#each}} / {{#with}} without a param throw at render time; the
    // inner context cannot be determined either way.
    var result = collect('{{#each}}{{x}}{{/each}}');
    expect(result.paths).toEqual([]);
    expect(result.unresolved).toEqual([
      { kind: 'block-helper', name: 'each', paths: ['x'] },
    ]);

    result = collect('{{#with}}{{y}}{{/with}}');
    expect(result.paths).toEqual([]);
    expect(result.unresolved).toEqual([
      { kind: 'block-helper', name: 'with', paths: ['y'] },
    ]);
  });

  it('ignores the body of {{#log}} and {{#lookup}} blocks', function () {
    // `log` and `lookup` never execute the block body at render time.
    expect(collect('{{#log}}never {{a}}{{/log}}')).toEqual({
      paths: [],
      unresolved: [],
    });
    expect(collect('{{#log m}}never {{a}}{{/log}}')).toEqual({
      paths: ['m'],
      unresolved: [],
    });
    expect(collect('{{#lookup a b}}never {{c}}{{/lookup}}')).toEqual({
      paths: ['a', 'b'],
      unresolved: [{ kind: 'lookup', name: 'a', paths: [] }],
    });
  });

  it('marks lookup without an object expression', function () {
    var result = collect('{{lookup}}');
    expect(result.paths).toEqual([]);
    expect(result.unresolved).toEqual([
      { kind: 'lookup', name: null, paths: [] },
    ]);
  });

  it('quotes segments that contain a dot', function () {
    expect(paths('{{a.[b.c]}}')).toEqual(['a.[b.c]']);
  });

  it('collects reads inside {{#each}} over a computed value as unresolved', function () {
    var result = collect('{{#each (filter items)}}{{name}}{{/each}}');
    expect(result.paths).toEqual(['items']);
    expect(result.unresolved).toEqual([
      { kind: 'block-helper', name: 'each', paths: ['name'] },
    ]);
  });

  it('collects block params of a computed {{#each}} as written', function () {
    var result = collect(
      '{{#each (filter items) as |it|}}{{it.name}}{{/each}}'
    );
    expect(result.paths).toEqual(['items']);
    expect(result.unresolved).toEqual([
      { kind: 'block-helper', name: 'each', paths: ['it.name'] },
    ]);
  });

  it('handles a subexpression in path position', function () {
    // `{{(foo) bar}}` invokes the result of `(foo)` as a helper.
    expect(paths('{{(foo) bar}}')).toEqual(['bar']);
  });

  it('collects block params of a computed {{#each}} as written', function () {
    var result = collect(
      '{{#each (filter items) as |it|}}{{it.name}}{{/each}}'
    );
    expect(result.paths).toEqual(['items']);
    expect(result.unresolved).toEqual([
      { kind: 'block-helper', name: 'each', paths: ['it.name'] },
    ]);
  });

  it('collects reads inside {{#with}} over a computed value as unresolved', function () {
    var result = collect('{{#with (compute)}}{{name}}{{/with}}');
    expect(result.paths).toEqual([]);
    expect(result.unresolved).toEqual([
      { kind: 'block-helper', name: 'with', paths: ['name'] },
    ]);
  });

  it('handles a subexpression in mustache position', function () {
    // `{{(foo) bar}}` invokes the result of `(foo)` as a helper.
    expect(paths('{{(foo) bar}}')).toEqual(['bar']);
  });

  it('collects reads inside custom block helpers as unresolved', function () {
    var result = collect(
      '{{#wrap a}}{{#if b}}{{c}}{{/if}}{{else}}{{d}}{{/wrap}}'
    );
    expect(result.paths).toEqual(['a']);
    expect(result.unresolved).toEqual([
      { kind: 'block-helper', name: 'wrap', paths: ['b', 'c', 'd'] },
    ]);
  });

  it('collects reads inside ambiguous blocks as unresolved', function () {
    var result = collect('{{#foo}}{{bar}}{{/foo}}');
    expect(result.paths).toEqual([]);
    expect(result.unresolved).toEqual([
      { kind: 'block-helper', name: 'foo', paths: ['bar'] },
    ]);
  });

  it('reads the path of a dotted block but keeps its body unresolved', function () {
    var result = collect('{{#foo.bar}}{{baz}}{{/foo.bar}}');
    expect(result.paths).toEqual(['foo.bar']);
    expect(result.unresolved).toEqual([
      { kind: 'block-helper', name: 'foo.bar', paths: ['baz'] },
    ]);
  });

  it('resolves @root reads even inside unknown contexts', function () {
    var result = collect('{{#wrap}}{{@root.x}} {{y}}{{/wrap}}');
    expect(result.paths).toEqual(['x']);
    expect(result.unresolved).toEqual([
      { kind: 'block-helper', name: 'wrap', paths: ['y'] },
    ]);
  });

  it('resolves known contexts nested inside unknown ones', function () {
    var result = collect(
      '{{#wrap}}{{#with @root.user}}{{name}}{{/with}}{{/wrap}}'
    );
    expect(result.paths).toEqual(['user', 'user.name']);
    expect(result.unresolved).toEqual([
      { kind: 'block-helper', name: 'wrap', paths: [] },
    ]);
  });

  it('assigns nested unknown reads to the innermost construct', function () {
    var result = collect('{{#a}}{{#b x}}{{c}}{{/b}}{{/a}}');
    expect(result.paths).toEqual([]);
    expect(result.unresolved).toEqual([
      { kind: 'block-helper', name: 'a', paths: ['x'] },
      { kind: 'block-helper', name: 'b', paths: ['c'] },
    ]);
  });

  it('collects reads of block params provided by custom helpers', function () {
    var result = collect('{{#each2 items as |it|}}{{it.name}}{{/each2}}');
    expect(result.paths).toEqual(['items']);
    expect(result.unresolved).toEqual([
      { kind: 'block-helper', name: 'each2', paths: ['it.name'] },
    ]);
  });

  it('marks partials as unresolved', function () {
    var result = collect('{{> myPartial user.profile}}');
    expect(result.paths).toEqual(['user.profile']);
    expect(result.unresolved).toEqual([
      { kind: 'partial', name: 'myPartial', paths: [] },
    ]);
  });

  it('marks dynamic partial names with a null name', function () {
    var result = collect('{{> (whichPartial)}}');
    expect(result.paths).toEqual([]);
    expect(result.unresolved).toEqual([
      { kind: 'partial', name: null, paths: [] },
    ]);
  });

  it('collects reads inside partial blocks as unresolved', function () {
    var result = collect('{{#> layout}}{{title}}{{/layout}}');
    expect(result.paths).toEqual([]);
    expect(result.unresolved).toEqual([
      { kind: 'partial', name: 'layout', paths: ['title'] },
    ]);
  });

  it('collects reads inside inline partials as unresolved', function () {
    var result = collect(
      '{{#*inline "person"}}{{name}}{{/inline}}{{> person}}'
    );
    expect(result.paths).toEqual([]);
    expect(result.unresolved).toEqual([
      { kind: 'partial', name: 'person', paths: ['name'] },
    ]);
  });

  it('evaluates a non-literal inline partial name from the data', function () {
    var result = collect('{{#*inline nameVar}}{{name}}{{/inline}}');
    expect(result.paths).toEqual(['nameVar']);
    expect(result.unresolved).toEqual([
      { kind: 'partial', name: null, paths: ['name'] },
    ]);

    result = collect('{{#*inline}}{{name}}{{/inline}}');
    expect(result.paths).toEqual([]);
    expect(result.unresolved).toEqual([
      { kind: 'partial', name: null, paths: ['name'] },
    ]);
  });

  it('evaluates a non-literal inline partial name from the data', function () {
    var result = collect('{{#*inline partialName}}{{name}}{{/inline}}');
    expect(result.paths).toEqual(['partialName']);
    expect(result.unresolved).toEqual([
      { kind: 'partial', name: null, paths: ['name'] },
    ]);
  });

  it('marks lookup calls as unresolved dynamic reads', function () {
    var result = collect('{{lookup users idx}}');
    expect(result.paths).toEqual(['idx', 'users']);
    expect(result.unresolved).toEqual([
      { kind: 'lookup', name: 'users', paths: [] },
    ]);
  });

  it('marks lookup calls in any position', function () {
    var result = collect('{{#each items}}{{lookup this key}}{{/each}}');
    expect(result.paths).toEqual(['items', 'items.*', 'items.*.key']);
    expect(result.unresolved).toEqual([
      { kind: 'lookup', name: 'this', paths: [] },
    ]);

    result = collect('{{helper (lookup a.b c)}}');
    expect(result.paths).toEqual(['a.b', 'c']);
    expect(result.unresolved).toEqual([
      { kind: 'lookup', name: 'a.b', paths: [] },
    ]);
  });

  it('never runs the body of {{#lookup}} and {{#log}} blocks', function () {
    var result = collect('{{#lookup a b}}{{ignored}}{{/lookup}}');
    expect(result.paths).toEqual(['a', 'b']);
    expect(result.unresolved).toEqual([
      { kind: 'lookup', name: 'a', paths: [] },
    ]);

    result = collect('{{#log m}}{{ignored}}{{/log}}');
    expect(result.paths).toEqual(['m']);
    expect(result.unresolved).toEqual([]);

    result = collect('{{#log}}{{ignored}}{{/log}}');
    expect(result.paths).toEqual([]);
    expect(result.unresolved).toEqual([]);
  });

  it('marks decorators as unresolved', function () {
    var result = collect('{{#*decorate}}{{x}}{{/decorate}}');
    expect(result.paths).toEqual([]);
    expect(result.unresolved).toEqual([
      { kind: 'decorator', name: 'decorate', paths: ['x'] },
    ]);

    result = collect('{{*decorate y}}');
    expect(result.paths).toEqual(['y']);
    expect(result.unresolved).toEqual([
      { kind: 'decorator', name: 'decorate', paths: [] },
    ]);
  });

  it('merges and sorts unresolved entries', function () {
    var result = collect(
      '{{#b}}{{y}}{{/b}}{{#a}}{{x}}{{/a}}{{#b}}{{z}}{{/b}}{{> p}}'
    );
    expect(result.unresolved).toEqual([
      { kind: 'block-helper', name: 'a', paths: ['x'] },
      { kind: 'block-helper', name: 'b', paths: ['y', 'z'] },
      { kind: 'partial', name: 'p', paths: [] },
    ]);

    result = collect('{{> p}}{{> (dynamic)}}{{#a}}{{x}}{{/a}}');
    expect(result.unresolved).toEqual([
      { kind: 'block-helper', name: 'a', paths: ['x'] },
      { kind: 'partial', name: null, paths: [] },
      { kind: 'partial', name: 'p', paths: [] },
    ]);
  });

  it('ignores reads that step beyond the root context', function () {
    expect(paths('{{../../tooFar}}')).toEqual([]);
  });

  it('accepts a parsed AST as input', function () {
    expect(paths(Handlebars.parse('{{x}}'))).toEqual(['x']);
  });

  it('throws for invalid input', function () {
    expect(function () {
      Handlebars.collectDataPaths(null);
    }).toThrow(Error);
    expect(function () {
      Handlebars.collectDataPaths(42);
    }).toThrow(Error);
  });

  it('is available on created instances', function () {
    var instance = Handlebars.create();
    expect(instance.collectDataPaths('{{x}}').paths).toEqual(['x']);
  });

  describe('render comparison', function () {
    // Records every property read performed while rendering, as dotted
    // paths with `*` for array indices — the same notation collectDataPaths
    // returns.
    function trackReads() {
      var reads = new Set();
      // Property gets that are not template data reads.
      var ignored = { hasOwnProperty: true, toString: true, toHTML: true };

      function wrap(value, path) {
        if (value === null || typeof value !== 'object') {
          return value;
        }
        return new Proxy(value, {
          get: function (target, prop) {
            if (typeof prop === 'symbol' || ignored[prop]) {
              return Reflect.get(target, prop);
            }
            var segment = prop;
            if (Array.isArray(target)) {
              if (prop === 'length') {
                reads.add(path.join('.'));
                return target.length;
              }
              segment = String(Number(prop)) === prop ? '*' : prop;
            }
            var childPath = path.concat(segment);
            reads.add(childPath.join('.'));
            return wrap(Reflect.get(target, prop), childPath);
          },
        });
      }

      return { reads: reads, wrap: wrap };
    }

    // Rendering reads every segment of a path step by step, so every
    // observed read must be a prefix of a predicted path (nothing
    // unexpected is read) and every predicted path must be observed
    // (nothing is missed).
    function expectRenderedReads(template, input, options) {
      var tracker = trackReads();
      Handlebars.compile(template)(tracker.wrap(input, []), options);
      var expected = Handlebars.collectDataPaths(template).paths;

      Array.from(tracker.reads).forEach(function (read) {
        var accounted = expected.some(function (path) {
          return path === read || path.indexOf(read + '.') === 0;
        });
        expect(accounted).toBe(
          true,
          'render read ' + read + ' is not accounted for by ' + expected
        );
      });
      expected.forEach(function (path) {
        expect(tracker.reads.has(path)).toBe(
          true,
          'predicted path ' + path + ' was not read while rendering'
        );
      });
    }

    it('matches the paths read while rendering an each template', function () {
      expectRenderedReads(
        '{{#each items}}{{this}}:{{name}} of {{../title}};{{/each}}',
        { items: [{ name: 'a' }, { name: 'b' }], title: 'T' }
      );
    });

    it('matches the paths read while rendering with/@root templates', function () {
      expectRenderedReads(
        '{{#with user}}{{name.first}} {{@root.suffix}}{{/with}}',
        { user: { name: { first: 'F' } }, suffix: 'S' }
      );
    });

    it('matches the paths read while rendering block params and helpers', function () {
      expectRenderedReads(
        '{{#each rows as |row i|}}{{row.id}} {{format row.value when=fmt}}{{/each}}',
        { rows: [{ id: 1, value: 2 }], fmt: 'x' },
        {
          helpers: {
            format: function (value, options) {
              return value + ':' + options.hash.when;
            },
          },
        }
      );
    });

    it('matches the paths read while rendering nested each blocks', function () {
      expectRenderedReads(
        '{{#each a}}{{#each b}}{{c}} {{../../top}}{{/each}}{{/each}}',
        { a: [{ b: [{ c: 1 }] }], top: 'T' }
      );
    });
  });
});
