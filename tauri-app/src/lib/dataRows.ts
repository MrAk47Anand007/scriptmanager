import type { DataRow } from '@/lib/apiRuntimeClient'

/// Client-side mirror of the Rust parse_csv_rows for previews and inline
/// data-driven runs: header row + comma-separated values with quote support.
export function parseCsvRows(content: string): DataRow[] {
  const records: string[][] = []
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue
    const fields: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"'
          i += 1
        } else if (ch === '"') {
          inQuotes = false
        } else {
          current += ch
        }
      } else if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        fields.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    fields.push(current.trim())
    records.push(fields)
  }
  if (records.length === 0) return []
  const headers = records[0]
  return records.slice(1).map((record) => {
    const row: DataRow = {}
    headers.forEach((header, index) => {
      row[header] = record[index] ?? ''
    })
    return row
  })
}

/// Parse pasted data (CSV or JSON array of objects) into rows.
export function parseDataText(kind: 'csv' | 'json', content: string): { rows: DataRow[]; error?: string } {
  try {
    if (kind === 'csv') {
      const rows = parseCsvRows(content)
      if (rows.length === 0) return { rows, error: 'No data rows' }
      return { rows }
    }
    const parsed = JSON.parse(content) as unknown
    if (!Array.isArray(parsed) || parsed.some((row) => typeof row !== 'object' || row === null)) {
      return { rows: [], error: 'JSON must be an array of objects' }
    }
    return {
      rows: parsed.map((row) => {
        const out: DataRow = {}
        for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
          out[key] = typeof value === 'string' ? value : JSON.stringify(value)
        }
        return out
      }),
    }
  } catch (error) {
    return { rows: [], error: error instanceof Error ? error.message : 'Invalid data' }
  }
}
