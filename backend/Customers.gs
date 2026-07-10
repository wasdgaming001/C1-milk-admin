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

const CUSTOMER_STATUSES = ["Active", "Paused", "Inactive"];
const MILK_PRODUCTS = [
  "Full Cream",
  "Toned",
  "Double Toned",
  "Skimmed",
  "Standardised",
];
const MAX_DAILY_QTY = 50; // litres/day per customer — sanity cap

// ----------------------------------------------------------------------------
// VALIDATION
// ----------------------------------------------------------------------------

function validateCustomerPayload(payload, isUpdate) {
  const errors = [];

  if (!isUpdate || payload.name !== undefined) {
    if (!payload.name || !String(payload.name).trim())
      errors.push("Customer name is required");
    else if (String(payload.name).length > 120)
      errors.push("Name too long (max 120 chars)");
  }

  if (!isUpdate || payload.deliveryAddress !== undefined) {
    if (!payload.deliveryAddress || !String(payload.deliveryAddress).trim())
      errors.push("Delivery address is required");
    else if (String(payload.deliveryAddress).length > 500)
      errors.push("Address too long (max 500 chars)");
  }

  if (payload.phone) {
    const digits = String(payload.phone).replace(/\D/g, "");
    const isValid10 = digits.length === 10;
    const isValid91 = digits.length === 12 && digits.startsWith("91");
    if (!isValid10 && !isValid91)
      errors.push("Invalid phone number (use 10-digit Indian number)");
  }

  if (payload.product !== undefined && payload.product !== "") {
    if (MILK_PRODUCTS.indexOf(payload.product) === -1)
      errors.push("Invalid product: " + payload.product);
  }

  if (payload.dailyQty !== undefined) {
    const q = Number(payload.dailyQty);
    if (isNaN(q) || q < 0)
      errors.push("Daily quantity must be a non-negative number");
    else if (q > MAX_DAILY_QTY)
      errors.push("Daily quantity exceeds maximum (" + MAX_DAILY_QTY + "L)");
  }

  if (payload.deliveryDays !== undefined) {
    const days = payload.deliveryDays;
    if (!Array.isArray(days)) errors.push("Delivery days must be an array");
    else if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6))
      errors.push("Delivery days must be 0–6 (Sun=0 .. Sat=6)");
  }

  if (payload.status !== undefined) {
    if (CUSTOMER_STATUSES.indexOf(payload.status) === -1)
      errors.push("Invalid status: " + payload.status);
  }

  return { valid: errors.length === 0, errors };
}

function validateLogPayload(payload) {
  const errors = [];
  if (!payload.customerId) errors.push("customerId is required");
  if (!payload.date || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date))
    errors.push("date must be YYYY-MM-DD");
  if (payload.qty !== undefined) {
    const q = Number(payload.qty);
    if (isNaN(q) || q < 0 || q > MAX_DAILY_QTY) errors.push("Invalid qty");
  }
  if (payload.delivered !== undefined && typeof payload.delivered !== "boolean")
    errors.push("delivered must be boolean");
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
  if (!v.valid)
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: v.errors.join("; "),
    });

  return withLock(function () {
    const sheet = getSheet("CUSTOMERS");
    const hdr = buildHeaderMap(sheet);

    // FIX (AI-1 Medium 18): Cap idempotencyKey length to 80 chars to prevent DoS via giant cell writes
    const idemKey = payload.idempotencyKey ? String(payload.idempotencyKey).substring(0, 80) : "";

    if (idemKey) {
      const dup = findRowByColumnValue(sheet, hdr, "IdempotencyKey", idemKey);
      if (dup) {
        return respond(true, {
          customerId: dup.rowValues[hdr["CustomerId"]],
          duplicate: true,
        });
      }
    }

    const customerId = "CUST-" + Utilities.getUuid().substring(0, 8).toUpperCase();
    const now = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");

    const row = [];
    row[hdr["CustomerId"]] = customerId;
    row[hdr["Name"]] = sanitizeForText(payload.name).trim();
    row[hdr["DeliveryAddress"]] = sanitizeForText(payload.deliveryAddress).trim();
    row[hdr["Phone"]] = payload.phone ? normalizePhone(payload.phone) : "";
    row[hdr["Status"]] = "Active";
    row[hdr["Product"]] = payload.product || "Full Cream";
    row[hdr["DailyQty"]] = payload.dailyQty !== undefined ? Number(payload.dailyQty) : 1;
    row[hdr["DeliveryDays"]] = JSON.stringify(payload.deliveryDays || [0, 1, 2, 3, 4, 5, 6]);
    row[hdr["Balance"]] = 0;
    row[hdr["Version"]] = 1;
    row[hdr["IdempotencyKey"]] = idemKey; // Use the capped key
    row[hdr["CreatedAt"]] = now;
    row[hdr["UpdatedAt"]] = now;

    safeAppend(sheet, row);
    writeActivityLog("addCustomer", payload, { customerId: customerId });

    return respond(true, { customerId: customerId });
  });
}

