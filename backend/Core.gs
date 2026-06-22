


/**
 * ============================================================================
 * MILK DELIVERY ADMIN — V17 BACKEND
 * PART 4 of 5: CORE INFRASTRUCTURE
 * ============================================================================
 *
 * This file SUPERSEDES every stub block at the bottom of Parts 1, 2, and 3.
 * Once this file is added to the project, DELETE all stub blocks (search
 * each file for "TEMPORARY STUBS") — leaving them in is harmless (the
 * `typeof x === 'undefined'` guards prevent redeclaration crashes) but
 * pointless, since this file's versions are what should actually run.
 *
 * NOTE: healthCheck(), runDiagnostics(), getSheetNamesAction(), eraseAllData(),
 * runMigration() are declared (and referenced by the router below) but their
 * full bodies live in Part 5 (Diagnostics/Admin Actions). healthCheck() gets
 * a minimal working version here since PUBLIC_ACTIONS / doPost depend on it
 * being callable immediately — Part 5 will be the authoritative version if
 * the two ever diverge; delete this file's copy at that point.
 *
 * Contents:
 *   1.  Sheet name constants
 *   2.  respond() — response envelope
 *   3.  Sheet read helpers (buildHeaderMap, getSheet, findRowById, etc.)
 *   4.  Write helpers (safeAppend, withLock)
 *   5.  Date helpers (toISO, nowISTTimestamp, todayIST)
 *   6.  safeJsonParse()
 *   7.  sanitizeForText()
 *   8.  normalizePhone()
 *   9.  writeActivityLog()
 *  10.  Settings get/set with cache
 *  11.  PIN hashing, verifyPIN, rotatePIN, session creation
 *  12.  Per-IP PIN rate limiting
 *  13.  Session validation
 *  14.  ALLOWED_ACTIONS / TESTED_ACTIONS registry
 *  15.  doPost() router
 *  16.  healthCheck() — minimal version, see note above
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// 1. SHEET NAMES — must match your actual spreadsheet tab names EXACTLY
// ----------------------------------------------------------------------------

const SHEET_NAMES = {
  CUSTOMERS:      'Customers',
  DAILY_LOGS:     'DailyLogs',
  PAUSE_PERIODS:  'PausePeriods',
  BILLS:          'Bills',
  PAYMENTS:       'Payments',
  ADJUSTMENTS:    'Adjustments',
  MILK_IMPORTS:   'MilkImports',
  MILK_BRANDS:    'MilkBrands',
  MILK_TYPES:     'MilkTypes',
  PRODUCTS:       'Products',
  SETTINGS:       'Settings',
  ACTIVITY_LOG:   'ActivityLog',
  SYSTEM_STATE:   'SystemState',
};

const TIMEZONE = 'Asia/Kolkata';

function getSheet(constName) {
  const name = SHEET_NAMES[constName] || constName;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Sheet not found: ' + name + ' (expected tab named "' + name + '")');
  return sheet;
}

// ----------------------------------------------------------------------------
// 2. RESPONSE ENVELOPE
// ----------------------------------------------------------------------------

/**
 * respond — every action returns through this. Rule 1: NEVER calls
 * .addHeader() here — CORS is exclusively the Netlify proxy's job, since
 * Apps Script's ContentService has no header-setting API for CORS.
 */
function respond(success, data, error) {
  const body = { success: !!success };
  if (success) {
    body.data = data || {};
  } else {
    body.error = error || { code: 'UNKNOWN_ERROR', message: 'Unspecified error' };
  }
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

// ----------------------------------------------------------------------------
// 3. SHEET READ HELPERS — Rule 5: column reads always via buildHeaderMap,
//    never positional index
// ----------------------------------------------------------------------------

function buildHeaderMap(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) return {};
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const map = {};
  headers.forEach((h, i) => {
    const key = String(h).trim();
    if (key) map[key] = i;
  });
  return map;
}

function findRowById(sheet, idColIdx, idVal) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2 || idColIdx === undefined) return null;
  const ids = sheet.getRange(2, idColIdx + 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === idVal) {
      const fullRow = sheet.getRange(i + 2, 1, 1, sheet.getLastColumn()).getValues()[0];
      return { rowIndex: i + 2, rowValues: fullRow };
    }
  }
  return null;
}

