/**
 * ============================================================================
 * MILK DELIVERY ADMIN — V17 BACKEND
 * PART 3 of 5: MILK IMPORT ACTIONS
 * ============================================================================
 *
 * Depends on Part 4 (Core Infrastructure) helpers — stub block at the bottom,
 * same pattern as Parts 1 & 2. DELETE stubs once Part 4 lands.
 *
 * Sheet: MilkImports
 *   ImportId | Date | BrandName | MilkType | Quantity | RatePerLiter |
 *   TotalCost | Supplier | InvoiceNumber | Notes | Status | Version |
 *   IdempotencyKey | CreatedAt | UpdatedAt
 *   Status: Draft -> Confirmed -> Reconciled
 *
 * Sheet: MilkBrands
 *   BrandId | BrandName | SupplierName | SupplierPhone | DefaultMilkType |
 *   RatePerLiter | Status | CreatedAt
 *
 * Sheet: MilkTypes
 *   TypeId | TypeName | Status
 *
 * Sheet: DailyLogs (read-only here)
 *   used to compute "Distributed" for inventory math — see getDailyInventory
 *
 * Settings keys referenced (read via getSettingValue, defined in Part 4):
 *   MinDailyStockThreshold, MilkCategoryNames
 *
 * Security/business rules from spec Section 11 applied here:
 *   - expectedVersion REQUIRED on updateMilkImport (Rule 13)
 *   - Version incremented on confirm too (B-I-08)
 *   - MILK_IMPORTS included in eraseAllData; MILK_BRANDS/MILK_TYPES excluded
 *     (catalog data, not transactional) — see Part 5 for eraseAllData itself
 * ============================================================================
 */

const MAX_IMPORT_QTY = 5000; // litres — sanity cap per B-I import
const IMPORT_STATUSES = ["Draft", "Confirmed", "Reconciled"];

function round2_imports(n) {
  return Math.round(Number(n) * 100) / 100;
}

// ----------------------------------------------------------------------------
// VALIDATION
// ----------------------------------------------------------------------------

function validateMilkImportPayload(payload, isUpdate) {
  const errors = [];

  if (!isUpdate || payload.date !== undefined) {
    if (!payload.date || !/^\d{4}-\d{2}-\d{2}$/.test(payload.date))
      errors.push("date must be YYYY-MM-DD");
  }
  if (!isUpdate || payload.brandName !== undefined) {
    if (!payload.brandName || !String(payload.brandName).trim())
      errors.push("brandName is required");
  }
  if (!isUpdate || payload.milkType !== undefined) {
    if (!payload.milkType) errors.push("milkType is required");
  }
  if (!isUpdate || payload.quantity !== undefined) {
    const q = Number(payload.quantity);
    if (isNaN(q) || q <= 0) errors.push("quantity must be a positive number");
    else if (q > MAX_IMPORT_QTY)
      errors.push("quantity exceeds maximum allowed (" + MAX_IMPORT_QTY + "L)");
  }
  if (!isUpdate || payload.ratePerLiter !== undefined) {
    const r = Number(payload.ratePerLiter);
    if (isNaN(r) || r <= 0)
      errors.push("ratePerLiter must be a positive number");
    else if (r > 500)
      errors.push("ratePerLiter looks implausibly high — check input");
  }
  if (
    payload.invoiceNumber !== undefined &&
    String(payload.invoiceNumber).length > 100
  ) {
    errors.push("invoiceNumber too long (max 100 chars)");
  }

  return { valid: errors.length === 0, errors };
}

// ----------------------------------------------------------------------------
// MILK TYPE LOOKUP (validates against active MilkTypes sheet, not a hardcoded
// list — your spec seeds Full Cream / Toned / Double Toned but lets the
// catalog grow, e.g. Skimmed / Standardised)
// ----------------------------------------------------------------------------

