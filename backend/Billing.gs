/**
 * ============================================================================
 * MILK DELIVERY ADMIN — V17 BACKEND
 * PART 2 of 5: BILLING + PAYMENT ACTIONS
 * ============================================================================
 *
 * Depends on Part 4 (Core Infrastructure) helpers — see stub block at the
 * bottom of this file, same pattern as Part 1. DELETE stubs once Part 4 lands.
 *
 * Sheet: Bills
 *   BillId | CustomerId | Month | Amount | AmountPaid | Status | DueDate |
 *   Locked | StaleFlag | Version | CreatedAt | UpdatedAt
 *
 * Sheet: Payments
 *   PaymentId | BillId | CustomerId | Amount | Mode | Date | Note |
 *   IdempotencyKey | CreatedAt
 *
 * Sheet: Adjustments
 *   AdjustmentId | CustomerId | Date | Amount | Reason | Applied | BillId |
 *   CreatedAt
 *
 * Status lifecycle: Unpaid -> Partial -> Paid (never moves backward except
 * via a correction adjustment, which is out of scope for these actions).
 *
 * Rule 10: all payment amounts rounded to 2 decimals via Math.round(*100)/100.
 * ============================================================================
 */

const PAYMENT_MODES = [
  "Cash",
  "UPI",
  "PhonePe",
  "GPay",
  "Paytm",
  "Bank Transfer",
  "Cheque",
];
const BILL_STATUSES = ["Unpaid", "Partial", "Paid"];
const RATE_PER_LITER_DEFAULT = 32; // fallback if no MilkType-specific rate is configured

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

// ----------------------------------------------------------------------------
// VALIDATION
// ----------------------------------------------------------------------------

function validatePaymentPayload(payload) {
  const errors = [];
  if (!payload.billId) errors.push("billId is required");
  if (payload.amount === undefined || payload.amount === null)
    errors.push("amount is required");
  else {
    const amt = Number(payload.amount);
    if (isNaN(amt) || amt <= 0) errors.push("amount must be a positive number");
    else if (amt > 1000000)
      errors.push("amount exceeds maximum allowed (₹10,00,000)");
  }
  if (!payload.mode) errors.push("mode is required");
  else if (PAYMENT_MODES.indexOf(payload.mode) === -1)
    errors.push("Invalid payment mode: " + payload.mode);
  if (!payload.idempotencyKey) errors.push("idempotencyKey is required");
  return { valid: errors.length === 0, errors };
}

function validateAdjustmentPayload(payload) {
  const errors = [];
  if (!payload.customerId) errors.push("customerId is required");
  if (
    payload.amount === undefined ||
    payload.amount === null ||
    Number(payload.amount) === 0
  ) {
    errors.push("amount is required and must be non-zero");
  } else if (Math.abs(Number(payload.amount)) > 100000) {
    errors.push("amount exceeds maximum allowed (₹1,00,000)");
  }
  if (!payload.reason || !String(payload.reason).trim())
    errors.push("reason is required");
  return { valid: errors.length === 0, errors };
}

// ----------------------------------------------------------------------------
// deriveStatus — pure function, unit-tested in Section 9 of the spec
// ----------------------------------------------------------------------------

function deriveStatus(amount, amountPaid, billLifecycleState) {
    const a = round2(amount);
    const p = round2(amountPaid);
    
    if (a <= 0) return "Paid";
    if (p <= 0) return "Unpaid";
    if (p >= a) return "Paid";
    return "Partial";
}

// ----------------------------------------------------------------------------
// BILL GENERATION
// ----------------------------------------------------------------------------

/**
 * generateMonthBill — creates a bill for one customer for one month, based
 * on confirmed DailyLogs (delivered=true) in that month, minus any *applied*
 * adjustments dated within the month.
 * Required: customerId, month (YYYY-MM)
 */
