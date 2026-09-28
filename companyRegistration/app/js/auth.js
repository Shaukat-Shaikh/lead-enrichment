"use strict";

// ---------------------------------------------------------------
// AUTHENTICATION & TOKEN HELPERS
// ---------------------------------------------------------------
function isTokenExpired(token) {
  if (!token || typeof token !== "string" || token.trim().length === 0) {
    return true;
  }
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      // If not a standard 3-part JWT, do not treat as expired immediately
      return false;
    }
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map(function (c) {
          return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join(""),
    );
    const payload = JSON.parse(jsonPayload);
    if (!payload || !payload.exp) {
      return false;
    }
    // 60 seconds buffer
    return payload.exp * 1000 < Date.now() + 60000;
  } catch (e) {
    return true;
  }
}

// Persist tokens and orgId directly to the CRM license record
async function saveTokensToCrm(newAccessToken, newRefreshToken, currentOrgId) {
  if (!licenseRecordId) {
    addLog("saveTokensToCrm: No licenseRecordId available to update.", "warn");
    return false;
  }
  const targetModule = resolvedLicenseModule || CRM_LICENSE_MODULE;

  addLog(
    `Persisting credentials to CRM record (${licenseRecordId}) in '${targetModule}'...`,
    "info",
  );

  // 0. Save License Key FIRST (this is the critical field that gates enrichment)
  if (licenseKey && String(licenseKey).trim().startsWith("LIC-")) {
    const licFieldCandidates = [
      FIELD_LICENSE_KEY,
      "intelligence360__Enrichment_License",
    ];
    let licSaved = false;
    for (const f of licFieldCandidates) {
      try {
        addLog(
          `Attempting to save license key '${licenseKey}' to field '${f}'...`,
          "info",
        );
        const res = await ZOHO.CRM.API.updateRecord({
          Entity: targetModule,
          APIData: { id: licenseRecordId, [f]: String(licenseKey).trim() },
          RecordID: licenseRecordId,
        });
        addLog(
          `License key save response for field '${f}': ${JSON.stringify(res)}`,
          "info",
        );
        if (
          res &&
          res.data &&
          res.data[0] &&
          (res.data[0].code === "SUCCESS" || res.data[0].status === "success")
        ) {
          addLog(
            `Saved License Key into CRM field '${f}' successfully.`,
            "success",
          );
          licSaved = true;

          // Verify the write by reading back
          try {
            const verifyRes = await ZOHO.CRM.API.getRecord({
              Entity: targetModule,
              RecordID: licenseRecordId,
            });
            const verRec = verifyRes && verifyRes.data && verifyRes.data[0];
            if (verRec) {
              const storedVal = verRec[f] || "";
              if (
                storedVal &&
                String(storedVal).trim() === String(licenseKey).trim()
              ) {
                addLog(
                  `VERIFIED: License key '${storedVal}' confirmed in CRM field '${f}'.`,
                  "success",
                );
              } else {
                addLog(
                  `WARNING: CRM returned SUCCESS but field '${f}' value is '${storedVal}' (expected '${licenseKey}'). Possible unique constraint blocking write.`,
                  "error",
                );
                licSaved = false;
              }
            }
          } catch (verErr) {
            addLog(
              `Verification read-back failed: ${verErr.message || JSON.stringify(verErr)}`,
              "warn",
            );
          }
          break;
        } else if (res && res.data && res.data[0]) {
          addLog(
            `License Key field '${f}' rejected by CRM: ${res.data[0].code} - ${res.data[0].message || ""}`,
            "error",
          );
        }
      } catch (e) {
        addLog(
          `License Key field '${f}' update exception: ${e.message || JSON.stringify(e)}`,
          "error",
        );
      }
    }
    if (!licSaved) {
      addLog(
        "CRITICAL: License key could NOT be saved to CRM. Check 'Do not allow duplicate values' setting on Enrichment_License field in Zoho CRM Setup.",
        "error",
      );
    }
  }

  // 1. Save Org ID independently
  if (currentOrgId) {
    const orgFieldCandidates = [
      FIELD_ORG_ID,
      "intelligence360__Organisation_ID",
      "intelligence360__Organization_ID",
      "intelligence__Organisation_ID",
      "intelegence__Organisation_ID",
    ];
    let orgSaved = false;
    for (const f of orgFieldCandidates) {
      try {
        const res = await ZOHO.CRM.API.updateRecord({
          Entity: targetModule,
          APIData: { id: licenseRecordId, [f]: String(currentOrgId) },
          RecordID: licenseRecordId,
        });
        if (
          res &&
          res.data &&
          res.data[0] &&
          (res.data[0].code === "SUCCESS" || res.data[0].status === "success")
        ) {
          addLog(
            `Saved Org ID (${currentOrgId}) into CRM field '${f}' successfully.`,
            "success",
          );
          orgSaved = true;
          break;
        } else if (res && res.data && res.data[0]) {
          addLog(
            `Org ID field '${f}' rejected by CRM: ${res.data[0].code} - ${res.data[0].message || ""}`,
            "info",
          );
        }
      } catch (e) {
        addLog(
          `Org ID field '${f}' update exception: ${e.message || JSON.stringify(e)}`,
          "warn",
        );
      }
    }
  }

  // 2. Save Refresh Token independently (64 chars, fits in all text field types)
  if (newRefreshToken) {
    const refreshCandidates = [
      FIELD_REFRESH_TOKEN,
      "intelligence360__Refresh_Token",
      "intelligence__refresh_token",
      "intelegence__refresh_token",
    ];
    let refreshSaved = false;
    for (const f of refreshCandidates) {
      try {
        const res = await ZOHO.CRM.API.updateRecord({
          Entity: targetModule,
          APIData: { id: licenseRecordId, [f]: newRefreshToken },
          RecordID: licenseRecordId,
        });
        if (
          res &&
          res.data &&
          res.data[0] &&
          (res.data[0].code === "SUCCESS" || res.data[0].status === "success")
        ) {
          addLog(
            `Saved Refresh Token into CRM field '${f}' successfully.`,
            "success",
          );
          refreshSaved = true;
          break;
        } else if (res && res.data && res.data[0]) {
          addLog(
            `Refresh Token field '${f}' rejected by CRM: ${res.data[0].code} - ${res.data[0].message || ""}`,
            "info",
          );
        }
      } catch (e) {
        addLog(
          `Refresh Token field '${f}' update exception: ${e.message || JSON.stringify(e)}`,
          "warn",
        );
      }
    }
  }

  // 3. Save Access Token independently (288 chars JWT, requires Multi-Line field)
  if (newAccessToken) {
    const accessCandidates = [
      FIELD_ACCESS_TOKEN,
      "intelligence360__Access_Token",
      "intelligence__access_token",
      "intelegence__access_token",
    ];
    let accessSaved = false;
    for (const f of accessCandidates) {
      try {
        const res = await ZOHO.CRM.API.updateRecord({
          Entity: targetModule,
          APIData: { id: licenseRecordId, [f]: newAccessToken },
          RecordID: licenseRecordId,
        });
        if (
          res &&
          res.data &&
          res.data[0] &&
          (res.data[0].code === "SUCCESS" || res.data[0].status === "success")
        ) {
          addLog(
            `Saved Access Token into CRM field '${f}' successfully.`,
            "success",
          );
          accessSaved = true;
          break;
        } else if (res && res.data && res.data[0]) {
          const item = res.data[0];
          addLog(
            `Access Token field '${f}' rejected by CRM: ${item.code} - ${item.message || ""}`,
            "warn",
          );
          if (item.code === "MAX_LENGTH_EXCEEDED") {
            addLog(
              `⚠️ CRITICAL NOTICE: Field '${f}' in Zoho CRM has a maximum length of ${item.details && item.details.maximum_length ? item.details.maximum_length : 255}, but JWT access token is ${newAccessToken.length} chars. Please change field '${f}' in Zoho CRM Setup from 'Single Line' to 'Multi-Line' (TextArea) to store full tokens!`,
              "error",
            );
          }
        }
      } catch (e) {
        addLog(
          `Access Token field '${f}' update exception: ${e.message || JSON.stringify(e)}`,
          "warn",
        );
      }
    }
  }

  return true;
}

