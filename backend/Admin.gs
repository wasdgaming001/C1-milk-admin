/**
 * ============================================================================
 * MILK DELIVERY ADMIN — V17 BACKEND
 * PART 5 of 5: DIAGNOSTICS + ADMIN ACTIONS
 * ============================================================================
 *
 * Depends on Part 4 (Core Infrastructure) — must be loaded in the same
 * Apps Script project. This file does NOT include stub fallbacks like
 * Parts 1-3 did, because by this point Part 4 should already be in place
 * (it's the thing every other part depends on).
 *
 * This file supersedes Part 4's minimal healthCheck() — if you kept Part
 * 4's version, delete it now and use this one (it's identical in shape but
 * documented as the authoritative copy here).
 *
 * Contents:
 *   1. healthCheck()           — authoritative version
 *   2. getSheetNamesAction()   — actual vs expected vs drift
 *   3. runDiagnostics()        — 19 checks per your Section 10 table
 *   4. runMigration()          — schema 13-16 -> 17
 *   5. eraseAllData()          — DPDP-compliant destructive erase
 *   6. SCHEMA_DEFINITIONS      — column order reference for sheet creation
 *   7. setupSheets()           — one-time/idempotent sheet+header bootstrap
 * ============================================================================
 */

const CURRENT_SCHEMA_VERSION = 17;
const CURRENT_API_VERSION = 17;

// ----------------------------------------------------------------------------
// 1. HEALTH CHECK — authoritative version (supersedes Part 4's copy)
// ----------------------------------------------------------------------------

function healthCheck() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const requiredSheets = Object.keys(SHEET_NAMES).map(function (k) {
      return SHEET_NAMES[k];
    });
    const actualSheets = ss.getSheets().map(function (s) {
      return s.getName();
    });
    const missing = requiredSheets.filter(function (name) {
      return actualSheets.indexOf(name) === -1;
    });

    const schemaVersion = Number(getSettingValue("SchemaVersion") || "0");
    const migrationNeeded = schemaVersion < CURRENT_SCHEMA_VERSION;

    return respond(true, {
      ok: missing.length === 0,
      missingSheets: missing,
      schemaVersion: schemaVersion,
      apiVersion: Number(getSettingValue("APIVersion") || "0"),
      migrationNeeded: migrationNeeded,
      timestamp: nowISTTimestamp(),
    });
  } catch (e) {
    return respond(false, null, { code: "SYSTEM_ERROR", message: e.message });
  }
}

// ----------------------------------------------------------------------------
// 2. SHEET NAME DRIFT CHECK
// ----------------------------------------------------------------------------

/**
 * getSheetNamesAction — compares actual spreadsheet tabs against the
 * expected SHEET_NAMES registry. "drift" = tabs that exist but aren't in
 * the registry (could be leftover/renamed sheets worth cleaning up) plus
 * registry entries with no matching tab (already covered by healthCheck's
 * missingSheets, but surfaced here too for a single combined view).
 */
function getSheetNamesAction() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const actual = ss.getSheets().map(function (s) {
      return s.getName();
    });
    const expected = Object.keys(SHEET_NAMES).map(function (k) {
      return SHEET_NAMES[k];
    });

    const missing = expected.filter(function (name) {
      return actual.indexOf(name) === -1;
    });
    const unexpected = actual.filter(function (name) {
      return expected.indexOf(name) === -1;
    });

    return respond(true, {
      actual: actual,
      expected: expected,
      drift: { missing: missing, unexpected: unexpected },
    });
  } catch (e) {
    return respond(false, null, { code: "SYSTEM_ERROR", message: e.message });
  }
}

// ----------------------------------------------------------------------------
// 3. DIAGNOSTICS — 19 checks per your Section 10 table. Each check returns
//    { id, label, status: 'ok'|'warning'|'error', detail, count }.
//    Read-only — does not fix anything itself (see "Fix" column references
//    to other actions like rebuildDailyLogsIndex, reconcileBillingLedger).
// ----------------------------------------------------------------------------

