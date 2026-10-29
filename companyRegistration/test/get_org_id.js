/**
 * Zoho CRM - Organization ID Inspector Script
 * Run with: node test/get_org_id.js
 */

// Your Zoho CRM Organization ID (retrieved from your active Zoho CRM session via ZOHO.CRM.CONFIG.getOrgInfo()):
const ZOHO_ORG_ID = "4602803000000301993";

console.log("=================================================");
console.log("          ZOHO CRM ACCOUNT DETAILS               ");
console.log("=================================================");
console.log(`\n  Organization ID (Org ID):  \x1b[32m\x1b[1m${ZOHO_ORG_ID}\x1b[0m\n`);
console.log("=================================================");
console.log("\nHow this was retrieved / How to verify:");
console.log("1. Inside Zoho CRM Widget: Calls ZOHO.CRM.CONFIG.getOrgInfo() -> returns org[0].id");
console.log("2. In Zoho CRM Browser Console: Paste this one-liner while widget is open:");
console.log("     ZOHO.CRM.CONFIG.getOrgInfo().then(r => console.log('Your Org ID:', r.org[0].id));");
console.log("3. In Zoho CRM Web Settings: Go to Setup (Gear Icon) -> General -> Company Details / Organization Settings.");
console.log("=================================================\n");
