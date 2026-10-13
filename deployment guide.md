# Intelligence 360 — Zoho CRM Extension Deployment Guide

This guide covers the end-to-end deployment, configuration, and verification process for the **Intelligence 360 Lead Enrichment** extension for Zoho CRM.

---

## 1. Architecture Summary

The extension is structured as a **Single-Page Application (SPA)** embedded widget running within Zoho CRM via the Zoho Embedded App JavaScript SDK (`ZOHO.embeddedApp`).

- **Zero Browser Storage:** Sensitive credentials (`accessToken`, `refreshToken`, `orgId`, `licenseKey`, `jobId`) are **never** stored in browser `localStorage` or `sessionStorage`. All credentials are read and persisted directly within Zoho CRM records.
- **Licensing Module (`intelegence__name_of_lead`):** Stores company license and auth tokens in a dedicated record named `"lisense key"`.
- **Lead Module (`Leads`):** Stores the active enrichment Job ID in the custom field `intelegence__JobID`.
- **Dynamic Routing:**
  - If no license is detected $\rightarrow$ Opens **Company Registration**.
  - If license is active $\rightarrow$ Automatically routes to **Lead Enrichment** and polls the backend for intelligence reports.

---

## 2. Prerequisites

| Requirement             | Specification                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Zoho CRM Edition**    | **Professional, Enterprise, or Ultimate** (Standard edition does not support full marketplace extension widgets). |
| **User Role / Profile** | **Administrator** profile (or profile with _Developer Space_ and _Manage Extensibility_ permissions enabled).     |
| **Node.js Environment** | Node.js v18+ with `zet` (Zoho Extension Toolkit) for building packages.                                           |
| **Backend API**         | Accessible via **HTTPS** with a valid SSL/TLS certificate (Zoho CRM blocks insecure `http://` iframe requests).   |

---

## 3. Zoho CRM Schema Configuration

Before deploying the extension, ensure the following custom module and custom fields are created in your Zoho Developer Console (Sigma) extension workspace or active CRM organization.

### 3.1 Custom Module: `intelligence360__Intelligence_360`

This module acts as the secure CRM database for extension credentials.

| Field Label            | Exact API Name                        | Field Type                | Properties / Notes                                                                |
| ---------------------- | ------------------------------------- | ------------------------- | --------------------------------------------------------------------------------- |
| **Record Name**        | `Name`                                | Single Line               | **Named `"lisense key"` or `"license key"`**                                      |
| **Enrichment License** | `intelligence360__Enrichment_License` | Single Line               | Stores the active license key (`LIC-XXXX...`)                                     |
| **Organisation ID**    | `intelligence360__Organisation_ID`    | Single Line               | Stores canonical Zoho Organization ID                                             |
| **Access Token**       | `intelligence360__Access_Token`       | **Multi Line (TextArea)** | **Required:** JWT access token is ~288 chars (exceeds Single Line 255-char limit) |
| **Refresh Token**      | `intelligence360__Refresh_Token`      | Single Line               | 64-character refresh token for silent background renewal                          |

> **Security Note:** In the Layout Editor, mark these fields as **Read-Only** so standard users cannot tamper with tokens in the Zoho CRM user interface.

### 3.2 Lead Module Custom Field (`Leads`)

Only **one** custom field is required in the standard **Leads** module:

| Setting                   | Value to Configure                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Field Type**            | **Single Line Text**                                                                                        |
| **Field Label**           | `JobID` (or `Intelligence_JobID`)                                                                           |
| **Exact API Name**        | `intelligence360__Intelligence_JobID`                                                                       |
| **Length**                | `255`                                                                                                       |
| **Set as External Field** | ☑️ **Checked**                                                                                              |
| **External Field Type**   | **Organisation**                                                                                            |
| **Field Visibility**      | **Show**                                                                                                    |
| **UI Permission**         | In Layout Properties, mark as **Read-Only** _(locks manual edits in UI while allowing widget SDK to write)_ |

---

## 4. Production Configuration (`config.js`)

Before packing for production deployment, verify and update the backend endpoints in `companyRegistration/app/js/config.js`:

```javascript
// Production Endpoint Configuration
const BASE_URL = "https://api.yourdomain.com/api/v1"; // Replace with your production domain
const REGISTER_URL = BASE_URL + "/register";
const HANDSHAKE_URL = BASE_URL + "/auth/handshake";
const REQUESTS_URL = BASE_URL + "/requests";
const REFRESH_URL = BASE_URL + "/auth/refresh";
const VALIDATE_URL = BASE_URL + "/license/validate";

// CRM Field Mapping
const CRM_LICENSE_MODULE = "intelegence__name_of_lead";
const LICENSE_RECORD_NAME = "lisense key";

const FIELD_LICENSE_KEY = "intelegence__enrichment_lisense";
const FIELD_ACCESS_TOKEN = "intelegence__access_token";
const FIELD_REFRESH_TOKEN = "intelegence__refresh_token";
const FIELD_ORG_ID = "intelegence__Organisation_ID";

// Exact Lead Field Name
const FIELD_LEAD_JOB_ID = "intelegence__JobID";
```

> **Tip:** If cutting over from ngrok to production HTTPS, remove the header `"ngrok-skip-browser-warning": "69420"` from `auth.js`, `enrichment.js`, and `registration.js`.

---