/**
 * updateCustomer — partial update of an existing customer.
 * Required: customerId, expectedVersion (Rule 13 — no silent bypass)
 * Optional: any of name, deliveryAddress, phone, product, dailyQty, deliveryDays, status
 */
function updateCustomer(payload) {
  if (!payload.customerId)
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: "customerId is required",
    });
  if (payload.expectedVersion === undefined || payload.expectedVersion === null) {
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: "expectedVersion is required for updates",
    });
  }

  const v = validateCustomerPayload(payload, true);
  if (!v.valid)
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: v.errors.join("; "),
    });

  return withLock(function () {
    const sheet = getSheet("CUSTOMERS");
    const hdr = buildHeaderMap(sheet);
    const found = findRowById(sheet, hdr["CustomerId"], payload.customerId);

    if (!found)
      return respond(false, null, {
        code: "NOT_FOUND",
        message: "Customer not found: " + payload.customerId,
      });

    const currentVersion = Number(found.rowValues[hdr["Version"]]);
    if (currentVersion !== Number(payload.expectedVersion)) {
      return respond(false, null, {
        code: "VERSION_CONFLICT",
        message: "Customer was modified by another process",
        currentVersion: currentVersion,
      });
    }

    const now = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
    const updated = found.rowValues.slice();

    if (payload.name !== undefined) updated[hdr["Name"]] = sanitizeForText(payload.name).trim();
    if (payload.deliveryAddress !== undefined) updated[hdr["DeliveryAddress"]] = sanitizeForText(payload.deliveryAddress).trim();
    if (payload.phone !== undefined) updated[hdr["Phone"]] = payload.phone ? normalizePhone(payload.phone) : "";
    if (payload.product !== undefined) updated[hdr["Product"]] = payload.product;
    if (payload.dailyQty !== undefined) updated[hdr["DailyQty"]] = Number(payload.dailyQty);
    
    // FIXED: Properly handle null/undefined for deliveryDays to prevent storing the literal string "null"
    if (payload.deliveryDays !== undefined) {
      if (payload.deliveryDays === null || !Array.isArray(payload.deliveryDays)) {
        updated[hdr["DeliveryDays"]] = "[]";
      } else {
        updated[hdr["DeliveryDays"]] = JSON.stringify(payload.deliveryDays);
      }
    }
    
    if (payload.status !== undefined) updated[hdr["Status"]] = payload.status;

    updated[hdr["Version"]] = currentVersion + 1;
    updated[hdr["UpdatedAt"]] = now;
    
    // This prevents the "silent disconnect" where updating a customer doesn't update their deliveries.
    if (payload.product !== undefined || payload.dailyQty !== undefined) {
        try {
            const subSheet = getSheet(SHEET_NAMES.SUBSCRIPTIONS || "Subscriptions");
            const subHdr = buildHeaderMap(subSheet);
            const subData = subSheet.getDataRange().getValues();
            
            // Find the first active subscription for this customer
            const activeSubIndex = subData.findIndex(row => 
                row[subHdr["CustomerId"]] === payload.customerId && 
                (row[subHdr["IsActive"]] === true || row[subHdr["IsActive"]] === "TRUE")
            );

            if (activeSubIndex !== -1) {
                const subRow = subData[activeSubIndex];
                let subChanged = false;

                if (payload.product !== undefined && subHdr["MilkType"] !== undefined) {
                    subRow[subHdr["MilkType"]] = payload.product;
                    subChanged = true;
                }
                if (payload.dailyQty !== undefined && subHdr["Qty"] !== undefined) {
                    subRow[subHdr["Qty"]] = Number(payload.dailyQty);
                    subChanged = true;
                }

                if (subChanged) {
                    subRow[subHdr["UpdatedAt"]] = now;
                    subRow[subHdr["Version"]] = Number(subRow[subHdr["Version"]] || 1) + 1;
                    
                    // Write the updated subscription row back to the sheet
                    subSheet.getRange(activeSubIndex + 1, 1, 1, subRow.length).setValues([subRow]);
                    
                    // Log the sync to the subscription history
                    logSubscriptionHistory(
                        subRow[subHdr["Id"]], 
                        "SYNCED_FROM_CUSTOMER", 
                        `Synced from Customer update: Product=${payload.product || 'unchanged'}, Qty=${payload.dailyQty || 'unchanged'}`
                    );
                }
            }
        } catch (syncErr) {
            // If the Subscriptions sheet doesn't exist yet or sync fails, don't break the customer update
            Logger.log("Subscription sync failed: " + syncErr.message);
        }
    }
    
    sheet.getRange(found.rowIndex, 1, 1, updated.length).setValues([updated]);
    writeActivityLog("updateCustomer", payload, {
      customerId: payload.customerId,
      newVersion: currentVersion + 1,
    });

    return respond(true, {
      customerId: payload.customerId,
      newVersion: currentVersion + 1,
    });
  });
}
/**
 * deactivateCustomer — soft-delete (sets Status=Inactive). Never physically
 * deletes a customer row outside of eraseAllData (DPDP compliance flow).
 */
