"use strict";

// ---------------------------------------------------------------
// COMPANY REGISTRATION HANDLER
// ---------------------------------------------------------------
function initRegistrationForm() {
  const form = document.getElementById("widgetForm");
  if (!form) return;

  form.addEventListener("submit", async function () {
    const btn = document.getElementById("submitRegBtn");
    const statusBox = document.getElementById("regStatusBox");
    const successBox = document.getElementById("regSuccessBox");

    statusBox.style.display = "block";
    statusBox.textContent = "Connecting to Zoho CRM...";
    successBox.style.display = "none";
    btn.disabled = true;

    addLog("Company registration form submitted.", "info");

    try {
      if (!orgId) {
        try {
          const o = await ZOHO.CRM.CONFIG.getOrgInfo();
          orgId = (o && o.org && o.org[0] && o.org[0].id) || "";
        } catch (e) {}
      }
      if (!orgId) orgId = "ZOHO-" + Date.now();

      const cName = document.getElementById("companyName").value.trim();
      const cleanDomain =
        cName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "company";

      const rawProducts =
        (document.getElementById("productsServiceLines") &&
          document.getElementById("productsServiceLines").value) ||
        "";
      const productsList = rawProducts
        ? rawProducts
            .split(/[,\n]/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
        : [];
      if (productsList.length === 0 && rawProducts.trim().length > 0) {
        productsList.push(rawProducts.trim());
      }

      const payload = {
        orgId: String(orgId),
        companyName: cName,
        contactName: cName + " Admin",
        email: "admin@" + cleanDomain + ".com",
        phone: "",
        aboutCompany: document.getElementById("aboutCompany")
          ? document.getElementById("aboutCompany").value.trim()
          : "",
        industry: document.getElementById("industry")
          ? document.getElementById("industry").value.trim()
          : "",
        productsServiceLines: productsList,
        idealCustomerProfile: document.getElementById("idealCustomerProfile")
          ? document.getElementById("idealCustomerProfile").value.trim()
          : "",
        uniqueValueProposition: "",
        language:
          (document.getElementById("language") &&
            document.getElementById("language").value) ||
          "English",
      };

      addLog(`POST ${REGISTER_URL}`, "api", payload);
      statusBox.textContent = "Registering company with Intelligence 360...";
      const regRes = await fetch(REGISTER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "69420",
        },
        body: JSON.stringify(payload),
      });

      if (!regRes.ok) {
        throw new Error(
          "Registration failed: " + (await regRes.text().catch(() => "")),
        );
      }
      const regData = await regRes.json();
      licenseKey = regData.licenseKey || regData.license_key;
      if (!licenseKey) {
        throw new Error("No licenseKey returned: " + JSON.stringify(regData));
      }

      // If the org is already registered, show a friendly message and stop
      if (regData.alreadyRegistered) {
        addLog("Organization is already registered.", "info");
        statusBox.style.display = "none";
        var overlay = document.createElement("div");
        overlay.style.cssText =
          "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;";
        overlay.innerHTML =
          '<div style="background:#fff;border-radius:12px;padding:28px 32px;text-align:center;max-width:340px;box-shadow:0 8px 30px rgba(0,0,0,0.2);"><div style="font-size:2.2rem;margin-bottom:8px;">⚠️</div><strong style="font-size:1.1rem;color:#92400e;">Already Registered</strong><p style="margin:10px 0 0;font-size:0.93rem;color:#78350f;line-height:1.5;">Your organisation is already registered.<br>Please contact the development team.</p></div>';
        document.body.appendChild(overlay);
        btn.disabled = false;
        setTimeout(function () {
          closeEntireWidget();
        }, 3000);
        return;
      }

      addLog(`Registration succeeded! License Key: ${licenseKey}`, "success");

      // Execute handshake immediately to get active tokens
      statusBox.textContent = "Authenticating handshake...";
      await doHandshake();

      statusBox.textContent = "Saving license and tokens to Zoho CRM...";
      const targetMod = resolvedLicenseModule || CRM_LICENSE_MODULE;

      // Find existing record to update (same as Friday's simple approach)
      let existingId = null;
      try {
        const all = await ZOHO.CRM.API.getAllRecords({ Entity: targetMod });
        if (all && all.data && all.data.length > 0) {
          const matched = all.data.find((r) => {
            const n = (r.Name || "").trim().toLowerCase();
            return (
              n === "lisense key" ||
              n === "license key" ||
              n === "lisense_key" ||
              n === "license_key"
            );
          });
          if (matched) {
            existingId = matched.id;
            addLog(
              `Found existing record '${matched.Name}' (ID: ${existingId}) to update in ${targetMod}.`,
              "info",
            );
          }
        }
      } catch (e) {}

      // ALL fields in ONE single payload (this is how it worked on Friday)
      const crmData = {
        Name: "lisense key",
        [FIELD_LICENSE_KEY]: licenseKey,
        [FIELD_ACCESS_TOKEN]: accessToken,
        [FIELD_REFRESH_TOKEN]: refreshToken,
        [FIELD_ORG_ID]: String(orgId),
      };

      try {
        if (existingId) {
          crmData.id = existingId;
          licenseRecordId = existingId;
          addLog(
            `Updating existing record ${existingId} with ALL fields in ONE call in ${targetMod}...`,
            "info",
          );
          const updRes = await ZOHO.CRM.API.updateRecord({
            Entity: targetMod,
            APIData: crmData,
            RecordID: existingId,
          });
          addLog(`Update response: ${JSON.stringify(updRes)}`, "info");
        } else {
          addLog(
            `Inserting new record with ALL fields in ONE call into ${targetMod}...`,
            "info",
          );
          const insRes = await ZOHO.CRM.API.insertRecord({
            Entity: targetMod,
            APIData: crmData,
          });
          addLog(`Insert response: ${JSON.stringify(insRes)}`, "info");
          const item = insRes && insRes.data && insRes.data[0];
          if (item && item.details && item.details.id) {
            licenseRecordId = item.details.id;
          }
        }
        addLog(
          "Saved license, tokens, and Organization ID to CRM module successfully.",
          "success",
        );
      } catch (e) {
        addLog(
          "Full save failed, trying without Org ID: " + JSON.stringify(e),
          "warn",
        );
        // Fallback: try without Org ID field
        const fallback = {
          Name: "lisense key",
          [FIELD_LICENSE_KEY]: licenseKey,
          [FIELD_ACCESS_TOKEN]: accessToken,
          [FIELD_REFRESH_TOKEN]: refreshToken,
        };
        try {
          if (existingId) {
            fallback.id = existingId;
            await ZOHO.CRM.API.updateRecord({
              Entity: targetMod,
              APIData: fallback,
              RecordID: existingId,
            });
          } else {
            const insRes = await ZOHO.CRM.API.insertRecord({
              Entity: targetMod,
              APIData: fallback,
            });
            const item = insRes && insRes.data && insRes.data[0];
            if (item && item.details && item.details.id) {
              licenseRecordId = item.details.id;
            }
          }
          addLog(
            "Saved license and tokens to CRM (without Org ID).",
            "success",
          );
        } catch (tokenErr) {
          addLog(
            "Token save also failed, trying minimal: " +
              JSON.stringify(tokenErr),
            "warn",
          );
          // Last resort: just license key
          const minimal = {
            Name: "lisense key",
            [FIELD_LICENSE_KEY]: licenseKey,
          };
          if (existingId) {
            minimal.id = existingId;
            await ZOHO.CRM.API.updateRecord({
              Entity: targetMod,
              APIData: minimal,
              RecordID: existingId,
            });
          } else {
            await ZOHO.CRM.API.insertRecord({
              Entity: targetMod,
              APIData: minimal,
            });
          }
        }
      }

      // Verify the license key was actually saved by reading back
      if (licenseRecordId) {
        try {
          const verifyRes = await ZOHO.CRM.API.getRecord({
            Entity: targetMod,
            RecordID: licenseRecordId,
          });
          const rec = verifyRes && verifyRes.data && verifyRes.data[0];
          if (rec) {
            const storedLic = rec[FIELD_LICENSE_KEY] || "";
            addLog(
              `VERIFICATION: Record ${licenseRecordId} field '${FIELD_LICENSE_KEY}' = '${storedLic}'`,
              storedLic ? "success" : "error",
            );
          }
        } catch (verErr) {
          addLog(
            `Verification read-back error: ${verErr.message || verErr}`,
            "warn",
          );
        }
      }

      purgeBrowserStorage();

      statusBox.style.display = "none";
      successBox.style.display = "block";

      // Check if there is an active Lead record context
      resolveLeadContext();
      if (currentLeadId) {
        successBox.innerHTML = `Registration Complete!<br><br>Switching to Lead Enrichment...`;
        updateNavState();
        setTimeout(() => {
          switchView("enrichment");
          startEnrichment();
        }, 1500);
      } else {
        successBox.innerHTML = `Registration Complete!<br><br>Company registered and license activated successfully.<br><span style="font-size:0.85rem;color:#475569;">To enrich leads, open any Lead in Zoho CRM and click the <strong>Lead Enrichment</strong> button.</span>`;
        updateNavState();
      }
    } catch (err) {
      addLog("Registration exception: " + (err.message || err), "error");
      statusBox.style.display = "none";
      showError(
        "Registration Error: " + (err.message || err),
        "Registration Failed",
        "Try Again",
      );
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------------------------------------------------------------
// CLOSE WIDGET WINDOW HELPER
// ---------------------------------------------------------------
async function closeEntireWidget() {
  addLog("Executing closeEntireWidget()...", "info");
  try {
    if (
      window.ZOHO &&
      ZOHO.CRM &&
      ZOHO.CRM.UI &&
      ZOHO.CRM.UI.Popup &&
      typeof ZOHO.CRM.UI.Popup.close === "function"
    ) {
      addLog("Calling ZOHO.CRM.UI.Popup.close()...", "info");
      await ZOHO.CRM.UI.Popup.close();
      return;
    }
  } catch (e) {
    addLog("ZOHO.CRM.UI.Popup.close failed: " + (e.message || e), "warn");
  }

  try {
    window.close();
  } catch (e) {
    addLog("window.close() failed: " + (e.message || e), "warn");
  }
}
window.closeEntireWidget = closeEntireWidget;
