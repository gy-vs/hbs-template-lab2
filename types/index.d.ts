/* These definitions were imported from https://github.com/DefinitelyTyped/DefinitelyTyped
 * and includes previous contributions from the DefinitelyTyped community by:
 *   - Albert Willemsen <https://github.com/AlbertWillemsen-Centric>
 *   - Boris Yankov <https://github.com/borisyankov>
 *   - Jessica Franco <https://github.com/Kovensky>
 *   - Masahiro Wakame <https://github.com/vvakame>
 *   - Raanan Weber <https://github.com/RaananW>
 *   - Sergei Dorogin <https://github.com/evil-shrike>
 *   - webbiesdk <https://github.com/webbiesdk>
 *   - Andrew Leedham <https://github.com/AndrewLeedham>
 *   - Nils Knappmeier <https://github.com/nknapp>
 * For full history prior to their migration to handlebars.js, please see:
 * https://github.com/DefinitelyTyped/DefinitelyTyped/commits/1ce60bdc07f10e0b076778c6c953271c072bc894/types/handlebars/index.d.ts
 */
// TypeScript Version: 2.3
import {
  parse,
  parseWithoutProcessing,
  ParseOptions,
  AST,
} from '@handlebars/parser';

declare namespace Handlebars {
  export interface TemplateDelegate<T = any> {
    (context: T, options?: RuntimeOptions): string;
  }

  export type Template<T = any> = TemplateDelegate<T> | string;

  export interface RuntimeOptions {
    partial?: boolean;
    depths?: any[];
    helpers?: { [name: string]: Function };
    partials?: { [name: string]: Template };
    decorators?: { [name: string]: Function };
    data?: any;
    blockParams?: any[];
    allowCallsToHelperMissing?: boolean;
    allowedProtoProperties?: { [name: string]: boolean };
    allowedProtoMethods?: { [name: string]: boolean };
    allowProtoPropertiesByDefault?: boolean;
    allowProtoMethodsByDefault?: boolean;
  }

  export interface HelperOptions {
    fn: TemplateDelegate;
    inverse: TemplateDelegate;
    hash: Record<string, any>;
    data?: any;
  }

  export interface HelperDelegate {
    (
      context?: any,
      arg1?: any,
      arg2?: any,
      arg3?: any,
      arg4?: any,
      arg5?: any,
      options?: HelperOptions
    ): any;
  }
  export interface HelperDeclareSpec {
    [key: string]: HelperDelegate;
  }

  export { parse, parseWithoutProcessing, ParseOptions };

  export function registerHelper(name: string, fn: HelperDelegate): void;
  export function registerHelper(name: HelperDeclareSpec): void;
  export function unregisterHelper(name: string): void;

  export function registerPartial(name: string, fn: Template): void;
  export function registerPartial(spec: { [name: string]: Template }): void;
  export function unregisterPartial(name: string): void;

  // TODO: replace Function with actual signature
  export function registerDecorator(name: string, fn: Function): void;
  export function unregisterDecorator(name: string): void;

  export function K(): void;
  export function createFrame(object: any): any;
  export function blockParams(obj: any[], ids: any[]): any[];
  export function log(level: number, obj: any): void;

  export function compile<T = any>(
    input: any,
    options?: CompileOptions
  ): HandlebarsTemplateDelegate<T>;
  export function precompile(
    input: any,
    options?: PrecompileOptions
  ): TemplateSpecification;

  /**
   * The result of {@link Handlebars.collectDataPaths}.
   */
  export interface CollectDataPathsResult {
    /**
     * All data paths the template reads, resolved against the root context,
     * de-duplicated and sorted lexicographically. Segments are joined with
     * `.`; the per-item context of an `{{#each}}` iteration is written as
     * `*`, e.g. `items.*.name`. A segment that itself contains a dot is
     * quoted the way it would be written in a template (`a.[b.c]`). The
     * empty string denotes a read of the root context itself (e.g. a
     * top-level `{{this}}`).
     */
    paths: string[];
    /**
     * Reads that cannot be resolved to concrete data paths statically,
     * grouped by the construct that causes the ambiguity. Entries are
     * sorted by `kind` and `name`.
     */
    unresolved: UnresolvedDataPaths[];
  }