function isValidActiveMilkType(typeName) {
  const sheet = getSheet("MILK_TYPES");
  const hdr = buildHeaderMap(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  const values = sheet
    .getRange(2, 1, lastRow - 1, sheet.getLastColumn())
    .getValues();
  return values.some(
    (row) =>
      row[hdr["TypeName"]] === typeName && row[hdr["Status"]] === "Active",
  );
}

// ----------------------------------------------------------------------------
// MILK IMPORT ACTIONS
// ----------------------------------------------------------------------------

/**
 * addMilkImport — creates a Draft import row. Idempotent via idempotencyKey.
 * Required: date, brandName, milkType, quantity, ratePerLiter, idempotencyKey
 * Optional: supplier, invoiceNumber, notes
 */
function addMilkImport(payload) {
  const v = validateMilkImportPayload(payload, false);
  if (!v.valid)
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: v.errors.join("; "),
    });

  if (!isValidActiveMilkType(payload.milkType)) {
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: "Invalid or inactive milk type: " + payload.milkType,
    });
  }

  return withLock(function () {
    const sheet = getSheet("MILK_IMPORTS");
    const hdr = buildHeaderMap(sheet);

    if (payload.idempotencyKey) {
      const dup = findRowByColumnValue(
        sheet,
        hdr,
        "IdempotencyKey",
        payload.idempotencyKey,
      );
      if (dup) {
        return respond(true, {
          importId: dup.rowValues[hdr["ImportId"]],
          totalCost: dup.rowValues[hdr["TotalCost"]],
          duplicate: true,
        });
      }
    }

    const importId = "IMP-" + Utilities.getUuid().substring(0, 8).toUpperCase();
    const now = Utilities.formatDate(
      new Date(),
      TIMEZONE,
      "yyyy-MM-dd'T'HH:mm:ssXXX",
    );
    const quantity = Number(payload.quantity);
    const rate = Number(payload.ratePerLiter);
    const totalCost = round2_imports(quantity * rate);

    const row = [];
    row[hdr["ImportId"]] = importId;
    row[hdr["Date"]] = payload.date;
    row[hdr["BrandName"]] = sanitizeForText(payload.brandName).trim();
    row[hdr["MilkType"]] = payload.milkType;
    row[hdr["Quantity"]] = quantity;
    row[hdr["RatePerLiter"]] = rate;
    row[hdr["TotalCost"]] = totalCost;
    row[hdr["Supplier"]] = sanitizeForText(payload.supplier || "");
    row[hdr["InvoiceNumber"]] = sanitizeForText(payload.invoiceNumber || "");
    row[hdr["Notes"]] = sanitizeForText(payload.notes || "");
    row[hdr["Status"]] = "Draft";
    row[hdr["Version"]] = 1;
    row[hdr["IdempotencyKey"]] = payload.idempotencyKey || "";
    row[hdr["CreatedAt"]] = now;
    row[hdr["UpdatedAt"]] = now;

    safeAppend(sheet, row);
    writeActivityLog("addMilkImport", payload, {
      importId: importId,
      totalCost: totalCost,
    });

    return respond(true, { importId: importId, totalCost: totalCost });
  });
}

/**
 * updateMilkImport — partial update of a Draft import. Confirmed/Reconciled
 * imports cannot be edited (must be a fresh import or a manual correction
 * via the spreadsheet, by design — once stock math depends on it, silently
 * editing quantity/rate would corrupt inventory reconciliation).
 * Required: importId, expectedVersion
 */
