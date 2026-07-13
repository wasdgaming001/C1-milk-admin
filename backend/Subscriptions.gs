// ----------------------------------------------------------------------------
// SUBSCRIPTIONS ACTIONS
// -------------------------------------------------------------------------------------------------------------------

/**
 * logSubscriptionHistory — appends an audit trail entry for subscription changes.
 */
function logSubscriptionHistory(subId, action, details) {
    try {
        const sheet = getSheet(SHEET_NAMES.SUBSCRIPTION_HISTORY || "SubscriptionHistory");
        const hdr = buildHeaderMap(sheet);
        const now = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
        const row = new Array(sheet.getLastColumn()).fill("");

        row[hdr["Id"]] = Utilities.getUuid();
        row[hdr["SubscriptionId"]] = subId;
        row[hdr["Action"]] = action;
        row[hdr["Details"]] = details;
        row[hdr["Timestamp"]] = now;

        // Use safeAppend if we are inside a lock, otherwise fallback to appendRow
        if (_lockHeld) {
            safeAppend(sheet, row);
        } else {
            sheet.appendRow(row);
        }
    } catch (e) {
        // Fire and forget: audit log failure should never break the main action
        Logger.log("Failed to log subscription history: " + e.message);
    }
}
/**
 * getSubscriptions — fetches all subscriptions and joins customer names.
 */
function getSubscriptions(payload) {
    const sheet = getSheet(SHEET_NAMES.SUBSCRIPTIONS || "Subscriptions");
    const hdr = buildHeaderMap(sheet);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return respond(true, { subscriptions: [] });

    const allValues = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

    // Fetch customers to join names for the UI
    const custSheet = getSheet(SHEET_NAMES.CUSTOMERS || "Customers");
    const custHdr = buildHeaderMap(custSheet);
    const custLastRow = custSheet.getLastRow();
    const customers = {};
    if (custLastRow >= 2) {
        const custValues = custSheet.getRange(2, 1, custLastRow - 1, custSheet.getLastColumn()).getValues();
        custValues.forEach((row) => {
            // FIX: Ensure headers exist before accessing to prevent crashes
            if (custHdr["CustomerId"] !== undefined && custHdr["Name"] !== undefined) {
                customers[row[custHdr["CustomerId"]]] = row[custHdr["Name"]];
            }
        });
    }

    const subscriptions = allValues.map((row) => {
        let days = [];
        try {
            const rawDays = row[hdr["DeliveryDays"]];
            if (typeof rawDays === 'string' && rawDays.trim() !== "") {
                days = JSON.parse(rawDays);
            } else if (Array.isArray(rawDays)) {
                days = rawDays;
            }
        } catch (e) {
            days = [];
        }

        return {
            id: row[hdr["Id"]],
            customerId: row[hdr["CustomerId"]],
            customerName: customers[row[hdr["CustomerId"]]] || "Unknown",
            milkType: row[hdr["MilkType"]],
            quantity: Number(row[hdr["Qty"]] || 0),
            deliveryDays: days,
            isActive: row[hdr["IsActive"]] === true || row[hdr["IsActive"]] === "TRUE",
            version: Number(row[hdr["Version"]] || 1),
        };
    });

    return respond(true, { subscriptions });
}

/**
 * saveSubscription — creates or updates a subscription.
 * Required for create: customerId, milkType, quantity, deliveryDays
 * Required for update: id, expectedVersion
 */
