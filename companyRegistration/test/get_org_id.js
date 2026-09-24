/**
 * Node.js script to inspect Org ID and test Backend APIs
 * Run with: node test/get_org_id.js
 */

const https = require("https");

// The Org ID retrieved by the Zoho SDK from your active Zoho CRM session:
const ZOHO_ORG_ID = "4602803000000301993";
const LICENSE_KEY = "LIC-2N5E-J7SH-EZA7-JAJS";
const BASE_URL = "https://796d-49-248-125-98.ngrok-free.app/api/v1";

console.log("=========================================");
console.log("  ZOHO CRM ORGANIZATION INFORMATION");
console.log("=========================================");
console.log(`Zoho Org ID (from SDK): \x1b[32m${ZOHO_ORG_ID}\x1b[0m`);
console.log(`Current License Key:   \x1b[36m${LICENSE_KEY}\x1b[0m`);
console.log("=========================================\n");

// Optional: Test backend license validation endpoint with this Org ID
console.log("Testing backend handshake with this Org ID...");

const postData = JSON.stringify({ orgId: ZOHO_ORG_ID });
const url = new URL(`${BASE_URL}/auth/handshake`);

const req = https.request(
  url,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      licenseKey: LICENSE_KEY,
      "Content-Length": Buffer.byteLength(postData),
    },
    rejectUnauthorized: false,
  },
  (res) => {
    let body = "";
    res.on("data", (chunk) => (body += chunk));
    res.on("end", () => {
      console.log(`Response Status: HTTP ${res.statusCode}`);
      try {
        const parsed = JSON.parse(body);
        console.log("Response Body:", JSON.stringify(parsed, null, 2));
      } catch (e) {
        console.log("Raw Response:", body);
      }
    });
  },
);

req.on("error", (err) => {
  console.error("Connection Error:", err.message);
});

req.write(postData);
req.end();