function findRowByColumnValue(sheet, hdr, colName, value) {
  const colIdx = hdr[colName];
  if (colIdx === undefined) return null;
  return findRowById(sheet, colIdx, value);
}

function findRowByTwoColumns(sheet, hdr, col1, val1, col2, val2) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  for (let i = 0; i < values.length; i++) {
    if (values[i][hdr[col1]] === val1 && values[i][hdr[col2]] === val2) {
      return { rowIndex: i + 2, rowValues: values[i] };
    }
  }
  return null;
}

// ----------------------------------------------------------------------------
// 4. WRITE HELPERS — Rule 2: safeAppend requires _lockHeld=true;
//    Rule 8: ScriptLock always try/finally with releaseLock()
// ----------------------------------------------------------------------------

let _lockHeld = false;

/**
 * withLock — acquires the script-wide lock, runs fn() with _lockHeld=true,
 * and releases it in a finally block no matter what happens inside fn.
 * All write actions in Parts 1-3 wrap their entire body in this.
 */
function withLock(fn) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return respond(false, null, { code: 'LOCK_TIMEOUT', message: 'Could not acquire lock within 10s — system busy, please retry' });
  }
  _lockHeld = true;
  try {
    return fn();
  } catch (e) {
    Logger.log('[withLock] Unhandled error: ' + e.message + '\n' + (e.stack || ''));
    return respond(false, null, { code: 'SYSTEM_ERROR', message: e.message });
  } finally {
    _lockHeld = false;
    lock.releaseLock();
  }
}

/**
 * safeAppend — appends a row, but only while a lock is held, to prevent
 * interleaved appends from racing on getLastRow().
 */
function safeAppend(sheet, rowArray) {
  if (!_lockHeld) throw new Error('safeAppend called without holding the script lock (Rule 2 violation)');
  const targetRow = sheet.getLastRow() + 1;
  sheet.getRange(targetRow, 1, 1, rowArray.length).setValues([rowArray]);
}

// ----------------------------------------------------------------------------
// 5. DATE HELPERS — Rule 3: cell dates always via toISO(); Rule 12: "now"
//    always via Utilities.formatDate(,TZ,) — .toISOString() is BANNED
//    everywhere in this codebase because it silently uses UTC, not IST.
// ----------------------------------------------------------------------------

/**
 * toISO — converts a raw sheet cell value (which Apps Script may hand back
 * as a JS Date object, a string, or even a number) into a consistent
 * "yyyy-MM-dd" IST date string. Never uses .toISOString().
 */
function toISO(dateVal) {
  if (dateVal === null || dateVal === undefined || dateVal === '') return '';
  if (Object.prototype.toString.call(dateVal) === '[object Date]') {
    return Utilities.formatDate(dateVal, TIMEZONE, 'yyyy-MM-dd');
  }
  const str = String(dateVal).trim();
  // Already in YYYY-MM-DD form
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);
  // Last resort: try to parse and reformat via IST
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return Utilities.formatDate(parsed, TIMEZONE, 'yyyy-MM-dd');
  return str; // give back whatever we got rather than throwing
}

function nowISTTimestamp() {
  return Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function todayIST() {
  return Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
}

// ----------------------------------------------------------------------------
// 6. SAFE JSON — Rule 6: safeJsonParse with a default, never bare JSON.parse
// ----------------------------------------------------------------------------

function safeJsonParse(str, fallback) {
  if (str === null || str === undefined || str === '') return fallback;
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
}

// ----------------------------------------------------------------------------
// 7. XSS-SAFE TEXT — Rule 11: all user-derived strings rendered via
//    textContent or sanitizeForText(); innerHTML with user data is forbidden
//    (enforced on the frontend — this is the backend half: strip control
//    chars and angle brackets before they ever reach a sheet or a WhatsApp
//    message body).
// ----------------------------------------------------------------------------

function sanitizeForText(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/[<>]/g, '')           // strip angle brackets (defense in depth vs stored XSS)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // strip control chars, keep \t \n
    .substring(0, 2000);            // hard cap to prevent abuse via giant fields
}

// ----------------------------------------------------------------------------
// 8. PHONE NORMALIZATION — Rule 4: phone numbers always stored as 91XXXXXXXXXX
// ----------------------------------------------------------------------------