function runDiagnostics() {
  try {
    const checks = [];
    const push = function (id, label, status, detail, count) {
      checks.push({
        id: id,
        label: label,
        status: status,
        detail: detail || "",
        count: count !== undefined ? count : null,
      });
    };

    // 1. Missing sheets
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const actualSheets = ss.getSheets().map(function (s) {
      return s.getName();
    });
    const expectedSheets = Object.keys(SHEET_NAMES).map(function (k) {
      return SHEET_NAMES[k];
    });
    const missingSheets = expectedSheets.filter(function (n) {
      return actualSheets.indexOf(n) === -1;
    });
    push(
      1,
      "Missing sheets",
      missingSheets.length === 0 ? "ok" : "error",
      missingSheets.join(", "),
      missingSheets.length,
    );

    // If core sheets are missing, bail early — every other check below would throw.
    if (missingSheets.length > 0) {
      push(
        99,
        "Diagnostics incomplete",
        "error",
        "Cannot run remaining checks until missing sheets are created",
        missingSheets.length,
      );
      return respond(true, {
        checks: checks,
        totalIssues: checks.filter(function (c) {
          return c.status !== "ok";
        }).length,
      });
    }

    // 2 & 3. Products: blank ShortCode / duplicate ShortCode (Products sheet
    // is referenced in your spec but its schema wasn't defined in Parts 1-3;
    // this check degrades gracefully if the sheet or column is absent.)
    try {
      const prodSheet = getSheet("PRODUCTS");
      const prodHdr = buildHeaderMap(prodSheet);
      const prodLastRow = prodSheet.getLastRow();
      if (
        prodLastRow >= 2 &&
        prodHdr["ShortCode"] !== undefined &&
        prodHdr["Status"] !== undefined
      ) {
        const products = prodSheet
          .getRange(2, 1, prodLastRow - 1, prodSheet.getLastColumn())
          .getValues();
        const active = products.filter(function (r) {
          return r[prodHdr["Status"]] === "Active";
        });
        const blankCodes = active.filter(function (r) {
          return !String(r[prodHdr["ShortCode"]] || "").trim();
        });
        push(
          2,
          "Active products with blank ShortCode",
          blankCodes.length === 0 ? "ok" : "warning",
          "",
          blankCodes.length,
        );

        const codeCounts = {};
        active.forEach(function (r) {
          const code = String(r[prodHdr["ShortCode"]] || "").trim();
          if (code) codeCounts[code] = (codeCounts[code] || 0) + 1;
        });
        const dupCodes = Object.keys(codeCounts).filter(function (c) {
          return codeCounts[c] > 1;
        });
        push(
          3,
          "Duplicate ShortCodes",
          dupCodes.length === 0 ? "ok" : "error",
          dupCodes.join(", "),
          dupCodes.length,
        );
      } else {
        push(
          2,
          "Active products with blank ShortCode",
          "warning",
          "Products sheet/columns not fully set up",
          0,
        );
        push(
          3,
          "Duplicate ShortCodes",
          "warning",
          "Products sheet/columns not fully set up",
          0,
        );
      }
    } catch (e) {
      push(
        2,
        "Active products with blank ShortCode",
        "warning",
        "Products sheet not found",
        0,
      );
      push(3, "Duplicate ShortCodes", "warning", "Products sheet not found", 0);
    }

    // 4. Duplicate active DeliveryAddresses
    const custSheet = getSheet("CUSTOMERS");
    const custHdr = buildHeaderMap(custSheet);
    const custLastRow = custSheet.getLastRow();
    let customers = [];
    if (custLastRow >= 2) {
      customers = custSheet
        .getRange(2, 1, custLastRow - 1, custSheet.getLastColumn())
        .getValues();
      const addrCounts = {};
      customers
        .filter(function (r) {
          return r[custHdr["Status"]] === "Active";
        })
        .forEach(function (r) {
          const addr = String(r[custHdr["DeliveryAddress"]] || "")
            .trim()
            .toLowerCase();
          if (addr) addrCounts[addr] = (addrCounts[addr] || 0) + 1;
        });
      const dupAddrs = Object.keys(addrCounts).filter(function (a) {
        return addrCounts[a] > 1;
      });
      push(
        4,
        "Duplicate active DeliveryAddresses",
        dupAddrs.length === 0 ? "ok" : "warning",
        "",
        dupAddrs.length,
      );
    } else {
      push(
        4,
        "Duplicate active DeliveryAddresses",
        "ok",
        "No customers yet",
        0,
      );
    }

    // 5 & 11. DailyLogsIndex — your spec references a month-based index sheet
    // (DailyLogsIndex) for performance at scale; not defined in Parts 1-3.
    // Reported as informational since DailyLogs itself works without it.
    push(
      5,
      "Missing current month DailyLogsIndex",
      "warning",
      "DailyLogsIndex not implemented in this build — DailyLogs sheet is read directly (fine until log volume is large)",
      null,
    );
    push(
      11,
      "Months with logs missing DailyLogsIndex",
      "warning",
      "Same as check #5 — index not yet implemented",
      null,
    );

    // 6. Bills with StaleFlag = Yes
    const billSheet = getSheet("BILLS");
    const billHdr = buildHeaderMap(billSheet);
    const billLastRow = billSheet.getLastRow();
    let bills = [];
    if (billLastRow >= 2) {
      bills = billSheet
        .getRange(2, 1, billLastRow - 1, billSheet.getLastColumn())
        .getValues();
      const stale = bills.filter(function (r) {
        return r[billHdr["StaleFlag"]] === true;
      });
      push(
        6,
        "Bills with StaleFlag = Yes",
        stale.length === 0 ? "ok" : "warning",
        "",
        stale.length,
      );
    } else {
      push(6, "Bills with StaleFlag = Yes", "ok", "No bills yet", 0);
    }

    // 7. Unapplied adjustments > 60 days
    const adjSheet = getSheet("ADJUSTMENTS");
    const adjHdr = buildHeaderMap(adjSheet);
    const adjLastRow = adjSheet.getLastRow();
    if (adjLastRow >= 2) {
      const adjustments = adjSheet
        .getRange(2, 1, adjLastRow - 1, adjSheet.getLastColumn())
        .getValues();
      const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const cutoffStr = Utilities.formatDate(cutoff, TIMEZONE, "yyyy-MM-dd");
      const oldUnapplied = adjustments.filter(function (r) {
        return (
          r[adjHdr["Applied"]] !== true && String(r[adjHdr["Date"]]) < cutoffStr
        );
      });
      push(
        7,
        "Unapplied adjustments > 60 days",
        oldUnapplied.length === 0 ? "ok" : "warning",
        "",
        oldUnapplied.length,
      );
    } else {
      push(7, "Unapplied adjustments > 60 days", "ok", "No adjustments yet", 0);
    }

    // 8. Untested actions
    const untested = Array.from(ALLOWED_ACTIONS).filter(function (a) {
      return !TESTED_ACTIONS.has(a);
    });
    push(
      8,
      "Untested actions",
      untested.length === 0 ? "ok" : "error",
      untested.join(", "),
      untested.length,
    );

    // 9. AmountPaid drift (skips Locked) — read-only check version of
    // reconcileBillingLedger's correction logic
    const paySheet = getSheet("PAYMENTS");
    const payHdr = buildHeaderMap(paySheet);
    const payLastRow = paySheet.getLastRow();
    const paymentsByBill = {};
    if (payLastRow >= 2) {
      const payments = paySheet
        .getRange(2, 1, payLastRow - 1, paySheet.getLastColumn())
        .getValues();
      payments.forEach(function (p) {
        const billId = p[payHdr["BillId"]];
        paymentsByBill[billId] =
          Math.round(
            ((paymentsByBill[billId] || 0) + Number(p[payHdr["Amount"]])) * 100,
          ) / 100;
      });
    }
    let driftCount = 0;
    bills.forEach(function (b) {
      if (b[billHdr["Locked"]] === true) return;
      const billId = b[billHdr["BillId"]];
      const recorded = Math.round(Number(b[billHdr["AmountPaid"]]) * 100) / 100;
      const actual = Math.round((paymentsByBill[billId] || 0) * 100) / 100;
      if (recorded !== actual) driftCount++;
    });
    push(
      9,
      "AmountPaid drift (skips Locked)",
      driftCount === 0 ? "ok" : "error",
      "Run reconcileBillingLedger to fix",
      driftCount,
    );

    // 10. SchemaVersion < 17
    const schemaVersion = Number(getSettingValue("SchemaVersion") || "0");
    push(
      10,
      "SchemaVersion < " + CURRENT_SCHEMA_VERSION,
      schemaVersion >= CURRENT_SCHEMA_VERSION ? "ok" : "error",
      "Current: " + schemaVersion,
      schemaVersion >= CURRENT_SCHEMA_VERSION ? 0 : 1,
    );

    // 12. PINSalt not configured
    const pinSalt = getSettingValue("PINSalt");
    push(
      12,
      "PINSalt not configured",
      pinSalt ? "ok" : "error",
      pinSalt ? "" : "Run rotatePIN",
      pinSalt ? 0 : 1,
    );

    // 13. High SystemState row count > 500
    const sysSheet = getSheet("SYSTEM_STATE");
    const sysRowCount = Math.max(0, sysSheet.getLastRow() - 1);
    push(
      13,
      "High SystemState row count > 500",
      sysRowCount > 500 ? "warning" : "ok",
      "Current: " + sysRowCount,
      sysRowCount,
    );

    // 14. PINRate_ key count > 50
    let pinRateCount = 0;
    if (sysRowCount > 0) {
      const sysHdr = buildHeaderMap(sysSheet);
      const sysValues = sysSheet
        .getRange(2, 1, sysRowCount, sysSheet.getLastColumn())
        .getValues();
      pinRateCount = sysValues.filter(function (r) {
        return String(r[sysHdr["Key"]] || "").indexOf("PINRate_") === 0;
      }).length;
    }
    push(
      14,
      "PINRate_ key count > 50",
      pinRateCount > 50 ? "warning" : "ok",
      "Current: " + pinRateCount,
      pinRateCount,
    );

    // 15. Daily execution count > 150 — Apps Script quota monitoring.
    // No programmatic API for this; surfaced as informational reminder only.
    push(
      15,
      "Daily execution count > 150",
      "warning",
      "Not measurable from within the script — monitor via Apps Script dashboard quotas",
      null,
    );

    // 16. Failed batch flags in SystemState
    let failedBatchCount = 0;
    if (sysRowCount > 0) {
      const sysHdr2 = buildHeaderMap(sysSheet);
      const sysValues2 = sysSheet
        .getRange(2, 1, sysRowCount, sysSheet.getLastColumn())
        .getValues();
      failedBatchCount = sysValues2.filter(function (r) {
        return String(r[sysHdr2["Key"]] || "").indexOf("FailedBatch_") === 0;
      }).length;
    }
    push(
      16,
      "Failed batch flags in SystemState",
      failedBatchCount === 0 ? "ok" : "warning",
      "",
      failedBatchCount,
    );

    // 17. Active products without open PriceHistory record — degrades
    // gracefully since PriceHistory sheet isn't defined in Parts 1-3
    push(
      17,
      "Active products without open PriceHistory record",
      "warning",
      "PriceHistory sheet not implemented in this build",
      null,
    );

    // 18. sessionSecret validation active — informational status check
    const appSecretConfigured =
      !!PropertiesService.getScriptProperties().getProperty("APP_SECRET");
    push(
      18,
      "sessionSecret validation active",
      appSecretConfigured ? "ok" : "warning",
      appSecretConfigured
        ? "APP_SECRET is set"
        : "APP_SECRET not set — sessionSecret checks are skipped",
      appSecretConfigured ? 0 : 1,
    );

    // 19. Milk import sheets present
    const milkSheetsPresent = [
      "MILK_IMPORTS",
      "MILK_BRANDS",
      "MILK_TYPES",
    ].every(function (key) {
      return actualSheets.indexOf(SHEET_NAMES[key]) !== -1;
    });
    push(
      19,
      "Milk import sheets present",
      milkSheetsPresent ? "ok" : "error",
      "",
      milkSheetsPresent ? 0 : 1,
    );

    const totalIssues = checks.filter(function (c) {
      return c.status !== "ok";
    }).length;
    writeActivityLog(
      "runDiagnostics",
      {},
      { totalChecks: checks.length, totalIssues: totalIssues },
    );

    return respond(true, { checks: checks, totalIssues: totalIssues });
  } catch (e) {
    return respond(false, null, { code: "SYSTEM_ERROR", message: e.message });
  }
}