function generateMonthBill(payload) {
  if (!payload.customerId)
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: "customerId is required",
    });
  if (!payload.month || !/^\d{4}-\d{2}$/.test(payload.month)) {
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: "month must be YYYY-MM",
    });
  }

  return withLock(function () {
    const billSheet = getSheet("BILLS");
    const billHdr = buildHeaderMap(billSheet);

    // Prevent duplicate bill for same customer+month
    const existing = findRowByTwoColumns(
      billSheet,
      billHdr,
      "CustomerId",
      payload.customerId,
      "Month",
      payload.month,
    );
    if (existing) {
      return respond(false, null, {
        code: "CONFLICT",
        message: "Bill already exists for this customer and month",
        billId: existing.rowValues[billHdr["BillId"]],
      });
    }

    const custSheet = getSheet("CUSTOMERS");
    const custHdr = buildHeaderMap(custSheet);
    const custRow = findRowById(
      custSheet,
      custHdr["CustomerId"],
      payload.customerId,
    );
    if (!custRow)
      return respond(false, null, {
        code: "NOT_FOUND",
        message: "Customer not found",
      });

    // Sum delivered quantity for the month from DailyLogs
    const logSheet = getSheet("DAILY_LOGS");
    const logHdr = buildHeaderMap(logSheet);
    const logLastRow = logSheet.getLastRow();
    let totalQty = 0;

    if (logLastRow >= 2) {
      const logs = logSheet
        .getRange(2, 1, logLastRow - 1, logSheet.getLastColumn())
        .getValues();
      logs.forEach((row) => {
        if (row[logHdr["CustomerId"]] !== payload.customerId) return;
        if (!String(row[logHdr["Date"]]).startsWith(payload.month)) return;
        if (!row[logHdr["Delivered"]]) return;
        totalQty += Number(row[logHdr["Qty"]]) || 0;
      });
    }

    const rate = Number(payload.ratePerLiter) || RATE_PER_LITER_DEFAULT;
    let amount = round2(totalQty * rate);

    // Apply any *already-applied* adjustments for this customer dated in this month
    const adjSheet = getSheet("ADJUSTMENTS");
    const adjHdr = buildHeaderMap(adjSheet);
    const adjLastRow = adjSheet.getLastRow();
    if (adjLastRow >= 2) {
      const adjustments = adjSheet
        .getRange(2, 1, adjLastRow - 1, adjSheet.getLastColumn())
        .getValues();
      adjustments.forEach((row) => {
        if (row[adjHdr["CustomerId"]] !== payload.customerId) return;
        if (!String(row[adjHdr["Date"]]).startsWith(payload.month)) return;
        if (!row[adjHdr["Applied"]]) return;
        amount = round2(amount + Number(row[adjHdr["Amount"]]));
      });
    }

    if (amount < 0) amount = 0; // a bill can't be negative; credit carries forward via Balance, not handled here

    const billId = "BILL-" + Utilities.getUuid().substring(0, 8).toUpperCase();
    const now = Utilities.formatDate(
      new Date(),
      TIMEZONE,
      "yyyy-MM-dd'T'HH:mm:ssXXX",
    );
    const dueDate = computeDueDate(payload.month);

    const row = [];
    row[billHdr["BillId"]] = billId;
    row[billHdr["CustomerId"]] = payload.customerId;
    row[billHdr["Month"]] = payload.month;
    row[billHdr["Amount"]] = amount;
    row[billHdr["AmountPaid"]] = 0;
    row[billHdr["Status"]] = deriveStatus(amount, 0, "Generated");
    row[billHdr["DueDate"]] = dueDate;
    row[billHdr["Locked"]] = false;
    row[billHdr["StaleFlag"]] = false;
    row[billHdr["Version"]] = 1;
    row[billHdr["CreatedAt"]] = now;
    row[billHdr["UpdatedAt"]] = now;

    safeAppend(billSheet, row);
    writeActivityLog("generateMonthBill", payload, {
      billId: billId,
      amount: amount,
      totalQty: totalQty,
    });

    return respond(true, {
      billId: billId,
      amount: amount,
      totalQty: totalQty,
      dueDate: dueDate,
    });
  });
}

