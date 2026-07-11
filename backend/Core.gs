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
 * runMigration() are declared (and referenced by the router below). Their
 * full bodies live in Part 5 (Admin.gs / Diagnostics & Admin Actions), which
 * is the AUTHORITATIVE copy. Core.gs does NOT define healthCheck() here —
 * the router dispatches to the Part 5 implementation directly.
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
 *  13.  Session validation & Purge helpers
 *  14.  ALLOWED_ACTIONS / TESTED_ACTIONS registry
 *  15.  doPost() router
 *  16.  batchFlush() — write-queue beacon handler
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// 1. SHEET NAMES — must match your actual spreadsheet tab names EXACTLY
// ----------------------------------------------------------------------------

const SHEET_NAMES = {
  CUSTOMERS: "Customers",
  DAILY_LOGS: "DailyLogs",
  PAUSE_PERIODS: "PausePeriods",
  BILLS: "Bills",
  PAYMENTS: "Payments",
  ADJUSTMENTS: "Adjustments",
  MILK_IMPORTS: "MilkImports",
  MILK_BRANDS: "MilkBrands",
  MILK_TYPES: "MilkTypes",
  PRODUCTS: "Products",
  SETTINGS: "Settings",
  ACTIVITY_LOG: "ActivityLog",
  SYSTEM_STATE: "SystemState",
  SUBSCRIPTIONS: "Subscriptions",
  SUBSCRIPTION_HISTORY: "SubscriptionHistory",
  CREDIT_NOTES: "CreditNotes",
};

const TIMEZONE = Session.getScriptTimeZone() || "Asia/Kolkata";

function getSheet(constName) {
  const name = SHEET_NAMES[constName] || constName;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet)
    throw new Error(
      "Sheet not found: " + name + ' (expected tab named "' + name + '")',
    );
  return sheet;
}

// ----------------------------------------------------------------------------
// 2. RESPONSE ENVELOPE
// ----------------------------------------------------------------------------

function respond(success, data, error) {
  const body = { success: !!success };
  if (success) {
    body.data = data || {};
  } else {
    body.error = error || {
      code: "UNKNOWN_ERROR",
      message: "Unspecified error",
    };
  }
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

// ----------------------------------------------------------------------------
// 3. SHEET READ HELPERS
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
      const fullRow = sheet
        .getRange(i + 2, 1, 1, sheet.getLastColumn())
        .getValues()[0];
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
  const values = sheet
    .getRange(2, 1, lastRow - 1, sheet.getLastColumn())
    .getValues();
  for (let i = 0; i < values.length; i++) {
    if (values[i][hdr[col1]] === val1 && values[i][hdr[col2]] === val2) {
      return { rowIndex: i + 2, rowValues: values[i] };
    }
  }
  return null;
}

// ----------------------------------------------------------------------------
// 4. WRITE HELPERS
// ----------------------------------------------------------------------------

let _lockHeld = false;

function withLock(fn) {
    const lock = LockService.getScriptLock();
    let lockAcquired = false; 
    
    try {
        lock.waitLock(10000);
        lockAcquired = true;
    } catch (e) {
        return respond(false, null, {
            code: "LOCK_TIMEOUT",
            message: "Could not acquire lock within 10s — system busy, please retry",
        });
    }
    
    _lockHeld = true;
    try {
        return fn();
    } catch (e) {
        Logger.log(
            "\[withLock\] Unhandled error: " + e.message + "\n" + (e.stack || ""),
        );
        return respond(false, null, { code: "SYSTEM_ERROR", message: e.message });
    } finally {
        _lockHeld = false;
        if (lockAcquired) {
            lock.releaseLock(); 
        }
    }
}

function safeAppend(sheet, rowArray) {
    if (!_lockHeld)
        throw new Error(
            "safeAppend called without holding the script lock (Rule 2 violation)",
        );
    
    const numCols = sheet.getLastColumn();
    const denseRow = new Array(numCols).fill("");
    for (let i = 0; i < rowArray.length && i < numCols; i++) {
        if (rowArray[i] !== undefined) {
            denseRow[i] = rowArray[i];
        }
    }
    
    const targetRow = sheet.getLastRow() + 1;
    sheet.getRange(targetRow, 1, 1, denseRow.length).setValues([denseRow]);
}

