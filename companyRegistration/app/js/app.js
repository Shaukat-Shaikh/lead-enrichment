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
  if (
    viewName === "enrichment" &&
    (!licenseKey || String(licenseKey).trim().length === 0)
  ) {
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

  const topNav = document.getElementById("topNav") || document.querySelector(".top-nav");
  if (topNav) {
    topNav.style.display = viewName === "enrichment" ? "none" : (viewName === "registration" ? "flex" : "none");
  }

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
  purgeBrowserStorage();
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

    // Inspect module metadata to verify exact field API names from Zoho CRM
    try {
      const meta = await ZOHO.CRM.META.getFields({
        Entity: CRM_LICENSE_MODULE,
      });
      if (meta && Array.isArray(meta.fields)) {
        addLog(
          `Module '${CRM_LICENSE_MODULE}' fields: ` +
            meta.fields.map((f) => `${f.api_name} (${f.data_type})`).join(", "),
          "info",
        );
      }
    } catch (metaErr) {
      addLog(
        "META.getFields notice: " +
          (metaErr.message || JSON.stringify(metaErr)),
        "info",
      );
    }

    // Check if License exists in Zoho CRM module intelligence360zoho__Intelligence_360
    addLog("Checking CRM for existing license key...", "info");
    const hasLicense = await checkAndLoadLicense();
    updateNavState();

    if (hasLicense && licenseKey && String(licenseKey).trim().length > 0) {
      resolveLeadContext();
      if (currentLeadId) {
        addLog(
          `License active & ${currentEntity} detected (ID: ${currentLeadId}). Launching Enrichment view.`,
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
          successBox.innerHTML = `
            <div style="text-align: center; padding: 12px 0;">
              <div style="font-size: 1.8rem; margin-bottom: 6px;">🛡️</div>
              <strong style="color: #166534; font-size: 1.05rem;">License Active</strong>
              <p style="margin: 8px 0; font-size: 0.9rem; color: #475569;">
                Company is already registered.<br>To enrich leads, open any Lead in Zoho CRM and click the <strong>Lead Enrichment</strong> button.
              </p>
            </div>`;
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
      licenseKey = "";
      switchView("registration");
      const successBox = document.getElementById("regSuccessBox");
      if (successBox) successBox.style.display = "none";
      const statusBox = document.getElementById("regStatusBox");
      if (statusBox) statusBox.style.display = "none";
      const submitBtn = document.getElementById("submitRegBtn");
      if (submitBtn) {
        submitBtn.textContent = "Register & Activate License";
        submitBtn.disabled = false;
      }
    }
  } catch (err) {
    addLog("Bootstrap exception: " + (err.message || err), "error");
    licenseKey = "";
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
  purgeBrowserStorage();
  initRegistrationForm();
  bootstrap();
});