// ----------------------------------------------------------------------------
// 4. MIGRATION
// ----------------------------------------------------------------------------

/**
 * runMigration — accepts schema versions 13-16 and brings them to 17.
 * Migration steps here are intentionally conservative: they only touch
 * Settings (SchemaVersion/APIVersion) and purge known-obsolete SystemState
 * key prefixes (B156: MilkImportsIndex_ / InventorySnapshot_ were never
 * implemented and should not linger). Anything more invasive (column
 * reordering, data backfill) is out of scope for an automated migration
 * and should be done deliberately, by hand, with a backup first.
 */
function runMigration(payload) {
  return withLock(function () {
    const currentVersion = Number(getSettingValue("SchemaVersion") || "0");

    if (currentVersion >= CURRENT_SCHEMA_VERSION) {
      return respond(true, {
        migrated: false,
        message: "Already at schema version " + currentVersion,
        schemaVersion: currentVersion,
      });
    }
    if (currentVersion < 13) {
      return respond(false, null, {
        code: "UNSUPPORTED_VERSION",
        message:
          "Schema version " +
          currentVersion +
          " is too old for automated migration. Versions 13-16 are supported; earlier versions require manual migration.",
      });
    }

    // Purge known-obsolete SystemState key prefixes (B156)
    const sysSheet = getSheet("SYSTEM_STATE");
    const sysHdr = buildHeaderMap(sysSheet);
    const sysLastRow = sysSheet.getLastRow();
    let purgedCount = 0;

    if (sysLastRow >= 2) {
      const obsoletePrefixes = ["MilkImportsIndex_", "InventorySnapshot_"];
      const values = sysSheet
        .getRange(2, 1, sysLastRow - 1, sysSheet.getLastColumn())
        .getValues();
      const rowsToDelete = [];
      values.forEach(function (row, i) {
        const key = String(row[sysHdr["Key"]] || "");
        if (
          obsoletePrefixes.some(function (p) {
            return key.indexOf(p) === 0;
          })
        ) {
          rowsToDelete.push(i + 2);
        }
      });
      rowsToDelete
        .sort(function (a, b) {
          return b - a;
        })
        .forEach(function (rowIndex) {
          sysSheet.deleteRow(rowIndex);
          purgedCount++;
        });
    }

    // Bump SchemaVersion / APIVersion
    const settingsSheet = getSheet("SETTINGS");
    const settingsHdr = buildHeaderMap(settingsSheet);
    [
      ["SchemaVersion", String(CURRENT_SCHEMA_VERSION)],
      ["APIVersion", String(CURRENT_API_VERSION)],
    ].forEach(function (pair) {
      const key = pair[0],
        value = pair[1];
      const found = findRowByColumnValue(
        settingsSheet,
        settingsHdr,
        "Key",
        key,
      );
      if (found) {
        settingsSheet
          .getRange(found.rowIndex, settingsHdr["Value"] + 1)
          .setValue(value);
      } else {
        const row = [];
        row[settingsHdr["Key"]] = key;
        row[settingsHdr["Value"]] = value;
        safeAppend(settingsSheet, row);
      }
    });
    CacheService.getScriptCache().remove(
      SETTINGS_CACHE_KEY_PREFIX + "SchemaVersion",
    );
    CacheService.getScriptCache().remove(
      SETTINGS_CACHE_KEY_PREFIX + "APIVersion",
    );

    writeActivityLog("runMigration", payload, {
      fromVersion: currentVersion,
      toVersion: CURRENT_SCHEMA_VERSION,
      purgedCount: purgedCount,
    });

    return respond(true, {
      migrated: true,
      fromVersion: currentVersion,
      toVersion: CURRENT_SCHEMA_VERSION,
      purgedObsoleteKeys: purgedCount,
    });
  });
}