function saveSubscription(payload) {
    // FIX (AI-1): Allow quantity to be 0, but reject negative numbers
    if (!payload.customerId || !payload.milkType || payload.quantity === undefined || Number(payload.quantity) <=0 || !Array.isArray(payload.deliveryDays)) {
        return respond(false, null, {
            code: "VALIDATION_ERROR",
            message: "Quantity must be greater than zero" ,
        });
    }

    return withLock(function () {
        const sheet = getSheet(SHEET_NAMES.SUBSCRIPTIONS || "Subscriptions");
        const hdr = buildHeaderMap(sheet);
        const now = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");

        if (payload.id) {
            // FIX (AI-1): Require expectedVersion for updates to prevent lost updates
            if (payload.expectedVersion === undefined) {
                return respond(false, null, {
                    code: "VALIDATION_ERROR",
                    message: "expectedVersion is required for updates",
                });
            }

            // Update existing
            const found = findRowById(sheet, hdr["Id"], payload.id);
            if (!found) {
                return respond(false, null, {
                    code: "NOT_FOUND",
                    message: "Subscription not found",
                });
            }

            const currentVersion = Number(found.rowValues[hdr["Version"]] || 1);
            if (currentVersion !== Number(payload.expectedVersion)) {
                return respond(false, null, {
                    code: "VERSION_CONFLICT",
                    message: "Subscription was modified by another user",
                });
            }

            const updated = found.rowValues.slice();
            updated[hdr["CustomerId"]] = payload.customerId;
            updated[hdr["MilkType"]] = payload.milkType;
            updated[hdr["Qty"]] = Number(payload.quantity);
            updated[hdr["DeliveryDays"]] = JSON.stringify(payload.deliveryDays);
            updated[hdr["IsActive"]] = payload.isActive === true || payload.isActive === "TRUE" ? "TRUE" : "FALSE";
            updated[hdr["UpdatedAt"]] = now;
            updated[hdr["Version"]] = currentVersion + 1;

            // Log the change to the audit trail
            const oldDetails = `Qty: ${found.rowValues[hdr["Qty"]]} | Type: ${found.rowValues[hdr["MilkType"]]}`;
            const newDetails = `Qty: ${payload.quantity} | Type: ${payload.milkType}`;
            if (oldDetails !== newDetails) {
                logSubscriptionHistory(payload.id, "UPDATED", `Changed from [${oldDetails}] to [${newDetails}]`);
            }

            sheet.getRange(found.rowIndex, 1, 1, updated.length).setValues([updated]);
            return respond(true, { id: payload.id, newVersion: currentVersion + 1 });
        } else {
            // Create new
            if (payload.idempotencyKey) {
                const dup = findRowByColumnValue(sheet, hdr, "IdempotencyKey", payload.idempotencyKey);
                if (dup) {
                    return respond(true, {
                        id: dup.rowValues[hdr["Id"]],
                        duplicate: true,
                    });
                }
            }

            const id = Utilities.getUuid();
            const newRow = new Array(sheet.getLastColumn()).fill("");
            newRow[hdr["Id"]] = id;
            newRow[hdr["CustomerId"]] = payload.customerId;
            newRow[hdr["MilkType"]] = payload.milkType;
            newRow[hdr["Qty"]] = Number(payload.quantity);
            newRow[hdr["DeliveryDays"]] = JSON.stringify(payload.deliveryDays);
            newRow[hdr["IsActive"]] = payload.isActive === true || payload.isActive === "TRUE" ? "TRUE" : "FALSE";
            newRow[hdr["CreatedAt"]] = now;
            newRow[hdr["UpdatedAt"]] = now;
            newRow[hdr["Version"]] = 1;
            if (hdr["IdempotencyKey"] !== undefined) {
                newRow[hdr["IdempotencyKey"]] = payload.idempotencyKey || "";
            }

            safeAppend(sheet, newRow);

            // Log the creation to the audit trail
            logSubscriptionHistory(id, "CREATED", `Qty: ${payload.quantity} | Type: ${payload.milkType} | Days: ${JSON.stringify(payload.deliveryDays)}`);

            return respond(true, { id: id, newVersion: 1 });
        }
    });
}

/**
 * getSubscriptionHistory — fetches the audit trail for a specific subscription.
 */
function getSubscriptionHistory(payload) {
    const sheet = getSheet(SHEET_NAMES.SUBSCRIPTION_HISTORY || "SubscriptionHistory");
    const hdr = buildHeaderMap(sheet);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return respond(true, { history: [], total: 0 });

    const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

    const history = data
        .filter((row) => row[hdr["SubscriptionId"]] === payload.subscriptionId)
        .map((row) => ({
            id: row[hdr["Id"]],
            action: row[hdr["Action"]],
            details: row[hdr["Details"]],
            timestamp: row[hdr["Timestamp"]],
        }));
        
    history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    const total = history.length;
    const limit = Number(payload.limit) || 50;
    const offset = Number(payload.offset) || 0;
    
    return respond(true, {
        history: history.slice(offset, offset + limit),
        total: total,
        hasMore: offset + limit < total
    });
}