function deactivateCustomer(payload) {
  return withLock(function () {
    if (!payload.customerId) {
      return respond(false, null, { code: "VALIDATION_ERROR", message: "Missing customerId" });
    }

    const sheet = getSheet(SHEET_NAMES.CUSTOMERS);
    const hdr = getHeaders(SHEET_NAMES.CUSTOMERS);
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][hdr["CustomerId"]] === payload.customerId) {
        const currentStatus = data[i][hdr["Status"]];
        
        // Check if already inactive
        if (currentStatus === "Inactive") {
          return respond(false, null, { code: "ALREADY_INACTIVE", message: "Customer is already inactive" });
        }
        
        data[i][hdr["Status"]] = "Inactive";
        data[i][hdr["UpdatedAt"]] = nowISTTimestamp();
        sheet.getRange(i + 1, 1, 1, data[0].length).setValues([data[i]]);
        
        writeActivityLog("deactivateCustomer", "Deactivated customer " + payload.customerId);
        return respond(true, { customerId: payload.customerId });
      }
    }

    return respond(false, null, { code: "NOT_FOUND", message: "Customer not found" });
  });
}

/**
 * getCustomers — paginated list with optional filters.
 * Optional: status, search, limit, offset
 */
function getCustomers(payload) {
  const sheet = getSheet("CUSTOMERS");
  const hdr = buildHeaderMap(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return respond(true, { customers: [], total: 0, hasMore: false });

  const allValues = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  const search = (payload.search || "").toLowerCase().trim();
  const statusFilter = payload.status || "";

  let filtered = allValues.filter((row) => {
    if (statusFilter && row[hdr["Status"]] !== statusFilter) return false;
    if (search) {
      const name = String(row[hdr["Name"]] || "").toLowerCase();
      const addr = String(row[hdr["DeliveryAddress"]] || "").toLowerCase();
      const phone = String(row[hdr["Phone"]] || "");
      if (name.indexOf(search) === -1 && addr.indexOf(search) === -1 && phone.indexOf(search) === -1)
        return false;
    }
    return true;
  });

  const total = filtered.length;
  // FIX (AI-3 High 4): Removed the hard cap of 200. Increased default to 5000 to prevent silent data truncation.
  const limit = payload.limit !== undefined ? Math.max(0, Number(payload.limit)) : 5000;
  const offset = Number(payload.offset) || 0;
  const page = filtered.slice(offset, offset + limit);

  const customers = page.map((row) => ({
    customerId: row[hdr["CustomerId"]],
    name: row[hdr["Name"]],
    deliveryAddress: row[hdr["DeliveryAddress"]],
    phone: row[hdr["Phone"]],
    status: row[hdr["Status"]],
    product: row[hdr["Product"]],
    dailyQty: row[hdr["DailyQty"]],
    deliveryDays: safeJsonParse(row[hdr["DeliveryDays"]], []),
    balance: row[hdr["Balance"]],
    version: row[hdr["Version"]],
  }));

  return respond(true, {
    customers: customers,
    total: total,
    hasMore: offset + limit < total,
  });
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
  if (!payload.customerId)
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: "customerId is required",
    });
  if (!payload.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(payload.startDate)) {
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: "startDate must be YYYY-MM-DD",
    });
  }
  if (payload.endDate && payload.endDate < payload.startDate) {
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: "endDate cannot be before startDate",
    });
  }

  return withLock(function () {
    const custSheet = getSheet("CUSTOMERS");
    const custHdr = buildHeaderMap(custSheet);
    const custRow = findRowById(custSheet, custHdr["CustomerId"], payload.customerId);
    if (!custRow)
      return respond(false, null, {
        code: "NOT_FOUND",
        message: "Customer not found",
      });

    const pauseSheet = getSheet("PAUSE_PERIODS");
    const pauseHdr = buildHeaderMap(pauseSheet);
    const pauseId = "PAUSE-" + Utilities.getUuid().substring(0, 8).toUpperCase();
    const now = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");

    const row = [];
    row[pauseHdr["PauseId"]] = pauseId;
    row[pauseHdr["CustomerId"]] = payload.customerId;
    row[pauseHdr["StartDate"]] = payload.startDate;
    row[pauseHdr["EndDate"]] = payload.endDate || "";
    row[pauseHdr["Reason"]] = sanitizeForText(payload.reason || "");
    row[pauseHdr["CreatedAt"]] = now;

    safeAppend(pauseSheet, row);

    // Only flip status to Paused if the pause window covers today
    const today = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd");
    const coversToday = payload.startDate <= today && (!payload.endDate || payload.endDate >= today);
    if (coversToday) {
      custSheet.getRange(custRow.rowIndex, custHdr["Status"] + 1).setValue("Paused");
      custSheet.getRange(custRow.rowIndex, custHdr["Version"] + 1).setValue(Number(custRow.rowValues[custHdr["Version"]]) + 1);
      custSheet.getRange(custRow.rowIndex, custHdr["UpdatedAt"] + 1).setValue(now);
    }

    writeActivityLog("addPausePeriod", payload, { pauseId: pauseId });
    return respond(true, {
      pauseId: pauseId,
      customerStatusChanged: coversToday,
    });
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
  if (!payload.logId)
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: "logId is required",
    });
  if (payload.expectedVersion === undefined || payload.expectedVersion === null) {
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: "expectedVersion is required for updates",
    });
  }

  return withLock(function () {
    const sheet = getSheet("DAILY_LOGS");
    const hdr = buildHeaderMap(sheet);
    const found = findRowById(sheet, hdr["LogId"], payload.logId);
    if (!found)
      return respond(false, null, {
        code: "NOT_FOUND",
        message: "Log entry not found",
      });

    // Check version for optimistic concurrency
    const currentVersion = Number(found.rowValues[hdr["Version"]] || 1);
    if (currentVersion !== Number(payload.expectedVersion)) {
      return respond(false, null, {
        code: "VERSION_CONFLICT",
        message: "Log entry was modified by another process",
        currentVersion: currentVersion,
      });
    }

    const now = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
    const updated = found.rowValues.slice();
    
    if (payload.delivered !== undefined) updated[hdr["Delivered"]] = !!payload.delivered;
    if (payload.note !== undefined) updated[hdr["Note"]] = sanitizeForText(payload.note);
    if (payload.qty !== undefined) {
      const q = Number(payload.qty);
      if (isNaN(q) || q < 0 || q > MAX_DAILY_QTY)
        return respond(false, null, {
          code: "VALIDATION_ERROR",
          message: "Invalid qty",
        });
      updated[hdr["Qty"]] = q;
    }
    
    updated[hdr["Version"]] = currentVersion + 1;
    updated[hdr["UpdatedAt"]] = now;
    
    sheet.getRange(found.rowIndex, 1, 1, updated.length).setValues([updated]);

    writeActivityLog("updateLogEntry", payload, { 
      logId: payload.logId,
      newVersion: currentVersion + 1 
    });
    return respond(true, { 
      logId: payload.logId,
      newVersion: currentVersion + 1 
    });
  });
}

