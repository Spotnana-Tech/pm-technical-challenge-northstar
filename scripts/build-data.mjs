// Workbook -> src/data/*.json. Node 18, ESM, only dependency: exceljs.
// Regenerate: `npm run build-data`. Verify no drift: `npm run build-data -- --check`.
// Candidates never run this script; JSON output is committed.

import ExcelJS from 'exceljs'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const WORKBOOK_DIR = path.join(ROOT, 'workbook')
const DATA_DIR = path.join(ROOT, 'src', 'data')

const CHECK = process.argv.includes('--check')

// The workbook has no field that derives the cold-start traveler's
// `history_id` prefix from anything else — it's just the convention the sheet
// authors used ("M01", "M02", ... for Marcus). One named constant, used
// everywhere that letter matters, so it never goes stale in two places at once.
const COLD_START_HISTORY_PREFIX = 'M'

// Per-sheet numeric allow-lists: which text fields become numbers. exceljs
// already hands back JS numbers for numeric cells, and JSON has no separate
// int type — an integral float serializes as an int for free. Nothing here
// rounds or sanity-fixes a value; it only decides whether `Number(text)` runs.
const NUMERIC_FIELDS = {
  Air_Options: [
    'stops',
    'connect_min',
    'fare_usd',
    'change_fee_usd',
    'on_time_pct_90d',
    'cancel_pct_90d',
    'co2_kg',
    'commission_usd',
    'rebate_usd',
  ],
  Hotel_Options: [
    'distance_miles',
    'nightly_usd',
    'nights',
    'total_stay_usd',
    'mandatory_fees_usd',
    'review_score_5',
    'cancel_pct',
    'commission_usd',
    'rebate_usd',
  ],
  Traveler_History: ['total_usd', 'satisfaction_1_5'],
}

function findWorkbookFile() {
  if (!existsSync(WORKBOOK_DIR)) {
    throw new Error(`workbook/ directory not found at ${WORKBOOK_DIR}`)
  }
  const match = readdirSync(WORKBOOK_DIR).find((f) => f.toLowerCase().endsWith('.xlsx'))
  if (!match) throw new Error('No .xlsx file found under workbook/')
  return path.join(WORKBOOK_DIR, match)
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

// Dates in this workbook are stored as text ("2024-09-24", "2026-04-12 18:00").
// exceljs can still hand back a JS Date for date-formatted cells; normalise
// those to the same text shape, using UTC fields so we never shift a day.
function formatDate(d, withTime) {
  const y = d.getUTCFullYear()
  const m = pad2(d.getUTCMonth() + 1)
  const day = pad2(d.getUTCDate())
  const base = `${y}-${m}-${day}`
  if (!withTime) return base
  const hh = pad2(d.getUTCHours())
  const mm = pad2(d.getUTCMinutes())
  return `${base} ${hh}:${mm}`
}

// Normalise an exceljs cell value to plain text (handles rich text and
// formula-result objects) or null for blank/whitespace-only cells.
function cellToText(value, key) {
  if (value === null || value === undefined) return null
  if (value instanceof Date) {
    return formatDate(value, key === 'refundable_until')
  }
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) {
      value = value.richText.map((rt) => rt.text).join('')
    } else if ('result' in value) {
      value = value.result
      if (value instanceof Date) return formatDate(value, key === 'refundable_until')
    } else if ('text' in value) {
      value = value.text
    } else {
      value = String(value)
    }
  }
  const str = String(value)
  const trimmed = str.trim()
  return trimmed === '' ? null : trimmed
}

function coerceNumeric(text) {
  if (text === null) return null
  const n = Number(text)
  if (Number.isNaN(n)) return text
  return n
}

// Read a sheet into an array of { header: text } row objects, applying the
// numeric allow-list, blank->null, and header-order key ordering. Stops at
// the last row that has any non-blank cell (skips empty trailing rows).
function readSheet(workbook, sheetName, numericFields = []) {
  const ws = workbook.getWorksheet(sheetName)
  if (!ws) throw new Error(`Sheet not found: ${sheetName}`)

  const headerRow = ws.getRow(1)
  const headers = []
  for (let c = 1; c <= ws.columnCount; c++) {
    const h = cellToText(headerRow.getCell(c).value, null)
    if (h) headers.push({ col: c, key: h })
  }

  const rows = []
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const obj = {}
    let hasValue = false
    for (const { col, key } of headers) {
      const text = cellToText(row.getCell(col).value, key)
      if (text !== null) hasValue = true
      obj[key] = numericFields.includes(key) ? coerceNumeric(text) : text
    }
    if (!hasValue) continue // skip fully empty trailing rows
    obj.__row = r
    rows.push(obj)
  }
  return rows
}