function computeDueDate(month) {
  // Due 5th of the following month
  const parts = month.split("-");
  let y = Number(parts[0]),
    m = Number(parts[1]) + 1;
  if (m > 12) {
    m = 1;
    y += 1;
  }
  return y + "-" + String(m).padStart(2, "0") + "-05";
}

// ----------------------------------------------------------------------------
// UPDATE / LOCK / FINALIZE
// ----------------------------------------------------------------------------

/**
 * updateBill — adjusts a non-locked bill's Amount directly (manual correction
 * path, separate from adjustments). Required: billId, expectedVersion, amount
 */
function updateBill(payload) {
  if (!payload.billId)
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: "billId is required",
    });
  if (payload.expectedVersion === undefined)
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: "expectedVersion is required",
    });
  if (
    payload.amount === undefined ||
    isNaN(Number(payload.amount)) ||
    Number(payload.amount) < 0
  ) {
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: "Valid amount is required",
    });
  }

  return withLock(function () {
    const sheet = getSheet("BILLS");
    const hdr = buildHeaderMap(sheet);
    const found = findRowById(sheet, hdr["BillId"], payload.billId);
    if (!found)
      return respond(false, null, {
        code: "NOT_FOUND",
        message: "Bill not found",
      });

    if (found.rowValues[hdr["Locked"]] === true) {
      return respond(false, null, {
        code: "BILL_LOCKED",
        message: "Cannot modify a locked bill",
      });
    }

    const currentVersion = Number(found.rowValues[hdr["Version"]]);
    if (currentVersion !== Number(payload.expectedVersion)) {
      return respond(false, null, {
        code: "VERSION_CONFLICT",
        message: "Bill was modified by another process",
        currentVersion: currentVersion,
      });
    }

    const newAmount = round2(payload.amount);
    const amountPaid = Number(found.rowValues[hdr["AmountPaid"]]);
    const now = Utilities.formatDate(
      new Date(),
      TIMEZONE,
      "yyyy-MM-dd'T'HH:mm:ssXXX",
    );

    sheet.getRange(found.rowIndex, hdr["Amount"] + 1).setValue(newAmount);
    sheet
      .getRange(found.rowIndex, hdr["Status"] + 1)
      .setValue(deriveStatus(newAmount, amountPaid, "Updated"));
    sheet.getRange(found.rowIndex, hdr["StaleFlag"] + 1).setValue(false);
    sheet
      .getRange(found.rowIndex, hdr["Version"] + 1)
      .setValue(currentVersion + 1);
    sheet.getRange(found.rowIndex, hdr["UpdatedAt"] + 1).setValue(now);

    writeActivityLog("updateBill", payload, {
      billId: payload.billId,
      newAmount: newAmount,
    });
    return respond(true, {
      billId: payload.billId,
      newVersion: currentVersion + 1,
      newAmount: newAmount,
    });
  });
}

/**
 * finalizeBill — marks a bill ready for collection (no further auto-recalc).
 * Distinct from "Locked", which additionally blocks edits and payments.
 */
function finalizeBill(payload) {
  if (!payload.billId)
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: "billId is required",
    });

  return withLock(function () {
    const sheet = getSheet("BILLS");
    const hdr = buildHeaderMap(sheet);
    const found = findRowById(sheet, hdr["BillId"], payload.billId);
    if (!found)
      return respond(false, null, {
        code: "NOT_FOUND",
        message: "Bill not found",
      });

    const now = Utilities.formatDate(
      new Date(),
      TIMEZONE,
      "yyyy-MM-dd'T'HH:mm:ssXXX",
    );
    sheet.getRange(found.rowIndex, hdr["StaleFlag"] + 1).setValue(false);
    sheet
      .getRange(found.rowIndex, hdr["Version"] + 1)
      .setValue(Number(found.rowValues[hdr["Version"]]) + 1);
    sheet.getRange(found.rowIndex, hdr["UpdatedAt"] + 1).setValue(now);

    writeActivityLog("finalizeBill", payload, { billId: payload.billId });
    return respond(true, { billId: payload.billId });
  });
}