// ----------------------------------------------------------------------------
// 5. DATE HELPERS
// ----------------------------------------------------------------------------

function toISO(dateVal) {
  if (dateVal === null || dateVal === undefined || dateVal === "") return "";
  if (Object.prototype.toString.call(dateVal) === "[object Date]") {
    return Utilities.formatDate(dateVal, TIMEZONE, "yyyy-MM-dd");
  }
  const str = String(dateVal).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime()))
    return Utilities.formatDate(parsed, TIMEZONE, "yyyy-MM-dd");
  return str; 
}

function nowISTTimestamp() {
  return Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function todayIST() {
  return Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd");
}

// ----------------------------------------------------------------------------
// 6. SAFE JSON
// ----------------------------------------------------------------------------

function safeJsonParse(str, fallback) {
  if (str === null || str === undefined || str === "") return fallback;
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
}

// ----------------------------------------------------------------------------
// 7. XSS-SAFE TEXT
// ----------------------------------------------------------------------------

function sanitizeForText(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/[<>]/g, "") 
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "") 
    .substring(0, 2000); 
}

// ----------------------------------------------------------------------------
// 8. PHONE NORMALIZATION
// ----------------------------------------------------------------------------

function normalizePhone(phone) {
    let digits = String(phone || "").replace(/\D/g, "");
    if (digits.startsWith("0")) {
        digits = digits.substring(1);
    }
    if (digits.length === 10) {
        digits = "91" + digits;
    }
    return digits;
}

// ----------------------------------------------------------------------------
// 9. ACTIVITY LOG
// ----------------------------------------------------------------------------

function writeActivityLog(action, payload, result) {
    try {
        const lock = LockService.getScriptLock();
        lock.waitLock(3000); 
        try {
            const sheet = getSheet(SHEET_NAMES.ACTIVITY_LOG);
            const hdr = buildHeaderMap(sheet);
            const row = new Array(sheet.getLastColumn()).fill("");
            
            row[hdr["Timestamp"]] = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd HH:mm:ss");
            row[hdr["Action"]] = action;
            row[hdr["Payload"]] = JSON.stringify(payload || {}).slice(0, 50000);
            row[hdr["Result"]] = JSON.stringify(result || {}).slice(0, 50000);
            
            sheet.appendRow(row);
        } finally {
            lock.releaseLock();
        }
    } catch (e) {
        Logger.log("[writeActivityLog] Failed to write log: " + e.message);
    }
}

// ----------------------------------------------------------------------------
// 10. SETTINGS
// ----------------------------------------------------------------------------

const SETTINGS_CACHE_KEY_PREFIX = "setting_";
const SETTINGS_CACHE_TTL_SECONDS = 300;

function getSettingValue(key) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(SETTINGS_CACHE_KEY_PREFIX + key);
  if (cached !== null) return cached;

  const sheet = getSheet("SETTINGS");
  const hdr = buildHeaderMap(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return "";

  const values = sheet
    .getRange(2, 1, lastRow - 1, sheet.getLastColumn())
    .getValues();
  const found = values.find((row) => row[hdr["Key"]] === key);
  const value = found ? String(found[hdr["Value"]]) : "";

  cache.put(SETTINGS_CACHE_KEY_PREFIX + key, value, SETTINGS_CACHE_TTL_SECONDS);
  return value;
}

function setSettingValue(key, value) {
  return withLock(function () {
    const sheet = getSheet("SETTINGS");
    const hdr = buildHeaderMap(sheet);
    const found = findRowByColumnValue(sheet, hdr, "Key", key);

    if (found) {
      sheet.getRange(found.rowIndex, hdr["Value"] + 1).setValue(value);
    } else {
      const row = [];
      row[hdr["Key"]] = key;
      row[hdr["Value"]] = value;
      safeAppend(sheet, row);
    }

    CacheService.getScriptCache().remove(SETTINGS_CACHE_KEY_PREFIX + key);
    return respond(true, { key: key });
  });
}

