/**
 * Threadbreak — order intake
 *
 * ONE deployment serves all three forms, because all three templates post to the
 * same /exec URL:
 *   page.custom-order.liquid  -> type "order-artwork" / "order-details"  (embroidery)
 *   page.quote-form.liquid    -> type "quote"
 *   page.patch-order.liquid   -> type "patch-order-artwork" / "patch-order-details"
 *
 * Each form gets its own sheet tab and its own Drive subfolder, with a column set
 * matching what that form actually sends. Adding a form later means adding one
 * entry to FORMS below.
 *
 * SETUP
 *   Nothing is required. On first run the script creates a Drive folder called
 *   ROOT_FOLDER_NAME in your My Drive and a log sheet inside it, then remembers
 *   both. Run testRun() and check the execution log — it prints the links.
 *
 *   To file into a specific folder instead, put its ID in ROOT_FOLDER_ID (open
 *   the folder in Drive; the ID is the last chunk of the URL). Same for SHEET_ID.
 *
 *   Then: Deploy > Manage deployments > edit the existing web app > New version
 *         (editing the existing deployment keeps the same /exec URL, so the
 *         templates don't need changing).
 *
 * The pages post as text/plain with mode:"no-cors", so this script never needs to
 * return CORS headers — it just has to accept the POST and not throw.
 */

var ROOT_FOLDER_ID   = "";                      // "" = auto-create on first run
var ROOT_FOLDER_NAME = "Threadbreak orders";
var SHEET_ID         = "";                      // "" = auto-create on first run
var NOTIFY_EMAIL     = "help@threadbreak.com";

// Fields every form sends, ahead of the form-specific columns.
var COMMON_LEAD = [
  ["Submitted", "submittedAt"],
  ["Type",      "_type"],
  ["Name",      "name"],
  ["Email",     "email"],
  ["Phone",     "phone"]
];

// Fields every form sends, after the form-specific columns.
var COMMON_TAIL = [
  ["Proof method",   "proof"],
  ["Proof phone",    "proofPhone"],
  ["Social sharing", "social"],
  ["Notes",          "notes"],
  ["Estimate",       "estimate"],
  ["Page URL",       "pageUrl"],
  ["Drive folder",   "_folderUrl"],
  ["Artwork link",   "_artworkUrl"],
  ["Mockup link",    "_mockupUrl"]
];

/**
 * One entry per form. `match` decides which entry a payload belongs to, `tab` is
 * the sheet tab, `folder` the Drive subfolder, `columns` the fields unique to it.
 */
var FORMS = [
  {
    key: "patch",
    label: "Patch order",
    tab: "Patch orders",
    folder: "Patch orders",
    match: function (type) { return type.indexOf("patch") === 0; },
    columns: [
      ["Hat style",        "style"],
      ["Hat color(s)",     "color"],
      ["Color split",      "colorSplit"],
      ["Quantity",         "qty"],
      ["Sizing",           "sizing"],
      ["Patch material",   "material"],
      ["Patch shape",      "shape"],
      ["Placement",        "placement"],
      ["Edge finish",      "edge"],
      ["Patch size",       "patchSizeLabel"],
      ["Patch dimensions", "patchDims"],
      ["Size upcharge",    "sizeUpcharge"],
      ["Tier price",       "tierPrice"],
      ["Price per hat",    "perHat"],
      ["Order total",      "orderTotal"],
      ["Hat variant ID",   "hatVariantId"],
      ["Size variant ID",  "sizeVariantId"],
      ["Threshold",        "threshold"],
      ["Inverted",         "invert"],
      ["Logo size",        "logoScale"],
      ["Logo offset",      "logoOffset"],
      ["Logo file",        "logoFileName"],
      ["Mockup captured",  "hasMockup"]
    ]
  },
  {
    key: "quote",
    label: "Quote request",
    tab: "Quote requests",
    folder: "Quote requests",
    match: function (type) { return type.indexOf("quote") === 0; },
    columns: [
      ["Hat style",       "style"],
      ["Requested style", "requestedStyle"],
      ["Color(s)",        "color"],
      ["Quantity",        "qty"],
      ["Decoration",      "deco"],
      ["Placements",      "placements"]
    ]
  },
  {
    // Default. The embroidery form posts "order-artwork" / "order-details".
    key: "embroidery",
    label: "Embroidery order",
    tab: "Embroidery orders",
    folder: "Embroidery orders",
    match: function (type) { return true; },
    columns: [
      ["Hat style",       "style"],
      ["Requested style", "requestedStyle"],
      ["Hat color(s)",    "color"],
      ["Quantity",        "qty"],
      ["Sizing",          "sizing"],
      ["Decoration",      "deco"],
      ["Placements",      "placements"]
    ]
  }
];

