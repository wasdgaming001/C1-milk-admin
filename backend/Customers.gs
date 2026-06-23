

/**
 * ============================================================================
 * MILK DELIVERY ADMIN — V17 BACKEND
 * PART 1 of 5: CUSTOMER + DELIVERY LOG ACTIONS
 * ============================================================================
 *
 * This file depends on helpers defined in Part 4 (Core Infrastructure):
 *   - respond(success, data, error)        -> wraps output as ContentService JSON
 *   - withLock(fn)                          -> acquires ScriptLock, runs fn, releases
 *   - buildHeaderMap(sheet)                 -> { ColumnName: zeroBasedIndex }
 *   - getSheet(name)                        -> SpreadsheetApp sheet by constant name
 *   - toISO(dateVal)                        -> consistent IST date string
 *   - safeAppend(sheet, rowArray)           -> requires lock held
 *   - writeActivityLog(action, payload, result) -> fire-and-forget audit log
 *   - sanitizeForText(str)                  -> strips HTML/control chars
 *   - normalizePhone(phone)                 -> "91XXXXXXXXXX"
 *   - findRowById(sheet, idCol, idVal)      -> { rowIndex, rowValues } or null
 *   - findRowByColumnValue(sheet, hdr, colName, value) -> helper owned by Part 4
 *
 * Until Part 4 lands, minimal stand-in stubs are provided at the bottom of
 * this file (guarded by `typeof x === 'undefined'`) purely so this part is
 * independently readable/testable. Part 4 will provide the real versions —
 * do not ship both definitions together.
 *
 * Sheet: Customers
 *   CustomerId | Name | DeliveryAddress | Phone | Status | Product |
 *   DailyQty | DeliveryDays | Balance | Version | CreatedAt | UpdatedAt
 *
 * Sheet: DailyLogs
 *   LogId | CustomerId | Date | Product | Qty | Delivered | Note |
 *   CreatedAt | UpdatedAt
 *
 * Sheet: PausePeriods
 *   PauseId | CustomerId | StartDate | EndDate | Reason | CreatedAt
 * ============================================================================
 */

const CUSTOMER_STATUSES = ['Active', 'Paused', 'Inactive'];
const MILK_PRODUCTS = ['Full Cream', 'Toned', 'Double Toned', 'Skimmed', 'Standardised'];
const MAX_DAILY_QTY = 50; // litres/day per customer — sanity cap

// ----------------------------------------------------------------------------
// VALIDATION
// ----------------------------------------------------------------------------

function validateCustomerPayload(payload, isUpdate) {
  const errors = [];

  if (!isUpdate || payload.name !== undefined) {
    if (!payload.name || !String(payload.name).trim()) errors.push('Customer name is required');
    else if (String(payload.name).length > 120) errors.push('Name too long (max 120 chars)');
  }

  if (!isUpdate || payload.deliveryAddress !== undefined) {
    if (!payload.deliveryAddress || !String(payload.deliveryAddress).trim()) errors.push('Delivery address is required');
    else if (String(payload.deliveryAddress).length > 500) errors.push('Address too long (max 500 chars)');
  }

  if (payload.phone) {
    const digits = String(payload.phone).replace(/\D/g, '');
    const isValid10 = digits.length === 10;
    const isValid91 = digits.length === 12 && digits.startsWith('91');
    if (!isValid10 && !isValid91) errors.push('Invalid phone number (use 10-digit Indian number)');
  }

  if (payload.product !== undefined && payload.product !== '') {
    if (MILK_PRODUCTS.indexOf(payload.product) === -1) errors.push('Invalid product: ' + payload.product);
  }

  if (payload.dailyQty !== undefined) {
    const q = Number(payload.dailyQty);
    if (isNaN(q) || q < 0) errors.push('Daily quantity must be a non-negative number');
    else if (q > MAX_DAILY_QTY) errors.push('Daily quantity exceeds maximum (' + MAX_DAILY_QTY + 'L)');
  }

  if (payload.deliveryDays !== undefined) {
    const days = payload.deliveryDays;
    if (!Array.isArray(days)) errors.push('Delivery days must be an array');
    else if (days.some(d => !Number.isInteger(d) || d < 0 || d > 6)) errors.push('Delivery days must be 0–6 (Sun=0 .. Sat=6)');
  }

  if (payload.status !== undefined) {
    if (CUSTOMER_STATUSES.indexOf(payload.status) === -1) errors.push('Invalid status: ' + payload.status);
  }

  return { valid: errors.length === 0, errors };
}