/**
 * addAdHocLog — creates a one-off delivery log (extra milk, guest delivery, etc.).
 */
function addAdHocLog(payload) {
    if (!payload.customerId || !payload.date || payload.quantity === undefined) {
        return respond(false, null, {
            code: "VALIDATION_ERROR",
            message: "Missing required fields",
        });
    }

    return withLock(function () {
        // FIX: Use SHEET_NAMES constant instead of hardcoded string
        const sheet = getSheet(SHEET_NAMES.DAILY_LOGS || "DailyLogs");
        const hdr = buildHeaderMap(sheet);
        const now = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
        
        // FIX: Add idempotency check
        if (payload.idempotencyKey) {
            const dup = findRowByColumnValue(sheet, hdr, "IdempotencyKey", payload.idempotencyKey);
            if (dup) {
                return respond(true, { id: dup.rowValues[hdr["LogId"]], duplicate: true });
            }
        }

        const newRow = new Array(sheet.getLastColumn()).fill("");

        newRow[hdr["LogId"]] = Utilities.getUuid();
        newRow[hdr["CustomerId"]] = payload.customerId;
        newRow[hdr["Date"]] = payload.date;

        // Handle Quantity vs Qty column name gracefully
        const qtyCol = hdr["Qty"] !== undefined ? "Qty" : "Quantity";
        if (qtyCol && hdr[qtyCol] !== undefined) newRow[hdr[qtyCol]] = Number(payload.quantity);
        newRow[hdr["Delivered"]] = true; // Ad-hoc logs are considered delivered immediately
        if (hdr["Source"] !== undefined) newRow[hdr["Source"]] = "ADHOC";
        if (hdr["Reason"] !== undefined) newRow[hdr["Reason"]] = payload.reason || "";
        if (hdr["CreatedAt"] !== undefined) newRow[hdr["CreatedAt"]] = now;
        if (hdr["UpdatedAt"] !== undefined) newRow[hdr["UpdatedAt"]] = now;
        if (hdr["IdempotencyKey"] !== undefined) newRow[hdr["IdempotencyKey"]] = payload.idempotencyKey || "";

        safeAppend(sheet, newRow);
        return respond(true, { id: newRow[hdr["LogId"]] });
    });
}

/**
 * addCreditNote — issues a credit note to offset a customer's bill.
 */
function addCreditNote(payload) {
  return withLock(function () {
    if (!payload.customerId) {
      return respond(false, null, { code: "VALIDATION_ERROR", message: "Missing customerId" });
    }
    const amount = Number(payload.amount);
    if (isNaN(amount) || amount <= 0) {
      return respond(false, null, { code: "VALIDATION_ERROR", message: "Amount must be a positive number" });
    }
    if (!payload.reason || typeof payload.reason !== "string") {
      return respond(false, null, { code: "VALIDATION_ERROR", message: "Missing or invalid reason" });
    }

    // Verify customer exists
    const custSheet = getSheet(SHEET_NAMES.CUSTOMERS);
    const custHdr = buildHeaderMap(getSheet(SHEET_NAMES.CUSTOMERS));  
    const custData = custSheet.getDataRange().getValues();
    let customerExists = false;
    for (let i = 1; i < custData.length; i++) {
      if (custData[i][custHdr["CustomerId"]] === payload.customerId) {
        customerExists = true;
        break;
      }
    }
    if (!customerExists) {
      return respond(false, null, { code: "NOT_FOUND", message: "Customer not found" });
    }

    const sheet = getSheet(SHEET_NAMES.CREDIT_NOTES);
    const hdr = buildHeaderMap(getSheet(SHEET_NAMES.CREDIT_NOTES));
    const noteId = "CN-" + Utilities.getUuid();
    
    const row = new Array(sheet.getLastColumn()).fill("");
    row[hdr["Id"]] = noteId;
    row[hdr["CustomerId"]] = payload.customerId;
    row[hdr["Date"]] = payload.date || todayIST();
    row[hdr["Amount"]] = amount;
    row[hdr["Reason"]] = sanitizeForText(payload.reason);
    row[hdr["Applied"]] = false;
    row[hdr["BillId"]] = "";
    row[hdr["CreatedAt"]] = nowISTTimestamp();
    
    sheet.appendRow(row);
    writeActivityLog("addCreditNote", "Created credit note " + noteId + " for customer " + payload.customerId);
    
    return respond(true, { creditNoteId: noteId });
  });
}