/**
 * lockBill — prevents any further edits or payments against this bill.
 * Typically called once a bill is confirmed fully settled or archived.
 */
function lockBill(payload) {
  if (!payload.billId)
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: "billId is required",
    });

  return withLock(function () {
    const sheet = getSheet("BILLS");
    const hdr = buildHeaderMap(sheet);
    const found = findRowById(sheet, hdr["BillId"], payload.billId);
    if (!found)
      return respond(false, null, {
        code: "NOT_FOUND",
        message: "Bill not found",
      });

    if (found.rowValues[hdr["Locked"]] === true) {
      return respond(false, null, {
        code: "ALREADY_LOCKED",
        message: "Bill is already locked",
      });
    }

    const now = Utilities.formatDate(
      new Date(),
      TIMEZONE,
      "yyyy-MM-dd'T'HH:mm:ssXXX",
    );
    sheet.getRange(found.rowIndex, hdr["Locked"] + 1).setValue(true);
    sheet
      .getRange(found.rowIndex, hdr["Version"] + 1)
      .setValue(Number(found.rowValues[hdr["Version"]]) + 1);
    sheet.getRange(found.rowIndex, hdr["UpdatedAt"] + 1).setValue(now);

    writeActivityLog("lockBill", payload, { billId: payload.billId });
    return respond(true, { billId: payload.billId });
  });
}

/**
 * unlockBill — reverses lockBill. This is the action whose missing-variable
 * bug (undefined `bhm`) caused a runtime crash in V15/16 (B153). Rewritten
 * cleanly here with no shortcuts — every variable used is declared above.
 */
function unlockBill(payload) {
  if (!payload.billId)
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: "billId is required",
    });

  return withLock(function () {
    const sheet = getSheet("BILLS");
    const hdr = buildHeaderMap(sheet);
    const found = findRowById(sheet, hdr["BillId"], payload.billId);
    if (!found)
      return respond(false, null, {
        code: "NOT_FOUND",
        message: "Bill not found",
      });

    const now = Utilities.formatDate(
      new Date(),
      TIMEZONE,
      "yyyy-MM-dd'T'HH:mm:ssXXX",
    );
    sheet.getRange(found.rowIndex, hdr["Locked"] + 1).setValue(false);
    sheet
      .getRange(found.rowIndex, hdr["Version"] + 1)
      .setValue(Number(found.rowValues[hdr["Version"]]) + 1);
    sheet.getRange(found.rowIndex, hdr["UpdatedAt"] + 1).setValue(now);

    writeActivityLog("unlockBill", payload, { billId: payload.billId });
    return respond(true, { billId: payload.billId });
  });
}

// ----------------------------------------------------------------------------
// PAYMENT — the most concurrency-sensitive action in the system
// ----------------------------------------------------------------------------

/**
 * recordPayment — adds a payment against a bill with:
 *  - idempotency (re-sent writes with the same idempotencyKey are no-ops)
 *  - a final re-read of AmountPaid *inside the lock* right before writing,
 *    to avoid lost updates from concurrent payments (Section 11: "Lost-update
 *    prevention — final re-read before write")
 *  - an overpayment guard, bypassable only with allowOverpayment=true
 *  - bill-locked guard
 * Required: billId, amount, mode, idempotencyKey
 * Optional: date, note, allowOverpayment
 */
