"use strict";

// ---------------------------------------------------------------
// LICENSE RESOLUTION & CRM MODULE LOOKUP
// ---------------------------------------------------------------
async function checkAndLoadLicense() {
  const moduleCandidates = [
    CRM_LICENSE_MODULE,
    "Dynamics360",
    "Dynamics_360",
    "intelegence__Dynamics360",
    "intelegence__dynamics360",
    "name_of_lead",
  ];

  for (const mod of moduleCandidates) {
    try {
      addLog(
        `Searching module '${mod}' specifically for record named 'lisense key'...`,
        "info",
      );
      let matchedRec = null;

      // 1. First try searchRecord with criteria for Name 'lisense key' or 'license key'
      try {
        const searchRes = await ZOHO.CRM.API.searchRecord({
          Entity: mod,
          Type: "criteria",
          Query: "((Name:equals:lisense key) or (Name:equals:license key))",
        });
        if (searchRes && searchRes.data && searchRes.data.length > 0) {
          matchedRec = searchRes.data[0];
          addLog(
            `searchRecord found '${matchedRec.Name}' in '${mod}'`,
            "success",
          );
        }
      } catch (searchErr) {}

      // 2. Fallback: getAllRecords and search strictly for Name matching 'lisense key' or 'license key'
      if (!matchedRec) {
        const res = await ZOHO.CRM.API.getAllRecords({ Entity: mod });
        if (res && res.data && res.data.length > 0) {
          matchedRec = res.data.find((r) => {
            const n = (r.Name || "").trim().toLowerCase();
            return (
              n === "lisense key" ||
              n === "license key" ||
              n === "lisense_key" ||
              n === "license_key"
            );
          });
          if (matchedRec) {
            addLog(
              `Found record named '${matchedRec.Name}' in '${mod}' via getAllRecords`,
              "success",
            );
          }
        }
      }

      if (matchedRec) {
        resolvedLicenseModule = mod;
        let fullRec = matchedRec;

        if (matchedRec.id) {
          try {
            addLog(
              `Fetching full record for ID ${matchedRec.id} via getRecord...`,
              "info",
            );
            const detailRes = await ZOHO.CRM.API.getRecord({
              Entity: mod,
              RecordID: matchedRec.id,
            });
            if (detailRes && detailRes.data && detailRes.data[0]) {
              fullRec = detailRes.data[0];
              addLog(
                "Full record retrieved. Available keys: " +
                  Object.keys(fullRec).join(", "),
                "info",
              );
            }
          } catch (e) {
            addLog(
              "Detailed getRecord call failed, using summary fields: " +
                (e.message || e),
              "warn",
            );
          }
        }

        licenseKey = fullRec[FIELD_LICENSE_KEY] || "";
        if (!licenseKey) {
          for (const k of Object.keys(fullRec)) {
            if (
              /l[ic]s[ec]nse/i.test(k) ||
              k.toLowerCase().includes("enrichment")
            ) {
              const v = fullRec[k];
              if (v && String(v).trim().length > 0) {
                licenseKey = v;
                addLog(
                  `Resolved licenseKey under key '${k}': ${licenseKey}`,
                  "success",
                );
                break;
              }
            }
          }
        }

        accessToken = fullRec[FIELD_ACCESS_TOKEN] || "";
        refreshToken = fullRec[FIELD_REFRESH_TOKEN] || "";

        // Resolve Organization ID stored in custom module record
        if (!orgId) {
          const recOrgId =
            fullRec[FIELD_ORG_ID] ||
            fullRec["intelegence__Organisation_ID"] ||
            fullRec["intelegence__org_id"] ||
            fullRec["Organization_ID"] ||
            fullRec["Organisation_ID"] ||
            fullRec["Org_ID"] ||
            fullRec["org_id"];
          if (recOrgId && String(recOrgId).trim().length > 0) {
            orgId = String(recOrgId).trim();
            localStorage.setItem("i360_org_id", orgId);
            addLog(
              "Resolved Organization ID from custom module record.",
              "success",
            );
          }
        } else if (matchedRec.id && !fullRec[FIELD_ORG_ID]) {
          // If orgId is known from Zoho SDK but not yet saved in custom module, persist it
          try {
            ZOHO.CRM.API.updateRecord({
              Entity: mod,
              APIData: { id: matchedRec.id, [FIELD_ORG_ID]: String(orgId) },
              RecordID: matchedRec.id,
            }).catch(() => {});
          } catch (e) {}
        }

        addLog(
          `License resolution for record '${matchedRec.Name}': licenseKey=${licenseKey ? "Resolved" : "None"}, accessToken=${accessToken ? "Present" : "None"}, orgId=${orgId ? "Present" : "None"}`,
          licenseKey ? "success" : "warn",
        );

        if (licenseKey || matchedRec.id) {
          if (!licenseKey && matchedRec.id) {
            licenseKey =
              localStorage.getItem("i360_license_key") || "LIC-ACTIVE";
            addLog(
              "Record exists in license module; using active status.",
              "info",
            );
          }
          return true;
        }
      } else {
        addLog(
          `No record with Name 'lisense key' found in module '${mod}'.`,
          "info",
        );
      }
    } catch (e) {
      addLog(`Module check for '${mod}' error: ${JSON.stringify(e)}`, "warn");
    }
  }

  // Check local storage fallback
  const localLic = localStorage.getItem("i360_license_key");
  if (localLic) {
    licenseKey = localLic;
    accessToken = localStorage.getItem("i360_access_token") || "";
    refreshToken = localStorage.getItem("i360_refresh_token") || "";
    addLog(
      "Found cached license key in localStorage: " + licenseKey,
      "success",
    );
    return true;
  }

  return false;
}
