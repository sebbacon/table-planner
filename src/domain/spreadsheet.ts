import { readSheet } from "read-excel-file/browser";
import { formatGuestLine, parseGuestText } from "./parser";
import type { GuestColumn } from "./types";
import { readFileText } from "./file";

type SpreadsheetCell = string | number | boolean | Date | null | undefined;
export type SpreadsheetRow = SpreadsheetCell[];

export interface SpreadsheetImportResult {
  guestText: string;
  importedCount: number;
  warnings: string[];
  columns: GuestColumn[];
}

const NAME_HEADERS = new Set([
  "name",
  "guest",
  "guest name",
  "full name",
  "fullname",
  "person",
  "attendee",
  "invitee"
]);
const FIRST_NAME_HEADERS = new Set(["first", "first name", "firstname", "forename"]);
const LAST_NAME_HEADERS = new Set(["last", "last name", "lastname", "surname", "family name"]);
const GROUP_HEADERS = new Set(["group", "groups", "category", "dimension", "type", "gender", "sex"]);

export interface SpreadsheetOptions {
  hasHeader: boolean;
  nameColumns: number[];
  includedColumns?: number[];
}

export async function readGuestSpreadsheet(file: File): Promise<SpreadsheetRow[]> {
  const extension = getFileExtension(file.name);
  if (extension === "csv" || extension === "tsv") {
    return parseDelimitedText(await readFileText(file), extension === "tsv" ? "\t" : undefined);
  }
  if (extension === "xlsx") return await readSheet(file) as SpreadsheetRow[];
  throw new Error("Upload a .xlsx, .csv, or .tsv file.");
}

export async function spreadsheetFileToGuestText(file: File): Promise<SpreadsheetImportResult> {
  return rowsToGuestText(await readGuestSpreadsheet(file));
}

export function defaultSpreadsheetOptions(rows: SpreadsheetRow[]): SpreadsheetOptions {
  const header = rows.find(row => row.some(cell => normalizeCell(cell))) ?? [];
  const detected = detectColumns(header);
  const nameColumns = detected.nameIndex !== null ? [detected.nameIndex]
    : [detected.firstNameIndex, detected.lastNameIndex].filter((index): index is number => index !== null);
  return { hasHeader: detected.hasHeader, nameColumns: nameColumns.length ? nameColumns : [0] };
}

export function spreadsheetHeaders(rows: SpreadsheetRow[], hasHeader: boolean): string[] {
  const nonEmpty = rows.filter(row => row.some(cell => normalizeCell(cell)));
  const width = Math.max(0, ...nonEmpty.map(row => row.length));
  const labels = Array.from({ length: width }, (_, index) => hasHeader ? normalizeCell(nonEmpty[0]?.[index]) || `Column ${index + 1}` : `Column ${index + 1}`);
  const used = new Set<string>();
  return labels.map((label, index) => {
    let unique = labels.filter(other => other === label).length > 1 ? `${label} (column ${index + 1})` : label;
    while (used.has(unique)) unique += ` (column ${index + 1})`;
    used.add(unique);
    return unique;
  });
}

export function rowsToGuestText(rows: SpreadsheetRow[], options = defaultSpreadsheetOptions(rows)): SpreadsheetImportResult {
  const warnings: string[] = [];
  const nonEmpty = rows.filter(row => row.some(cell => normalizeCell(cell)));
  const headers = spreadsheetHeaders(rows, options.hasHeader);
  const attributeIndices = headers.map((_, index) => index).filter(index => !options.nameColumns.includes(index)
    && (!options.includedColumns || options.includedColumns.includes(index)));
  const dataRows = options.hasHeader ? nonEmpty.slice(1) : nonEmpty;
  const keptRows: SpreadsheetRow[] = [];
  const names: string[] = [];
  for (const [index, row] of dataRows.entries()) {
    const name = options.nameColumns.map(index => normalizeCell(row[index])).filter(Boolean).join(" ").replace(/[\r\n]+/g, " ");
    if (!name) {
      warnings.push(`Skipped row ${index + (options.hasHeader ? 2 : 1)} because it has no name.`);
      continue;
    }
    names.push(formatGuestLine(name));
    keptRows.push(row);
  }
  if (!nonEmpty.length) warnings.push("The spreadsheet did not contain any guest rows.");
  if (!options.hasHeader && nonEmpty.length) warnings.push("No header row selected. Review the name column and column labels before importing.");
  const guestText = names.join("\n");
  const guests = parseGuestText(guestText).guests;
  const columns = attributeIndices.map(index => ({
    id: `column-${index + 1}`, label: headers[index], mode: "ignore" as const, tableMapping: {},
    values: Object.fromEntries(guests.map((guest, rowIndex) => {
      const value = normalizeCell(keptRows[rowIndex][index]);
      return [guest.id, value ? [value] : []];
    }))
  }));
  return { guestText, importedCount: guests.length, warnings: [...warnings, ...parseGuestText(guestText).warnings], columns };
}

interface ColumnDetection {
  hasHeader: boolean;
  nameIndex: number | null;
  firstNameIndex: number | null;
  lastNameIndex: number | null;
  groupIndex: number | null;
}

function detectColumns(headerRow: SpreadsheetRow): ColumnDetection {
  const normalizedHeaders = headerRow.map((cell) => normalizeHeader(cell));
  const nameIndex = findHeaderIndex(normalizedHeaders, NAME_HEADERS);
  const firstNameIndex = findHeaderIndex(normalizedHeaders, FIRST_NAME_HEADERS);
  const lastNameIndex = findHeaderIndex(normalizedHeaders, LAST_NAME_HEADERS);
  const groupIndex = findHeaderIndex(normalizedHeaders, GROUP_HEADERS);
  const hasHeader = nameIndex !== null || firstNameIndex !== null || lastNameIndex !== null || groupIndex !== null;

  if (hasHeader) {
    return {
      hasHeader,
      nameIndex,
      firstNameIndex,
      lastNameIndex,
      groupIndex
    };
  }

  return {
    hasHeader: false,
    nameIndex: 0,
    firstNameIndex: null,
    lastNameIndex: null,
    groupIndex: headerRow.length > 1 ? 1 : null
  };
}

function findHeaderIndex(headers: string[], candidates: Set<string>): number | null {
  const index = headers.findIndex((header) => candidates.has(header));

  return index === -1 ? null : index;
}

function parseDelimitedText(input: string, explicitDelimiter?: "," | "\t"): SpreadsheetRow[] {
  const delimiter = explicitDelimiter ?? detectDelimiter(input);
  const rows: SpreadsheetRow[] = [];
  let currentCell = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const nextChar = input[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";

      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      continue;
    }

    currentCell += char;
  }

  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

function detectDelimiter(input: string): "," | "\t" {
  const firstLine = input.split(/\r?\n/, 1)[0] ?? "";
  const commaCount = firstLine.split(",").length;
  const tabCount = firstLine.split("\t").length;

  return tabCount > commaCount ? "\t" : ",";
}

function normalizeHeader(value: SpreadsheetCell): string {
  return normalizeCell(value)
    .toLocaleLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCell(value: SpreadsheetCell): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value.toLocaleDateString();
  }

  return String(value).trim();
}

function getFileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLocaleLowerCase() ?? "";
}