function recordPayment(payload) {
  const v = validatePaymentPayload(payload);
  if (!v.valid)
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: v.errors.join("; "),
    });

  return withLock(function () {
    const paymentSheet = getSheet("PAYMENTS");
    const paymentHdr = buildHeaderMap(paymentSheet);

    // Idempotency check FIRST, before touching the bill at all.
    const dup = findRowByColumnValue(
      paymentSheet,
      paymentHdr,
      "IdempotencyKey",
      payload.idempotencyKey,
    );
    if (dup) {
      return respond(true, {
        paymentId: dup.rowValues[paymentHdr["PaymentId"]],
        billId: dup.rowValues[paymentHdr["BillId"]],
        duplicate: true,
      });
    }

    const billSheet = getSheet("BILLS");
    const billHdr = buildHeaderMap(billSheet);
    const found = findRowById(billSheet, billHdr["BillId"], payload.billId);
    if (!found)
      return respond(false, null, {
        code: "NOT_FOUND",
        message: "Bill not found",
      });

    if (found.rowValues[billHdr["Locked"]] === true) {
      return respond(false, null, {
        code: "BILL_LOCKED",
        message: "Cannot record payment against a locked bill",
      });
    }

    // --- Final re-read inside the lock, right before computing the new total.
    // findRowById already read fresh values under the lock we're holding, but
    // we re-fetch explicitly here as a defensive, self-documenting step in
    // case this function is ever refactored to read earlier in its body.
    const freshRow = billSheet
      .getRange(found.rowIndex, 1, 1, billSheet.getLastColumn())
      .getValues()[0];
    const amount = Number(freshRow[billHdr["Amount"]]);
    const currentPaid = Number(freshRow[billHdr["AmountPaid"]]);
    const paymentAmt = round2(payload.amount);
    const newPaid = round2(currentPaid + paymentAmt);

    if (newPaid > amount && !payload.allowOverpayment) {
      return respond(false, null, {
        code: "OVERPAYMENT",
        message:
          "Payment would exceed bill amount. Pass allowOverpayment:true to override.",
        billAmount: amount,
        currentPaid: currentPaid,
        attemptedTotal: newPaid,
      });
    }

    const paymentId =
      "PAY-" + Utilities.getUuid().substring(0, 8).toUpperCase();
    const now = Utilities.formatDate(
      new Date(),
      TIMEZONE,
      "yyyy-MM-dd'T'HH:mm:ssXXX",
    );

    const payRow = [];
    payRow[paymentHdr["PaymentId"]] = paymentId;
    payRow[paymentHdr["BillId"]] = payload.billId;
    payRow[paymentHdr["CustomerId"]] = freshRow[billHdr["CustomerId"]];
    payRow[paymentHdr["Amount"]] = paymentAmt;
    payRow[paymentHdr["Mode"]] = payload.mode;
    payRow[paymentHdr["Date"]] =
      payload.date ||
      Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd");
    payRow[paymentHdr["Note"]] = sanitizeForText(payload.note || "");
    payRow[paymentHdr["IdempotencyKey"]] = payload.idempotencyKey;
    payRow[paymentHdr["CreatedAt"]] = now;

    safeAppend(paymentSheet, payRow);

    const newStatus = deriveStatus(amount, newPaid, "Paid");
    billSheet
      .getRange(found.rowIndex, billHdr["AmountPaid"] + 1)
      .setValue(newPaid);
    billSheet
      .getRange(found.rowIndex, billHdr["Status"] + 1)
      .setValue(newStatus);
    billSheet
      .getRange(found.rowIndex, billHdr["Version"] + 1)
      .setValue(Number(freshRow[billHdr["Version"]]) + 1);
    billSheet.getRange(found.rowIndex, billHdr["UpdatedAt"] + 1).setValue(now);

    writeActivityLog("recordPayment", payload, {
      paymentId: paymentId,
      billId: payload.billId,
      newPaid: newPaid,
      newStatus: newStatus,
    });

    return respond(true, {
      paymentId: paymentId,
      billId: payload.billId,
      amountPaid: newPaid,
      status: newStatus,
      overpaid: newPaid > amount,
    });
  });
}

// ----------------------------------------------------------------------------
// ADJUSTMENTS
// ----------------------------------------------------------------------------

/**
 * addAdjustment
 */
