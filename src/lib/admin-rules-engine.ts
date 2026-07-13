// src/lib/admin-rules-engine.ts
// Safe evaluator for the admin rules DSL.
//
// The `when` clause is a small expression language. We DO NOT use eval()
// or Function(). Instead we parse the expression into an AST and walk it.
// This is intentionally a small subset (no function calls, no
// assignment, no property mutation) to prevent the admin from accidentally
// or maliciously running arbitrary code through the JSON config.
//
// Supported:
//   - Property access: item.foo.bar
//   - Comparison: === !== == != < <= > >=
//   - Logical: && || !
//   - Truthy check: item.foo (returns truthy if not null/undefined/0/'')
//   - Ternary: cond ? a : b
//   - Grouping with parens
//   - String/number literals
//
// NOT supported (returns false / throws):
//   - Function calls: item.foo()
//   - Assignment: item.foo = bar
//   - eval, Function, setTimeout, etc.
//   - new / this / arguments

import type { AdminRule, RuleAction } from './admin-types';

// ---------------------------------------------------------------------------
// AST types
// ---------------------------------------------------------------------------

type AstNode =
  | { kind: 'identifier'; name: string }
  | { kind: 'literal'; value: string | number | boolean | null }
  | { kind: 'member'; object: AstNode; property: string; computed: boolean }
  | { kind: 'binary'; op: '===' | '!==' | '==' | '!=' | '<' | '<=' | '>' | '>=' | '&&' | '||'; left: AstNode; right: AstNode }
  | { kind: 'unary'; op: '!'; argument: AstNode }
  | { kind: 'conditional'; test: AstNode; consequent: AstNode; alternate: AstNode };

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type Token =
  | { type: 'ident'; value: string }
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'punctuator'; value: string };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    // Identifiers and keywords (only `true`, `false`, `null` here)
    if (/[a-zA-Z_$]/.test(ch)) {
      let j = i + 1;
      while (j < input.length && /[a-zA-Z0-9_$]/.test(input[j])) j++;
      const word = input.slice(i, j);
      if (word === 'true' || word === 'false' || word === 'null') {
        tokens.push({
          type: 'number',
          value: word === 'true' ? 1 : word === 'false' ? 0 : 0, // placeholder; we handle in parser
        });
        // Encode as identifier so the parser can special-case
        tokens[tokens.length - 1] = {
          type: 'ident',
          value: word,
        };
      } else {
        tokens.push({ type: 'ident', value: word });
      }
      i = j;
      continue;
    }

    // Numbers
    if (/[0-9]/.test(ch)) {
      let j = i + 1;
      while (j < input.length && /[0-9]/.test(input[j])) j++;
      if (input[j] === '.') {
        j++;
        if (j >= input.length || !/[0-9]/.test(input[j])) {
          throw new Error(`invalid number at ${i}`);
        }
        while (j < input.length && /[0-9]/.test(input[j])) j++;
        if (input[j] === '.') {
          throw new Error(`invalid number at ${i}`);
        }
      }
      const rawNumber = input.slice(i, j);
      const num = Number(rawNumber);
      if (!Number.isFinite(num)) throw new Error(`invalid number at ${i}`);
      tokens.push({ type: 'number', value: num });
      i = j;
      continue;
    }

    // Strings (single or double quotes)
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      let buf = '';
      while (j < input.length && input[j] !== quote) {
        if (input[j] === '\\' && j + 1 < input.length) {
          buf += input[j + 1];
          j += 2;
        } else {
          buf += input[j];
          j++;
        }
      }
      if (j >= input.length) throw new Error(`unterminated string at ${i}`);
      tokens.push({ type: 'string', value: buf });
      i = j + 1;
      continue;
    }

    // Punctuators
    if ('(){}[].,;?:+-*/%=<>!&|'.includes(ch)) {
      // Multi-char punctuators
      const three = input.slice(i, i + 3);
      const two = input.slice(i, i + 2);
      if (three === '===' || three === '!==') {
        tokens.push({ type: 'punctuator', value: three });
        i += 3;
      } else if (two === '==' || two === '!=') {
        tokens.push({ type: 'punctuator', value: two });
        i += 2;
      } else if (two === '<=' || two === '>=' || two === '&&' || two === '||') {
        tokens.push({ type: 'punctuator', value: two });
        i += 2;
      } else if ('()[].,;?:+-*/%=<>!'.includes(ch)) {
        tokens.push({ type: 'punctuator', value: ch });
        i++;
      } else {
        throw new Error(`unexpected character '${ch}' at ${i}`);
      }
      continue;
    }

    throw new Error(`unexpected character '${ch}' at ${i}`);
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Parser (recursive descent, Pratt-ish for precedence)
// ---------------------------------------------------------------------------