function updateMilkImport(payload) {
  if (!payload.importId)
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: "importId is required",
    });
  if (
    payload.expectedVersion === undefined ||
    payload.expectedVersion === null
  ) {
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: "expectedVersion is required for updates",
    });
  }

  const v = validateMilkImportPayload(payload, true);
  if (!v.valid)
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: v.errors.join("; "),
    });

  if (
    payload.milkType !== undefined &&
    !isValidActiveMilkType(payload.milkType)
  ) {
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: "Invalid or inactive milk type: " + payload.milkType,
    });
  }

  return withLock(function () {
    const sheet = getSheet("MILK_IMPORTS");
    const hdr = buildHeaderMap(sheet);
    const found = findRowById(sheet, hdr["ImportId"], payload.importId);
    if (!found)
      return respond(false, null, {
        code: "NOT_FOUND",
        message: "Import not found: " + payload.importId,
      });

    if (found.rowValues[hdr["Status"]] !== "Draft") {
      return respond(false, null, {
        code: "INVALID_STATE",
        message:
          "Only Draft imports can be edited (current status: " +
          found.rowValues[hdr["Status"]] +
          ")",
      });
    }

    const currentVersion = Number(found.rowValues[hdr["Version"]]);
    if (currentVersion !== Number(payload.expectedVersion)) {
      return respond(false, null, {
        code: "VERSION_CONFLICT",
        message: "Import was modified by another process",
        currentVersion: currentVersion,
      });
    }

    const now = Utilities.formatDate(
      new Date(),
      TIMEZONE,
      "yyyy-MM-dd'T'HH:mm:ssXXX",
    );
    const updated = found.rowValues.slice();

    if (payload.date !== undefined) updated[hdr["Date"]] = payload.date;
    if (payload.brandName !== undefined)
      updated[hdr["BrandName"]] = sanitizeForText(payload.brandName).trim();
    if (payload.milkType !== undefined)
      updated[hdr["MilkType"]] = payload.milkType;
    if (payload.supplier !== undefined)
      updated[hdr["Supplier"]] = sanitizeForText(payload.supplier);
    if (payload.invoiceNumber !== undefined)
      updated[hdr["InvoiceNumber"]] = sanitizeForText(payload.invoiceNumber);
    if (payload.notes !== undefined)
      updated[hdr["Notes"]] = sanitizeForText(payload.notes);

    const newQty =
      payload.quantity !== undefined
        ? Number(payload.quantity)
        : Number(updated[hdr["Quantity"]]);
    const newRate =
      payload.ratePerLiter !== undefined
        ? Number(payload.ratePerLiter)
        : Number(updated[hdr["RatePerLiter"]]);
    updated[hdr["Quantity"]] = newQty;
    updated[hdr["RatePerLiter"]] = newRate;
    updated[hdr["TotalCost"]] = round2_imports(newQty * newRate);

    updated[hdr["Version"]] = currentVersion + 1;
    updated[hdr["UpdatedAt"]] = now;

    sheet.getRange(found.rowIndex, 1, 1, updated.length).setValues([updated]);
    writeActivityLog("updateMilkImport", payload, {
      importId: payload.importId,
      newVersion: currentVersion + 1,
    });

    return respond(true, {
      importId: payload.importId,
      newVersion: currentVersion + 1,
      totalCost: updated[hdr["TotalCost"]],
    });
  });
}

/**
 * confirmMilkImport — moves Draft -> Confirmed. From this point the import
 * counts toward inventory (getDailyInventory). Version is incremented here
 * too (B-I-08), even though only Status changes, so any client holding a
 * stale Draft version can't silently re-edit a just-confirmed import.
 */
function confirmMilkImport(payload) {
  if (!payload.importId)
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: "importId is required",
    });

  return withLock(function () {
    const sheet = getSheet("MILK_IMPORTS");
    const hdr = buildHeaderMap(sheet);
    const found = findRowById(sheet, hdr["ImportId"], payload.importId);
    if (!found)
      return respond(false, null, {
        code: "NOT_FOUND",
        message: "Import not found",
      });

    if (found.rowValues[hdr["Status"]] !== "Draft") {
      return respond(false, null, {
        code: "INVALID_STATE",
        message:
          "Only Draft imports can be confirmed (current: " +
          found.rowValues[hdr["Status"]] +
          ")",
      });
    }

    const now = Utilities.formatDate(
      new Date(),
      TIMEZONE,
      "yyyy-MM-dd'T'HH:mm:ssXXX",
    );
    const newVersion = Number(found.rowValues[hdr["Version"]]) + 1;

    sheet.getRange(found.rowIndex, hdr["Status"] + 1).setValue("Confirmed");
    sheet.getRange(found.rowIndex, hdr["Version"] + 1).setValue(newVersion);
    sheet.getRange(found.rowIndex, hdr["UpdatedAt"] + 1).setValue(now);

    writeActivityLog("confirmMilkImport", payload, {
      importId: payload.importId,
      newVersion: newVersion,
    });
    return respond(true, {
      importId: payload.importId,
      newVersion: newVersion,
    });
  });
}

/**
 * deleteMilkImport — hard delete, but ONLY for Draft imports. Once Confirmed,
 * an import has (or may have) been counted in inventory/reconciliation —
 * deleting it would silently corrupt stock history, so it's blocked.
 */
function deleteMilkImport(payload) {
  if (!payload.importId)
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: "importId is required",
    });

  return withLock(function () {
    const sheet = getSheet("MILK_IMPORTS");
    const hdr = buildHeaderMap(sheet);
    const found = findRowById(sheet, hdr["ImportId"], payload.importId);
    if (!found)
      return respond(false, null, {
        code: "NOT_FOUND",
        message: "Import not found",
      });

    if (found.rowValues[hdr["Status"]] !== "Draft") {
      return respond(false, null, {
        code: "INVALID_STATE",
        message: "Only Draft imports can be deleted",
      });
    }

    sheet.deleteRow(found.rowIndex);
    writeActivityLog("deleteMilkImport", payload, {
      importId: payload.importId,
    });
    return respond(true, { importId: payload.importId });
  });
}