function formFor(type) {
  var t = String(type || "").toLowerCase();
  for (var i = 0; i < FORMS.length; i++) {
    if (FORMS[i].match(t)) return FORMS[i];
  }
  return FORMS[FORMS.length - 1];
}

function columnsFor(form) {
  return COMMON_LEAD.concat(form.columns).concat(COMMON_TAIL);
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      // Almost always means someone pressed Run in the editor instead of posting.
      throw new Error(
        "No POST body. If you clicked Run in the editor, run testRun() instead — " +
        "doPost only works when a form actually submits to the /exec URL."
      );
    }
    handle(JSON.parse(e.postData.contents));
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    // Log and still return 200 — the pages fire no-cors and can't read this, and
    // we'd rather not lose the submission to a retry loop.
    console.error("order intake failed: " + err + "\n" + (err && err.stack));
    logFailure(err, e);
    return ContentService.createTextOutput(JSON.stringify({ ok: false }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService.createTextOutput("Threadbreak order intake is running.");
}

function handle(payload) {
  var meta  = payload.meta || {};
  var files = payload.files || [];
  var form  = formFor(payload.type);
  meta._type = payload.type || form.key;

  var folder = makeOrderFolder(form, meta);
  meta._folderUrl = folder.getUrl();

  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (!f || !f.data) continue;
    var blob = Utilities.newBlob(
      Utilities.base64Decode(f.data),
      f.mimeType || "application/octet-stream",
      fileName(f, meta)
    );
    var saved = folder.createFile(blob);
    if (f.kind === "mockup") meta._mockupUrl = saved.getUrl();
    else if (!meta._artworkUrl) meta._artworkUrl = saved.getUrl();
  }

  appendRow(form, meta);
  notify(form, meta, files);
}

/**
 * The Drive folder submissions are filed into. Uses ROOT_FOLDER_ID when you've
 * set one; otherwise creates ROOT_FOLDER_NAME in My Drive on first run and
 * reuses it from then on (the ID is cached in script properties).
 */
function rootFolder() {
  if (ROOT_FOLDER_ID && ROOT_FOLDER_ID.indexOf("PASTE") !== 0) {
    return DriveApp.getFolderById(ROOT_FOLDER_ID);
  }
  var props = PropertiesService.getScriptProperties();
  var known = props.getProperty("ROOT_FOLDER_ID");
  if (known) {
    try { return DriveApp.getFolderById(known); } catch (e) { /* deleted — remake below */ }
  }
  var existing = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
  var folder = existing.hasNext() ? existing.next() : DriveApp.createFolder(ROOT_FOLDER_NAME);
  props.setProperty("ROOT_FOLDER_ID", folder.getId());
  Logger.log("Filing orders into: " + folder.getUrl());
  return folder;
}

function subFolder(name) {
  var root = rootFolder();
  var it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}