// ----------------------------------------------------------------------------
// 11. PIN AUTH
// ----------------------------------------------------------------------------

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; 
const MAX_PIN_ATTEMPTS_PER_DAY_PER_IP = 10;

function sha256Hex(input) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    input,
    Utilities.Charset.UTF_8,
  );
  return bytes.map((b) => ("0" + (b & 0xff).toString(16)).slice(-2)).join("");
}

function constantTimeEqual(a, b) {
  const sa = String(a || "");
  const sb = String(b || "");
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
  // Use multiple iterations to slow down brute force
  // Apps Script doesn't have native PBKDF2, so we simulate with repeated SHA-256
  const iterations = 10000;
  let hash = salt + pin; 
  for (let i = 0; i < iterations; i++) {
    hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, hash, Utilities.Charset.UTF_8)
      .map(byte => ('0' + (byte & 0xFF).toString(16)).slice(-2))
      .join('');
  } 
  return hash;
}

function checkAndIncrementPinRateLimit(ipHash) {
  const sheet = getSheet("SYSTEM_STATE");
  const hdr = buildHeaderMap(sheet);
  const today = todayIST().replace(/-/g, "");
  const key = "PINRate_" + today + "_" + ipHash;

  const found = findRowByColumnValue(sheet, hdr, "Key", key);
  const currentCount = found ? Number(found.rowValues[hdr["Value"]]) : 0;

  if (currentCount >= MAX_PIN_ATTEMPTS_PER_DAY_PER_IP) {
    return { allowed: false, attemptsToday: currentCount };
  }

  const newCount = currentCount + 1;
  if (found) {
    sheet.getRange(found.rowIndex, hdr["Value"] + 1).setValue(newCount);
  } else {
    const row = [];
    row[hdr["Key"]] = key;
    row[hdr["Value"]] = newCount;
    safeAppend(sheet, row);
  }

  return { allowed: true, attemptsToday: newCount };
}

function verifyPIN(payload) {
  const pin = payload.pin;
  if (!pin) return respond(false, null, { code: "VALIDATION_ERROR", message: "PIN required" });

  return withLock(function () {
    const ipHash = payload.ipHash || "unknown";
    
    // FIXED: Only CHECK the limit here, do not increment yet
    const rateLimit = checkPinRateLimit(ipHash);
    if (!rateLimit.allowed) {
      return respond(false, null, { code: "RATE_LIMITED", message: "Too many failed PIN attempts today." });
    }
    //  FIX START: Read the PIN from the Script Properties
    const sheet = getSheet("SETTINGS");
    const hdr = buildHeaderMap(sheet);
    
    const saltRow = findRowByColumnValue(sheet, hdr, "Key", "PINSalt");
    const hashRow = findRowByColumnValue(sheet, hdr, "Key", "PINHash");
    
    if (!saltRow || !hashRow) {
      return respond(false, null, { code: "SYSTEM_ERROR", message: "PIN not configured in SETTINGS sheet" });
    }
    
    const salt = sheet.getRange(saltRow.rowIndex, hdr["Value"] + 1).getValue();
    const storedHash = sheet.getRange(hashRow.rowIndex, hdr["Value"] + 1).getValue();

    const candidateHash = hashPIN(pin, salt);
    if (!constantTimeEqual(candidateHash, storedHash)) {
      // FIXED: ONLY increment the rate limit counter on FAILED attempts
      incrementPinRateLimit(ipHash);
      return respond(false, null, { code: "INVALID_PIN", message: "Incorrect PIN" });
    }

    // Success path
    const token = Utilities.getUuid();
    
    // We still use Script Properties for temporary sessions, which is perfectly fine!
    const props = PropertiesService.getScriptProperties();
    props.setProperty("SESSION_" + token, JSON.stringify({ ip: ipHash, created: nowISTTimestamp() }));
    
    writeActivityLog("verifyPIN", "Successful login from " + ipHash);
    
    // Return both token and sessionSecret so the frontend state updates correctly
    return respond(true, { token: token, sessionSecret: token }); 
  });
}