## 5. Building the Extension Package

To compile and package the extension assets into a deployable ZIP:

1. Open PowerShell or Terminal and navigate to the project directory:

   ```powershell
   cd c:\shaukat-code-backup\zoho-widget-packaged\companyRegistration
   ```

2. Validate JavaScript syntax across all files:

   ```powershell
   node --check app/js/app.js app/js/auth.js app/js/config.js app/js/credits.js app/js/enrichment.js app/js/license.js app/js/logger.js app/js/registration.js
   ```

3. Run Zoho Extension Toolkit pack command:

   ```powershell
   npx zet pack
   ```

4. The compiled ZIP file will be generated at:
   ```
   companyRegistration/dist/companyRegistration.zip
   ```

---

## 6. Installing / Updating the Extension in Zoho CRM

### Option A: Via Zoho Developer Console (Sigma)

1. Log in to the [Zoho Developer Console](https://developer.zoho.com/).
2. Select your extension project (**Intelligence 360**).
3. Under **Components** $\rightarrow$ **Widgets**:
   - Upload the updated package `companyRegistration/dist/companyRegistration.zip`.
   - Index Path: `/app/widget.html`.
4. Under **Components** $\rightarrow$ **Buttons**:
   - Target Module: **Leads**.
   - Placement: **View Page** (Detail View).
   - Button Label: **Lead Enrichment**.
   - Action: **Open Widget**.
5. Click **Publish** $\rightarrow$ **Publish to Zoho Marketplace** (or create a private install URL).

### Option B: Direct Private Extension Upload in Zoho CRM

1. In Zoho CRM, click **Setup** (⚙️ gear icon, top-right).
2. Navigate to **Developer Space** $\rightarrow$ **Marketplace** $\rightarrow$ **Installed Extensions**.
3. Locate **Intelligence 360** and click **Configure** (or click **Upload Extension** for initial installation).
4. Upload `companyRegistration/dist/companyRegistration.zip`.
5. Select **Profiles** to grant access (recommend: _All Profiles_ or _Standard + Administrator_).
6. Click **Save** and accept the permissions.

---

## 7. Verification & Testing Runbook

Follow these steps to confirm end-to-end functionality in your Zoho CRM environment:

### Step 1: Initial Registration Check

1. Open any Lead record in Zoho CRM.
2. Click the **"Lead Enrichment"** button.
3. If no license exists in the CRM, the **Company Registration** form will load.
4. Fill in company details and click **Register Company**.
5. Verify:
   - Success message appears: _"Registration Complete! Credentials saved to Zoho CRM."_
   - Window closes automatically after 4 seconds (or click _Close Window_).
6. Verify in CRM: Open module **`intelegence__name_of_lead`**. A record named **`lisense key`** should exist with `intelegence__enrichment_lisense`, `intelegence__Organisation_ID`, and `intelegence__refresh_token` populated.

### Step 2: First Lead Enrichment

1. Open a Lead record (e.g. _Pratik Shinde_).
2. Click **"Lead Enrichment"**.
3. Verify:
   - Widget displays **"Enrichment in Progress"** notice card.
   - Job ID is displayed (e.g. `8672da55-9be1-48ed...`).
4. In Zoho CRM, refresh the Lead record:
   - Verify the **JobID** field (`intelegence__JobID`) is populated with the assigned Job ID.

### Step 3: Polling & Report Rendering

1. Inside the widget, click **"🔄 Refresh / Check Status"**.
2. Once the backend processing is complete:
   - Badge changes to green **Completed**.
   - Interactive Intelligence Report renders seamlessly inside the widget iframe.
   - Click **Copy Report** to verify report copying.

### Step 4: Re-open & Persistence Verification

1. Close the widget.
2. Click **"Lead Enrichment"** on the same Lead again.
3. Verify:
   - Widget recognizes the existing `intelegence__JobID` on the Lead.
   - Directly calls the status endpoint without creating duplicate jobs (`POST /requests` is skipped).
   - If user wants a fresh analysis, they can click **"⚡ Re-run Full Enrichment"** to initiate a new job.

---

## 8. Troubleshooting Reference

| Symptom                                           | Cause                                                    | Solution                                                                                                                                                         |
| ------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **"JobID" field not visible on Lead screen**      | Field exists in database but not added to active layout. | Go to Setup $\rightarrow$ Modules & Fields $\rightarrow$ Leads $\rightarrow$ Layouts $\rightarrow$ Standard. Drag `JobID` from _Unused Fields_ tray into layout. |
| **`MAX_LENGTH_EXCEEDED` on Access Token**         | Field created as Single Line (max 255 chars).            | In module `intelegence__name_of_lead`, delete field and recreate `intelegence__access_token` as **Multi-Line (TextArea)**.                                       |
| **Handshake fails with 404 `INVALID_LICENSE`**    | Backend license expired or unregistered.                 | Re-register via the Registration screen or verify license key validity on backend.                                                                               |
| **Widget stays blank or shows CORS error**        | Non-HTTPS endpoint or mixed content.                     | Ensure `BASE_URL` in `config.js` uses valid HTTPS with trusted SSL certificate.                                                                                  |
| **Backend error: `ANTHROPIC_API_KEY is not set`** | Missing environment variable on backend server.          | Add `ANTHROPIC_API_KEY=...` to the backend `.env` file and restart backend service.                                                                              |
