"use strict";

// ---------------------------------------------------------------
// TERMINAL LOGGER (Streams directly to PowerShell via dev server)
// ---------------------------------------------------------------
function addLog(message, type = "info", details = null) {
  let detailStr = "";
  if (details) {
    try {
      detailStr =
        " | " +
        (typeof details === "string" ? details : JSON.stringify(details));
    } catch (e) {}
  }
  const fullMsg = `[${type.toUpperCase()}] ${message}${detailStr}`;
  console.log(`[i360:${type.toUpperCase()}]`, message, details || "");

  // Stream to local server so it prints directly into your PowerShell terminal!
  try {
    fetch("https://127.0.0.1:5000/__log?msg=" + encodeURIComponent(fullMsg), {
      mode: "no-cors",
    }).catch(() => {});
  } catch (e) {}
}