function addAdjustment(payload) {
  return withLock(function () {
    if (!payload.customerId || payload.amount === undefined || !payload.reason) {
      return respond(false, null, { code: "VALIDATION_ERROR", message: "Missing customerId, amount, or reason" });
    }
    const amount = Number(payload.amount);
    if (isNaN(amount) || amount === 0) {
      return respond(false, null, { code: "VALIDATION_ERROR", message: "Amount must be a non-zero number" });
    }

    const sheet = getSheet(SHEET_NAMES.ADJUSTMENTS);
    const hdr = buildHeaderMap(getSheet(SHEET_NAMES.ADJUSTMENTS));
    const adjId = "ADJ-" + Utilities.getUuid();
    
    const row = new Array(sheet.getLastColumn()).fill("");
    row[hdr["AdjustmentId"]] = adjId;
    row[hdr["CustomerId"]] = payload.customerId;
    row[hdr["Date"]] = payload.date || todayIST();
    row[hdr["Amount"]] = amount;
    row[hdr["Reason"]] = sanitizeForText(payload.reason);
    row[hdr["Applied"]] = false; 
    row[hdr["BillId"]] = "";
    row[hdr["CreatedAt"]] = nowISTTimestamp();
    
    sheet.appendRow(row);
    writeActivityLog("addAdjustment", "Created adjustment " + adjId + " for customer " + payload.customerId);
    
    return respond(true, { adjustmentId: adjId });
  });
}

/**
 * applyAdjustment — applies a not-yet-applied adjustment directly to an
 * existing, unlocked bill's Amount + Status. This is for adjustments raised
 * AFTER a bill was already generated (the common case in the UI). For
 * adjustments dated before bill generation, generateMonthBill already folds
 * in applied adjustments automatically — applying twice is prevented by the
 * Applied flag.
 * Required: adjustmentId, billId
 */
function applyAdjustment(payload) {
  if (!payload.adjustmentId)
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: "adjustmentId is required",
    });
  if (!payload.billId)
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: "billId is required",
    });

  return withLock(function () {
    const adjSheet = getSheet("ADJUSTMENTS");
    const adjHdr = buildHeaderMap(adjSheet);
    const adjRow = findRowById(
      adjSheet,
      adjHdr["AdjustmentId"],
      payload.adjustmentId,
    );
    if (!adjRow)
      return respond(false, null, {
        code: "NOT_FOUND",
        message: "Adjustment not found",
      });
    if (adjRow.rowValues[adjHdr["Applied"]] === true) {
      return respond(false, null, {
        code: "ALREADY_APPLIED",
        message: "Adjustment was already applied",
      });
    }

    const billSheet = getSheet("BILLS");
    const billHdr = buildHeaderMap(billSheet);
    const billRow = findRowById(billSheet, billHdr["BillId"], payload.billId);
    if (!billRow)
      return respond(false, null, {
        code: "NOT_FOUND",
        message: "Bill not found",
      });
    if (billRow.rowValues[billHdr["Locked"]] === true) {
      return respond(false, null, {
        code: "BILL_LOCKED",
        message: "Cannot apply adjustment to a locked bill",
      });
    }
    
    const adjAmount = Number(adjRow.rowValues[adjHdr["Amount"]]);
    const currentAmount = Number(billRow.rowValues[billHdr["Amount"]]);
    const currentPaid = Number(billRow.rowValues[billHdr["AmountPaid"]]);
    let newAmount = round2(currentAmount + adjAmount);
    if (newAmount < 0) newAmount = 0;

    const now = Utilities.formatDate(
      new Date(),
      TIMEZONE,
      "yyyy-MM-dd'T'HH:mm:ssXXX",
    );

    billSheet
      .getRange(billRow.rowIndex, billHdr["Amount"] + 1)
      .setValue(newAmount);
    billSheet
      .getRange(billRow.rowIndex, billHdr["Status"] + 1)
      .setValue(deriveStatus(newAmount, currentPaid, "Adjusted"));
    billSheet
      .getRange(billRow.rowIndex, billHdr["Version"] + 1)
      .setValue(Number(billRow.rowValues[billHdr["Version"]]) + 1);
    billSheet
      .getRange(billRow.rowIndex, billHdr["UpdatedAt"] + 1)
      .setValue(now);

    adjSheet.getRange(adjRow.rowIndex, adjHdr["Applied"] + 1).setValue(true);
    adjSheet
      .getRange(adjRow.rowIndex, adjHdr["BillId"] + 1)
      .setValue(payload.billId);

    writeActivityLog("applyAdjustment", payload, {
      adjustmentId: payload.adjustmentId,
      billId: payload.billId,
      newAmount: newAmount,
    });
    return respond(true, { billId: payload.billId, newAmount: newAmount });
  });
}