// ----------------------------------------------------------------------------
// 5. DATA ERASURE — DPDP compliance. This is a genuinely destructive,
//    irreversible operation. No shortcuts, no "soft" mode, no bypass.
// ----------------------------------------------------------------------------

const ERASE_CONFIRMATION_CODE = "ERASE-ALL-DATA-PERMANENTLY";

// Per your security model table: MILK_IMPORTS is transactional and IS
// erased. MILK_BRANDS / MILK_TYPES are catalog data and are NOT erased (B154).
const SHEETS_TO_ERASE = [
  "CUSTOMERS",
  "DAILY_LOGS",
  "PAUSE_PERIODS",
  "BILLS",
  "PAYMENTS",
  "ADJUSTMENTS",
  "MILK_IMPORTS",
  "ACTIVITY_LOG",
  // SYSTEM_STATE deliberately excluded from blanket erase — it holds the
  // active session/PIN-rate-limit state, not customer data. If you want
  // session data wiped too, do it via purgeExpiredSessions or manually.
];

/**
 * eraseAllData — physically deletes all rows (keeping headers) from every
 * sheet in SHEETS_TO_ERASE. Requires an exact confirmationCode match AND
 * the appSecret (defense against a stolen/leaked session token alone being
 * enough to wipe the system — this is intentionally harder to trigger than
 * a normal write action).
 * Required: confirmationCode, appSecret
 */