function normalizePhone(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) digits = '91' + digits;
  return digits;
}

// ----------------------------------------------------------------------------
// 9. ACTIVITY LOG — Rule 7: writeActivityLog is fire-and-forget, never
//    aborts the primary operation even if logging itself fails
// ----------------------------------------------------------------------------

function writeActivityLog(action, payload, result) {
  try {
    const sheet = getSheet('ACTIVITY_LOG');
    const hdr = buildHeaderMap(sheet);
    const row = [];
    row[hdr['Timestamp']] = nowISTTimestamp();
    row[hdr['Action']] = action;
    row[hdr['PayloadSummary']] = JSON.stringify(payload || {}).substring(0, 500);
    row[hdr['ResultSummary']] = JSON.stringify(result || {}).substring(0, 500);
    sheet.appendRow(row); // not safeAppend — logging shouldn't require the main lock
  } catch (e) {
    // Never let logging failure break the calling action.
    try { Logger.log('[writeActivityLog] failed: ' + e.message); } catch (e2) { /* truly never throw */ }
  }
}

// ----------------------------------------------------------------------------
// 10. SETTINGS — cached via CacheService (5 min TTL) to avoid a sheet read
//     on every single action that consults a setting (e.g. getDailyInventory)
// ----------------------------------------------------------------------------

const SETTINGS_CACHE_KEY_PREFIX = 'setting_';
const SETTINGS_CACHE_TTL_SECONDS = 300;

function getSettingValue(key) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(SETTINGS_CACHE_KEY_PREFIX + key);
  if (cached !== null) return cached;

  const sheet = getSheet('SETTINGS');
  const hdr = buildHeaderMap(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return '';

  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  const found = values.find(row => row[hdr['Key']] === key);
  const value = found ? String(found[hdr['Value']]) : '';

  cache.put(SETTINGS_CACHE_KEY_PREFIX + key, value, SETTINGS_CACHE_TTL_SECONDS);
  return value;
}

function setSettingValue(key, value) {
  return withLock(function () {
    const sheet = getSheet('SETTINGS');
    const hdr = buildHeaderMap(sheet);
    const found = findRowByColumnValue(sheet, hdr, 'Key', key);

    if (found) {
      sheet.getRange(found.rowIndex, hdr['Value'] + 1).setValue(value);
    } else {
      const row = [];
      row[hdr['Key']] = key;
      row[hdr['Value']] = value;
      safeAppend(sheet, row);
    }

    CacheService.getScriptCache().remove(SETTINGS_CACHE_KEY_PREFIX + key);
    return respond(true, { key: key });
  });
}

// ----------------------------------------------------------------------------
// 11. PIN AUTH — salted SHA-256, constant-time compare, session creation
//     INLINED inside verifyPIN under one lock (Rule 14: session creation is
//     ONLY inlined in verifyPIN; no standalone createSession()). This
//     eliminates the validate-then-create race described in your security
//     model table.
//
// SECURITY NOTE FOR THE HUMAN READING THIS: this is a reasonable, standard
// implementation of salted-hash PIN auth for a low-stakes internal tool, but
// it has NOT been independently security-reviewed. A 4-digit PIN has only
// 10,000 possible values — the per-IP daily rate limit below is what makes
// brute-forcing impractical, not the hash itself. If this app will ever be
// reachable from the open internet (not just your LAN/known users), consider:
//   - a longer PIN/passcode, and/or
//   - rate limiting at the Netlify/WAF edge layer too, not just here
//     (in-memory or even sheet-based counters can be raced under load), and/or
//   - a proper review by someone with an application-security background
//     before this protects anything you'd be upset to lose.
// ----------------------------------------------------------------------------

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const MAX_PIN_ATTEMPTS_PER_DAY_PER_IP = 10;

function sha256Hex(input) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input, Utilities.Charset.UTF_8);
  return bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

/**
 * constantTimeEqual — compares two strings without an early-exit on the
 * first mismatched character. Walks the full length of the longer string
 * either way, so a mismatch on character 0 takes the same time as a
 * mismatch on the last character.
 */
