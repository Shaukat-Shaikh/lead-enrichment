"use strict";

// ---------------------------------------------------------------
// CONFIGURATION & CONSTANTS
// ---------------------------------------------------------------
const BASE_URL = "https://796d-49-248-125-98.ngrok-free.app/api/v1";
const REGISTER_URL = BASE_URL + "/register";
const HANDSHAKE_URL = BASE_URL + "/auth/handshake";
const REQUESTS_URL = BASE_URL + "/requests";
const REFRESH_URL = BASE_URL + "/auth/refresh";
const VALIDATE_URL = BASE_URL + "/license/validate";

const CRM_LICENSE_MODULE = "intelegence__name_of_lead";
const FIELD_LICENSE_KEY = "intelegence__enrichment_lisense";
const FIELD_ACCESS_TOKEN = "intelegence__access_token";
const FIELD_REFRESH_TOKEN = "intelegence__refresh_token";
const FIELD_LEAD_REPORT_HTML = "intelegence__enrichment_html";
const FIELD_LEAD_JOB_ID = "intelegence__job_id";
const FIELD_ORG_ID = "intelegence__Organisation_ID";

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 40;

// ---------------------------------------------------------------
// SHARED APPLICATION STATE
// ---------------------------------------------------------------
let zohoPageData = null;
let currentLead = null;
let currentLeadId = null;
let orgId = "";
let licenseKey = "";
let accessToken = "";
let refreshToken = "";
let rawReportHtml = "";
let activeJobId = "";
let currentRawData = null;
let resolvedLicenseModule = CRM_LICENSE_MODULE;

// ---------------------------------------------------------------
// UTILITIES
// ---------------------------------------------------------------
function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = String(text);
  return div.innerHTML;
}