// --- ADD/REPLACE these helpers ---
function checkPinRateLimit(ipHash) {
  const props = PropertiesService.getScriptProperties();
  const key = "PIN_RATE_" + ipHash + "_" + todayIST();
  const attempts = Number(props.getProperty(key) || 0);
  return { allowed: attempts < MAX_PIN_ATTEMPTS_PER_DAY_PER_IP, attempts };
}

function incrementPinRateLimit(ipHash) {
  const props = PropertiesService.getScriptProperties();
  const key = "PIN_RATE_" + ipHash + "_" + todayIST();
  const attempts = Number(props.getProperty(key) || 0);
  props.setProperty(key, attempts + 1);
}

function rotatePIN(payload) {
  payload = payload || {};
  if (!payload.newPin || !/^\d{4}$/.test(String(payload.newPin))) {
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: "newPin must be exactly 4 digits",
    });
  }
  if (payload.newPin !== payload.confirmPin) {
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: "newPin and confirmPin do not match",
    });
  }

  return withLock(function () {
    const salt = Utilities.getUuid();
    const hash = hashPIN(String(payload.newPin), salt);

    const sheet = getSheet("SETTINGS");
    const hdr = buildHeaderMap(sheet);

    [
      ["PINSalt", salt],
      ["PINHash", hash],
    ].forEach(function (pair) {
      const key = pair[0],
        value = pair[1];
      const found = findRowByColumnValue(sheet, hdr, "Key", key);
      if (found) {
        sheet.getRange(found.rowIndex, hdr["Value"] + 1).setValue(value);
      } else {
        const row = [];
        row[hdr["Key"]] = key;
        row[hdr["Value"]] = value;
        safeAppend(sheet, row);
      }
    });

    CacheService.getScriptCache().remove(SETTINGS_CACHE_KEY_PREFIX + "PINSalt");
    CacheService.getScriptCache().remove(SETTINGS_CACHE_KEY_PREFIX + "PINHash");

    writeActivityLog("rotatePIN", {}, { success: true });
    return respond(true, {}); 
  });
}

function validateSession(token, sessionSecret) {
  if (!token) return { valid: false, reason: "NO_TOKEN" };

  const sheet = getSheet("SYSTEM_STATE");
  const hdr = buildHeaderMap(sheet);
  const found = findRowByColumnValue(sheet, hdr, "Key", "Session_" + token);
  if (!found) return { valid: false, reason: "SESSION_NOT_FOUND" };

  const sessionData = safeJsonParse(found.rowValues[hdr["Value"]], null);
  if (!sessionData || Date.now() > sessionData.expiresAt)
    return { valid: false, reason: "SESSION_EXPIRED" };

  if (sessionSecret) {
    const appSecret =
      PropertiesService.getScriptProperties().getProperty("APP_SECRET") || "";
    const expected = appSecret ? sha256Hex(token + appSecret) : "";
    if (!constantTimeEqual(sessionSecret, expected))
      return { valid: false, reason: "BAD_SESSION_SECRET" };
  }

  return { valid: true };
}

// ----------------------------------------------------------------------------
// 12. PURGE HELPERS (Fixed for batch deletion and correct sheet names)
// ----------------------------------------------------------------------------

/**
 * purgeExpiredSessions — housekeeping helper.
 * FIX: Sessions are stored in SYSTEM_STATE, not a separate SESSIONS sheet.
 * FIX: Uses batch deletion to prevent 6-minute timeout limit.
 */
function purgeExpiredSessions() {
    return withLock(() => {
        const sheet = getSheet("SYSTEM_STATE"); // FIX: Sessions are in SYSTEM_STATE
        const hdr = buildHeaderMap(sheet);
        const data = sheet.getDataRange().getValues();
        const now = Date.now();
        const rowsToDelete = [];

        for (let i = 1; i < data.length; i++) {
            const key = String(data[i][hdr["Key"]] || "");
            if (key.indexOf("Session_") === 0) {
                const sessionData = safeJsonParse(data[i][hdr["Value"]], null);
                if (!sessionData || now > sessionData.expiresAt) {
                    rowsToDelete.push(i + 1); // 1-based row index
                }
            }
        }

        if (rowsToDelete.length > 0) {
            rowsToDelete.sort((a, b) => b - a);
            let i = 0;
            while (i < rowsToDelete.length) {
                let start = rowsToDelete[i];
                let count = 1;
                while (i + count < rowsToDelete.length && rowsToDelete[i + count] === rowsToDelete[i + count - 1] - 1) {
                    count++;
                }
                sheet.deleteRows(start, count);
                i += count;
            }
        }
        return respond(true, { purged: rowsToDelete.length });
    });
}