// Always check CRM tokens before making handshake
async function ensureValidTokens() {
  if (!licenseKey) {
    throw new Error(
      "No license key available. Please complete registration first.",
    );
  }

  // 1. Check if access token is present and valid (not expired)
  if (accessToken && !isTokenExpired(accessToken)) {
    addLog(
      "Valid access token found in CRM record. Skipping handshake.",
      "info",
    );
    return accessToken;
  }

  // 2. If access token is missing or expired, check if refresh token is present
  if (refreshToken) {
    addLog(
      "Access token expired/missing, but refresh token found in CRM. Attempting token refresh...",
      "info",
    );
    try {
      await doTokenRefresh();
      if (accessToken && !isTokenExpired(accessToken)) {
        return accessToken;
      }
    } catch (refreshErr) {
      addLog(
        "Token refresh failed (" +
          (refreshErr.message || refreshErr) +
          "). Falling back to handshake...",
        "warn",
      );
    }
  }

  // 3. Fallback: Perform full handshake
  addLog(
    "Tokens absent or expired. Performing /auth/handshake with server...",
    "api",
  );
  await doHandshake();
  return accessToken;
}

async function doHandshake() {
  if (!licenseKey) {
    throw new Error("Cannot handshake: No license key found in CRM.");
  }

  if (!orgId) {
    try {
      const orgInfo = await ZOHO.CRM.CONFIG.getOrgInfo();
      orgId =
        (orgInfo && orgInfo.org && orgInfo.org[0] && orgInfo.org[0].id) || "";
    } catch (e) {}
  }
  if (!orgId) orgId = "ZOHO-ORG";

  addLog(`POST ${HANDSHAKE_URL} with orgId: ${orgId}`, "api");
  const res = await fetch(HANDSHAKE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      licenseKey: licenseKey,
      "ngrok-skip-browser-warning": "69420",
    },
    body: JSON.stringify({ orgId: String(orgId) }),
  });

  if (!res.ok) {
    const errTxt = await res.text().catch(() => "");
    addLog("Handshake failed: " + errTxt, "error");
    throw new Error("Handshake failed: " + errTxt);
  }

  const data = await res.json();
  accessToken = data.accessToken;
  if (data.refreshToken) {
    refreshToken = data.refreshToken;
  }
  addLog("Handshake successful. Received new access token.", "success");

  // Save directly to CRM module (never in browser storage)
  await saveTokensToCrm(accessToken, refreshToken, orgId);
}

