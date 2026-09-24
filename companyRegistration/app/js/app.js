"use strict";

// ---------------------------------------------------------------
// VIEW ROUTING & SPA MANAGEMENT
// ---------------------------------------------------------------
function updateNavState() {
  const badge = document.getElementById("topStatusBadge");
  if (!badge) return;
  if (licenseKey) {
    badge.style.display = "inline-block";
    badge.textContent = "Lead Enrichment";
  } else {
    badge.style.display = "inline-block";
    badge.textContent = "Company Setup";
  }
}

function switchView(viewName) {
  if (viewName === "enrichment" && !licenseKey) {
    addLog(
      "Blocked access to Lead Enrichment: License registration required.",
      "warn",
    );
    viewName = "registration";
  }

  addLog(`Switching view to: ${viewName}`, "info");
  document.getElementById("loadingView").style.display = "none";
  document.getElementById("enrichmentView").style.display =
    viewName === "enrichment" ? "block" : "none";
  document.getElementById("registrationView").style.display =
    viewName === "registration" ? "block" : "none";

  updateNavState();
}

function showError(
  msg,
  title = "Notice",
  actionText = "Retry",
  onAction = null,
) {
  addLog(`UI Error shown: ${title} - ${msg}`, "error");
  document.getElementById("errorTitle").textContent = title;
  document.getElementById("errorMsg").textContent = msg;
  const btn = document.getElementById("errorActionBtn");
  btn.textContent = actionText;
  btn.onclick = onAction || (() => startEnrichment());
  document.getElementById("errorCard").style.display = "block";
}

function clearError() {
  document.getElementById("errorCard").style.display = "none";
}

function setStep(num) {
  // Step progress line removed per user request
}

// ---------------------------------------------------------------
// ZOHO EMBEDDED APP SDK INIT
// ---------------------------------------------------------------
let zohoReadyResolve;
const zohoReady = new Promise((resolve) => (zohoReadyResolve = resolve));

if (typeof ZOHO !== "undefined") {
  addLog("Registering ZOHO.embeddedApp.on(PageLoad)...", "info");
  ZOHO.embeddedApp.on("PageLoad", function (data) {
    addLog("PageLoad event received from CRM", "success", data);
    zohoPageData = data;
    try {
      sessionStorage.setItem("zoho_page_data", JSON.stringify(data));
    } catch (e) {}
  });

  addLog("Calling ZOHO.embeddedApp.init()...", "info");
  ZOHO.embeddedApp
    .init()
    .then(() => {
      addLog("Zoho Embedded App SDK initialized successfully.", "success");
      zohoReadyResolve(true);
    })
    .catch((err) => {
      addLog("Zoho SDK init failed: " + JSON.stringify(err), "warn");
      zohoReadyResolve(false);
    });
} else {
  addLog(
    "ZOHO global is undefined! Script live.zwidgets.com may be blocked.",
    "error",
  );
  zohoReadyResolve(false);
}

// ---------------------------------------------------------------
// MAIN APP BOOTSTRAP
// ---------------------------------------------------------------
async function bootstrap() {
  clearError();
  addLog("Starting Intelligence 360 App Bootstrap...", "info");

  try {
    addLog("Awaiting SDK readiness (max 4s)...", "info");
    await Promise.race([zohoReady, new Promise((r) => setTimeout(r, 4000))]);

    // Fetch Org ID
    try {
      addLog("Calling ZOHO.CRM.CONFIG.getOrgInfo()...", "info");
      const orgInfo = await ZOHO.CRM.CONFIG.getOrgInfo();
      orgId =
        (orgInfo && orgInfo.org && orgInfo.org[0] && orgInfo.org[0].id) || "";
      addLog("Zoho Org ID retrieved: " + orgId, orgId ? "success" : "warn");
    } catch (e) {
      addLog("Could not fetch Org Info from Zoho: " + (e.message || e), "warn");
    }
    if (!orgId) {
      orgId = localStorage.getItem("i360_org_id") || "";
      if (orgId)
        addLog("Using cached Org ID from local storage: " + orgId, "info");
    }

    // Check if License exists in Zoho CRM module
    addLog("Checking custom module for existing license key...", "info");
    const hasLicense = await checkAndLoadLicense();
    updateNavState();

    if (hasLicense) {
      resolveLeadContext();
      if (currentLeadId) {
        addLog(
          "License active & Lead detected. Launching Lead Enrichment view.",
          "success",
        );
        switchView("enrichment");
        startEnrichment();
      } else {
        addLog(
          "License active, but no Lead record in context. Showing Company Registration view.",
          "info",
        );
        switchView("registration");
        const successBox = document.getElementById("regSuccessBox");
        if (successBox) {
          successBox.style.display = "block";
          successBox.innerHTML = `License Active<br><br>Company is already registered.<br><span style="font-size:0.85rem;color:#475569;">To enrich leads, open any Lead in Zoho CRM and click the <strong>Lead Enrichment</strong> button.</span>`;
        }
        const submitBtn = document.getElementById("submitRegBtn");
        if (submitBtn) {
          submitBtn.textContent = "Update Registration";
        }
      }
    } else {
      addLog(
        "No active license found in CRM. Lead Enrichment locked. Showing Registration.",
        "warn",
      );
      switchView("registration");
    }
  } catch (err) {
    addLog("Bootstrap exception: " + (err.message || err), "error");
    switchView("registration");
    showError(
      "Startup error: " + (err.message || err),
      "Startup Notice",
      "Open Registration",
      () => switchView("registration"),
    );
  }
}

// ---------------------------------------------------------------
// DOM READY INITIALIZATION
// ---------------------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
  initRegistrationForm();
  bootstrap();
});