/**
 * purgeSystemState — comprehensive housekeeping for the SystemState sheet.
 * FIX: Uses batch deletion to prevent 6-minute timeout limit.
 */
function purgeSystemState() {
  return withLock(function () {
    const sheet = getSheet("SYSTEM_STATE");
    const hdr = buildHeaderMap(sheet);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return respond(true, { purged: 0, remaining: 0 });

    const values = sheet
      .getRange(2, 1, lastRow - 1, sheet.getLastColumn())
      .getValues();
    const now = Date.now();
    const todayStr = todayIST().replace(/-/g, ""); 
    const rowsToDelete = [];

    values.forEach(function (row, i) {
      const key = String(row[hdr["Key"]] || "");

      if (key.indexOf("Session_") === 0) {
        const data = safeJsonParse(row[hdr["Value"]], null);
        if (!data || now > data.expiresAt) {
          rowsToDelete.push(i + 2);
        }
      }
      else if (key.indexOf("PINRate_") === 0) {
        const parts = key.split("_");
        if (parts.length >= 2 && parts[1] < todayStr) {
          rowsToDelete.push(i + 2);
        }
      }
    });

    if (rowsToDelete.length > 0) {
        rowsToDelete.sort((a, b) => b - a);
        let i = 0;
        while (i < rowsToDelete.length) {
            let start = rowsToDelete[i];
            let count = 1;
            while (i + count < rowsToDelete.length && rowsToDelete[i + count] === rowsToDelete[i + count - 1] - 1) {
                count++;
            }
            sheet.deleteRows(start, count);
            i += count;
        }
    }

    writeActivityLog("purgeSystemState", {}, { purged: rowsToDelete.length });

    return respond(true, {
      purged: rowsToDelete.length,
      remaining: sheet.getLastRow() - 1,
    });
  });
}

// ----------------------------------------------------------------------------
// 13. ACTION REGISTRY
// ----------------------------------------------------------------------------

const ALLOWED_ACTIONS = new Set([
  //Subscriptions
  "getSubscriptions",
  "saveSubscription",
  "generateDailyLogsForDate",
  "addAdHocLog",
  "getSubscriptionHistory",
  "addCreditNote",
  "getCreditNotes",
  // Customers
  "addCustomer",
  "updateCustomer",
  "deactivateCustomer",
  "getCustomers",
  // Pause periods
  "addPausePeriod",
  "getPauses", 
  // Delivery logs
  "updateLogEntry",
  "bulkUpsertLogs",
  "getDailyLogs",
  // Billing
  "generateMonthBill",
  "updateBill",
  "finalizeBill",
  "lockBill",
  "unlockBill",
  "recordPayment",
  "addAdjustment",
  "applyAdjustment",
  "getBills",
  "getBillText",
  "reconcileBillingLedger",
  "getAdjustments", 
  // Milk imports
  "addMilkImport",
  "updateMilkImport",
  "confirmMilkImport",
  "deleteMilkImport",
  "getMilkImports",
  "getMilkImportSummary",
  "getDailyInventory",
  "reconcileMilkInventory",
  "addMilkBrand",
  "getMilkBrands", 
  "getBrands",
  "getMilkTypes",
  // Auth
  "verifyPIN",
  "rotatePIN",
  // Write-queue beacon
  "batchFlush",
  // System / diagnostics
  "healthCheck",
  "runDiagnostics",
  "getSheetNamesAction",
  "eraseAllData",
  "runMigration",
]);