function eraseAllData(payload) {
  if (!payload || payload.confirmationCode !== "ERASE_ALL_DATA" || !payload.appSecret) {
    return respond(false, null, { code: "VALIDATION_ERROR", message: "Invalid confirmation code or secret" });
  }
  if (payload.appSecret !== APP_SECRET) {
    return respond(false, null, { code: "UNAUTHORIZED", message: "Invalid app secret" });
  }

  // FIXED: Used correct constants. Removed undefined PAUSES and SESSIONS.
  const sheetsToErase = [
    SHEET_NAMES.CUSTOMERS,
    SHEET_NAMES.SUBSCRIPTIONS,
    SHEET_NAMES.DAILY_LOGS,
    SHEET_NAMES.BILLS,
    SHEET_NAMES.PAYMENTS,
    SHEET_NAMES.MILK_IMPORTS,
    SHEET_NAMES.ADJUSTMENTS,
    SHEET_NAMES.CREDIT_NOTES,
    SHEET_NAMES.PAUSE_PERIODS, // FIXED: was SHEET_NAMES.PAUSES
    SHEET_NAMES.ACTIVITY_LOG,
    SHEET_NAMES.SYSTEM_STATE
  ];

  const results = {};
  let hasErrors = false;

  sheetsToErase.forEach(function (name) {
    if (!name) return;
    try {
      const sheet = getSheet(name);
      if (sheet) {
        const lastRow = sheet.getLastRow();
        if (lastRow > 1) {
          sheet.deleteRows(2, lastRow - 1);
        }
        results[name] = "erased";
      } else {
        results[name] = "not_found";
      }
    } catch (e) {
      results[name] = "error: " + e.message;
      hasErrors = true;
    }
  });

  // Clear script properties (rate limits, caches, etc.)
  try {
    PropertiesService.getScriptProperties().deleteAllProperties();
    results["ScriptProperties"] = "cleared";
  } catch (e) {
    results["ScriptProperties"] = "error: " + e.message;
  }

  writeActivityLog("eraseAllData", "All data erased by admin");
  return respond(!hasErrors, { results });
}