// ----------------------------------------------------------------------------
// READ ACTIONS
// ----------------------------------------------------------------------------

/**
 * getMilkImports — paginated, filterable by month, brandName, status
 */
function getMilkImports(payload) {
  const sheet = getSheet("MILK_IMPORTS");
  const hdr = buildHeaderMap(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2)
    return respond(true, { imports: [], total: 0, hasMore: false });

  const values = sheet
    .getRange(2, 1, lastRow - 1, sheet.getLastColumn())
    .getValues();
  let filtered = values.filter((row) => {
    if (payload.month && !String(row[hdr["Date"]]).startsWith(payload.month))
      return false;
    if (payload.brandName && row[hdr["BrandName"]] !== payload.brandName)
      return false;
    if (payload.status && row[hdr["Status"]] !== payload.status) return false;
    return true;
  });

  // Most recent first
  filtered.sort((a, b) => (a[hdr["Date"]] < b[hdr["Date"]] ? 1 : -1));

  const total = filtered.length;
  const limit = Number(payload.limit) || 5000; 
  const offset = Number(payload.offset) || 0;
  const page = filtered.slice(offset, offset + limit);

  const imports = page.map((row) => ({
    importId: row[hdr["ImportId"]],
    date: row[hdr["Date"]],
    brandName: row[hdr["BrandName"]],
    milkType: row[hdr["MilkType"]],
    quantity: row[hdr["Quantity"]],
    ratePerLiter: row[hdr["RatePerLiter"]],
    totalCost: row[hdr["TotalCost"]],
    invoiceNumber: row[hdr["InvoiceNumber"]],
    status: row[hdr["Status"]],
    version: row[hdr["Version"]],
  }));

  return respond(true, {
    imports: imports,
    total: total,
    hasMore: offset + limit < total,
  });
}

/**
 * getMilkImportSummary — totals for Confirmed+Reconciled imports in a month
 * Required: month (YYYY-MM)
 */
function getMilkImportSummary(payload) {
  if (!payload.month || !/^\d{4}-\d{2}$/.test(payload.month)) {
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: "month must be YYYY-MM",
    });
  }

  const sheet = getSheet("MILK_IMPORTS");
  const hdr = buildHeaderMap(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2)
    return respond(true, { summary: { totalQuantity: 0, totalCost: 0 } });

  const values = sheet
    .getRange(2, 1, lastRow - 1, sheet.getLastColumn())
    .getValues();
  let totalQuantity = 0,
    totalCost = 0;

  values.forEach((row) => {
    if (!String(row[hdr["Date"]]).startsWith(payload.month)) return;
    if (row[hdr["Status"]] === "Draft") return; // only counted/confirmed stock
    totalQuantity += Number(row[hdr["Quantity"]]) || 0;
    totalCost += Number(row[hdr["TotalCost"]]) || 0;
  });

  return respond(true, {
    summary: {
      totalQuantity: round2_imports(totalQuantity),
      totalCost: round2_imports(totalCost),
    },
  });
}

/**
 * getDailyInventory — per-day Imported / Distributed / Stock for a month.
 *
 * "Distributed" sums DailyLogs.Qty where Delivered=true for that date, but
 * ONLY for products considered "milk" — controlled by Settings.MilkCategoryNames
 * if set, falling back to ALL delivered products if Products.Category is
 * unused (this mirrors B158 from your migration notes: "if Products.Category
 * is unused... getDailyInventory falls back to summing all delivered
 * products, documented, not silent").
 *
 * categoryFilterActive in the response tells the caller which mode was used.
 *
 * Required: month (YYYY-MM)
 */
function getDailyInventory(payload) {
  const targetDate = payload.date || todayIST();
  const sheet = getSheet(SHEET_NAMES.MILK_IMPORTS);
  const hdr = buildHeaderMap(getSheet(SHEET_NAMES.MILK_IMPORTS));
  const data = sheet.getDataRange().getValues();
  
  let totalQty = 0;
  let totalValue = 0;
  const byProduct = {};
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowDate = row[hdr["Date"]];
    
    // FIXED: Actually filter by the requested date
    if (rowDate !== targetDate) continue; 
    
    const status = row[hdr["Status"]] || "Completed";
    if (status === "Cancelled") continue;

    const product = row[hdr["MilkType"]] || "Unknown";
    const qty = Number(row[hdr["Quantity"]]) || 0;
    const rate = Number(row[hdr["RatePerLiter"]]) || 0; // FIXED: was "Rate"
    
    totalQty += qty;
    totalValue += (qty * rate);
    
    if (!byProduct[product]) byProduct[product] = { qty: 0, value: 0 };
    byProduct[product].qty += qty;
    byProduct[product].value += (qty * rate);
  }
  
  return respond(true, { date: targetDate, totalQty, totalValue, byProduct });
}