  /**
   * Reads collected below a position whose context is only known at
   * runtime. The contained paths are written as they appear in the
   * template, relative to that position — they are intentionally not
   * stitched onto a guessed absolute path.
   */
  export interface UnresolvedDataPaths {
    /**
     * Which construct makes the context unknown:
     * - `partial` — a partial call (`{{> foo}}`), a partial block
     *   (`{{#> foo}}`), or an inline partial definition
     *   (`{{#*inline "foo"}}`), whose body is rendered with a context
     *   chosen at the invocation site
     * - `block-helper` — a block helper that is not one of `each`, `with`,
     *   `if`, `unless` (or one of those with a context that cannot be
     *   determined statically, e.g. `{{#each (computed)}}`)
     * - `lookup` — a `lookup` call, which reads a dynamically named
     *   property
     * - `decorator` — a decorator, which may alter the program at runtime
     */
    kind: 'partial' | 'block-helper' | 'lookup' | 'decorator';
    /**
     * Identifies the construct: the partial name for `partial` (null when
     * the name is computed dynamically), the helper or decorator name for
     * `block-helper` and `decorator`, and the object expression as written
     * for `lookup` (null when it is not a path, e.g. a subexpression).
     */
    name: string | null;
    /**
     * The paths read inside this construct, as written in the template,
     * de-duplicated and sorted lexicographically. Empty for plain partial
     * calls (their body is not part of the template) and for `lookup`.
     */
    paths: string[];
  }

  /**
   * Collects the data paths that a template reads.
   *
   * Every path that can be determined statically is resolved against the
   * root context, following the same scoping rules as the renderer
   * (`{{#each}}`, `{{#with}}`, `../`, block params, `@root`, ...), and
   * returned in {@link CollectDataPathsResult.paths}. Reads below custom
   * block helpers, partials, dynamic `lookup`s and decorators cannot be
   * resolved statically and are listed in
   * {@link CollectDataPathsResult.unresolved} instead. `@`-variables such
   * as `@index` or `@key` are provided by helpers at runtime and are not
   * counted as data reads.
   *
   * @param input A template string or a parsed Handlebars AST.
   */
  export function collectDataPaths(
    input: string | hbs.AST.Program
  ): CollectDataPathsResult;
  export function template<T = any>(
    precompilation: TemplateSpecification
  ): HandlebarsTemplateDelegate<T>;

  export function create(): typeof Handlebars;

  export const escapeExpression: typeof Utils.escapeExpression;
  //export const Utils: typeof hbs.Utils;
  export const logger: Logger;
  export const templates: HandlebarsTemplates;
  export const helpers: { [name: string]: HelperDelegate };
  export const partials: { [name: string]: any };
  // TODO: replace Function with actual signature
  export const decorators: { [name: string]: Function };

  export const VERSION: string;

  export function noConflict(): typeof Handlebars;

  export class Exception {
    constructor(message: string, node?: hbs.AST.Node);
    description: string;
    fileName: string;
    lineNumber?: any;
    endLineNumber?: any;
    message: string;
    name: string;
    number: number;
    stack?: string;
    column?: any;
    endColumn?: any;
  }

  export class SafeString {
    constructor(str: string);
    toString(): string;
    toHTML(): string;
  }

  export namespace Utils {
    export function escapeExpression(str: string): string;
    export function createFrame(object: any): any;
    export function blockParams(obj: any[], ids: any[]): any[];
    export function isEmpty(obj: any): boolean;
    export function extend(obj: any, ...source: any[]): any;
    export function toString(obj: any): string;
    export function isArray(obj: any): boolean;
    export function isFunction(obj: any): boolean;
    export function isMap(obj: any): boolean;
    export function isSet(obj: any): boolean;
  }

  export namespace AST {
    export const helpers: hbs.AST.helpers;
  }

  export interface ICompiler {
    accept(node: hbs.AST.Node): void;
    Program(program: hbs.AST.Program): void;
    BlockStatement(block: hbs.AST.BlockStatement): void;
    PartialStatement(partial: hbs.AST.PartialStatement): void;
    PartialBlockStatement(partial: hbs.AST.PartialBlockStatement): void;
    DecoratorBlock(decorator: hbs.AST.DecoratorBlock): void;
    Decorator(decorator: hbs.AST.Decorator): void;
    MustacheStatement(mustache: hbs.AST.MustacheStatement): void;
    ContentStatement(content: hbs.AST.ContentStatement): void;
    CommentStatement(comment?: hbs.AST.CommentStatement): void;
    SubExpression(sexpr: hbs.AST.SubExpression): void;
    PathExpression(path: hbs.AST.PathExpression): void;
    StringLiteral(str: hbs.AST.StringLiteral): void;
    NumberLiteral(num: hbs.AST.NumberLiteral): void;
    BooleanLiteral(bool: hbs.AST.BooleanLiteral): void;
    UndefinedLiteral(): void;
    NullLiteral(): void;
    Hash(hash: hbs.AST.Hash): void;
  }