/**
 * bulkUpsertLogs — generates/updates delivery log rows.
 * Required: logs (array of objects)
 */
function bulkUpsertLogs(payload) {
  return withLock(function () {
    if (!payload.logs || !Array.isArray(payload.logs)) {
      return respond(false, null, { code: "VALIDATION_ERROR", message: "logs must be an array" });
    }

    const sheet = getSheet(SHEET_NAMES.DAILY_LOGS);
    const hdr = getHeaders(SHEET_NAMES.DAILY_LOGS);
    const data = sheet.getDataRange().getValues();
    
    const existingLogs = {};
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const key = row[hdr["CustomerId"]] + "|" + row[hdr["Date"]] + "|" + (row[hdr["Product"]] || "Cow Milk");
      existingLogs[key] = i;
    }
    
    row[hdr["Version"]] = 1;
    const rowsToUpdate = [];
    const rowsToAppend = [];

    payload.logs.forEach(log => {
      const product = log.milkType || log.product || "Cow Milk";
      const key = log.customerId + "|" + log.date + "|" + product;
      const qty = Number(log.qty) || 0;
      const delivered = !!log.delivered;
      
      const row = new Array(sheet.getLastColumn()).fill("");
      row[hdr["LogId"]] = log.id || log.logId || Utilities.getUuid(); // FIXED: was "Id"
      row[hdr["CustomerId"]] = log.customerId;
      row[hdr["Date"]] = log.date;
      row[hdr["Product"]] = product; // FIXED: was "MilkType"
      row[hdr["Qty"]] = qty;
      row[hdr["Delivered"]] = delivered;
      row[hdr["Note"]] = log.note || "";
      row[hdr["UpdatedAt"]] = nowISTTimestamp();

      if (existingLogs[key] !== undefined) {
        const rowIndex = existingLogs[key];
        row[hdr["CreatedAt"]] = data[rowIndex][hdr["CreatedAt"]] || nowISTTimestamp();
        rowsToUpdate.push({ index: rowIndex, data: row });
      } else {
        row[hdr["CreatedAt"]] = nowISTTimestamp();
        rowsToAppend.push(row);
      }
    });

    // Batch updates
    rowsToUpdate.forEach(u => {
      sheet.getRange(u.index + 1, 1, 1, row.length).setValues([u.data]);
    });
    
    if (rowsToAppend.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAppend.length, rowsToAppend[0].length).setValues(rowsToAppend);
    }

    writeActivityLog("bulkUpsertLogs", "Upserted " + payload.logs.length + " daily logs");
    return respond(true, { updated: rowsToUpdate.length, created: rowsToAppend.length });
  });
}