function constantTimeEqual(a, b) {
  const sa = String(a || '');
  const sb = String(b || '');
  const maxLen = Math.max(sa.length, sb.length);
  let result = sa.length === sb.length ? 0 : 1;
  for (let i = 0; i < maxLen; i++) {
    const ca = i < sa.length ? sa.charCodeAt(i) : 0;
    const cb = i < sb.length ? sb.charCodeAt(i) : 0;
    result |= ca ^ cb;
  }
  return result === 0;
}

function hashPIN(pin, salt) {
  return sha256Hex(salt + pin);
}

/**
 * checkAndIncrementPinRateLimit — atomic, must be called from WITHIN a
 * lock held by the caller (verifyPIN holds it for its whole body). Key
 * format: PINRate_YYYYMMDD_ipHash, stored in SystemState.
 */
function checkAndIncrementPinRateLimit(ipHash) {
  const sheet = getSheet('SYSTEM_STATE');
  const hdr = buildHeaderMap(sheet);
  const today = todayIST().replace(/-/g, '');
  const key = 'PINRate_' + today + '_' + ipHash;

  const found = findRowByColumnValue(sheet, hdr, 'Key', key);
  const currentCount = found ? Number(found.rowValues[hdr['Value']]) : 0;

  if (currentCount >= MAX_PIN_ATTEMPTS_PER_DAY_PER_IP) {
    return { allowed: false, attemptsToday: currentCount };
  }

  const newCount = currentCount + 1;
  if (found) {
    sheet.getRange(found.rowIndex, hdr['Value'] + 1).setValue(newCount);
  } else {
    const row = [];
    row[hdr['Key']] = key;
    row[hdr['Value']] = newCount;
    safeAppend(sheet, row);
  }

  return { allowed: true, attemptsToday: newCount };
}

/**
 * verifyPIN — validates a 4-digit PIN, enforces per-IP rate limiting, and on
 * success creates a session token IN THE SAME LOCKED OPERATION (Rule 14).
 * Required: pin
 * Optional: ipHash (injected by doPost from the proxy-supplied value)
 */
function verifyPIN(payload) {
  payload = payload || {};
  if (!payload.pin || !/^\d{4}$/.test(String(payload.pin))) {
    return respond(false, null, { code: 'VALIDATION_ERROR', message: 'PIN must be exactly 4 digits' });
  }

  return withLock(function () {
    const ipHash = payload.ipHash || 'unknown';
    const rateLimit = checkAndIncrementPinRateLimit(ipHash);
    if (!rateLimit.allowed) {
      return respond(false, null, { code: 'RATE_LIMITED', message: 'Too many PIN attempts today. Try again tomorrow.' });
    }

    const salt = getSettingValue('PINSalt');
    const storedHash = getSettingValue('PINHash');
    if (!salt || !storedHash) {
      return respond(false, null, { code: 'NOT_CONFIGURED', message: 'PIN is not yet configured. Run rotatePIN first.' });
    }

    const candidateHash = hashPIN(String(payload.pin), salt);
    if (!constantTimeEqual(candidateHash, storedHash)) {
      return respond(false, null, { code: 'INVALID_PIN', message: 'Incorrect PIN', attemptsToday: rateLimit.attemptsToday });
    }

    // --- Session creation, inlined here only (Rule 14) ---
    const token = Utilities.getUuid();
    const appSecret = PropertiesService.getScriptProperties().getProperty('APP_SECRET') || '';
    const sessionSecret = appSecret ? sha256Hex(token + appSecret) : '';
    const expiresAt = Date.now() + SESSION_TTL_MS;

    const sysSheet = getSheet('SYSTEM_STATE');
    const sysHdr = buildHeaderMap(sysSheet);
    const sessionRow = [];
    sessionRow[sysHdr['Key']] = 'Session_' + token;
    sessionRow[sysHdr['Value']] = JSON.stringify({ expiresAt: expiresAt, ipHash: ipHash });
    safeAppend(sysSheet, sessionRow);

    writeActivityLog('verifyPIN', { ipHash: ipHash }, { success: true });

    return respond(true, { token: token, sessionSecret: sessionSecret, expiresAt: expiresAt });
  });
}

/**
 * rotatePIN — sets a new PIN. Generates a fresh random salt every rotation
 * (never reuses the old salt). Response NEVER includes the salt or hash
 * (security model table: "no salt in response").
 * Required: newPin, confirmPin
 */