async function doTokenRefresh() {
  if (!refreshToken) {
    return doHandshake();
  }

  if (!orgId) {
    try {
      const orgInfo = await ZOHO.CRM.CONFIG.getOrgInfo();
      orgId =
        (orgInfo && orgInfo.org && orgInfo.org[0] && orgInfo.org[0].id) || "";
    } catch (e) {}
  }
  if (!orgId) orgId = "ZOHO-ORG";

  addLog(`POST ${REFRESH_URL}`, "api");
  const res = await fetch(REFRESH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      licenseKey: licenseKey,
      "ngrok-skip-browser-warning": "69420",
    },
    body: JSON.stringify({
      orgId: String(orgId),
      refreshToken: refreshToken,
    }),
  });

  if (!res.ok) {
    addLog(
      "Token refresh request failed, falling back to handshake...",
      "warn",
    );
    return doHandshake();
  }

  const data = await res.json();
  accessToken = data.accessToken;
  if (data.refreshToken) {
    refreshToken = data.refreshToken;
  }
  addLog("Token refresh successful.", "success");

  // Save directly to CRM module (never in browser storage)
  await saveTokensToCrm(accessToken, refreshToken, orgId);
}

async function makeAuthorizedPost(url, body) {
  await ensureValidTokens();

  let res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + accessToken,
      licenseKey: licenseKey,
      "ngrok-skip-browser-warning": "69420",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    addLog("POST returned 401 Unauthorized. Retrying handshake...", "warn");
    await doHandshake();
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + accessToken,
        licenseKey: licenseKey,
        "ngrok-skip-browser-warning": "69420",
      },
      body: JSON.stringify(body),
    });
  }

  return res;
}

async function makeAuthorizedGet(url) {
  await ensureValidTokens();

  let res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: "Bearer " + accessToken,
      licenseKey: licenseKey,
      "ngrok-skip-browser-warning": "69420",
    },
  });

  if (res.status === 401) {
    addLog("GET returned 401 Unauthorized. Retrying handshake...", "warn");
    await doHandshake();
    res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + accessToken,
        licenseKey: licenseKey,
        "ngrok-skip-browser-warning": "69420",
      },
    });
  }

  return res;
}