// ----------------------------------------------------------------------------
// READ ACTIONS
// ----------------------------------------------------------------------------

/**
 * getBills — paginated, filterable by customerId, month, status
 */
function getBills(payload) {
  const sheet = getSheet("BILLS");
  const hdr = buildHeaderMap(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2)
    return respond(true, { bills: [], total: 0, hasMore: false });

  const values = sheet
    .getRange(2, 1, lastRow - 1, sheet.getLastColumn())
    .getValues();
  let filtered = values.filter((row) => {
    if (payload.customerId && row[hdr["CustomerId"]] !== payload.customerId)
      return false;
    if (payload.month && row[hdr["Month"]] !== payload.month) return false;
    if (payload.status && row[hdr["Status"]] !== payload.status) return false;
    return true;
  });

  const total = filtered.length;
  const limit = Number(payload.limit) || 5000; 
  const offset = Number(payload.offset) || 0;
  const page = filtered.slice(offset, offset + limit);

  const bills = page.map((row) => ({
    billId: row[hdr["BillId"]],
    customerId: row[hdr["CustomerId"]],
    month: row[hdr["Month"]],
    amount: row[hdr["Amount"]],
    amountPaid: row[hdr["AmountPaid"]],
    status: row[hdr["Status"]],
    dueDate: row[hdr["DueDate"]],
    locked: !!row[hdr["Locked"]],
    version: row[hdr["Version"]],
  }));

  return respond(true, {
    bills: bills,
    total: total,
    hasMore: offset + limit < total,
  });
}

/**
 * getBillText — returns a plain-text bill summary, sanitized, for WhatsApp
 * share or printing. All interpolated fields pass through sanitizeForText.
 */
function getBillText(payload) {
  if (!payload.billId) {
    return respond(false, null, { code: "VALIDATION_ERROR", message: "Missing billId" });
  }

  const sheet = getSheet(SHEET_NAMES.BILLS);
  const hdr = buildHeaderMap(getSheet(SHEET_NAMES.BILLS));
  const data = sheet.getDataRange().getValues();

  let bill = null;
  for (let i = 1; i < data.length; i++) {
    if (data[i][hdr["BillId"]] === payload.billId) {
      bill = data[i];
      break;
    }
  }

  if (!bill) {
    return respond(false, null, { code: "NOT_FOUND", message: "Bill not found" });
  }

  // Get customer name
  const custSheet = getSheet(SHEET_NAMES.CUSTOMERS);
  const custHdr = buildHeaderMap(getSheet(SHEET_NAMES.CUSTOMERS));  
  const custData = custSheet.getDataRange().getValues();
  let customerName = "Customer";
  for (let i = 1; i < custData.length; i++) {
    if (custData[i][custHdr["CustomerId"]] === bill[hdr["CustomerId"]]) {
      customerName = custData[i][custHdr["Name"]] || "Customer";
      break;
    }
  }

  const amount = Number(bill[hdr["Amount"]] || 0);
  const paid = Number(bill[hdr["AmountPaid"]] || 0);
  const pending = Math.max(0, amount - paid);
  
  // Sanitize all interpolated values
  const safeName = sanitizeForText(customerName);
  const safeMonth = sanitizeForText(bill[hdr["Month"]] || "");
  const safeDueDate = sanitizeForText(bill[hdr["DueDate"]] || "");

  const text = 
    "Bill for " + safeName + "\n" +
    "Month: " + safeMonth + "\n" +
    "Total: Rs. " + amount.toFixed(2) + "\n" +
    "Paid: Rs. " + paid.toFixed(2) + "\n" +
    "Pending: Rs. " + pending.toFixed(2) + "\n" +
    "Due Date: " + safeDueDate;

  return respond(true, { text });
}