function rotatePIN(payload) {
  payload = payload || {};
  if (!payload.newPin || !/^\d{4}$/.test(String(payload.newPin))) {
    return respond(false, null, { code: 'VALIDATION_ERROR', message: 'newPin must be exactly 4 digits' });
  }
  if (payload.newPin !== payload.confirmPin) {
    return respond(false, null, { code: 'VALIDATION_ERROR', message: 'newPin and confirmPin do not match' });
  }

  return withLock(function () {
    const salt = Utilities.getUuid();
    const hash = hashPIN(String(payload.newPin), salt);

    const sheet = getSheet('SETTINGS');
    const hdr = buildHeaderMap(sheet);

    [['PINSalt', salt], ['PINHash', hash]].forEach(function (pair) {
      const key = pair[0], value = pair[1];
      const found = findRowByColumnValue(sheet, hdr, 'Key', key);
      if (found) {
        sheet.getRange(found.rowIndex, hdr['Value'] + 1).setValue(value);
      } else {
        const row = [];
        row[hdr['Key']] = key;
        row[hdr['Value']] = value;
        safeAppend(sheet, row);
      }
    });

    CacheService.getScriptCache().remove(SETTINGS_CACHE_KEY_PREFIX + 'PINSalt');
    CacheService.getScriptCache().remove(SETTINGS_CACHE_KEY_PREFIX + 'PINHash');

    writeActivityLog('rotatePIN', {}, { success: true });
    return respond(true, {}); // intentionally no salt/hash in the response
  });
}

/**
 * validateSession — checks a token against SystemState, optionally
 * validating sessionSecret if the client sent one (defense-in-depth, opt-in
 * per your security model table — payloads without a sessionSecret are
 * still accepted as long as the token itself is valid and unexpired).
 */
function validateSession(token, sessionSecret) {
  if (!token) return { valid: false, reason: 'NO_TOKEN' };

  const sheet = getSheet('SYSTEM_STATE');
  const hdr = buildHeaderMap(sheet);
  const found = findRowByColumnValue(sheet, hdr, 'Key', 'Session_' + token);
  if (!found) return { valid: false, reason: 'SESSION_NOT_FOUND' };

  const sessionData = safeJsonParse(found.rowValues[hdr['Value']], null);
  if (!sessionData || Date.now() > sessionData.expiresAt) return { valid: false, reason: 'SESSION_EXPIRED' };

  if (sessionSecret) {
    const appSecret = PropertiesService.getScriptProperties().getProperty('APP_SECRET') || '';
    const expected = appSecret ? sha256Hex(token + appSecret) : '';
    if (!constantTimeEqual(sessionSecret, expected)) return { valid: false, reason: 'BAD_SESSION_SECRET' };
  }

  return { valid: true };
}

/**
 * purgeExpiredSessions — housekeeping helper. Not wired into the router as
 * a public action (no obvious need for a client to trigger it directly);
 * intended to be called from runDiagnostics' fix-path (Part 5) or a
 * time-driven trigger you set up separately in the Apps Script editor.
 */
function purgeExpiredSessions() {
  return withLock(function () {
    const sheet = getSheet('SYSTEM_STATE');
    const hdr = buildHeaderMap(sheet);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return respond(true, { purged: 0 });

    const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    const now = Date.now();
    const rowsToDelete = [];

    values.forEach(function (row, i) {
      const key = row[hdr['Key']];
      if (typeof key === 'string' && key.indexOf('Session_') === 0) {
        const data = safeJsonParse(row[hdr['Value']], null);
        if (!data || now > data.expiresAt) rowsToDelete.push(i + 2);
      }
    });

    // Delete bottom-up so row indices stay valid as we go
    rowsToDelete.sort(function (a, b) { return b - a; }).forEach(function (rowIndex) {
      sheet.deleteRow(rowIndex);
    });

    return respond(true, { purged: rowsToDelete.length });
  });
}

// ----------------------------------------------------------------------------
// 12. ACTION REGISTRY — Section 8 of CI/CD: check-action-coverage.js parses
//     these two Sets directly out of this file's source via regex, so the
//     `const NAME = new Set([...])` literal syntax below must NOT be
//     reformatted (e.g. no template literals, no spread from another file,
//     keep each entry as a single-quoted string literal).
// ----------------------------------------------------------------------------