/**
 * getDailyLogs — returns logs for a given date (or date range).
 * Optional: date (single day), startDate+endDate (range), customerId
 */
function getDailyLogs(payload) {
  const sheet = getSheet("DAILY_LOGS");
  const hdr = buildHeaderMap(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return respond(true, { logs: [] });

  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  const filtered = values.filter((row) => {
    const date = row[hdr["Date"]];
    if (payload.date && date !== payload.date) return false;
    if (payload.startDate && date < payload.startDate) return false;
    if (payload.endDate && date > payload.endDate) return false;
    if (payload.customerId && row[hdr["CustomerId"]] !== payload.customerId)
      return false;
    return true;
  });

  const logs = filtered.map((row) => ({
    logId: row[hdr["LogId"]],
    customerId: row[hdr["CustomerId"]],
    date: row[hdr["Date"]],
    product: row[hdr["Product"]],
    qty: row[hdr["Qty"]],
    delivered: !!row[hdr["Delivered"]],
    note: row[hdr["Note"]],
  }));

  return respond(true, { logs: logs });
}

// NOTE: findRowByColumnValue() is intentionally NOT defined in this file.
// It is owned by Part 4 (Core.gs). Declaring it here would cause a duplicate
// function declaration crash at Apps Script deployment time.

/**
 * getPauses — fetches all pause periods.
 */
function getPauses() {
  const sheet = getSheet(SHEET_NAMES.PAUSE_PERIODS);
  const data = sheet.getDataRange().getValues();
  
  // FIX (AI-3 Critical 3): Changed to return respond() instead of a plain JS object.
  // Returning { success: true, data: ... } directly causes Apps Script's ContentService
  // to fail serialization or the router to double-wrap it, breaking the frontend.
  if (data.length < 2) return respond(true, { pauses: [] }); 
  
  const headers = data[0];
  const pauses = data.slice(1).map((row) => {
    const obj = {};
    headers.forEach((h, i) => (obj[h] = row[i]));
    return obj;
  });
  
  return respond(true, { pauses });
}