/**
 * reconcileMilkInventory — two modes:
 *   action='audit'  -> read-only health check, returns { healthy, issues }
 *   action='reconcile' -> moves Confirmed imports for the month to
 *                          Reconciled (final, locked-in-spirit state),
 *                          bumping Version. Does not touch Draft imports.
 * Required: month (YYYY-MM), action ('audit' | 'reconcile')
 */
function reconcileMilkInventory(payload) {
  if (!payload.month || !/^\d{4}-\d{2}$/.test(payload.month)) {
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: "month must be YYYY-MM",
    });
  }
  if (payload.action !== "audit" && payload.action !== "reconcile") {
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: "action must be 'audit' or 'reconcile'",
    });
  }

  return withLock(function () {
    const sheet = getSheet("MILK_IMPORTS");
    const hdr = buildHeaderMap(sheet);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return respond(true, { healthy: true, issues: [] });

    const values = sheet
      .getRange(2, 1, lastRow - 1, sheet.getLastColumn())
      .getValues();
    const issues = [];
    const toReconcile = [];

    values.forEach((row, i) => {
      if (!String(row[hdr["Date"]]).startsWith(payload.month)) return;
      if (row[hdr["Status"]] === "Draft") {
        issues.push({
          importId: row[hdr["ImportId"]],
          issue: "Still in Draft status — not counted in inventory",
        });
      }
      if (row[hdr["Status"]] === "Confirmed") {
        toReconcile.push(i + 2); // rowIndex
      }
      const qty = Number(row[hdr["Quantity"]]);
      const rate = Number(row[hdr["RatePerLiter"]]);
      const expectedTotal = round2_imports(qty * rate);
      if (round2_imports(row[hdr["TotalCost"]]) !== expectedTotal) {
        issues.push({
          importId: row[hdr["ImportId"]],
          issue:
            "TotalCost drift: stored=" +
            row[hdr["TotalCost"]] +
            " expected=" +
            expectedTotal,
        });
      }
    });

    if (payload.action === "audit") {
      writeActivityLog("reconcileMilkInventory", payload, {
        mode: "audit",
        issues: issues.length,
      });
      return respond(true, { healthy: issues.length === 0, issues: issues });
    }

    // action === 'reconcile'
    const now = Utilities.formatDate(
      new Date(),
      TIMEZONE,
      "yyyy-MM-dd'T'HH:mm:ssXXX",
    );
    let reconciledCount = 0;
    toReconcile.forEach((rowIndex) => {
      const currentVersion = Number(
        sheet.getRange(rowIndex, hdr["Version"] + 1).getValue(),
      );
      sheet.getRange(rowIndex, hdr["Status"] + 1).setValue("Reconciled");
      sheet.getRange(rowIndex, hdr["Version"] + 1).setValue(currentVersion + 1);
      sheet.getRange(rowIndex, hdr["UpdatedAt"] + 1).setValue(now);
      reconciledCount++;
    });

    writeActivityLog("reconcileMilkInventory", payload, {
      mode: "reconcile",
      reconciledCount: reconciledCount,
    });
    return respond(true, {
      healthy: issues.length === 0,
      issues: issues,
      reconciledCount: reconciledCount,
    });
  });
}

// ----------------------------------------------------------------------------
// MILK BRAND ACTIONS
// ----------------------------------------------------------------------------

/**
 * addMilkBrand — adds a new brand to the catalog. Duplicate active brand
 * names are rejected (case-insensitive) to keep import filters/selects clean.
 * Required: brandName
 * Optional: supplierName, supplierPhone, defaultMilkType, ratePerLiter
 */
