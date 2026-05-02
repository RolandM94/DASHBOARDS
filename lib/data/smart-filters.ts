import type { DatasetField, FieldType } from "@/types";
import { isDateType, isNumericType } from "@/types";
import type { FilterCategory } from "@/lib/data/filters";
import { detectFilterCategory } from "@/lib/data/filters";

const NUMERIC_SQL_REGEX = "^-?[0-9]+(\\.[0-9]+)?([eE][+-]?[0-9]+)?$";

type SmartFilterKind =
  | "missing"
  | "present"
  | "zero"
  | "positive"
  | "negative"
  | "past"
  | "future"
  | "this_year"
  | "true"
  | "false";

export interface SmartFilterDefinition {
  id: string;
  label: string;
  category: FilterCategory;
  description: string;
  field: string;
  fieldType: FieldType;
  kind: SmartFilterKind;
}

function encodeSmartId(kind: SmartFilterKind, field: string): string {
  return `smart:${kind}:${encodeURIComponent(field)}`;
}

function decodeSmartId(id: string): { kind: SmartFilterKind; field: string } | null {
  const match = /^smart:([^:]+):(.+)$/.exec(id);
  if (!match) return null;

  const kind = match[1] as SmartFilterKind;
  const validKinds = new Set<SmartFilterKind>([
    "missing", "present", "zero", "positive", "negative",
    "past", "future", "this_year", "true", "false",
  ]);
  if (!validKinds.has(kind)) return null;

  try {
    return { kind, field: decodeURIComponent(match[2]) };
  } catch {
    return null;
  }
}

function sqlStringLiteralContent(value: string): string {
  return value.replace(/'/g, "''");
}

function fieldSql(field: string): string {
  return `data->>'${sqlStringLiteralContent(field)}'`;
}

function numericExpr(field: string): string {
  const f = fieldSql(field);
  return `(case when ${f} ~ '${NUMERIC_SQL_REGEX}' then (${f})::numeric end)`;
}

function addBaseFilters(field: DatasetField): SmartFilterDefinition[] {
  return [
    {
      id: encodeSmartId("missing", field.name),
      label: `Missing ${field.name}`,
      category: detectFilterCategory(field),
      description: `Rows where ${field.name} is blank or unavailable`,
      field: field.name,
      fieldType: field.type,
      kind: "missing",
    },
    {
      id: encodeSmartId("present", field.name),
      label: `Has ${field.name}`,
      category: detectFilterCategory(field),
      description: `Rows where ${field.name} has a value`,
      field: field.name,
      fieldType: field.type,
      kind: "present",
    },
  ];
}

function filtersForField(field: DatasetField): SmartFilterDefinition[] {
  const filters = addBaseFilters(field);

  if (isNumericType(field.type)) {
    filters.push(
      {
        id: encodeSmartId("zero", field.name),
        label: `${field.name} is Zero`,
        category: detectFilterCategory(field),
        description: `Rows where ${field.name} equals 0`,
        field: field.name,
        fieldType: field.type,
        kind: "zero",
      },
      {
        id: encodeSmartId("positive", field.name),
        label: `${field.name} Above Zero`,
        category: detectFilterCategory(field),
        description: `Rows where ${field.name} is greater than 0`,
        field: field.name,
        fieldType: field.type,
        kind: "positive",
      },
      {
        id: encodeSmartId("negative", field.name),
        label: `${field.name} Below Zero`,
        category: detectFilterCategory(field),
        description: `Rows where ${field.name} is less than 0`,
        field: field.name,
        fieldType: field.type,
        kind: "negative",
      },
    );
  }

  if (isDateType(field.type)) {
    filters.push(
      {
        id: encodeSmartId("past", field.name),
        label: `${field.name} in the Past`,
        category: detectFilterCategory(field),
        description: `Rows where ${field.name} is before today`,
        field: field.name,
        fieldType: field.type,
        kind: "past",
      },
      {
        id: encodeSmartId("future", field.name),
        label: `${field.name} in the Future`,
        category: detectFilterCategory(field),
        description: `Rows where ${field.name} is after today`,
        field: field.name,
        fieldType: field.type,
        kind: "future",
      },
      {
        id: encodeSmartId("this_year", field.name),
        label: `${field.name} This Year`,
        category: detectFilterCategory(field),
        description: `Rows where ${field.name} falls in the current calendar year`,
        field: field.name,
        fieldType: field.type,
        kind: "this_year",
      },
    );
  }

  if (field.type === "boolean") {
    filters.push(
      {
        id: encodeSmartId("true", field.name),
        label: `${field.name} is True`,
        category: detectFilterCategory(field),
        description: `Rows where ${field.name} is true`,
        field: field.name,
        fieldType: field.type,
        kind: "true",
      },
      {
        id: encodeSmartId("false", field.name),
        label: `${field.name} is False`,
        category: detectFilterCategory(field),
        description: `Rows where ${field.name} is false`,
        field: field.name,
        fieldType: field.type,
        kind: "false",
      },
    );
  }

  return filters;
}

export function getDatasetSmartFilters(fields: DatasetField[]): SmartFilterDefinition[] {
  return fields.flatMap(filtersForField);
}

export function getDatasetSmartFilterMap(fields: DatasetField[]): Map<string, SmartFilterDefinition> {
  return new Map(getDatasetSmartFilters(fields).map((filter) => [filter.id, filter]));
}

export function isValidSmartFilterId(smartId: string, fields: DatasetField[]): boolean {
  return getDatasetSmartFilterMap(fields).has(smartId);
}

export function resolveSmartFilter(
  smartId: string,
  datasetFields: DatasetField[],
): string | null {
  const parsed = decodeSmartId(smartId);
  if (!parsed) return null;

  const field = datasetFields.find((candidate) => candidate.name === parsed.field);
  if (!field) return null;

  const valueExpr = fieldSql(field.name);
  const numExpr = numericExpr(field.name);

  switch (parsed.kind) {
    case "missing":
      return `(${valueExpr} is null or ${valueExpr} = '')`;
    case "present":
      return `(${valueExpr} is not null and ${valueExpr} != '')`;
    case "zero":
      if (!isNumericType(field.type)) return null;
      return `${numExpr} = 0`;
    case "positive":
      if (!isNumericType(field.type)) return null;
      return `${numExpr} > 0`;
    case "negative":
      if (!isNumericType(field.type)) return null;
      return `${numExpr} < 0`;
    case "past":
      if (!isDateType(field.type)) return null;
      return `(${valueExpr} is not null and ${valueExpr} != '' and ${valueExpr} < current_date::text)`;
    case "future":
      if (!isDateType(field.type)) return null;
      return `(${valueExpr} is not null and ${valueExpr} != '' and ${valueExpr} > current_date::text)`;
    case "this_year":
      if (!isDateType(field.type)) return null;
      return `(${valueExpr} >= date_trunc('year', current_date)::date::text and ${valueExpr} < (date_trunc('year', current_date)::date + interval '1 year')::date::text)`;
    case "true":
      if (field.type !== "boolean") return null;
      return `lower(${valueExpr}) in ('true','t','yes','y','1')`;
    case "false":
      if (field.type !== "boolean") return null;
      return `lower(${valueExpr}) in ('false','f','no','n','0')`;
  }
}

export function getSmartFilterPromptContext(fields: DatasetField[]): string {
  const filters = getDatasetSmartFilters(fields);
  if (filters.length === 0) return "  - None available for this dataset";

  return filters
    .map((sf) => `  - ${sf.id}: ${sf.label} — ${sf.description}`)
    .join("\n");
}