  export class Visitor implements ICompiler {
    accept(node: hbs.AST.Node): void;
    acceptKey(node: hbs.AST.Node, name: string): void;
    acceptArray(arr: hbs.AST.Expression[]): void;
    Program(program: hbs.AST.Program): void;
    BlockStatement(block: hbs.AST.BlockStatement): void;
    PartialStatement(partial: hbs.AST.PartialStatement): void;
    PartialBlockStatement(partial: hbs.AST.PartialBlockStatement): void;
    DecoratorBlock(decorator: hbs.AST.DecoratorBlock): void;
    Decorator(decorator: hbs.AST.Decorator): void;
    MustacheStatement(mustache: hbs.AST.MustacheStatement): void;
    ContentStatement(content: hbs.AST.ContentStatement): void;
    CommentStatement(comment?: hbs.AST.CommentStatement): void;
    SubExpression(sexpr: hbs.AST.SubExpression): void;
    PathExpression(path: hbs.AST.PathExpression): void;
    StringLiteral(str: hbs.AST.StringLiteral): void;
    NumberLiteral(num: hbs.AST.NumberLiteral): void;
    BooleanLiteral(bool: hbs.AST.BooleanLiteral): void;
    UndefinedLiteral(): void;
    NullLiteral(): void;
    Hash(hash: hbs.AST.Hash): void;
  }

  export interface ResolvePartialOptions {
    name: string;
    helpers?: { [name: string]: Function };
    partials?: { [name: string]: HandlebarsTemplateDelegate };
    decorators?: { [name: string]: Function };
    data?: any;
  }

  export namespace VM {
    /**
     * @deprecated
     */
    export function resolvePartial<T = any>(
      partial: HandlebarsTemplateDelegate<T> | undefined,
      context: any,
      options: ResolvePartialOptions
    ): HandlebarsTemplateDelegate<T>;
  }
}

/**
 * Implement this interface on your MVW/MVVM/MVC views such as Backbone.View
 **/
export interface HandlebarsTemplatable {
  template: HandlebarsTemplateDelegate;
}

// NOTE: for backward compatibility of this typing
export type HandlebarsTemplateDelegate<T = any> =
  Handlebars.TemplateDelegate<T>;

export interface HandlebarsTemplates {
  [index: string]: HandlebarsTemplateDelegate;
}

export interface TemplateSpecification {}

// for backward compatibility of this typing
export type RuntimeOptions = Handlebars.RuntimeOptions;

export interface CompileOptions {
  data?: boolean;
  compat?: boolean;
  knownHelpers?: KnownHelpers;
  knownHelpersOnly?: boolean;
  noEscape?: boolean;
  strict?: boolean;
  assumeObjects?: boolean;
  preventIndent?: boolean;
  ignoreStandalone?: boolean;
  explicitPartialContext?: boolean;
}

export type KnownHelpers = {
  [name in BuiltinHelperName | CustomHelperName]: boolean;
};

export type BuiltinHelperName =
  | 'helperMissing'
  | 'blockHelperMissing'
  | 'each'
  | 'if'
  | 'unless'
  | 'with'
  | 'log'
  | 'lookup';

export type CustomHelperName = string;

export interface PrecompileOptions extends CompileOptions {
  srcName?: string;
  destName?: string;
}

export namespace hbs {
  // for backward compatibility of this typing
  export type SafeString = Handlebars.SafeString;

  export type Utils = typeof Handlebars.Utils;

  export { AST };
}

export interface Logger {
  DEBUG: number;
  INFO: number;
  WARN: number;
  ERROR: number;
  level: number;

  methodMap: { [level: number]: string };

  log(level: number, obj: string): void;
}

export type CompilerInfo = [number /* revision */, string /* versions */];

declare module 'handlebars/runtime' {
  const runtime: typeof Handlebars;
  export default runtime;
}

// Named exports matching lib/index.js for ESM/CJS interop
export const create: typeof Handlebars.create;
export const compile: typeof Handlebars.compile;
export const precompile: typeof Handlebars.precompile;
export const collectDataPaths: typeof Handlebars.collectDataPaths;
export const template: typeof Handlebars.template;
export { parse, parseWithoutProcessing } from '@handlebars/parser';
export const VERSION: typeof Handlebars.VERSION;
export const COMPILER_REVISION: number;
export const LAST_COMPATIBLE_COMPILER_REVISION: number;
export const REVISION_CHANGES: { [revision: number]: string };
export import AST = Handlebars.AST;
export const Compiler: Handlebars.ICompiler;
export const JavaScriptCompiler: any;
export const Parser: any;
export import Visitor = Handlebars.Visitor;
export import SafeString = Handlebars.SafeString;
export import Exception = Handlebars.Exception;
export import Utils = Handlebars.Utils;
export const escapeExpression: typeof Handlebars.escapeExpression;
export import VM = Handlebars.VM;
export const log: typeof Handlebars.log;
export const registerHelper: typeof Handlebars.registerHelper;
export const unregisterHelper: typeof Handlebars.unregisterHelper;
export const registerPartial: typeof Handlebars.registerPartial;
export const unregisterPartial: typeof Handlebars.unregisterPartial;
export const registerDecorator: typeof Handlebars.registerDecorator;
export const unregisterDecorator: typeof Handlebars.unregisterDecorator;
export function print(ast: hbs.AST.Program): string;
export class PrintVisitor {
  accept(node: hbs.AST.Node): void;
}

export default Handlebars;