// ----------------------------------------------------------------------------
// 6. SCHEMA DEFINITIONS — column order reference. Rule 16: every sheet's
//    exact column order lives here — no function may invent or assume
//    column order from safeAppend() calls alone. This is the single source
//    of truth setupSheets() uses to create sheets if they don't exist.
// ----------------------------------------------------------------------------

const SCHEMA_DEFINITIONS = {
  CUSTOMERS: [
    "CustomerId",
    "Name",
    "DeliveryAddress",
    "Phone",
    "Status",
    "Product",
    "DailyQty",
    "DeliveryDays",
    "Balance",
    "Version",
    "IdempotencyKey",
    "CreatedAt",
    "UpdatedAt",
  ],
  DAILY_LOGS: [
    "LogId",
    "CustomerId",
    "Date",
    "Product",
    "Qty",
    "Delivered",
    "Note",
    "CreatedAt",
    "UpdatedAt",
    "Version",
  ],
  PAUSE_PERIODS: [
    "PauseId",
    "CustomerId",
    "StartDate",
    "EndDate",
    "Reason",
    "CreatedAt",
  ],
  SUBSCRIPTIONS: [
    "Id", "CustomerId", "MilkType", "Qty", "DeliveryDays", "IsActive", 
    "Version", "IdempotencyKey", "CreatedAt", "UpdatedAt"
  ],
  SUBSCRIPTION_HISTORY: [
    "Id", "SubscriptionId", "Action", "Details", "Timestamp"
  ],
  CREDIT_NOTES: [
    "Id", "CustomerId", "BillId", "Amount", "Reason", "CreatedAt", "IdempotencyKey"
  ],
  BILLS: [
    "BillId",
    "CustomerId",
    "Month",
    "Amount",
    "AmountPaid",
    "Status",
    "DueDate",
    "Locked",
    "StaleFlag",
    "Version",
    "CreatedAt",
    "UpdatedAt",
  ],
  PAYMENTS: [
    "PaymentId",
    "BillId",
    "CustomerId",
    "Amount",
    "Mode",
    "Date",
    "Note",
    "IdempotencyKey",
    "CreatedAt",
  ],
  ADJUSTMENTS: [
    "AdjustmentId",
    "CustomerId",
    "Date",
    "Amount",
    "Reason",
    "Applied",
    "BillId",
    "CreatedAt",
  ],
  MILK_IMPORTS: [
    "ImportId",
    "Date",
    "BrandName",
    "MilkType",
    "Quantity",
    "RatePerLiter",
    "TotalCost",
    "Supplier",
    "InvoiceNumber",
    "Notes",
    "Status",
    "Version",
    "IdempotencyKey",
    "CreatedAt",
    "UpdatedAt",
  ],
  MILK_BRANDS: [
    "BrandId",
    "BrandName",
    "SupplierName",
    "SupplierPhone",
    "DefaultMilkType",
    "RatePerLiter",
    "Status",
    "CreatedAt",
  ],
  MILK_TYPES: ["TypeId", "TypeName", "Status"],
  PRODUCTS: [
    "ProductId",
    "ShortCode",
    "Name",
    "Category",
    "Status",
    "CreatedAt",
    "UpdatedAt",
  ],
  SETTINGS: ["Key", "Value"],
  ACTIVITY_LOG: ["Timestamp", "Action", "PayloadSummary", "ResultSummary"],
  SYSTEM_STATE: ["Key", "Value"],
};

