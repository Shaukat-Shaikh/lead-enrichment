"use strict";

// ---------------------------------------------------------------
// LICENSE RESOLUTION & CRM MODULE LOOKUP
// ---------------------------------------------------------------
async function checkAndLoadLicense() {
  // Always reset in-memory license state at the start
  licenseKey = "";
  accessToken = "";
  refreshToken = "";
  licenseRecordId = null;

  const moduleCandidates = [
    CRM_LICENSE_MODULE, // "intelligence360__Intelligence_360"
    CRM_LICENSE_MODULE_FALLBACK, // "intelligence__name_of_lead"
    "intelegence__name_of_lead",
  ];

  for (const mod of moduleCandidates) {
    try {
      addLog(
        `Searching module '${mod}' for existing license record...`,
        "info",
      );
      const candidateRecs = [];

      // 1. Try getAllRecords with pagination (standard Zoho CRM JS SDK format)
      try {
        const res = await ZOHO.CRM.API.getAllRecords({
          Entity: mod,
          sort_order: "asc",
          per_page: 200,
          page: 1,
        });
        if (res && Array.isArray(res.data)) {
          for (const r of res.data) {
            if (!candidateRecs.some((c) => c.id === r.id)) {
              candidateRecs.push(r);
            }
          }
          addLog(
            `getAllRecords (paginated) found ${res.data.length} records in '${mod}'.`,
            "info",
          );
        }
      } catch (pageErr) {
        addLog(
          `getAllRecords (paginated) notice: ${pageErr.message || JSON.stringify(pageErr)}`,
          "info",
        );
      }

      // 2. Fallback: getAllRecords standard
      if (candidateRecs.length === 0) {
        try {
          const res = await ZOHO.CRM.API.getAllRecords({ Entity: mod });
          if (res && Array.isArray(res.data)) {
            for (const r of res.data) {
              if (!candidateRecs.some((c) => c.id === r.id)) {
                candidateRecs.push(r);
              }
            }
          }
        } catch (allErr) {}
      }

      // 3. Search by word "LIC" (finds records containing license keys across text fields)
      try {
        const wordRes = await ZOHO.CRM.API.searchRecord({
          Entity: mod,
          Type: "word",
          Query: "LIC",
        });
        if (wordRes && Array.isArray(wordRes.data)) {
          for (const r of wordRes.data) {
            if (!candidateRecs.some((c) => c.id === r.id)) {
              candidateRecs.push(r);
            }
          }
        }
      } catch (wordErr) {}

      // 4. Search by Name 'lisense key' or 'license key'
      try {
        const searchRes = await ZOHO.CRM.API.searchRecord({
          Entity: mod,
          Type: "criteria",
          Query: "((Name:equals:lisense key) or (Name:equals:license key))",
        });
        if (searchRes && Array.isArray(searchRes.data)) {
          for (const r of searchRes.data) {
            if (!candidateRecs.some((c) => c.id === r.id)) {
              candidateRecs.push(r);
            }
          }
        }
      } catch (searchErr) {}

      if (candidateRecs.length === 0) {
        addLog(`No records found in module '${mod}'.`, "info");
        continue;
      }

      // Check each candidate record in this module for a valid license key
      for (const matchedRec of candidateRecs) {
        let fullRec = matchedRec;

        if (matchedRec.id) {
          try {
            const detailRes = await ZOHO.CRM.API.getRecord({
              Entity: mod,
              RecordID: matchedRec.id,
            });
            if (detailRes && detailRes.data && detailRes.data[0]) {
              fullRec = detailRes.data[0];
            }
          } catch (e) {}
        }

        // Search for license key field (primary: intelligence360__Enrichment_License, intelligence__enrichment_license, intelegence__enrichment_lisense)
        let foundLic =
          fullRec[FIELD_LICENSE_KEY] ||
          fullRec["intelligence360__Enrichment_License"] ||
          fullRec["intelligence__enrichment_license"] ||
          fullRec["intelegence__enrichment_lisense"] ||
          fullRec["intelegence__enrichment_license"] ||
          fullRec["intelligence__enrichment_lisense"] ||
          "";
        if (!foundLic) {
          for (const k of Object.keys(fullRec)) {
            if (
              /l[ic]s[ec]nse/i.test(k) ||
              k.toLowerCase().includes("enrichment")
            ) {
              const v = fullRec[k];
              if (v && String(v).trim().length > 0) {
                foundLic = String(v).trim();
                break;
              }
            }
          }
        }

        // Validate found license key - MUST be non-empty and not dummy placeholder
        if (
          !foundLic ||
          typeof foundLic !== "string" ||
          foundLic.trim().length < 8 ||
          foundLic.trim() === "LIC-ACTIVE"
        ) {
          addLog(
            `Record '${matchedRec.Name}' (ID: ${matchedRec.id}) in '${mod}' does not contain license key, checking next...`,
            "info",
          );
          continue;
        }

        licenseRecordId = matchedRec.id;
        licenseKey = foundLic.trim();
        resolvedLicenseModule = mod;

        // Ensure record Name is standard 'lisense key'
        if ((matchedRec.Name || "").trim().toLowerCase() !== "lisense key") {
          try {
            await ZOHO.CRM.API.updateRecord({
              Entity: mod,
              APIData: { id: matchedRec.id, Name: "lisense key" },
              RecordID: matchedRec.id,
            });
          } catch (nameUpdErr) {}
        }

        // Load access token from CRM record
        accessToken =
          fullRec[FIELD_ACCESS_TOKEN] ||
          fullRec["intelligence360__Access_Token"] ||
          fullRec["intelligence__access_token"] ||
          fullRec["intelegence__access_token"] ||
          fullRec["intelligence__Access_Token"] ||
          fullRec["intelegence__Access_Token"] ||
          "";
        if (!accessToken) {
          for (const k of Object.keys(fullRec)) {
            if (/access.*token/i.test(k)) {
              const v = fullRec[k];
              if (v && String(v).trim().length > 0) {
                accessToken = String(v).trim();
                break;
              }
            }
          }
        }

        // Load refresh token from CRM record
        refreshToken =
          fullRec[FIELD_REFRESH_TOKEN] ||
          fullRec["intelligence360__Refresh_Token"] ||
          fullRec["intelligence__refresh_token"] ||
          fullRec["intelegence__refresh_token"] ||
          fullRec["intelligence__Refresh_Token"] ||
          fullRec["intelegence__Refresh_Token"] ||
          "";
        if (!refreshToken) {
          for (const k of Object.keys(fullRec)) {
            if (/refresh.*token/i.test(k)) {
              const v = fullRec[k];
              if (v && String(v).trim().length > 0) {
                refreshToken = String(v).trim();
                break;
              }
            }
          }
        }

        // Load Organization ID from CRM record
        const recOrgId =
          fullRec[FIELD_ORG_ID] ||
          fullRec["intelligence360__Organisation_ID"] ||
          fullRec["intelligence360__Organization_ID"] ||
          fullRec["intelligence__Organisation_ID"] ||
          fullRec["intelligence__Organization_ID"] ||
          fullRec["intelegence__Organisation_ID"] ||
          fullRec["intelegence__Organization_ID"] ||
          fullRec["intelligence__org_id"] ||
          fullRec["intelegence__org_id"] ||
          fullRec["Organization_ID"] ||
          fullRec["Organisation_ID"] ||
          fullRec["Org_ID"] ||
          fullRec["org_id"];
        if (recOrgId && String(recOrgId).trim().length > 0) {
          orgId = String(recOrgId).trim();
          addLog(
            "Resolved Organization ID from custom module record: " + orgId,
            "success",
          );
        }

        addLog(
          `Valid license confirmed from CRM '${mod}' (ID: ${licenseRecordId}): ${licenseKey} (accessToken: ${accessToken ? "Present" : "None"}, refreshToken: ${refreshToken ? "Present" : "None"}, orgId: ${orgId || "None"})`,
          "success",
        );

        purgeBrowserStorage();

        return true;
      }
    } catch (e) {
      if (
        e &&
        (e.code === "INVALID_MODULE" ||
          (e.message && e.message.includes("invalid")))
      ) {
        // Module does not exist in this CRM organization, quietly skip
      } else {
        addLog(`Module check for '${mod}' error: ${JSON.stringify(e)}`, "warn");
      }
    }
  }

  // If we reach here, NO valid license key was found in CRM custom module
  addLog(
    "No valid license key found in CRM. License registration required.",
    "warn",
  );
  licenseKey = "";
  accessToken = "";
  refreshToken = "";
  licenseRecordId = null;
  purgeBrowserStorage();

  return false;
}
