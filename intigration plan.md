# Intelligence 360 — Zoho CRM Integration Plan

**Base URL:** `https://intelligence360.intelegain.com/api/v1`

---

## Architecture Overview (Unified SPA)

All files share the same unified Single-Page Application (SPA) structure to eliminate iframe redirect issues in Zoho CRM. Navigation buttons between views have been removed in favor of contextual, automated view routing.

```
User clicks "Lead Enrichment" button on a Lead record
                                │
                                ▼
                       Bootstrap & License Check
         Searches module: intelegence__name_of_lead
               specifically for record with Name: "lisense key"
                                │
                 ┌──────────────┴──────────────┐
                 │                             │
          NO license key                HAS license key
                 │                             │
                 ▼                             ▼
         registrationView               Context Check
         (Company Setup)                       │
                                ┌──────────────┴──────────────┐
                                │                             │
                           Lead Context               No Lead Context
                         (on Lead Record)           (Settings / Direct Open)
                                │                             │
                                ▼                             ▼
                         enrichmentView                registrationView
                     (Auto-Poll & Report)         (Status: License Active)
```

---

## Security & Storage Architecture

> **CRITICAL SECURITY REQUIREMENT:**  
> **ZERO storage in browser (`localStorage` / `sessionStorage`) for any sensitive credentials** (`accessToken`, `refreshToken`, `orgId`, `licenseKey`, `jobId`).  
> All tokens and credentials are read from and persisted strictly into Zoho CRM custom module and record fields.

---

## Step 1 — Company Registration (First-Time Setup)

> **When:** User opens the widget and no record with Name `"lisense key"` exists in `intelegence__name_of_lead`.  
> **View:** `registrationView`

### 1.1 Form Fields (Company Info Only)

1. **Company Name** (`companyName`) — _Required_
2. **About Company** (`aboutCompany`) — _Required_
3. **Industry** (`industry`) — _Required_
4. **Products / Service Lines** (`productsServiceLines`) — _Required (Array of strings)_
5. **Ideal Customer Profile** (`idealCustomerProfile`) — _Required_
6. **Unique Value Proposition** (`uniqueValueProposition`) — _Required_
7. **Language** (`language`) — _Default: English_

### 1.2 Register Company API Call

```http
POST /api/v1/register
Content-Type: application/json
ngrok-skip-browser-warning: 69420
```

**Request Body:**

```json
{
  "orgId": "{{orgId}}",
  "companyName": "Acme Cloud Services",
  "contactName": "Acme Cloud Services Admin",
  "email": "admin@acmecloudservices.com",
  "phone": "",
  "aboutCompany": "Acme helps mid-market firms migrate to Microsoft Azure.",
  "industry": "Cloud Services",
  "productsServiceLines": ["Azure Migration", "Managed Services", "Power BI"],
  "idealCustomerProfile": "Mid-market manufacturing firms",
  "uniqueValueProposition": "Fast, fixed-price Azure migrations",
  "language": "English"
}
```

**Response:**

```json
{
  "success": true,
  "licenseKey": "LIC-XXXX-XXXX-XXXX-XXXX",
  "message": "Company registered successfully"
}
```

---

### 1.3 Handshake (Get Tokens)

Immediately following registration:

```http
POST /api/v1/auth/handshake
Content-Type: application/json
licenseKey: {{licenseKey}}
ngrok-skip-browser-warning: 69420
```

**Request Body:**

```json
{
  "orgId": "{{orgId}}"
}
```

**Response:**

```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "dGhpcyBp..."
}
```

---

### 1.4 Save Credentials to CRM Custom Module (`intelegence__name_of_lead`)

Save record with:

- **Record Name (`Name`):** `"lisense key"`
- **License Key (`intelegence__enrichment_lisense`):** `licenseKey`
- **Organization ID (`intelegence__Organisation_ID`):** `orgId`
- **Access Token (`intelegence__access_token`):** `accessToken`
- **Refresh Token (`intelegence__refresh_token`):** `refreshToken`

If an existing record with Name `"lisense key"` exists, it updates that record; otherwise, it inserts a new record.

**Post-Registration Flow:**

- Displays brief success confirmation:
  > **Registration Complete!**  
  > _Company registered and license activated successfully. Closing window..._
- Automatically closes the entire widget popup / page via `ZOHO.CRM.UI.Popup.close()` and `window.close()`.
- **Never transitions into the Lead Enrichment page after registration.** To enrich a lead, the user opens that Lead in Zoho CRM and clicks the **Lead Enrichment** button.

---

## Step 2 — Token Pre-Check Lifecycle (Before Handshake)

Before making any handshake or authorized request:

1. **Check `intelegence__name_of_lead` record in CRM:**
   - If `intelegence__access_token` is present and valid (`!isTokenExpired(accessToken)`):
     - **Skip handshake completely!** Reuse the token directly.