class Parser {
  private pos: number = 0;
  private tokens: Token[];
  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  private eat(type?: Token['type'], value?: string): Token {
    const t = this.tokens[this.pos++];
    if (!t) throw new Error('unexpected end of expression');
    if (type && t.type !== type) throw new Error(`expected ${type} but got ${t.type}`);
    if (value !== undefined && 'value' in t && t.value !== value) {
      throw new Error(`expected ${value} but got ${('value' in t && t.value) ?? t.type}`);
    }
    return t;
  }

  private eatIdent(): string {
    const token = this.eat('ident');
    if (token.type !== 'ident') {
      throw new Error(`expected ident but got ${token.type}`);
    }
    return token.value;
  }

  parseExpression(): AstNode {
    return this.parseConditional();
  }

  isAtEnd(): boolean {
    return this.pos >= this.tokens.length;
  }

  private parseConditional(): AstNode {
    const test = this.parseOr();
    if (this.peek()?.type === 'punctuator' && (this.peek() as any).value === '?') {
      this.eat('punctuator', '?');
      const consequent = this.parseExpression();
      this.eat('punctuator', ':');
      const alternate = this.parseExpression();
      return { kind: 'conditional', test, consequent, alternate };
    }
    return test;
  }

  private parseOr(): AstNode {
    let left = this.parseAnd();
    while (this.peek()?.type === 'punctuator' && (this.peek() as any).value === '||') {
      this.eat('punctuator', '||');
      const right = this.parseAnd();
      left = { kind: 'binary', op: '||', left, right };
    }
    return left;
  }

  private parseAnd(): AstNode {
    let left = this.parseEquality();
    while (this.peek()?.type === 'punctuator' && (this.peek() as any).value === '&&') {
      this.eat('punctuator', '&&');
      const right = this.parseEquality();
      left = { kind: 'binary', op: '&&', left, right };
    }
    return left;
  }