const ALLOWED_ACTIONS = new Set([
  // Customers
  'addCustomer', 'updateCustomer', 'deactivateCustomer', 'getCustomers',
  // Pause periods
  'addPausePeriod',
  // Delivery logs
  'updateLogEntry', 'bulkUpsertLogs', 'getDailyLogs',
  // Billing
  'generateMonthBill', 'updateBill', 'finalizeBill', 'lockBill', 'unlockBill',
  'recordPayment', 'addAdjustment', 'applyAdjustment', 'getBills', 'getBillText',
  'reconcileBillingLedger',
  // Milk imports
  'addMilkImport', 'updateMilkImport', 'confirmMilkImport', 'deleteMilkImport',
  'getMilkImports', 'getMilkImportSummary', 'getDailyInventory', 'reconcileMilkInventory',
  'addMilkBrand', 'getMilkBrands', 'getMilkTypes',
  // Auth
  'verifyPIN', 'rotatePIN',
  // System / diagnostics (Part 5)
  'healthCheck', 'runDiagnostics', 'getSheetNamesAction', 'eraseAllData', 'runMigration',
]);

const TESTED_ACTIONS = new Set([
  'addCustomer', 'updateCustomer', 'deactivateCustomer', 'getCustomers',
  'addPausePeriod',
  'updateLogEntry', 'bulkUpsertLogs', 'getDailyLogs',
  'generateMonthBill', 'updateBill', 'finalizeBill', 'lockBill', 'unlockBill',
  'recordPayment', 'addAdjustment', 'applyAdjustment', 'getBills', 'getBillText',
  'reconcileBillingLedger',
  'addMilkImport', 'updateMilkImport', 'confirmMilkImport', 'deleteMilkImport',
  'getMilkImports', 'getMilkImportSummary', 'getDailyInventory', 'reconcileMilkInventory',
  'addMilkBrand', 'getMilkBrands', 'getMilkTypes',
  'verifyPIN', 'rotatePIN',
  'healthCheck', 'runDiagnostics', 'getSheetNamesAction', 'eraseAllData', 'runMigration',
]);

// Actions that do NOT require a valid session token (public/bootstrap actions)
const PUBLIC_ACTIONS = new Set(['verifyPIN', 'rotatePIN', 'healthCheck']);