function validateLogPayload(payload) {
  const errors = [];
  if (!payload.customerId) errors.push('customerId is required');
  if (!payload.date || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) errors.push('date must be YYYY-MM-DD');
  if (payload.qty !== undefined) {
    const q = Number(payload.qty);
    if (isNaN(q) || q < 0 || q > MAX_DAILY_QTY) errors.push('Invalid qty');
  }
  if (payload.delivered !== undefined && typeof payload.delivered !== 'boolean') errors.push('delivered must be boolean');
  return { valid: errors.length === 0, errors };
}

// ----------------------------------------------------------------------------
// CUSTOMER ACTIONS
// ----------------------------------------------------------------------------

/**
 * addCustomer — creates a new customer row.
 * Required: name, deliveryAddress
 * Optional: phone, product, dailyQty, deliveryDays (array of 0-6), idempotencyKey
 */
function addCustomer(payload) {
  const v = validateCustomerPayload(payload, false);
  if (!v.valid) return respond(false, null, { code: 'VALIDATION_ERROR', message: v.errors.join('; ') });

  return withLock(function () {
    const sheet = getSheet('CUSTOMERS');
    const hdr = buildHeaderMap(sheet);

    // Idempotency: if a customer with this exact idempotencyKey was already
    // created, return the existing record instead of creating a duplicate.
    if (payload.idempotencyKey) {
      const dup = findRowByColumnValue(sheet, hdr, 'IdempotencyKey', payload.idempotencyKey);
      if (dup) {
        return respond(true, { customerId: dup.rowValues[hdr['CustomerId']], duplicate: true });
      }
    }

    const customerId = 'CUST-' + Utilities.getUuid().substring(0, 8).toUpperCase();
    const now = Utilities.formatDate(new Date(), 'Asia/Kolkata', "yyyy-MM-dd'T'HH:mm:ssXXX");

    const row = [];
    row[hdr['CustomerId']] = customerId;
    row[hdr['Name']] = sanitizeForText(payload.name).trim();
    row[hdr['DeliveryAddress']] = sanitizeForText(payload.deliveryAddress).trim();
    row[hdr['Phone']] = payload.phone ? normalizePhone(payload.phone) : '';
    row[hdr['Status']] = 'Active';
    row[hdr['Product']] = payload.product || 'Full Cream';
    row[hdr['DailyQty']] = payload.dailyQty !== undefined ? Number(payload.dailyQty) : 1;
    row[hdr['DeliveryDays']] = JSON.stringify(payload.deliveryDays || [0, 1, 2, 3, 4, 5, 6]);
    row[hdr['Balance']] = 0;
    row[hdr['Version']] = 1;
    row[hdr['IdempotencyKey']] = payload.idempotencyKey || '';
    row[hdr['CreatedAt']] = now;
    row[hdr['UpdatedAt']] = now;

    safeAppend(sheet, row);
    writeActivityLog('addCustomer', payload, { customerId: customerId });

    return respond(true, { customerId: customerId });
  });
}

/**
 * updateCustomer — partial update of an existing customer.
 * Required: customerId, expectedVersion (Rule 13 — no silent bypass)
 * Optional: any of name, deliveryAddress, phone, product, dailyQty, deliveryDays, status
 */