  private parseEquality(): AstNode {
    let left = this.parseRelational();
    while (true) {
      const t = this.peek();
      if (t?.type !== 'punctuator') break;
      const op = (t as any).value;
      if (op !== '===' && op !== '!==' && op !== '==' && op !== '!=') break;
      this.eat('punctuator', op);
      const right = this.parseRelational();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }

  private parseRelational(): AstNode {
    let left = this.parseUnary();
    while (true) {
      const t = this.peek();
      if (t?.type !== 'punctuator') break;
      const op = (t as any).value;
      if (op !== '<' && op !== '<=' && op !== '>' && op !== '>=') break;
      this.eat('punctuator', op);
      const right = this.parseUnary();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }

  private parseUnary(): AstNode {
    const t = this.peek();
    if (t?.type === 'punctuator' && (t as any).value === '!') {
      this.eat('punctuator', '!');
      return { kind: 'unary', op: '!', argument: this.parseUnary() };
    }
    return this.parseMember();
  }

  private parseMember(): AstNode {
    let node = this.parsePrimary();
    while (this.peek()?.type === 'punctuator' && (this.peek() as any).value === '.') {
      this.eat('punctuator', '.');
      const prop = this.eatIdent();
      node = { kind: 'member', object: node, property: prop, computed: false };
    }
    return node;
  }

  private parsePrimary(): AstNode {
    const t = this.peek();
    if (!t) throw new Error('unexpected end of expression');
    if (t.type === 'number') {
      this.eat();
      return { kind: 'literal', value: t.value };
    }
    if (t.type === 'string') {
      this.eat();
      return { kind: 'literal', value: t.value };
    }
    if (t.type === 'ident') {
      if (t.value === 'true') {
        this.eat();
        return { kind: 'literal', value: true };
      }
      if (t.value === 'false') {
        this.eat();
        return { kind: 'literal', value: false };
      }
      if (t.value === 'null') {
        this.eat();
        return { kind: 'literal', value: null };
      }
      this.eat();
      return { kind: 'identifier', name: t.value };
    }
    if (t.type === 'punctuator' && (t as any).value === '(') {
      this.eat('punctuator', '(');
      const node = this.parseExpression();
      this.eat('punctuator', ')');
      return node;
    }
    throw new Error(`unexpected token '${t.type}'`);
  }
}

function parseExpression(src: string): AstNode {
  const parser = new Parser(tokenize(src));
  const ast = parser.parseExpression();
  if (!parser.isAtEnd()) {
    throw new Error('unexpected token after complete expression');
  }
  validateAst(ast);
  return ast;
}

const FORBIDDEN_IDENTIFIERS = new Set([
  'Function',
  'arguments',
  'constructor',
  'document',
  'eval',
  'fetch',
  'globalThis',
  'import',
  'new',
  'process',
  'prototype',
  'queueMicrotask',
  'require',
  'setImmediate',
  'setInterval',
  'setTimeout',
  'this',
  'window',
  '__proto__',
]);

const ALLOWED_IDENTIFIERS = new Set(['item', 'count', 'now', 'today']);

function validateAst(node: AstNode): void {
  switch (node.kind) {
    case 'literal':
      return;
    case 'identifier':
      if (FORBIDDEN_IDENTIFIERS.has(node.name)) {
        throw new Error(`unsafe identifier '${node.name}'`);
      }
      if (!ALLOWED_IDENTIFIERS.has(node.name)) {
        throw new Error(`unknown identifier '${node.name}'`);
      }
      return;
    case 'member':
      if (FORBIDDEN_IDENTIFIERS.has(node.property)) {
        throw new Error(`unsafe property '${node.property}'`);
      }
      validateAst(node.object);
      return;
    case 'unary':
      validateAst(node.argument);
      return;
    case 'binary':
      validateAst(node.left);
      validateAst(node.right);
      return;
    case 'conditional':
      validateAst(node.test);
      validateAst(node.consequent);
      validateAst(node.alternate);
      return;
    default:
      throw new Error(`unknown AST node ${(node as { kind: string }).kind}`);
  }
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

function evalAst(node: AstNode, ctx: Record<string, unknown>): unknown {
  switch (node.kind) {
    case 'literal':
      return node.value;
    case 'identifier': {
      const name = node.name;
      if (name === 'item') {
        if (!Object.prototype.hasOwnProperty.call(ctx, 'item')) return null;
        return ctx.item ?? null;
      }
      if (name === 'count' || name === 'now' || name === 'today') {
        if (!Object.prototype.hasOwnProperty.call(ctx, name)) return null;
        return ctx[name] ?? null;
      }
      return null; // unknown identifier -> null (safe default)
    }
    case 'member': {
      const obj = evalAst(node.object, ctx);
      if (obj === null || obj === undefined) return undefined;
      if (typeof obj !== 'object') return undefined;
      if (!Object.prototype.hasOwnProperty.call(obj, node.property)) return undefined;
      return (obj as Record<string, unknown>)[node.property] ?? undefined;
    }
    case 'unary':
      return !evalAst(node.argument, ctx);
    case 'binary': {
      const l = evalAst(node.left, ctx);
      const r = evalAst(node.right, ctx);
      switch (node.op) {
        case '===':
          return l === r;
        case '!==':
          return l !== r;
        case '==':
          return l == r;
        case '!=':
          return l != r;
        case '<':
          return (l as number) < (r as number);
        case '<=':
          return (l as number) <= (r as number);
        case '>':
          return (l as number) > (r as number);
        case '>=':
          return (l as number) >= (r as number);
        case '&&':
          return Boolean(l) && Boolean(r);
        case '||':
          return Boolean(l) || Boolean(r);
        default:
          throw new Error('unknown binary op');
      }
    }
    case 'conditional':
      return Boolean(evalAst(node.test, ctx)) ? evalAst(node.consequent, ctx) : evalAst(node.alternate, ctx);
    default:
      throw new Error(`unknown AST node ${(node as { kind: string }).kind}`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compile a `when` expression to a callable predicate. Throws on parse
 * error. The returned function is safe to call many times (no recompile).
 */
export function compileRule(rule: AdminRule): (ctx: Record<string, unknown>) => boolean {
  let ast: AstNode;
  try {
    ast = parseExpression(rule.when);
  } catch (e) {
    throw new Error(`rule '${rule.id}': invalid expression '${rule.when}': ${(e as Error).message}`);
  }
  return (ctx) => {
    try {
      const evaluationCtx = Object.prototype.hasOwnProperty.call(ctx, 'item')
        ? ctx
        : { ...ctx, item: ctx };
      return Boolean(evalAst(ast, evaluationCtx));
    } catch {
      return false; // fail-safe: rule never crashes the renderer
    }
  };
}

/**
 * Validate the expression without compiling. Returns null on success,
 * or an error message on failure. Use this for live validation in the
 * admin UI (e.g. show a red border when the user types garbage).
 */
export function validateExpression(src: string): string | null {
  try {
    parseExpression(src);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/**
 * For each item in the list, find the first rule whose `when` evaluates
 * to true and return its `then` block. Returns null if no rule matches.
 */
export function resolveTemplateForItem(
  rules: AdminRule[],
  item: Record<string, unknown>
): RuleAction | null {
  const ctx = Object.prototype.hasOwnProperty.call(item, 'item') ? item : { item };

  for (const rule of rules) {
    try {
      const predicate = compileRule(rule);
      if (predicate(ctx)) {
        return rule.then;
      }
    } catch {
      // skip rules that fail to compile
      continue;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

export const _INTERNAL_TEST = {
  tokenize,
  parseExpression,
  evalAst,
};