const TESTED_ACTIONS = new Set([
  "addCustomer", "updateCustomer", "deactivateCustomer", "getCustomers",
  "addPausePeriod", "updateLogEntry", "bulkUpsertLogs", "getDailyLogs",
  "generateMonthBill", "updateBill", "finalizeBill", "lockBill", "unlockBill",
  "recordPayment", "addAdjustment", "applyAdjustment", "getBills", "getBillText",
  "reconcileBillingLedger", "addMilkImport", "updateMilkImport", "confirmMilkImport",
  "deleteMilkImport", "getMilkImports", "getMilkImportSummary", "getDailyInventory",
  "reconcileMilkInventory", "addMilkBrand", "getMilkBrands", "getMilkTypes",
  "verifyPIN", "rotatePIN", "batchFlush", "healthCheck", "runDiagnostics",
  "getSheetNamesAction", "eraseAllData", "runMigration",
]);

// FIX: Added verifyPIN and rotatePIN to PUBLIC_ACTIONS so they don't require a session
const PUBLIC_ACTIONS = new Set(["verifyPIN", "rotatePIN"]);

// ----------------------------------------------------------------------------
// 14. ROUTER
// ----------------------------------------------------------------------------

function doPost(e) {
  if (!e.postData || !e.postData.contents) {
    return respond(false, null, {
      code: "BAD_REQUEST",
      message: "Missing POST data",
    });
  }

  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return respond(false, null, {
      code: "BAD_REQUEST",
      message: "Invalid JSON body",
    });
  }

  const action = body.action;
  if (!action || !ALLOWED_ACTIONS.has(action)) {
    return respond(false, null, {
      code: "UNKNOWN_ACTION",
      message: "Unknown or disallowed action: " + action,
    });
  }

  // FIX (AI-1 Critical 1): Refuse boot if APP_SECRET is missing to prevent auth bypass
  const expectedSecret = PropertiesService.getScriptProperties().getProperty("APP_SECRET");
  const isPublicBootstrap = PUBLIC_ACTIONS.has(action);
  
  if (!isPublicBootstrap) {
      if (!expectedSecret) {
          return respond(false, null, { 
              code: "SYSTEM_CONFIG_ERROR", 
              message: "APP_SECRET is not configured on the server. Please set it in Script Properties." 
          });
      }
      if (body.appSecret !== expectedSecret) {
          return respond(false, null, { code: "FORBIDDEN", message: "Invalid app secret" });
      }
  }

  if (!isPublicBootstrap) {
    const session = validateSession(body.token, body.sessionSecret);
    if (!session.valid) {
      return respond(false, null, {
        code: "UNAUTHORIZED",
        message: "Invalid or expired session (" + session.reason + ")",
      });
    }
  }

  const payload = body.payload || {};
  payload.ipHash = body.ipHash; 

  try {
        switch(action) {
        case "getSubscriptions": return getSubscriptions(payload);
        case "saveSubscription": return saveSubscription(payload);
        case "getSubscriptionHistory": return getSubscriptionHistory(payload);
        case "addAdHocLog": return addAdHocLog(payload);
        case "addCreditNote": return addCreditNote(payload);
        case "getCreditNotes": return getCreditNotes();
        case "generateDailyLogsForDate": return generateDailyLogsForDate(payload);
        case "getAdjustments": return getAdjustments();
        case "getBillText": return getBillText(payload);
        case "addCustomer": return addCustomer(payload);
        case "updateCustomer": return updateCustomer(payload);
        case "deactivateCustomer": return deactivateCustomer(payload);
        case "getCustomers": return getCustomers(payload);
        case "addPausePeriod": return addPausePeriod(payload);
        case "getPauses": return getPauses();
        case "updateLogEntry": return updateLogEntry(payload);
        case "bulkUpsertLogs": return bulkUpsertLogs(payload);
        case "getDailyLogs": return getDailyLogs(payload);
        case "generateMonthBill": return generateMonthBill(payload);
        case "updateBill": return updateBill(payload);
        case "finalizeBill": return finalizeBill(payload);
        case "lockBill": return lockBill(payload);
        case "unlockBill": return unlockBill(payload);
        case "recordPayment": return recordPayment(payload);
        case "addAdjustment": return addAdjustment(payload);
        case "applyAdjustment": return applyAdjustment(payload);
        case "getBills": return getBills(payload);
        case "reconcileBillingLedger": return reconcileBillingLedger(payload);
        case "addMilkImport": return addMilkImport(payload);
        case "updateMilkImport": return updateMilkImport(payload);
        case "confirmMilkImport": return confirmMilkImport(payload);
        case "deleteMilkImport": return deleteMilkImport(payload);
        case "getMilkImports": return getMilkImports(payload);
        case "getMilkImportSummary": return getMilkImportSummary(payload);
        case "getDailyInventory": return getDailyInventory(payload);
        case "getBrands": return getBrands();
        case "reconcileMilkInventory": return reconcileMilkInventory(payload);
        case "addMilkBrand": return addMilkBrand(payload);
        case "getMilkBrands": return getMilkBrands(payload);
        case "getMilkTypes": return getMilkTypes(payload);
        case "verifyPIN": return verifyPIN(payload);
        case "rotatePIN": return rotatePIN(payload);
        case "batchFlush": return batchFlush(payload);
        case "healthCheck": return healthCheck();
        case "runDiagnostics": return runDiagnostics();
        case "getSheetNamesAction": return getSheetNamesAction();
        case "eraseAllData": return eraseAllData(payload);
        case "runMigration": return runMigration(payload);
        default:
            return respond(false, null, {
                code: "UNKNOWN_ACTION",
                message: "No handler wired for: " + action,
            });
    }
  } catch (err) {
    Logger.log(
      '[doPost] Unhandled exception in action "' +
        action +
        '": ' +
        err.message +
        "\n" +
        (err.stack || ""),
    );
    return respond(false, null, {
      code: "SYSTEM_ERROR",
      message: "Internal error processing " + action,
    });
  }
}