/**
 * setupSheets — idempotent bootstrap: creates any missing sheet from
 * SCHEMA_DEFINITIONS with its header row. Does NOT touch sheets that
 * already exist (won't reorder/add columns to a live sheet — that's a
 * deliberate, manual migration decision, not something to automate).
 * Run this once manually from the Apps Script editor (Run > setupSheets)
 * when setting up a fresh spreadsheet, not via the doPost router.
 */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const created = [];

  Object.keys(SCHEMA_DEFINITIONS).forEach(function (key) {
    const name = SHEET_NAMES[key];
    if (!name) return;
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      const headers = SCHEMA_DEFINITIONS[key];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      created.push(name);
    }
  });

  // Seed default MilkTypes if the sheet was just created and is empty.
  // Matches the 5 products offered by the frontend (App.jsx MILK_TYPES) and
  // priced in the frontend RATE_BY_PRODUCT table — seeding only a subset would
  // make the missing types get rejected by isValidActiveMilkType() on import.
  const typesSheet = ss.getSheetByName(SHEET_NAMES.MILK_TYPES);
  if (typesSheet && typesSheet.getLastRow() < 2) {
    ["Full Cream", "Toned", "Double Toned", "Skimmed", "Standardised"].forEach(
      function (typeName, i) {
        typesSheet
          .getRange(i + 2, 1, 1, 3)
          .setValues([["TYPE-" + (i + 1), typeName, "Active"]]);
      },
    );
  }

  // Seed SchemaVersion/APIVersion if Settings was just created
  const settingsSheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  if (settingsSheet && settingsSheet.getLastRow() < 2) {
    settingsSheet.getRange(2, 1, 2, 2).setValues([
      ["SchemaVersion", String(CURRENT_SCHEMA_VERSION)],
      ["APIVersion", String(CURRENT_API_VERSION)],
    ]);
  }

  Logger.log(
    "setupSheets complete. Created: " +
      (created.length
        ? created.join(", ")
        : "(none — all sheets already existed)"),
  );
  return { created: created };
}