function getAdjustments(payload) {
  const sheet = getSheet(SHEET_NAMES.ADJUSTMENTS);
 
  const hdr = buildHeaderMap(sheet); 
  
  const data = sheet.getDataRange().getValues();
  
  const adjustments = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    adjustments.push({
      adjustmentId: row[hdr["AdjustmentId"]],
      billId: row[hdr["BillId"]],
      customerId: row[hdr["CustomerId"]],
      amount: Number(row[hdr["Amount"]] || 0),
      reason: row[hdr["Reason"]],
      applied: row[hdr["Applied"]] === true || row[hdr["Applied"]] === "TRUE",
      date: row[hdr["Date"]],
      createdAt: row[hdr["CreatedAt"]]
    });
  }
  return respond(true, { adjustments });
}

// ----------------------------------------------------------------------------
// RECONCILIATION
// ----------------------------------------------------------------------------

/**
 * reconcileBillingLedger — recomputes AmountPaid for every non-locked bill
 * from the Payments sheet (sum of payments per billId) and corrects drift.
 * Locked bills are skipped intentionally (Diagnostic #9: "skips Locked").
 */

function reconcileBillingLedger(payload) {
  return withLock(function () {
    const billsSheet = getSheet(SHEET_NAMES.BILLS);
    const billsHdr = buildHeaderMap(getSheet(SHEET_NAMES.BILLS));    
    const billsData = billsSheet.getDataRange().getValues();

    const paysSheet = getSheet(SHEET_NAMES.PAYMENTS);
    const paysHdr = buildHeaderMap(getSheet(SHEET_NAMES.PAYMENTS));    
    const paysData = paysSheet.getDataRange().getValues();

    let reconciledCount = 0;
    const payments = paysData.slice(1);

    for (let i = 1; i < billsData.length; i++) {
      const bill = billsData[i];
      const billId = bill[billsHdr["BillId"]]; // FIXED: was "Id"
      const isLocked = bill[billsHdr["Locked"]] === true || bill[billsHdr["Locked"]] === "TRUE"; // FIXED: was "LifecycleState"
      
      if (isLocked || !billId) continue;

      const billPayments = payments.filter(p => p[paysHdr["BillId"]] === billId);
      let actualPaid = 0;
      billPayments.forEach(p => {
        actualPaid += Number(p[paysHdr["Amount"]] || 0);
      });

      const newAmountPaid = round2(actualPaid);
      const currentAmountPaid = round2(Number(bill[billsHdr["AmountPaid"]] || 0));

      if (newAmountPaid !== currentAmountPaid) {
        bill[billsHdr["AmountPaid"]] = newAmountPaid;
        bill[billsHdr["UpdatedAt"]] = nowISTTimestamp();
        
        // Recalculate status
        const totalAmount = Number(bill[billsHdr["Amount"]] || 0);
        if (newAmountPaid >= totalAmount) {
          bill[billsHdr["Status"]] = "Paid";
        } else if (newAmountPaid > 0) {
          bill[billsHdr["Status"]] = "Partial";
        } else {
          bill[billsHdr["Status"]] = "Unpaid";
        }
        
        billsSheet.getRange(i + 1, 1, 1, billsData[0].length).setValues([bill]);
        reconciledCount++;
      }
    }
    return respond(true, { reconciled: reconciledCount });
  });
}


// NOTE: findRowByTwoColumns() is intentionally NOT defined in this file.
// It is owned by Part 4 (Core.gs). Declaring it here would cause a duplicate
// function declaration crash at Apps Script deployment time.
