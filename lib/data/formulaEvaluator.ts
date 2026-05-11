type FormulaToken =
  | { type: "number"; value: number }
  | { type: "field"; value: string }
  | { type: "operator"; value: Operator }
  | { type: "paren"; value: "(" | ")" };

type RpnToken = Exclude<FormulaToken, { type: "paren" }>;
type Operator = "+" | "-" | "*" | "/";

export interface FormulaValidationResult {
  ok: boolean;
  error?: string;
  references: string[];
}

const PRECEDENCE: Record<Operator, number> = {
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
};

export function extractFormulaReferences(formula: string): string[] {
  const refs = new Set<string>();
  const pattern = /\{([^{}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(formula)) !== null) {
    const ref = match[1]?.trim();
    if (ref) refs.add(ref);
  }
  return Array.from(refs);
}

export function validateFormula(formula: string, availableFields: Iterable<string>): FormulaValidationResult {
  const available = new Set(availableFields);
  const trimmed = formula.trim();
  if (!trimmed) return { ok: false, error: "Formula is required", references: [] };

  let tokens: FormulaToken[];
  try {
    tokens = tokenizeFormula(trimmed);
    toRpn(tokens);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid formula",
      references: extractFormulaReferences(trimmed),
    };
  }

  const references = tokens.filter((token): token is { type: "field"; value: string } => token.type === "field").map((token) => token.value);
  const unknown = references.find((ref) => !available.has(ref));
  if (unknown) return { ok: false, error: `Unknown metric: ${unknown}`, references };

  return { ok: true, references };
}

export function evaluateFormula(formula: string, row: Record<string, unknown>): number | null {
  try {
    const rpn = toRpn(tokenizeFormula(formula));
    const stack: number[] = [];

    for (const token of rpn) {
      if (token.type === "number") {
        stack.push(token.value);
        continue;
      }
      if (token.type === "field") {
        const value = numericValue(row[token.value]);
        if (value === null) return null;
        stack.push(value);
        continue;
      }

      const right = stack.pop();
      const left = stack.pop();
      if (left == null || right == null) return null;
      if (token.value === "/" && right === 0) return null;

      switch (token.value) {
        case "+": stack.push(left + right); break;
        case "-": stack.push(left - right); break;
        case "*": stack.push(left * right); break;
        case "/": stack.push(left / right); break;
      }
    }

    return stack.length === 1 && Number.isFinite(stack[0]) ? stack[0] : null;
  } catch {
    return null;
  }
}

function tokenizeFormula(formula: string): FormulaToken[] {
  const tokens: FormulaToken[] = [];
  let index = 0;
  let expectsValue = true;

  while (index < formula.length) {
    const char = formula[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === "{") {
      const end = formula.indexOf("}", index + 1);
      if (end < 0) throw new Error("Missing closing }");
      const value = formula.slice(index + 1, end).trim();
      if (!value) throw new Error("Empty metric reference");
      tokens.push({ type: "field", value });
      index = end + 1;
      expectsValue = false;
      continue;
    }

    const signedNumber = (char === "-" || char === "+") && expectsValue && isNumberStart(formula[index + 1] ?? "");
    if (isNumberStart(char) || signedNumber) {
      const start = index;
      index += signedNumber ? 2 : 1;
      while (index < formula.length && /[0-9.]/.test(formula[index])) index += 1;
      const raw = formula.slice(start, index);
      if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(raw)) throw new Error(`Invalid number: ${raw}`);
      tokens.push({ type: "number", value: Number(raw) });
      expectsValue = false;
      continue;
    }

    if (isOperator(char)) {
      if (expectsValue) throw new Error(`Unexpected operator: ${char}`);
      tokens.push({ type: "operator", value: char });
      index += 1;
      expectsValue = true;
      continue;
    }

    if (char === "(" || char === ")") {
      if (char === "(" && !expectsValue) throw new Error("Missing operator before (");
      if (char === ")" && expectsValue) throw new Error("Missing value before )");
      tokens.push({ type: "paren", value: char });
      index += 1;
      expectsValue = char === "(";
      continue;
    }

    throw new Error(`Unexpected token: ${char}`);
  }

  if (tokens.length === 0) throw new Error("Formula is required");
  if (expectsValue) throw new Error("Formula cannot end with an operator");
  return tokens;
}

function toRpn(tokens: FormulaToken[]): RpnToken[] {
  const output: RpnToken[] = [];
  const operators: Array<Operator | "("> = [];

  for (const token of tokens) {
    if (token.type === "number" || token.type === "field") {
      output.push(token);
      continue;
    }

    if (token.type === "operator") {
      while (true) {
        const top = operators[operators.length - 1];
        if (!top || top === "(" || PRECEDENCE[top] < PRECEDENCE[token.value]) break;
        output.push({ type: "operator", value: operators.pop() as Operator });
      }
      operators.push(token.value);
      continue;
    }

    if (token.value === "(") {
      operators.push("(");
      continue;
    }

    let foundOpen = false;
    while (operators.length > 0) {
      const op = operators.pop();
      if (op === "(") {
        foundOpen = true;
        break;
      }
      output.push({ type: "operator", value: op as Operator });
    }
    if (!foundOpen) throw new Error("Mismatched parentheses");
  }

  while (operators.length > 0) {
    const op = operators.pop();
    if (op === "(") throw new Error("Mismatched parentheses");
    output.push({ type: "operator", value: op as Operator });
  }

  return output;
}

function isOperator(value: string): value is Operator {
  return value === "+" || value === "-" || value === "*" || value === "/";
}

function isNumberStart(value: string): boolean {
  return /[0-9.]/.test(value);
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized || !/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(normalized)) return null;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}