function makeOrderFolder(form, meta) {
  var parent = subFolder(form.folder);
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HHmm");
  var who = meta.name || meta.style || "order";
  var label = [stamp, who, meta.qty ? meta.qty + "pc" : ""]
    .filter(function (p) { return p; })
    .join(" - ")
    .replace(/[\\\/:*?"<>|]/g, "-");
  return parent.createFolder(label);
}

function fileName(f, meta) {
  var base = (f.name || "file").replace(/[\\\/:*?"<>|]/g, "-");
  if (f.kind === "mockup") return "MOCKUP - " + (meta.style || "patch") + " - " + base;
  return "ARTWORK" + (f.placement ? " - " + f.placement : "") + " - " + base;
}

function spreadsheet() {
  if (SHEET_ID) return SpreadsheetApp.openById(SHEET_ID);
  var props = PropertiesService.getScriptProperties();
  var known = props.getProperty("SHEET_ID");
  if (known) {
    try { return SpreadsheetApp.openById(known); } catch (e) { /* deleted — remake below */ }
  }
  var ss = SpreadsheetApp.create("Threadbreak orders");
  DriveApp.getFileById(ss.getId()).moveTo(rootFolder());
  props.setProperty("SHEET_ID", ss.getId());
  return ss;
}

function tabFor(form) {
  var ss = spreadsheet();
  var tab = ss.getSheetByName(form.tab) || ss.insertSheet(form.tab);
  if (tab.getLastRow() === 0) {
    var headers = columnsFor(form).map(function (c) { return c[0]; });
    tab.appendRow(headers);
    tab.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    tab.setFrozenRows(1);
  }
  return tab;
}

function appendRow(form, meta) {
  tabFor(form).appendRow(columnsFor(form).map(function (c) {
    var v = meta[c[1]];
    return (v === undefined || v === null) ? "" : v;
  }));
}

function notify(form, meta, files) {
  if (!NOTIFY_EMAIL) return;
  var lines = columnsFor(form).map(function (c) {
    var v = meta[c[1]];
    return (v === undefined || v === null || v === "") ? null : c[0] + ": " + v;
  }).filter(function (l) { return l; });

  var subject = "New " + form.label.toLowerCase() + " - " +
                (meta.style || meta.name || "hat") + " x" + (meta.qty || "?") +
                (meta.hasMockup === "Yes" ? " (mockup attached)" : "");

  var attachments = [];
  for (var i = 0; i < files.length; i++) {
    if (files[i].kind === "mockup" && files[i].data) {
      attachments.push(Utilities.newBlob(
        Utilities.base64Decode(files[i].data),
        files[i].mimeType || "image/png",
        files[i].name || "mockup.png"
      ));
    }
  }

  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: subject,
    body: lines.join("\n") + "\n\n" + files.length + " file(s) saved to Drive.",
    attachments: attachments
  });
}

function logFailure(err, e) {
  try {
    var ss = spreadsheet();
    var tab = ss.getSheetByName("Errors") || ss.insertSheet("Errors");
    if (tab.getLastRow() === 0) tab.appendRow(["When", "Error", "Body"]);
    var body = "";
    try { body = String(e.postData.contents).slice(0, 4000); } catch (_) { body = "(no body)"; }
    tab.appendRow([new Date(), String(err), body]);
  } catch (_) { /* nothing else we can do */ }
}

/**
 * Run THIS (not doPost) to test from the editor. Files one fake submission of
 * each type, so you can confirm all three tabs, folders and emails work.
 * Delete the test folders and rows afterwards.
 */
function testRun() {
  handle({
    type: "patch-order-artwork",
    meta: {
      submittedAt: new Date().toISOString(),
      name: "", email: "", phone: "",
      style: "TEST - Richardson 112", color: "Black / Charcoal",
      colorSplit: '{"Black":6,"Charcoal":6}', qty: 12,
      sizing: "One size, adjustable", material: "Vintage Caramel Brown",
      shape: "Die cut (follows your logo)", placement: "Front (centered)",
      edge: "None (die cut edge)", patchSizeLabel: "Medium", patchDims: '3.25" wide',
      sizeUpcharge: "$2.50/hat", tierPrice: "$24.00", perHat: "$26.50",
      orderTotal: "$318.00", hatVariantId: "0000000000", sizeVariantId: "52732410200196",
      threshold: "140", invert: "No", logoScale: "100%", logoOffset: "0%, 0%",
      logoFileName: "test-logo.png", hasMockup: "No",
      proof: "Email", proofPhone: "", social: "OK to share on social",
      notes: "TEST row from testRun().", estimate: "$26.50/hat, $318.00 total",
      pageUrl: "editor test"
    },
    files: []
  });

  handle({
    type: "order-artwork",
    meta: {
      submittedAt: new Date().toISOString(),
      name: "", email: "", phone: "",
      style: "TEST - Richardson 112", requestedStyle: "",
      color: "Navy", qty: 24, sizing: "One size, adjustable",
      deco: "Embroidery", placements: "Front (Center front), Back",
      proof: "Email", proofPhone: "", social: "OK to share on social",
      notes: "TEST row from testRun().", estimate: "$22.00/hat, $528.00 total",
      pageUrl: "editor test"
    },
    files: []
  });

  handle({
    type: "quote",
    meta: {
      submittedAt: new Date().toISOString(),
      name: "TEST Person", email: "test@example.com", phone: "",
      style: "Not sure yet", requestedStyle: "Not sure yet",
      color: "Black", qty: "50", deco: "Embroidery",
      placements: "Front (Center front)", social: "-",
      notes: "TEST row from testRun().", estimate: "quote",
      pageUrl: "editor test"
    },
    files: []
  });

  Logger.log("testRun complete — three test rows filed.");
  Logger.log("Drive folder: " + rootFolder().getUrl());
  Logger.log("Log sheet:    " + spreadsheet().getUrl());
  Logger.log("Notified:     " + NOTIFY_EMAIL);
}