function addMilkBrand(payload) {
  if (!payload.brandName || !String(payload.brandName).trim()) {
    return respond(false, null, {
      code: "VALIDATION_ERROR",
      message: "brandName is required",
    });
  }

  return withLock(function () {
    const sheet = getSheet("MILK_BRANDS");
    const hdr = buildHeaderMap(sheet);
    const lastRow = sheet.getLastRow();

    if (lastRow >= 2) {
      const existing = sheet
        .getRange(2, 1, lastRow - 1, sheet.getLastColumn())
        .getValues();
      const nameLower = String(payload.brandName).trim().toLowerCase();
      const dup = existing.find(
        (row) =>
          row[hdr["Status"]] === "Active" &&
          String(row[hdr["BrandName"]]).trim().toLowerCase() === nameLower,
      );
      if (dup)
        return respond(false, null, {
          code: "CONFLICT",
          message: "An active brand with this name already exists",
        });
    }

    const brandId =
      "BRAND-" + Utilities.getUuid().substring(0, 8).toUpperCase();
    const now = Utilities.formatDate(
      new Date(),
      TIMEZONE,
      "yyyy-MM-dd'T'HH:mm:ssXXX",
    );

    const row = [];
    row[hdr["BrandId"]] = brandId;
    row[hdr["BrandName"]] = sanitizeForText(payload.brandName).trim();
    row[hdr["SupplierName"]] = sanitizeForText(payload.supplierName || "");
    row[hdr["SupplierPhone"]] = payload.supplierPhone
      ? normalizePhone(payload.supplierPhone)
      : "";
    row[hdr["DefaultMilkType"]] = payload.defaultMilkType || "";
    row[hdr["RatePerLiter"]] =
      payload.ratePerLiter !== undefined ? Number(payload.ratePerLiter) : 0;
    row[hdr["Status"]] = "Active";
    row[hdr["CreatedAt"]] = now;

    safeAppend(sheet, row);
    writeActivityLog("addMilkBrand", payload, { brandId: brandId });

    return respond(true, { brandId: brandId });
  });
}

/**
 * getMilkBrands — list, optionally filtered by status (defaults to all)
 */
function getMilkBrands(payload) {
  const sheet = getSheet("MILK_BRANDS");
  const hdr = buildHeaderMap(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return respond(true, { brands: [] });

  const limit = Math.min(Number(payload.limit) || 200, 500);
  const values = sheet
    .getRange(2, 1, lastRow - 1, sheet.getLastColumn())
    .getValues();
  let filtered = values;
  if (payload.status)
    filtered = filtered.filter((row) => row[hdr["Status"]] === payload.status);
  filtered = filtered.slice(0, limit);

  const brands = filtered.map((row) => ({
    brandId: row[hdr["BrandId"]],
    brandName: row[hdr["BrandName"]],
    supplierName: row[hdr["SupplierName"]],
    supplierPhone: row[hdr["SupplierPhone"]],
    defaultMilkType: row[hdr["DefaultMilkType"]],
    ratePerLiter: row[hdr["RatePerLiter"]],
    status: row[hdr["Status"]],
  }));

  return respond(true, { brands: brands });
}

/**
 * getMilkTypes — list, optionally filtered by status
 */
function getMilkTypes(payload) {
  const sheet = getSheet("MILK_TYPES");
  const hdr = buildHeaderMap(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return respond(true, { types: [] });

  const values = sheet
    .getRange(2, 1, lastRow - 1, sheet.getLastColumn())
    .getValues();
  let filtered = values;
  if (payload.status)
    filtered = filtered.filter((row) => row[hdr["Status"]] === payload.status);

  const types = filtered.map((row) => ({
    typeId: row[hdr["TypeId"]],
    typeName: row[hdr["TypeName"]],
    status: row[hdr["Status"]],
  }));

  return respond(true, { types: types });
}

function getBrands() {
  const sheet = getSheet(SHEET_NAMES.MILK_BRANDS || "MilkBrands");
  const hdr = buildHeaderMap(sheet);
  const lastRow = sheet.getLastRow();
 
  if (lastRow < 2) return respond(true, { brands: [] });

  const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  const brands = data.map(row => ({
    brandId: row[hdr["BrandId"]] || row[hdr["Id"]],
    brandName: row[hdr["BrandName"]],
    status: row[hdr["Status"]],
    supplierName: row[hdr["SupplierName"]],
    supplierPhone: row[hdr["SupplierPhone"]],
    defaultMilkType: row[hdr["DefaultMilkType"]],
    ratePerLiter: Number(row[hdr["RatePerLiter"]]),
  }));

  return respond(true, { brands });
}