function splitAccessibility(raw) {
  if (raw === null) return []
  return raw
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function buildOptions(workbook, sheetName, product) {
  const rows = readSheet(workbook, sheetName, NUMERIC_FIELDS[sheetName])
  return rows.map((row) => {
    const sourceRow = row.__row
    delete row.__row
    return {
      ...row,
      product,
      accessibility_flags: splitAccessibility(row.accessibility),
      source_row: sourceRow,
    }
  })
}

// ---- Traveler_Profile / Cold_Start_Profile -> travelers.json ----

function deriveFieldKey(field) {
  return field
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function parseName(value) {
  const m = /^(.*?)\s*\((T-\d+)\)\s*$/.exec(value)
  if (!m) throw new Error(`Could not parse traveler name/id from "${value}"`)
  return { name: m[1].trim(), traveler_id: m[2] }
}

function parseLoyalty(value) {
  if (value === null || value.trim() === '' || /^none declared$/i.test(value.trim())) return []
  return value.split(';').map((entry) => {
    const trimmed = entry.trim()
    const words = trimmed.split(/\s+/)
    const tier = words.pop()
    const supplier = words.join(' ')
    return { supplier, tier }
  })
}

function buildTravelerProfile(workbook, sheetName, historyPrefix) {
  const rows = readSheet(workbook, sheetName, [])
  const fields = rows.map((r) => ({
    field: r.Field,
    value: r.Value,
    how_to_read: r['How to read it'],
  }))

  const nameRow = rows.find((r) => r.Field === 'Name')
  if (!nameRow) throw new Error(`${sheetName}: missing Name row`)
  const { name, traveler_id } = parseName(nameRow.Value)

  const traveler = {
    traveler_id,
    name,
    fields,
    history_prefix: historyPrefix,
    is_cold_start: sheetName === 'Cold_Start_Profile',
  }

  for (const row of rows) {
    if (row.Field === 'Name') continue
    const key = deriveFieldKey(row.Field)
    traveler[key] = row.Value
  }

  const loyaltySource = rows.find((r) => r.Field === 'Loyalty')
  traveler.loyalty_programs = parseLoyalty(loyaltySource ? loyaltySource.Value : null)

  return traveler
}

// ---- Trip_Request -> trip.json (label-driven) ----

const MONTHS = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
}

function parseLongDate(text, context) {
  // e.g. "Monday 30 March 2026"
  const m = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(text)
  if (!m) throw new Error(`mapTripRequest: could not parse date from "${text}" (${context})`)
  const day = Number(m[1])
  const month = MONTHS[m[2].toLowerCase()]
  if (!month) throw new Error(`mapTripRequest: unknown month in "${text}" (${context})`)
  const year = Number(m[3])
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function findRow(rows, matcher, label) {
  const row = rows.find((r) => matcher(r.Field))
  if (!row) throw new Error(`mapTripRequest: could not find row for "${label}"`)
  return row
}

function mapTripRequest(rows) {
  const today = findRow(rows, (f) => /today's date/i.test(f), "Today's date")
  const client = findRow(rows, (f) => /^client$/i.test(f), 'Client')
  const route = findRow(rows, (f) => /^route$/i.test(f), 'Route')
  const outbound = findRow(rows, (f) => /^outbound$/i.test(f), 'Outbound')
  const hotel = findRow(rows, (f) => /^hotel$/i.test(f), 'Hotel')
  const commitment = findRow(rows, (f) => /^commitment$/i.test(f), 'Commitment')
  const groundTransfer = findRow(rows, (f) => /ground transfer/i.test(f), 'Ground transfer')
  const negotiated = findRow(rows, (f) => /negotiated contract/i.test(f), 'Negotiated contract')
  const approval = findRow(rows, (f) => /northstar commission/i.test(f), 'NorthStar commission')

  const todayIso = parseLongDate(today.Value, "Today's date")

  // Route: "SFO to AUS, outbound only"
  const routeMatch = /([A-Z]{3})\s+to\s+([A-Z]{3})/.exec(route.Value)
  if (!routeMatch) throw new Error(`mapTripRequest: could not parse origin/destination from "${route.Value}"`)
  const origin = routeMatch[1]
  const destination = routeMatch[2]

  const outboundIso = parseLongDate(outbound.Value, 'Outbound')

  // Hotel: "13-16 April 2026, 3 nights, downtown Austin"
  const hotelRangeMatch = /(\d{1,2})\s*[–-]\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(hotel.Value)
  if (!hotelRangeMatch) throw new Error(`mapTripRequest: could not parse hotel date range from "${hotel.Value}"`)
  const [, checkinDay, checkoutDay, monthName, hotelYear] = hotelRangeMatch
  const hotelMonth = MONTHS[monthName.toLowerCase()]
  if (!hotelMonth) throw new Error(`mapTripRequest: unknown month in "${hotel.Value}"`)
  const hotelCheckin = `${hotelYear}-${pad2(hotelMonth)}-${pad2(Number(checkinDay))}`
  const hotelCheckout = `${hotelYear}-${pad2(hotelMonth)}-${pad2(Number(checkoutDay))}`

  const nightsMatch = /(\d+)\s+nights/i.exec(hotel.Value)
  if (!nightsMatch) throw new Error(`mapTripRequest: could not parse nights from "${hotel.Value}"`)
  const nights = Number(nightsMatch[1])

  const cityMatch = /downtown\s+(\w+)/i.exec(hotel.Value)
  const city = cityMatch ? cityMatch[1] : null

  // Commitment: "Partner dinner, 18:00 Central, Monday 13 April, downtown Austin"
  const commitmentParts = commitment.Value.split(',').map((s) => s.trim())
  const commitLabel = commitmentParts[0]
  const commitTimeMatch = /(\d{1,2}:\d{2})/.exec(commitment.Value)
  if (!commitTimeMatch) throw new Error(`mapTripRequest: could not parse commitment time from "${commitment.Value}"`)
  const commitTime = commitTimeMatch[1]
  const commitDateMatch = /([A-Za-z]+day)\s+(\d{1,2}\s+[A-Za-z]+)/.exec(commitment.Value)
  if (!commitDateMatch) throw new Error(`mapTripRequest: could not parse commitment date from "${commitment.Value}"`)
  const commitDateIso = parseLongDate(`${commitDateMatch[2]} ${outboundIso.slice(0, 4)}`, 'Commitment')
  const commitLocationMatch = /downtown\s+\w+/i.exec(commitment.Value)
  const commitLocation = commitLocationMatch ? commitLocationMatch[0] : commitmentParts[commitmentParts.length - 1]

  // Ground transfer: "... 35 minutes, USD 118, ..."
  const transferMinMatch = /(\d+)\s+minutes/i.exec(groundTransfer.Value)
  if (!transferMinMatch) throw new Error(`mapTripRequest: could not parse transfer minutes from "${groundTransfer.Value}"`)
  const transferUsdMatch = /USD\s+(\d+)/i.exec(groundTransfer.Value)
  if (!transferUsdMatch) throw new Error(`mapTripRequest: could not parse transfer USD from "${groundTransfer.Value}"`)

  // Negotiated contract: "... Summit Airways ... requires 65% ... at 58% ..."
  const supplierMatch = /corporate fare with ([A-Za-z ]+?)\./.exec(negotiated.Value)
  if (!supplierMatch) throw new Error(`mapTripRequest: could not parse negotiated supplier from "${negotiated.Value}"`)
  const pctMatches = [...negotiated.Value.matchAll(/(\d+)%/g)].map((m) => Number(m[1]))
  if (pctMatches.length < 2) throw new Error(`mapTripRequest: could not parse target/current % from "${negotiated.Value}"`)
  const targetSharePct = pctMatches[0]
  const currentSharePct = pctMatches[1]

  // Approval turnaround: mined from Traveler_Profile in practice, but the
  // exercise's fixed value lives on the Approver profile row, not
  // Trip_Request — "Approvals currently run about one business day."
  // Default to 1 business day.
  const approvalTurnaroundBusinessDays = 1
  // approval row is present to satisfy the label-driven lookup contract but
  // carries no additional structured field beyond documentation text.
  void approval

  // Client: "Vantage Robotics — 4,000 staff, hardware, HQ San Francisco"
  const clientNameMatch = /^([^—-]+)/.exec(client.Value)
  const clientName = clientNameMatch ? clientNameMatch[1].trim() : client.Value

  return {
    today: todayIso,
    origin,
    destination,
    city,
    outbound_date: outboundIso,
    hotel_checkin: hotelCheckin,
    hotel_checkout: hotelCheckout,
    nights,
    depart_timezone: 'PT',
    arrive_timezone: 'CT',
    commitment: {
      label: commitLabel,
      date: commitDateIso,
      time_ct: commitTime,
      location: commitLocation,
      mandatory: null,
    },
    ground_transfer_minutes: Number(transferMinMatch[1]),
    ground_transfer_usd: Number(transferUsdMatch[1]),
    ground_transfer_delay_probability: 0,
    ground_transfer_delay_minutes: 0,
    negotiated_contract: {
      supplier: supplierMatch[1].trim(),
      current_share_pct: currentSharePct,
      target_share_pct: targetSharePct,
    },
    approval_turnaround_business_days: approvalTurnaroundBusinessDays,
    client: { name: clientName },
    raw: rows.map((r) => ({ field: r.Field, value: r.Value, notes: r.Notes })),
  }
}

// ---- main build ----

async function build() {
  const file = findWorkbookFile()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(file)

  const output = {}
  const summary = []

  const air = buildOptions(workbook, 'Air_Options', 'air')
  output['air_options.json'] = air
  summary.push(['air_options.json', air.length])

  const hotel = buildOptions(workbook, 'Hotel_Options', 'hotel')
  output['hotel_options.json'] = hotel
  summary.push(['hotel_options.json', hotel.length])

  const policyRules = readSheet(workbook, 'Policy_Rules', []).map((r) => {
    delete r.__row
    return r
  })
  output['policy_rules.json'] = policyRules
  summary.push(['policy_rules.json', policyRules.length])

  const commercialTerms = readSheet(workbook, 'Commercial_Terms', []).map((r) => {
    delete r.__row
    return r
  })
  output['commercial_terms.json'] = commercialTerms
  summary.push(['commercial_terms.json', commercialTerms.length])

  const dataDictionary = readSheet(workbook, 'Data_Dictionary', []).map((r) => {
    delete r.__row
    return r
  })
  output['data_dictionary.json'] = dataDictionary
  summary.push(['data_dictionary.json', dataDictionary.length])

  const primaryTraveler = buildTravelerProfile(workbook, 'Traveler_Profile', 'H')
  const coldStartTraveler = buildTravelerProfile(workbook, 'Cold_Start_Profile', COLD_START_HISTORY_PREFIX)
  const travelers = {
    [primaryTraveler.traveler_id]: primaryTraveler,
    [coldStartTraveler.traveler_id]: coldStartTraveler,
  }
  output['travelers.json'] = travelers
  summary.push(['travelers.json', Object.keys(travelers).length])

  const historyRows = readSheet(workbook, 'Traveler_History', NUMERIC_FIELDS.Traveler_History).map((row) => {
    delete row.__row
    return {
      ...row,
      traveler_id: row.history_id.startsWith(COLD_START_HISTORY_PREFIX)
        ? coldStartTraveler.traveler_id
        : primaryTraveler.traveler_id,
    }
  })
  output['traveler_history.json'] = historyRows
  summary.push(['traveler_history.json', historyRows.length])

  const tripRows = readSheet(workbook, 'Trip_Request', []).map((r) => {
    delete r.__row
    return r
  })
  const trip = mapTripRequest(tripRows)
  output['trip.json'] = trip
  summary.push(['trip.json', 1])

  if (CHECK) {
    let drift = false
    for (const [filename, content] of Object.entries(output)) {
      const outPath = path.join(DATA_DIR, filename)
      const expected = JSON.stringify(content, null, 2) + '\n'
      let actual = null
      try {
        actual = readFileSync(outPath, 'utf8')
      } catch {
        // file missing counts as drift
      }
      if (actual === expected) {
        console.log(`OK    ${filename}`)
      } else {
        console.log(`DRIFT ${filename}`)
        drift = true
      }
    }
    if (drift) process.exit(1)
    return
  }

  for (const [filename, content] of Object.entries(output)) {
    const outPath = path.join(DATA_DIR, filename)
    writeFileSync(outPath, JSON.stringify(content, null, 2) + '\n')
  }
  for (const [filename, count] of summary) {
    console.log(`${filename}: ${count} row(s)`)
  }
}

build().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