2. **If access token is expired or absent:**
   - Check if `intelegence__refresh_token` is present:
     - Call `POST /api/v1/auth/refresh` with `orgId` and `refreshToken`.
     - When successful: immediately update `intelegence__access_token` and `intelegence__refresh_token` in the CRM record.
3. **If refresh fails or no refresh token:**
   - Call `POST /api/v1/auth/handshake` using `intelegence__Organisation_ID` and `licenseKey`.
   - When successful: immediately update `intelegence__access_token`, `intelegence__refresh_token`, and `intelegence__Organisation_ID` in the CRM record.

---

## Step 3 — Lead Enrichment Flow

> **When:** User opens the widget from a Lead record and a license key is active in CRM.  
> **View:** `enrichmentView`

### 3.1 Check Existing Job ID on Lead (`intelegence__JobID`)

Each time the user opens the widget on a Lead:

- **Check if `intelegence__JobID` is present on the Lead record:**
  - **IF PRESENT:**
    - **Skip `POST /api/v1/requests` completely!**
    - Show queued notice card with the existing Job ID.
    - Directly call the polling API:
      ```http
      GET /api/v1/requests/{{intelegence__JobID}}?orgId={{orgId}}
      Authorization: Bearer {{accessToken}}
      licenseKey: {{licenseKey}}
      ngrok-skip-browser-warning: 69420
      ```
    - If status is `Completed` or response is HTML: render full report in the iframe directly.
    - If status is `Processing` / `Queued`: show status notice: _"Data is still being prepared. The report will be shown in 8 to 10 minutes here."_ with **`[🔄 Refresh / Check Status]`** button.
  - **IF NOT PRESENT:**
    - Submit `POST /api/v1/requests` to backend.
    - Extract `jobId` from server response.
    - **Immediately save `jobId` into `intelegence__JobID` on this Lead record in Zoho CRM.**
    - Show queued notice card informing user of the 8–10 minute preparation window.

---

## CRM Custom Modules and Fields Configuration

### 1. License Module: `intelegence__name_of_lead`

| Field Label     | API Name                          | Type                   | Value / Description                                          |
| --------------- | --------------------------------- | ---------------------- | ------------------------------------------------------------ |
| **Record Name** | `Name`                            | Single Line            | **Always set to `"lisense key"`**                            |
| License Key     | `intelegence__enrichment_lisense` | Single Line            | Active license key from registration                         |
| Organization ID | `intelegence__Organisation_ID`    | Single Line            | Zoho Organization ID (`orgId`)                               |
| Access Token    | `intelegence__access_token`       | Multi Line (Text Area) | JWT access token (~288 chars, requires Multi Line)           |
| Refresh Token   | `intelegence__refresh_token`      | Single Line            | Refresh token (64 chars, stored on registration & handshake) |

### 2. Standard Module: `Leads`

| Field Label | API Name             | Type        | Description                                                                                   |
| ----------- | -------------------- | ----------- | --------------------------------------------------------------------------------------------- |
| **Job ID**  | `intelegence__JobID` | Single Line | Active enrichment Job ID (**exact API name: `intelegence__JobID` with capital `J` and `ID`**) |

---

## Packaging Command

To generate the uploadable ZIP package for Zoho CRM:

```powershell
cd companyRegistration
npx zet pack
```

Outputs to `companyRegistration/dist/companyRegistration.zip`.

---

## Technical Specifications & Architecture Reference

### 1. Emplacement & Hosting

- **Full-Page Display:** Both **Web Tab** and **Extension Settings Page** render as full-page iframes inside Zoho CRM. Custom Buttons render as modal dialogs, drawers, or new tabs.
- **Static URLs:** Zoho CRM iframe URLs are static. `orgId` cannot be injected into the URL; dynamic resolution must use the client SDK (`ZOHO.CRM.CONFIG.getOrgInfo()`).

### 2. SDK Identity APIs

- **SDK Script Endpoint:** `https://live.zwidgets.com/js-sdk/1.2/ZohoEmbededAppSDK.min.js`
- **Organization Identity:** `ZOHO.CRM.CONFIG.getOrgInfo()` $\rightarrow$ `response.org[0].id`
- **User Identity:** `ZOHO.CRM.CONFIG.getCurrentUser()` $\rightarrow$ `response.users[0].email`, `id`, `role.name`

### 3. Canonical Organization ID

- `response.org[0].id` matches the canonical 18–19 digit numeric Zoho Organization ID across all Zoho CRM REST APIs, OAuth tokens, data centers (`.com`, `.eu`, `.in`, etc.), and sandbox environments.

### 4. Prerequisites & Editions

- **Editions:** Professional, Enterprise, or Ultimate (Standard edition has restricted marketplace widget support).
- **User Permissions:** Administrator profile (or profile with Developer Space / Manage Extensibility enabled) for configuration; standard Lead Read/Write for enrichment.

### 5. Cryptographic Proof

- Standard client SDK widgets use browser `postMessage` origin validation. For cryptographically signed server proof, Zoho OAuth 2.0 Authorization Code Grant or Deluge HMAC-SHA256 webhooks can be utilized.
