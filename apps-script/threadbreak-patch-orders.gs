/**
 * Threadbreak — patch hat order intake
 * Receives submissions from templates/page.patch-order.liquid
 *
 * SETUP (one time)
 *   1. Set ROOT_FOLDER_ID below to the Drive folder you want orders saved into.
 *      (Open the folder in Drive; the ID is the last chunk of the URL.)
 *   2. Set SHEET_ID to a Google Sheet you want the log written to, or leave it
 *      as "" and the script will create one inside ROOT_FOLDER_ID on first run.
 *   3. Set NOTIFY_EMAIL to where you want the heads-up.
 *   4. Deploy > New deployment > Web app
 *        Execute as: Me
 *        Who has access: Anyone
 *      Copy the /exec URL into APPS_SCRIPT_URL in page.patch-order.liquid.
 *
 * The page posts as text/plain with mode:"no-cors", so this script never needs
 * to return CORS headers — it just has to accept the POST and not throw.
 */

var ROOT_FOLDER_ID = "PASTE_DRIVE_FOLDER_ID";
var SHEET_ID       = "";                       // "" = auto-create on first run
var NOTIFY_EMAIL   = "help@threadbreak.com";
var SHEET_TAB      = "Patch orders";

// Column order for the log. Keys match the `meta` object the page sends.
var COLUMNS = [
  ["Submitted",        "submittedAt"],
  ["Type",             "_type"],
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
  ["Mockup captured",  "hasMockup"],
  ["Proof method",     "proof"],
  ["Proof phone",      "proofPhone"],
  ["Social sharing",   "social"],
  ["Notes",            "notes"],
  ["Estimate",         "estimate"],
  ["Page URL",         "pageUrl"],
  ["Drive folder",     "_folderUrl"],
  ["Artwork link",     "_artworkUrl"],
  ["Mockup link",      "_mockupUrl"]
];

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      // Almost always means someone pressed Run in the editor instead of posting.
      // Use testRun() below to exercise the script by hand.
      throw new Error(
        "No POST body. If you clicked Run in the editor, run testRun() instead — " +
        "doPost only works when the form actually submits to the /exec URL."
      );
    }
    var payload = JSON.parse(e.postData.contents);
    handle(payload);
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    // Log and still return 200 — the page fires no-cors and can't read this,
    // and we'd rather not lose the order to a retry loop.
    console.error("patch order intake failed: " + err + "\n" + (err && err.stack));
    logFailure(err, e);
    return ContentService.createTextOutput(JSON.stringify({ ok: false }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Run THIS (not doPost) to test the script by hand from the editor.
 * It files a fake order so you can confirm the Drive folder, the sheet row and
 * the notification email all land where you expect. Delete the test folder and
 * sheet row afterwards.
 */
function testRun() {
  handle({
    type: "patch-order-test",
    meta: {
      submittedAt: new Date().toISOString(),
      style: "TEST - Richardson 112",
      color: "Black / Charcoal",
      colorSplit: '{"Black":6,"Charcoal":6}',
      qty: 12,
      sizing: "One size, adjustable",
      material: "Vintage Caramel Brown",
      shape: "Die cut (follows your logo)",
      placement: "Front (centered)",
      edge: "None (die cut edge)",
      patchSizeLabel: "Medium",
      patchDims: '3.25" wide',
      sizeUpcharge: "$2.50/hat",
      tierPrice: "$24.00",
      perHat: "$26.50",
      orderTotal: "$318.00",
      hatVariantId: "0000000000",
      sizeVariantId: "52732410200196",
      threshold: "140",
      invert: "No",
      logoScale: "100%",
      logoOffset: "0%, 0%",
      logoFileName: "test-logo.png",
      hasMockup: "No",
      proof: "Email",
      proofPhone: "",
      social: "OK to share on social",
      notes: "This is a test row from testRun().",
      estimate: "$26.50/hat, $318.00 total",
      pageUrl: "editor test"
    },
    files: []
  });
  Logger.log("testRun complete — check Drive, the sheet, and " + NOTIFY_EMAIL);
}

function doGet() {
  return ContentService.createTextOutput("Threadbreak patch order intake is running.");
}

function handle(payload) {
  var meta  = payload.meta || {};
  var files = payload.files || [];
  meta._type = payload.type || "patch-order";

  var folder = makeOrderFolder(meta);
  meta._folderUrl = folder.getUrl();

  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (!f || !f.data) continue;
    var name = fileName(f, meta);
    var blob = Utilities.newBlob(Utilities.base64Decode(f.data), f.mimeType || "application/octet-stream", name);
    var saved = folder.createFile(blob);
    if (f.kind === "mockup") meta._mockupUrl = saved.getUrl();
    else if (!meta._artworkUrl) meta._artworkUrl = saved.getUrl();
  }

  appendRow(meta);
  notify(meta, files);
}

function makeOrderFolder(meta) {
  var root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HHmm");
  var label = [stamp, "patch", meta.style || "order", meta.qty ? meta.qty + "pc" : ""]
    .filter(function (p) { return p; })
    .join(" - ")
    .replace(/[\\\/:*?"<>|]/g, "-");
  return root.createFolder(label);
}

function fileName(f, meta) {
  var base = (f.name || "file").replace(/[\\\/:*?"<>|]/g, "-");
  if (f.kind === "mockup") {
    return "MOCKUP - " + (meta.style || "patch") + " - " + base;
  }
  return "ARTWORK - " + base;
}

function sheet() {
  var ss;
  if (SHEET_ID) {
    ss = SpreadsheetApp.openById(SHEET_ID);
  } else {
    var props = PropertiesService.getScriptProperties();
    var known = props.getProperty("SHEET_ID");
    if (known) {
      ss = SpreadsheetApp.openById(known);
    } else {
      ss = SpreadsheetApp.create("Threadbreak patch orders");
      DriveApp.getFileById(ss.getId()).moveTo(DriveApp.getFolderById(ROOT_FOLDER_ID));
      props.setProperty("SHEET_ID", ss.getId());
    }
  }
  var tab = ss.getSheetByName(SHEET_TAB);
  if (!tab) {
    tab = ss.insertSheet(SHEET_TAB);
  }
  if (tab.getLastRow() === 0) {
    var headers = COLUMNS.map(function (c) { return c[0]; });
    tab.appendRow(headers);
    tab.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    tab.setFrozenRows(1);
  }
  return tab;
}

function appendRow(meta) {
  var tab = sheet();
  var row = COLUMNS.map(function (c) {
    var v = meta[c[1]];
    return (v === undefined || v === null) ? "" : v;
  });
  tab.appendRow(row);
}

function notify(meta, files) {
  if (!NOTIFY_EMAIL) return;
  var lines = COLUMNS.map(function (c) {
    var v = meta[c[1]];
    return (v === undefined || v === null || v === "") ? null : c[0] + ": " + v;
  }).filter(function (l) { return l; });

  var subject = "New patch order - " + (meta.style || "hat") + " x" + (meta.qty || "?") +
                (meta.hasMockup === "Yes" ? " (mockup attached)" : "");
  var body = lines.join("\n") + "\n\n" + files.length + " file(s) saved to Drive.";

  var attachments = [];
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (f.kind !== "mockup" || !f.data) continue;
    attachments.push(Utilities.newBlob(Utilities.base64Decode(f.data), f.mimeType || "image/png", f.name || "mockup.png"));
  }

  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: subject,
    body: body,
    attachments: attachments
  });
}

function logFailure(err, e) {
  try {
    var ss = sheet().getParent();
    var tab = ss.getSheetByName("Errors") || ss.insertSheet("Errors");
    if (tab.getLastRow() === 0) tab.appendRow(["When", "Error", "Body"]);
    var body = "";
    try { body = String(e.postData.contents).slice(0, 4000); } catch (_) { body = "(no body)"; }
    tab.appendRow([new Date(), String(err), body]);
  } catch (_) { /* nothing else we can do */ }
}