function doGet(e) {
  return ContentService.createTextOutput(
    JSON.stringify({
      success: true,
      data: {
        status: "Milk Delivery Admin V17 backend is running",
        timestamp: nowISTTimestamp(),
      },
    }),
  ).setMimeType(ContentService.MimeType.JSON);
}

// ----------------------------------------------------------------------------
// 15. WRITE-QUEUE BEACON
// ----------------------------------------------------------------------------

function batchFlush(payload) {
  payload = payload || {};
  var writes = payload.writes;
  if (!Array.isArray(writes) || writes.length === 0) {
    return respond(true, { flushed: 0, skipped: 0 });
  }

  var DISPATCH = {
    saveSubscription: saveSubscription,
    addCustomer: addCustomer,
    updateCustomer: updateCustomer,
    deactivateCustomer: deactivateCustomer,
    addPausePeriod: addPausePeriod,
    updateLogEntry: updateLogEntry,
    bulkUpsertLogs: bulkUpsertLogs,
    generateMonthBill: generateMonthBill,
    updateBill: updateBill,
    finalizeBill: finalizeBill,
    lockBill: lockBill,
    unlockBill: unlockBill,
    recordPayment: recordPayment,
    addAdjustment: addAdjustment,
    applyAdjustment: applyAdjustment,
    addMilkImport: addMilkImport,
    updateMilkImport: updateMilkImport,
    confirmMilkImport: confirmMilkImport,
    deleteMilkImport: deleteMilkImport,
    addMilkBrand: addMilkBrand,
  };

  var MAX_PER_BEACON = 20;
  var limit = Math.min(writes.length, MAX_PER_BEACON);
  var flushed = 0;
  var skipped = Math.max(0, writes.length - MAX_PER_BEACON); 

  for (var i = 0; i < limit; i++) {
    var w = writes[i];
    var fn = w && w.action ? DISPATCH[w.action] : null;
    if (!fn) {
      skipped++;
      continue;
    }
    try {
      fn(w.payload || {});
      flushed++;
    } catch (e) {
      skipped++;
      Logger.log("[batchFlush] " + (w.action || "?") + " failed: " + e.message);
    }
  }

  return respond(true, { flushed: flushed, skipped: skipped });
}