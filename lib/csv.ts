export interface ParsedRow {
  [key: string]: string;
}

/**
 * Parses a single CSV line, respecting RFC 4180 quoted fields and escaped
 * double-quotes (`""`).
 */
export function parseCSVRow(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped double-quote inside a quoted field
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  fields.push(current.trim());
  return fields;
}

/**
 * Parses a full CSV string into an array of header-keyed row objects.
 * Column headers are normalised: lowercased and spaces replaced with `_`.
 * Returns an empty array if the input has fewer than two lines.
 */
export function parseCSV(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCSVRow(lines[0]).map((h) =>
    h.toLowerCase().replace(/\s+/g, "_")
  );

  return lines.slice(1).map((line) => {
    const values = parseCSVRow(line);
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });
}
