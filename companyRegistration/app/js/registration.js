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
      const payload = {
        orgId: String(orgId),
        companyName: cName,
        contactName: cName + " Admin",
        email: "admin@" + cleanDomain + ".com",
        phone: "",
        aboutCompany: document.getElementById("aboutCompany").value.trim(),
        industry: document.getElementById("industry").value.trim(),
        productsServiceLines: document
          .getElementById("productsServiceLines")
          .value.trim(),
        idealCustomerProfile: document
          .getElementById("idealCustomerProfile")
          .value.trim(),
        uniqueValueProposition: document
          .getElementById("uniqueValueProposition")
          .value.trim(),
        language: document.getElementById("language").value || "English",
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
      if (!regRes.ok)
        throw new Error(
          "Registration failed: " + (await regRes.text().catch(() => "")),
        );
      const regData = await regRes.json();
      licenseKey = regData.licenseKey || regData.license_key;
      if (!licenseKey)
        throw new Error("No licenseKey returned: " + JSON.stringify(regData));

      addLog(`Registration succeeded! License Key: ${licenseKey}`, "success");

      statusBox.textContent = "Authenticating handshake...";
      await doHandshake();

      statusBox.textContent = "Saving license to Zoho CRM...";
      const targetMod = resolvedLicenseModule || CRM_LICENSE_MODULE;
      let existingId = null;
      try {
        const all = await ZOHO.CRM.API.getAllRecords({
          Entity: targetMod,
        });
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
          addLog(
            `Updating existing record ${existingId} with Name 'lisense key' & Org ID in ${targetMod}...`,
            "info",
          );
          await ZOHO.CRM.API.updateRecord({
            Entity: targetMod,
            APIData: crmData,
            RecordID: existingId,
          });
        } else {
          addLog(
            `Inserting new record with Name 'lisense key' & Org ID into ${targetMod}...`,
            "info",
          );
          await ZOHO.CRM.API.insertRecord({
            Entity: targetMod,
            APIData: crmData,
          });
        }
        addLog(
          "Saved license, tokens, and Organization ID to CRM module successfully with Name 'lisense key'.",
          "success",
        );
      } catch (e) {
        addLog(
          "Saving Org ID to CRM failed (field may need creation). Attempting without Org ID: " +
            JSON.stringify(e),
          "warn",
        );
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
            await ZOHO.CRM.API.insertRecord({
              Entity: targetMod,
              APIData: fallback,
            });
          }
          addLog(
            "Saved license and tokens to CRM module (without Org ID field).",
            "success",
          );
        } catch (tokenErr) {
          const minimalFallback = {
            Name: "lisense key",
            [FIELD_LICENSE_KEY]: licenseKey,
          };
          if (existingId) {
            minimalFallback.id = existingId;
            await ZOHO.CRM.API.updateRecord({
              Entity: targetMod,
              APIData: minimalFallback,
              RecordID: existingId,
            });
          } else {
            await ZOHO.CRM.API.insertRecord({
              Entity: targetMod,
              APIData: minimalFallback,
            });
          }
        }
      }

      localStorage.setItem("i360_license_key", licenseKey);
      localStorage.setItem("i360_org_id", String(orgId));

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