function updateCustomer(payload) {
  if (!payload.customerId) return respond(false, null, { code: 'VALIDATION_ERROR', message: 'customerId is required' });
  if (payload.expectedVersion === undefined || payload.expectedVersion === null) {
    return respond(false, null, { code: 'VALIDATION_ERROR', message: 'expectedVersion is required for updates' });
  }

  const v = validateCustomerPayload(payload, true);
  if (!v.valid) return respond(false, null, { code: 'VALIDATION_ERROR', message: v.errors.join('; ') });

  return withLock(function () {
    const sheet = getSheet('CUSTOMERS');
    const hdr = buildHeaderMap(sheet);
    const found = findRowById(sheet, hdr['CustomerId'], payload.customerId);

    if (!found) return respond(false, null, { code: 'NOT_FOUND', message: 'Customer not found: ' + payload.customerId });

    const currentVersion = Number(found.rowValues[hdr['Version']]);
    if (currentVersion !== Number(payload.expectedVersion)) {
      return respond(false, null, {
        code: 'VERSION_CONFLICT',
        message: 'Customer was modified by another process',
        currentVersion: currentVersion
      });
    }

    const now = Utilities.formatDate(new Date(), 'Asia/Kolkata', "yyyy-MM-dd'T'HH:mm:ssXXX");
    const updated = found.rowValues.slice();

    if (payload.name !== undefined) updated[hdr['Name']] = sanitizeForText(payload.name).trim();
    if (payload.deliveryAddress !== undefined) updated[hdr['DeliveryAddress']] = sanitizeForText(payload.deliveryAddress).trim();
    if (payload.phone !== undefined) updated[hdr['Phone']] = payload.phone ? normalizePhone(payload.phone) : '';
    if (payload.product !== undefined) updated[hdr['Product']] = payload.product;
    if (payload.dailyQty !== undefined) updated[hdr['DailyQty']] = Number(payload.dailyQty);
    if (payload.deliveryDays !== undefined) updated[hdr['DeliveryDays']] = JSON.stringify(payload.deliveryDays);
    if (payload.status !== undefined) updated[hdr['Status']] = payload.status;

    updated[hdr['Version']] = currentVersion + 1;
    updated[hdr['UpdatedAt']] = now;

    sheet.getRange(found.rowIndex, 1, 1, updated.length).setValues([updated]);
    writeActivityLog('updateCustomer', payload, { customerId: payload.customerId, newVersion: currentVersion + 1 });

    return respond(true, { customerId: payload.customerId, newVersion: currentVersion + 1 });
  });
}

/**
 * deactivateCustomer — soft-delete (sets Status=Inactive). Never physically
 * deletes a customer row outside of eraseAllData (DPDP compliance flow).
 */
function deactivateCustomer(payload) {
  if (!payload.customerId) return respond(false, null, { code: 'VALIDATION_ERROR', message: 'customerId is required' });

  return withLock(function () {
    const sheet = getSheet('CUSTOMERS');
    const hdr = buildHeaderMap(sheet);
    const found = findRowById(sheet, hdr['CustomerId'], payload.customerId);
    if (!found) return respond(false, null, { code: 'NOT_FOUND', message: 'Customer not found' });

    const now = Utilities.formatDate(new Date(), 'Asia/Kolkata', "yyyy-MM-dd'T'HH:mm:ssXXX");
    sheet.getRange(found.rowIndex, hdr['Status'] + 1).setValue('Inactive');
    sheet.getRange(found.rowIndex, hdr['Version'] + 1).setValue(Number(found.rowValues[hdr['Version']]) + 1);
    sheet.getRange(found.rowIndex, hdr['UpdatedAt'] + 1).setValue(now);

    writeActivityLog('deactivateCustomer', payload, { customerId: payload.customerId });
    return respond(true, { customerId: payload.customerId });
  });
}

/**
 * getCustomers — paginated list with optional filters.
 * Optional: status, search, limit (default 50, max 200), offset (default 0)
 */
