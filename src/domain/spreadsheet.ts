import { readSheet } from "read-excel-file/browser";
import { readFileText } from "./file";

type SpreadsheetCell = string | number | boolean | Date | null | undefined;
export type SpreadsheetRow = SpreadsheetCell[];

export interface SpreadsheetImportResult {
  guestText: string;
  importedCount: number;
  warnings: string[];
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

export async function spreadsheetFileToGuestText(file: File): Promise<SpreadsheetImportResult> {
  const extension = getFileExtension(file.name);

  if (extension === "csv" || extension === "tsv") {
    const rows = parseDelimitedText(await readFileText(file), extension === "tsv" ? "\t" : undefined);
    return rowsToGuestText(rows);
  }

  if (extension === "xlsx") {
    const rows = await readSheet(file);
    return rowsToGuestText(rows as SpreadsheetRow[]);
  }

  throw new Error("Upload a .xlsx, .csv, or .tsv file.");
}

export function rowsToGuestText(rows: SpreadsheetRow[]): SpreadsheetImportResult {
  const warnings: string[] = [];
  const nonEmptyRows = rows.filter((row) => row.some((cell) => normalizeCell(cell)));

  if (nonEmptyRows.length === 0) {
    return {
      guestText: "",
      importedCount: 0,
      warnings: ["The spreadsheet did not contain any guest rows."]
    };
  }

  const columns = detectColumns(nonEmptyRows[0]);
  const dataRows = columns.hasHeader ? nonEmptyRows.slice(1) : nonEmptyRows;

  if (!columns.hasHeader) {
    warnings.push("No header row found. Used column A for names and column B for groups.");
  }

  const guestLines = dataRows.flatMap((row, index) => {
    const name = getNameFromRow(row, columns);
    const group = columns.groupIndex === null ? "" : normalizeCell(row[columns.groupIndex]);

    if (!name) {
      if (row.some((cell) => normalizeCell(cell))) {
        warnings.push(`Skipped row ${index + (columns.hasHeader ? 2 : 1)} because it has no name.`);
      }

      return [];
    }

    return group ? [`${name}, ${group}`] : [name];
  });

  return {
    guestText: guestLines.join("\n"),
    importedCount: guestLines.length,
    warnings
  };
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

function getNameFromRow(row: SpreadsheetRow, columns: ColumnDetection): string {
  if (columns.nameIndex !== null) {
    return normalizeCell(row[columns.nameIndex]);
  }

  const firstName = columns.firstNameIndex === null ? "" : normalizeCell(row[columns.firstNameIndex]);
  const lastName = columns.lastNameIndex === null ? "" : normalizeCell(row[columns.lastNameIndex]);

  return [firstName, lastName].filter(Boolean).join(" ").trim();
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
