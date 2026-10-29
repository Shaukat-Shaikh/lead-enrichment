"use strict";

// ---------------------------------------------------------------
// CONFIGURATION & CONSTANTS
// ---------------------------------------------------------------
const BASE_URL = "https://intelligence360.intelegain.com/api/v1";
const REGISTER_URL = BASE_URL + "/register";
const HANDSHAKE_URL = BASE_URL + "/auth/handshake";
const REQUESTS_URL = BASE_URL + "/requests";
const REFRESH_URL = BASE_URL + "/auth/refresh";
const VALIDATE_URL = BASE_URL + "/license/validate";

// Exact CRM Module & Field API Names as defined in Zoho CRM Developer Console
const CRM_LICENSE_MODULE = "intelligence360zoho__Intelligence_360";
const CRM_LICENSE_MODULE_FALLBACK = "intelligence__name_of_lead";
const LICENSE_RECORD_NAME = "lisense key";

const FIELD_LICENSE_KEY = "intelligence360zoho__Enrichment_License";
const FIELD_LICENSE_KEY_FALLBACK = "intelligence__enrichment_license";
const FIELD_ACCESS_TOKEN = "intelligence360zoho__Access_Token";
const FIELD_REFRESH_TOKEN = "intelligence360zoho__Refresh_Token";
const FIELD_ORG_ID = "intelligence360zoho__Organisation_ID";

// Exact Lead Module field for Job ID
const FIELD_LEAD_JOB_ID = "intelligence360zoho__Intelligence_JobID";

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 40;

// ---------------------------------------------------------------
// SHARED APPLICATION STATE (IN-MEMORY ONLY)
// ---------------------------------------------------------------
let zohoPageData = null;
let currentLead = null;
let currentLeadId = null;
let currentEntity = "Leads"; // "Leads" or "Deals"
let currentDeal = null;
let orgId = "";
let licenseKey = "";
let accessToken = "";
let refreshToken = "";
let rawReportHtml = "";
let activeJobId = "";
let currentRawData = null;
let resolvedLicenseModule = CRM_LICENSE_MODULE;
let licenseRecordId = null;

// ---------------------------------------------------------------
// SECURITY: PURGE BROWSER STORAGE (NO CREDENTIALS IN LOCALSTORAGE)
// ---------------------------------------------------------------
function purgeBrowserStorage() {
  try {
    localStorage.removeItem("i360_license_key");
    localStorage.removeItem("i360_org_id");
    localStorage.removeItem("i360_access_token");
    localStorage.removeItem("i360_refresh_token");
    sessionStorage.removeItem("zoho_page_data");
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (
        k &&
        (k.startsWith("i360_") ||
          k.includes("token") ||
          k.includes("license") ||
          k.includes("job"))
      ) {
        localStorage.removeItem(k);
      }
    }
  } catch (e) {}
}

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = String(text);
  return div.innerHTML;
}