function getCustomers(payload) {
  const sheet = getSheet('CUSTOMERS');
  const hdr = buildHeaderMap(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return respond(true, { customers: [], total: 0, hasMore: false });

  const allValues = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  const search = (payload.search || '').toLowerCase().trim();
  const statusFilter = payload.status || '';

  let filtered = allValues.filter(row => {
    if (statusFilter && row[hdr['Status']] !== statusFilter) return false;
    if (search) {
      const name = String(row[hdr['Name']] || '').toLowerCase();
      const addr = String(row[hdr['DeliveryAddress']] || '').toLowerCase();
      const phone = String(row[hdr['Phone']] || '');
      if (name.indexOf(search) === -1 && addr.indexOf(search) === -1 && phone.indexOf(search) === -1) return false;
    }
    return true;
  });

  const total = filtered.length;
  const limit = Math.min(Number(payload.limit) || 50, 200);
  const offset = Number(payload.offset) || 0;
  const page = filtered.slice(offset, offset + limit);

  const customers = page.map(row => ({
    customerId: row[hdr['CustomerId']],
    name: row[hdr['Name']],
    deliveryAddress: row[hdr['DeliveryAddress']],
    phone: row[hdr['Phone']],
    status: row[hdr['Status']],
    product: row[hdr['Product']],
    dailyQty: row[hdr['DailyQty']],
    deliveryDays: safeJsonParse(row[hdr['DeliveryDays']], []),
    balance: row[hdr['Balance']],
    version: row[hdr['Version']],
  }));

  return respond(true, { customers: customers, total: total, hasMore: offset + limit < total });
}

// ----------------------------------------------------------------------------
// PAUSE PERIOD ACTIONS
// ----------------------------------------------------------------------------

/**
 * addPausePeriod — records a pause window and sets customer Status=Paused.
 * Required: customerId, startDate (YYYY-MM-DD)
 * Optional: endDate, reason
 */
function addPausePeriod(payload) {
  if (!payload.customerId) return respond(false, null, { code: 'VALIDATION_ERROR', message: 'customerId is required' });
  if (!payload.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(payload.startDate)) {
    return respond(false, null, { code: 'VALIDATION_ERROR', message: 'startDate must be YYYY-MM-DD' });
  }
  if (payload.endDate && payload.endDate < payload.startDate) {
    return respond(false, null, { code: 'VALIDATION_ERROR', message: 'endDate cannot be before startDate' });
  }

  return withLock(function () {
    const custSheet = getSheet('CUSTOMERS');
    const custHdr = buildHeaderMap(custSheet);
    const custRow = findRowById(custSheet, custHdr['CustomerId'], payload.customerId);
    if (!custRow) return respond(false, null, { code: 'NOT_FOUND', message: 'Customer not found' });

    const pauseSheet = getSheet('PAUSE_PERIODS');
    const pauseHdr = buildHeaderMap(pauseSheet);
    const pauseId = 'PAUSE-' + Utilities.getUuid().substring(0, 8).toUpperCase();
    const now = Utilities.formatDate(new Date(), 'Asia/Kolkata', "yyyy-MM-dd'T'HH:mm:ssXXX");

    const row = [];
    row[pauseHdr['PauseId']] = pauseId;
    row[pauseHdr['CustomerId']] = payload.customerId;
    row[pauseHdr['StartDate']] = payload.startDate;
    row[pauseHdr['EndDate']] = payload.endDate || '';
    row[pauseHdr['Reason']] = sanitizeForText(payload.reason || '');
    row[pauseHdr['CreatedAt']] = now;

    safeAppend(pauseSheet, row);

    // Only flip status to Paused if the pause window covers today
    const today = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
    const coversToday = payload.startDate <= today && (!payload.endDate || payload.endDate >= today);
    if (coversToday) {
      custSheet.getRange(custRow.rowIndex, custHdr['Status'] + 1).setValue('Paused');
      custSheet.getRange(custRow.rowIndex, custHdr['Version'] + 1).setValue(Number(custRow.rowValues[custHdr['Version']]) + 1);
      custSheet.getRange(custRow.rowIndex, custHdr['UpdatedAt'] + 1).setValue(now);
    }

    writeActivityLog('addPausePeriod', payload, { pauseId: pauseId });
    return respond(true, { pauseId: pauseId, customerStatusChanged: coversToday });
  });
}

// ----------------------------------------------------------------------------
// DELIVERY LOG ACTIONS
// ----------------------------------------------------------------------------

/**
 * updateLogEntry — toggles delivered/note for a single existing log row.
 * Required: logId
 * Optional: delivered (boolean), note, qty
 */
function updateLogEntry(payload) {
  if (!payload.logId) return respond(false, null, { code: 'VALIDATION_ERROR', message: 'logId is required' });

  return withLock(function () {
    const sheet = getSheet('DAILY_LOGS');
    const hdr = buildHeaderMap(sheet);
    const found = findRowById(sheet, hdr['LogId'], payload.logId);
    if (!found) return respond(false, null, { code: 'NOT_FOUND', message: 'Log entry not found' });

    const now = Utilities.formatDate(new Date(), 'Asia/Kolkata', "yyyy-MM-dd'T'HH:mm:ssXXX");
    if (payload.delivered !== undefined) sheet.getRange(found.rowIndex, hdr['Delivered'] + 1).setValue(!!payload.delivered);
    if (payload.note !== undefined) sheet.getRange(found.rowIndex, hdr['Note'] + 1).setValue(sanitizeForText(payload.note));
    if (payload.qty !== undefined) {
      const q = Number(payload.qty);
      if (isNaN(q) || q < 0 || q > MAX_DAILY_QTY) return respond(false, null, { code: 'VALIDATION_ERROR', message: 'Invalid qty' });
      sheet.getRange(found.rowIndex, hdr['Qty'] + 1).setValue(q);
    }
    sheet.getRange(found.rowIndex, hdr['UpdatedAt'] + 1).setValue(now);

    writeActivityLog('updateLogEntry', payload, { logId: payload.logId });
    return respond(true, { logId: payload.logId });
  });
}

/**
 * bulkUpsertLogs — generates/updates delivery log rows for a given date,
 * one per active customer scheduled to deliver that day-of-week. Skips
 * customers with an active pause covering that date.
 * Required: date (YYYY-MM-DD)
 */
function bulkUpsertLogs(payload) {
  if (!payload.date || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
    return respond(false, null, { code: 'VALIDATION_ERROR', message: 'date must be YYYY-MM-DD' });
  }

  return withLock(function () {
    const custSheet = getSheet('CUSTOMERS');
    const custHdr = buildHeaderMap(custSheet);
    const custLastRow = custSheet.getLastRow();
    if (custLastRow < 2) return respond(true, { created: 0, skipped: 0 });

    const customers = custSheet.getRange(2, 1, custLastRow - 1, custSheet.getLastColumn()).getValues();

    const pauseSheet = getSheet('PAUSE_PERIODS');
    const pauseHdr = buildHeaderMap(pauseSheet);
    const pauseLastRow = pauseSheet.getLastRow();
    const pauses = pauseLastRow >= 2
      ? pauseSheet.getRange(2, 1, pauseLastRow - 1, pauseSheet.getLastColumn()).getValues()
      : [];

    const isPausedOn = (customerId, date) => pauses.some(p =>
      p[pauseHdr['CustomerId']] === customerId &&
      p[pauseHdr['StartDate']] <= date &&
      (!p[pauseHdr['EndDate']] || p[pauseHdr['EndDate']] >= date)
    );

    const dow = new Date(payload.date + 'T00:00:00').getDay();
    const logSheet = getSheet('DAILY_LOGS');
    const logHdr = buildHeaderMap(logSheet);

    // Avoid duplicate logs for the same customer+date if this is re-run
    const existingLastRow = logSheet.getLastRow();
    const existingKeys = new Set();
    if (existingLastRow >= 2) {
      const existing = logSheet.getRange(2, 1, existingLastRow - 1, logSheet.getLastColumn()).getValues();
      existing.forEach(r => existingKeys.add(r[logHdr['CustomerId']] + '|' + r[logHdr['Date']]));
    }

    const now = Utilities.formatDate(new Date(), 'Asia/Kolkata', "yyyy-MM-dd'T'HH:mm:ssXXX");
    const newRows = [];
    let skipped = 0;

    customers.forEach(c => {
      const customerId = c[custHdr['CustomerId']];
      const status = c[custHdr['Status']];
      const days = safeJsonParse(c[custHdr['DeliveryDays']], []);

      if (status !== 'Active') { skipped++; return; }
      if (days.indexOf(dow) === -1) { skipped++; return; }
      if (isPausedOn(customerId, payload.date)) { skipped++; return; }
      if (existingKeys.has(customerId + '|' + payload.date)) { skipped++; return; }

      const row = [];
      row[logHdr['LogId']] = 'LOG-' + Utilities.getUuid().substring(0, 8).toUpperCase();
      row[logHdr['CustomerId']] = customerId;
      row[logHdr['Date']] = payload.date;
      row[logHdr['Product']] = c[custHdr['Product']];
      row[logHdr['Qty']] = c[custHdr['DailyQty']];
      row[logHdr['Delivered']] = true;
      row[logHdr['Note']] = '';
      row[logHdr['CreatedAt']] = now;
      row[logHdr['UpdatedAt']] = now;
      newRows.push(row);
    });

    if (newRows.length > 0) {
      logSheet.getRange(logSheet.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
    }

    writeActivityLog('bulkUpsertLogs', payload, { created: newRows.length, skipped: skipped });
    return respond(true, { created: newRows.length, skipped: skipped });
  });
}

/**
 * getDailyLogs — returns logs for a given date (or date range).
 * Optional: date (single day), startDate+endDate (range), customerId
 */
function getDailyLogs(payload) {
  const sheet = getSheet('DAILY_LOGS');
  const hdr = buildHeaderMap(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return respond(true, { logs: [] });

  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  const filtered = values.filter(row => {
    const date = row[hdr['Date']];
    if (payload.date && date !== payload.date) return false;
    if (payload.startDate && date < payload.startDate) return false;
    if (payload.endDate && date > payload.endDate) return false;
    if (payload.customerId && row[hdr['CustomerId']] !== payload.customerId) return false;
    return true;
  });

  const logs = filtered.map(row => ({
    logId: row[hdr['LogId']],
    customerId: row[hdr['CustomerId']],
    date: row[hdr['Date']],
    product: row[hdr['Product']],
    qty: row[hdr['Qty']],
    delivered: !!row[hdr['Delivered']],
    note: row[hdr['Note']],
  }));

  return respond(true, { logs: logs });
}

// NOTE: findRowByColumnValue() is intentionally NOT defined in this file.
// It is owned by Part 4 (Core.gs). Declaring it here would cause a duplicate
// function declaration crash at Apps Script deployment time.

// ----------------------------------------------------------------------------
// TEMPORARY STUBS — REMOVE ONCE PART 4 (CORE INFRASTRUCTURE) IS MERGED
// These let this file be pasted into a fresh Apps Script project and at
// least syntax-check / partially run before Part 4 lands.
// ----------------------------------------------------------------------------

if (typeof respond === 'undefined') {
  function respond(success, data, error) {
    const body = { success: success };
    if (success) body.data = data || {};
    else body.error = error || { code: 'UNKNOWN_ERROR', message: 'Unspecified error' };
    return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
  }
}

if (typeof withLock === 'undefined') {
  function withLock(fn) {
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
      return fn();
    } catch (e) {
      return respond(false, null, { code: 'LOCK_ERROR', message: e.message });
    } finally {
      lock.releaseLock();
    }
  }
}

if (typeof buildHeaderMap === 'undefined') {
  function buildHeaderMap(sheet) {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const map = {};
    headers.forEach((h, i) => { map[String(h).trim()] = i; });
    return map;
  }
}

if (typeof getSheet === 'undefined') {
  const SHEET_NAMES_STUB = {
    CUSTOMERS: 'Customers',
    DAILY_LOGS: 'DailyLogs',
    PAUSE_PERIODS: 'PausePeriods',
  };
  function getSheet(constName) {
    const name = SHEET_NAMES_STUB[constName] || constName;
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
    if (!sheet) throw new Error('Sheet not found: ' + name);
    return sheet;
  }
}

if (typeof safeAppend === 'undefined') {
  function safeAppend(sheet, rowArray) {
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, rowArray.length).setValues([rowArray]);
  }
}

if (typeof findRowById === 'undefined') {
  function findRowById(sheet, idColIdx, idVal) {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;
    const values = sheet.getRange(2, idColIdx + 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < values.length; i++) {
      if (values[i][0] === idVal) {
        const fullRow = sheet.getRange(i + 2, 1, 1, sheet.getLastColumn()).getValues()[0];
        return { rowIndex: i + 2, rowValues: fullRow };
      }
    }
    return null;
  }
}

if (typeof writeActivityLog === 'undefined') {
  function writeActivityLog(action, payload, result) {
    try {
      Logger.log('[ActivityLog] ' + action + ' ' + JSON.stringify(result));
    } catch (e) { /* never throw from logging */ }
  }
}

if (typeof sanitizeForText === 'undefined') {
  function sanitizeForText(str) {
    return String(str == null ? '' : str).replace(/[<>]/g, '');
  }
}

if (typeof normalizePhone === 'undefined') {
  function normalizePhone(phone) {
    let digits = String(phone).replace(/\D/g, '');
    if (digits.length === 10) digits = '91' + digits;
    return digits;
  }
}

if (typeof safeJsonParse === 'undefined') {
  function safeJsonParse(str, fallback) {
    try { return JSON.parse(str); } catch (e) { return fallback; }
  }
}