/**
 * getCreditNotes — fetches all issued credit notes.
 */
function getCreditNotes() {
    const sheet = getSheet(SHEET_NAMES.CREDIT_NOTES || "CreditNotes");
    const hdr = buildHeaderMap(sheet);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return respond(true, { creditNotes: [] });

    const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

    const creditNotes = data.map((row) => ({
        id: row[hdr["Id"]],
        customerId: row[hdr["CustomerId"]],
        billId: hdr["BillId"] !== undefined ? row[hdr["BillId"]] : "",
        amount: Number(row[hdr["Amount"]]),
        reason: row[hdr["Reason"]],
        createdAt: row[hdr["CreatedAt"]],
    }));

    return respond(true, { creditNotes });
}

/**
 * generateDailyLogsForDate — CRITICAL ACTION.
 * Automatically creates DailyLogs for active subscriptions on a given date.
 * Respects pause periods, active customer status, and prevents overwriting manual entries.
 */
function generateDailyLogsForDate(payload) {
    // FIX: Corrected regex to use \d instead of d
    if (!payload.date || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
        return respond(false, null, {
            code: "VALIDATION_ERROR",
            message: "Invalid date format (YYYY-MM-DD)",
        });
    }

    return withLock(function () {
        // FIX (AI-1): Use CacheService instead of PropertiesService to auto-expire idempotency keys after 24h (86400s)
        // This prevents the 9KB/500 key quota limit DoS vulnerability.
        const cache = CacheService.getScriptCache();
        const idemKey = "IDEM_GEN_LOGS_" + (payload.idempotencyKey || "");
        if (payload.idempotencyKey) {
            const cached = cache.get(idemKey);
            if (cached) {
                return respond(true, JSON.parse(cached));
            }
        }

        const targetDate = payload.date;
        
        // FIX (AI-1): Parse date in IST to avoid UTC day-of-week shift for late-night runs
        const dt = new Date(targetDate + "T00:00:00+05:30");
        const dayOfWeek = dt.getDay(); // 0 = Sunday, 6 = Saturday

        // 1. Fetch Subscriptions
        const subSheet = getSheet(SHEET_NAMES.SUBSCRIPTIONS || "Subscriptions");
        const subHdr = buildHeaderMap(subSheet);
        const subLastRow = subSheet.getLastRow();
        const subs = subLastRow >= 2 ? subSheet.getRange(2, 1, subLastRow - 1, subSheet.getLastColumn()).getValues() : [];

        // 2. Fetch Active Customers
        const custSheet = getSheet(SHEET_NAMES.CUSTOMERS || "Customers");
        const custHdr = buildHeaderMap(custSheet);
        const custLastRow = custSheet.getLastRow();
        const custs = custLastRow >= 2 ? custSheet.getRange(2, 1, custLastRow - 1, custSheet.getLastColumn()).getValues() : [];
        
        const activeCustIds = new Set();
        custs.forEach((row) => {
            const status = String(row[custHdr["Status"]] || "").toUpperCase();
            if (status === "ACTIVE") activeCustIds.add(row[custHdr["CustomerId"]]);
        });

        // 3. Fetch Existing Logs for targetDate (to prevent overwriting manual admin entries)
        const logSheet = getSheet(SHEET_NAMES.DAILY_LOGS || "DailyLogs");
        const logHdr = buildHeaderMap(logSheet);
        const logLastRow = logSheet.getLastRow();
        const logs = logLastRow >= 2 ? logSheet.getRange(2, 1, logLastRow - 1, logSheet.getLastColumn()).getValues() : [];
        
        const existingLogKeys = new Set();
        logs.forEach((row) => {
            if (row[logHdr["Date"]] === targetDate) {
                existingLogKeys.add(row[logHdr["CustomerId"]]);
            }
        });

        // 4. Fetch Pauses
        const pausesSheet = getSheet(SHEET_NAMES.PAUSE_PERIODS);
        const pauseHdr = buildHeaderMap(pauseSheet);
        const pauseLastRow = pauseSheet.getLastRow();
        const pauses = pauseLastRow >= 2 ? pauseSheet.getRange(2, 1, pauseLastRow - 1, pauseSheet.getLastColumn()).getValues() : [];

        const pausedCustIds = new Set();
        pauses.forEach((row) => {
            const start = String(row[pauseHdr["StartDate"]] || "");
            const end = String(row[pauseHdr["EndDate"]] || "");
            const custId = row[pauseHdr["CustomerId"]];
            
            // FIX (AI-1): Handle open-ended pauses (if end is empty, treat as active indefinitely)
            if (start && start <= targetDate && (!end || targetDate <= end)) {
                pausedCustIds.add(custId);
            }
        });

        let created = 0, skippedExisting = 0, skippedPaused = 0, skippedWrongDay = 0, skippedInactiveCust = 0;
        const newLogs = [];
        const logColumns = Object.keys(logHdr).length;
        const now = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");

        subs.forEach((row) => {
            const isActive = row[subHdr["IsActive"]] === true || row[subHdr["IsActive"]] === "TRUE";
            if (!isActive) return;

            const custId = row[subHdr["CustomerId"]];

            if (!activeCustIds.has(custId)) {
                skippedInactiveCust++;
                return;
            }

            const deliveryDays = JSON.parse(row[subHdr["DeliveryDays"]] || "[]");
            if (!deliveryDays.includes(dayOfWeek)) {
                skippedWrongDay++;
                return;
            }

            if (pausedCustIds.has(custId)) {
                skippedPaused++;
                return;
            }

            if (existingLogKeys.has(custId)) {
                skippedExisting++;
                return;
            }

            // Create new log entry
            const logRow = new Array(logColumns).fill("");
            logRow[logHdr["LogId"]] = Utilities.getUuid();
            logRow[logHdr["CustomerId"]] = custId;
            logRow[logHdr["Date"]] = targetDate;
            logRow[logHdr["Qty"]] = Number(row[subHdr["Qty"]]);

            // Map MilkType/Product depending on your DailyLogs schema
            if (logHdr["MilkType"] !== undefined) logRow[logHdr["MilkType"]] = row[subHdr["MilkType"]];
            if (logHdr["Product"] !== undefined) logRow[logHdr["Product"]] = row[subHdr["MilkType"]];

            // FIX (AI-1): Set Delivered to false instead of "PENDING" (which evaluates to true in JS)
            logRow[logHdr["Delivered"]] = false; 
            
            logRow[logHdr["CreatedAt"]] = now;
            logRow[logHdr["UpdatedAt"]] = now;

            newLogs.push(logRow);
            existingLogKeys.add(custId); // Prevent duplicate if multiple subs exist for same customer
            created++;
        });

        if (newLogs.length > 0) {
            logSheet.getRange(logSheet.getLastRow() + 1, 1, newLogs.length, logColumns).setValues(newLogs);
        }

        const summary = {
            created,
            skippedExisting,
            skippedPaused,
            skippedWrongDay,
            skippedInactiveCust,
        };

        // FIX (AI-1): Cache result for idempotency (expires in 24 hours = 86400 seconds)
        if (payload.idempotencyKey) {
            cache.put(idemKey, JSON.stringify(summary), 86400);
        }

        return respond(true, summary);
    });
}