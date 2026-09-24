"use strict";

// ---------------------------------------------------------------
// CREDITS & LICENSE DASHBOARD
// ---------------------------------------------------------------
function openCreditsDashboard() {
  const modal = document.getElementById("creditsModal");
  if (modal) modal.style.display = "flex";
  loadCreditsData();
}

function closeCreditsDashboard() {
  const modal = document.getElementById("creditsModal");
  if (modal) modal.style.display = "none";
}

function closeCreditsDashboardOnBackdrop(e) {
  if (e.target && e.target.id === "creditsModal") {
    closeCreditsDashboard();
  }
}

async function loadCreditsData() {
  const loadingEl = document.getElementById("creditsLoading");
  const errorEl = document.getElementById("creditsError");
  const contentEl = document.getElementById("creditsContent");
  if (loadingEl) loadingEl.style.display = "block";
  if (errorEl) errorEl.style.display = "none";
  if (contentEl) contentEl.style.display = "none";

  addLog("Loading credits & license balance...", "info");

  try {
    if (!orgId) {
      try {
        const o = await ZOHO.CRM.CONFIG.getOrgInfo();
        orgId = (o && o.org && o.org[0] && o.org[0].id) || "";
      } catch (e) {}
    }
    if (!orgId) orgId = localStorage.getItem("i360_org_id") || "ZOHO-ORG";
    if (!licenseKey) await checkAndLoadLicense();
    if (!accessToken || isTokenExpired(accessToken)) {
      try {
        await doHandshake();
      } catch (e) {}
    }

    const validateUrl = `${VALIDATE_URL}?orgId=${encodeURIComponent(orgId)}`;
    addLog(`GET ${validateUrl}`, "api");

    let res = await fetch(validateUrl, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + accessToken,
        licenseKey: licenseKey,
        "ngrok-skip-browser-warning": "69420",
      },
    });

    if (res.status === 401) {
      addLog("Validate returned 401. Refreshing token...", "warn");
      await doHandshake();
      res = await fetch(validateUrl, {
        method: "GET",
        headers: {
          Authorization: "Bearer " + accessToken,
          licenseKey: licenseKey,
          "ngrok-skip-browser-warning": "69420",
        },
      });
    }

    if (!res.ok) {
      const errTxt = await res.text().catch(() => "");
      throw new Error(
        `Server returned HTTP ${res.status}: ${errTxt || res.statusText}`,
      );
    }

    const data = await res.json();
    addLog("Credits validation payload received", "success", data);

    const avail =
      data.availableCredits !== undefined ? data.availableCredits : "-";
    const used = data.usedCredits !== undefined ? data.usedCredits : "-";
    const total = data.totalCredits !== undefined ? data.totalCredits : "-";
    const usagePercent =
      typeof data.usagePercent === "number"
        ? data.usagePercent
        : parseFloat(data.usagePercent) || 0;
    const status = data.status || (data.valid ? "Active" : "Inactive");
    const msg =
      data.message || (data.valid ? "License is active" : "Status notice");

    // Fill Stat Cards
    const availEl = document.getElementById("statAvailableCredits");
    if (availEl) availEl.textContent = avail;

    const usedEl = document.getElementById("statUsedCredits");
    if (usedEl) usedEl.textContent = used;

    const totalEl = document.getElementById("statTotalCredits");
    if (totalEl) totalEl.textContent = total;

    // Utilization bar & text
    const usageLabel = document.getElementById("statUsagePercentLabel");
    if (usageLabel) usageLabel.textContent = `${usagePercent}% used`;

    const pBar = document.getElementById("statUsageProgressBar");
    if (pBar) {
      const clamped = Math.min(100, Math.max(0, usagePercent));
      pBar.style.width = `${clamped}%`;
      if (clamped >= 90) {
        pBar.style.background = "linear-gradient(90deg, #ef4444, #dc2626)";
        if (usageLabel) usageLabel.style.color = "#dc2626";
      } else if (clamped >= 75) {
        pBar.style.background = "linear-gradient(90deg, #f59e0b, #d97706)";
        if (usageLabel) usageLabel.style.color = "#d97706";
      } else {
        pBar.style.background = "linear-gradient(90deg, #2563eb, #3b82f6)";
        if (usageLabel) usageLabel.style.color = "#2563eb";
      }
    }

    const usedLabel = document.getElementById("statUsedLabel");
    if (usedLabel) usedLabel.textContent = `${used} used`;
    const remLabel = document.getElementById("statRemainingLabel");
    if (remLabel) remLabel.textContent = `${avail} remaining`;
    const limitLabel = document.getElementById("statTotalLimitLabel");
    if (limitLabel) limitLabel.textContent = `${total} total`;

    // Status & Message
    const statusBadge = document.getElementById("creditStatusBadge");
    if (statusBadge) {
      statusBadge.textContent = status;
      statusBadge.className = data.valid
        ? "badge badge-success"
        : "badge badge-error";
    }

    const msgEl = document.getElementById("creditMessage");
    if (msgEl) msgEl.textContent = msg;

    if (loadingEl) loadingEl.style.display = "none";
    if (contentEl) contentEl.style.display = "block";
  } catch (err) {
    addLog("Failed to query credits: " + err.message, "error");
    if (loadingEl) loadingEl.style.display = "none";
    if (errorEl) {
      errorEl.style.display = "block";
      const errSpan = document.getElementById("creditsErrorMsg");
      if (errSpan)
        errSpan.textContent = err.message || "Failed to query license balance.";
    }
  }
}
