"use strict";

// ---------------------------------------------------------------
// AUTHENTICATION & TOKEN HELPERS
// ---------------------------------------------------------------
function isTokenExpired(token) {
  if (!token || typeof token !== "string") return true;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return true;
    const payload = JSON.parse(atob(parts[1]));
    if (!payload || !payload.exp) return true;
    return payload.exp * 1000 < Date.now() + 60000;
  } catch (e) {
    return true;
  }
}

async function doHandshake() {
  addLog(`POST ${HANDSHAKE_URL} with orgId: ${orgId}`, "api");
  const res = await fetch(HANDSHAKE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      licenseKey: licenseKey,
      "ngrok-skip-browser-warning": "69420",
    },
    body: JSON.stringify({ orgId: String(orgId || "ZOHO-ORG") }),
  });
  if (!res.ok) {
    const errTxt = await res.text().catch(() => "");
    addLog("Handshake failed: " + errTxt, "error");
    throw new Error("Handshake failed: " + errTxt);
  }
  const data = await res.json();
  accessToken = data.accessToken;
  refreshToken = data.refreshToken || refreshToken;
  localStorage.setItem("i360_access_token", accessToken);
  if (refreshToken) localStorage.setItem("i360_refresh_token", refreshToken);
  addLog("Handshake successful. Received new access token.", "success");
}

async function doTokenRefresh() {
  if (!refreshToken) return doHandshake();
  addLog(`POST ${REFRESH_URL}`, "api");
  const res = await fetch(REFRESH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      licenseKey: licenseKey,
      "ngrok-skip-browser-warning": "69420",
    },
    body: JSON.stringify({
      orgId: String(orgId || "ZOHO-ORG"),
      refreshToken: refreshToken,
    }),
  });
  if (!res.ok) {
    addLog("Refresh failed, attempting handshake...", "warn");
    return doHandshake();
  }
  const data = await res.json();
  accessToken = data.accessToken;
  localStorage.setItem("i360_access_token", accessToken);
  addLog("Token refresh successful.", "success");
}

async function makeAuthorizedPost(url, body) {
  return fetch(url, {
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