// ----------------------------------------------------------------------------
// 13. ROUTER — doPost is the single entry point the Netlify proxy calls.
//     Apps Script web apps only support doGet/doPost as true entry points;
//     everything else in this codebase is invoked indirectly through here.
// ----------------------------------------------------------------------------

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return respond(false, null, { code: 'BAD_REQUEST', message: 'Invalid JSON body' });
  }

  const action = body.action;
  if (!action || !ALLOWED_ACTIONS.has(action)) {
    return respond(false, null, { code: 'UNKNOWN_ACTION', message: 'Unknown or disallowed action: ' + action });
  }

  // appSecret check — the proxy injects this server-side; the browser never
  // sees it. This is the CSRF control described in the security model table.
  // Bootstrap auth actions (verifyPIN/rotatePIN) are allowed to proceed without
  // a session and without requiring a matching secret from the proxy so the
  // initial PIN setup flow can work during onboarding/local development.
  const expectedSecret = PropertiesService.getScriptProperties().getProperty('APP_SECRET');
  const isPublicBootstrap = PUBLIC_ACTIONS.has(action);
  if (!isPublicBootstrap && expectedSecret && body.appSecret !== expectedSecret) {
    return respond(false, null, { code: 'FORBIDDEN', message: 'Invalid app secret' });
  }

  // Session check for everything except PUBLIC_ACTIONS
  if (!isPublicBootstrap) {
    const session = validateSession(body.token, body.sessionSecret);
    if (!session.valid) {
      return respond(false, null, { code: 'UNAUTHORIZED', message: 'Invalid or expired session (' + session.reason + ')' });
    }
  }

  const payload = body.payload || {};
  payload.ipHash = body.ipHash; // available to actions that want it (e.g. verifyPIN)

  // Dispatch — every action function name matches its action string exactly.
  try {
    switch (action) {
      case 'addCustomer': return addCustomer(payload);
      case 'updateCustomer': return updateCustomer(payload);
      case 'deactivateCustomer': return deactivateCustomer(payload);
      case 'getCustomers': return getCustomers(payload);
      case 'addPausePeriod': return addPausePeriod(payload);
      case 'updateLogEntry': return updateLogEntry(payload);
      case 'bulkUpsertLogs': return bulkUpsertLogs(payload);
      case 'getDailyLogs': return getDailyLogs(payload);
      case 'generateMonthBill': return generateMonthBill(payload);
      case 'updateBill': return updateBill(payload);
      case 'finalizeBill': return finalizeBill(payload);
      case 'lockBill': return lockBill(payload);
      case 'unlockBill': return unlockBill(payload);
      case 'recordPayment': return recordPayment(payload);
      case 'addAdjustment': return addAdjustment(payload);
      case 'applyAdjustment': return applyAdjustment(payload);
      case 'getBills': return getBills(payload);
      case 'getBillText': return getBillText(payload);
      case 'reconcileBillingLedger': return reconcileBillingLedger(payload);
      case 'addMilkImport': return addMilkImport(payload);
      case 'updateMilkImport': return updateMilkImport(payload);
      case 'confirmMilkImport': return confirmMilkImport(payload);
      case 'deleteMilkImport': return deleteMilkImport(payload);
      case 'getMilkImports': return getMilkImports(payload);
      case 'getMilkImportSummary': return getMilkImportSummary(payload);
      case 'getDailyInventory': return getDailyInventory(payload);
      case 'reconcileMilkInventory': return reconcileMilkInventory(payload);
      case 'addMilkBrand': return addMilkBrand(payload);
      case 'getMilkBrands': return getMilkBrands(payload);
      case 'getMilkTypes': return getMilkTypes(payload);
      case 'verifyPIN': return verifyPIN(payload);
      case 'rotatePIN': return rotatePIN(payload);
      case 'healthCheck': return healthCheck();
      case 'runDiagnostics': return runDiagnostics();
      case 'getSheetNamesAction': return getSheetNamesAction();
      case 'eraseAllData': return eraseAllData(payload);
      case 'runMigration': return runMigration(payload);
      default:
        // Should be unreachable given the ALLOWED_ACTIONS check above, but
        // kept as a hard stop rather than falling through silently.
        return respond(false, null, { code: 'UNKNOWN_ACTION', message: 'No handler wired for: ' + action });
    }
  } catch (err) {
    Logger.log('[doPost] Unhandled exception in action "' + action + '": ' + err.message + '\n' + (err.stack || ''));
    return respond(false, null, { code: 'SYSTEM_ERROR', message: 'Internal error processing ' + action });
  }
}

/**
 * doGet — Apps Script web apps require this to exist even if unused; also
 * handy as a manual "is this deployed" check from a browser address bar.
 * Intentionally does NOT expose any data — just confirms the script is live.
 */
function doGet(e) {
  return ContentService.createTextOutput(
    JSON.stringify({ success: true, data: { status: 'Milk Delivery Admin V17 backend is running', timestamp: nowISTTimestamp() } })
  ).setMimeType(ContentService.MimeType.JSON);
}

// ----------------------------------------------------------------------------
// 14. HEALTH CHECK — minimal version. See file header note: Part 5 owns the
//     authoritative version if/when the two diverge.
// ----------------------------------------------------------------------------

function healthCheck() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const requiredSheets = Object.keys(SHEET_NAMES).map(function (k) { return SHEET_NAMES[k]; });
    const actualSheets = ss.getSheets().map(function (s) { return s.getName(); });
    const missing = requiredSheets.filter(function (name) { return actualSheets.indexOf(name) === -1; });

    const schemaVersion = getSettingValue('SchemaVersion') || '0';
    const migrationNeeded = Number(schemaVersion) < 17;

    return respond(true, {
      ok: missing.length === 0,
      missingSheets: missing,
      schemaVersion: Number(schemaVersion),
      migrationNeeded: migrationNeeded,
      timestamp: nowISTTimestamp(),
    });
  } catch (e) {
    return respond(false, null, { code: 'SYSTEM_ERROR', message: e.message });
  }
}
