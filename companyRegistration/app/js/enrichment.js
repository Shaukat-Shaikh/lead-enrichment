"use strict";

// ---------------------------------------------------------------
// LEAD CONTEXT & IDENTIFICATION
// ---------------------------------------------------------------
function resolveLeadContext() {
  currentLeadId = null;
  currentEntity = "Leads";
  const params = new URLSearchParams(window.location.search);
  const urlEntity = params.get("entity") || "";

  // Detect entity type from URL params or PageLoad event
  const pageEntity =
    (zohoPageData && zohoPageData.Entity) || "";
  const detectedEntity = urlEntity || pageEntity;

  if (detectedEntity) {
    addLog(`Detected CRM entity: '${detectedEntity}'`, "info");
  }

  // Support Leads and Deals
  const entityLower = detectedEntity.toLowerCase();
  if (entityLower === "deals") {
    currentEntity = "Deals";
    addLog("Entity is 'Deals'. Will resolve Deal context.", "info");
  } else if (entityLower === "leads" || entityLower === "") {
    currentEntity = "Leads";
  } else {
    // Not Leads or Deals — skip
    addLog(
      `Context entity is '${detectedEntity}' (not 'Leads' or 'Deals'). Skipping ID assignment.`,
      "info",
    );
    return;
  }

  if (params.get("entityId")) {
    currentLeadId = params.get("entityId");
    addLog(
      `${currentEntity} ID found in URL parameters: ${currentLeadId}`,
      "info",
    );
    return;
  }

  if (zohoPageData && zohoPageData.EntityId) {
    currentLeadId = Array.isArray(zohoPageData.EntityId)
      ? zohoPageData.EntityId[0]
      : zohoPageData.EntityId;
    addLog(
      `${currentEntity} ID found in PageLoad event: ${currentLeadId}`,
      "info",
    );
    return;
  }

  return;
}

function findJobIdOnLead(lead) {
  if (!lead) return null;

  // Exact API field name: intelligence360zoho__Intelligence_JobID
  if (
    lead.intelligence360zoho__Intelligence_JobID &&
    String(lead.intelligence360zoho__Intelligence_JobID).trim().length > 3
  ) {
    return String(lead.intelligence360zoho__Intelligence_JobID).trim();
  }

  if (
    lead[FIELD_LEAD_JOB_ID] &&
    String(lead[FIELD_LEAD_JOB_ID]).trim().length > 3
  ) {
    return String(lead[FIELD_LEAD_JOB_ID]).trim();
  }

  if (
    lead.intelligence__JobID &&
    String(lead.intelligence__JobID).trim().length > 3
  ) {
    return String(lead.intelligence__JobID).trim();
  }

  if (
    lead.intelligence__JobId &&
    String(lead.intelligence__JobId).trim().length > 3
  ) {
    return String(lead.intelligence__JobId).trim();
  }

  if (
    lead.intelegence__JobID &&
    String(lead.intelegence__JobID).trim().length > 3
  ) {
    return String(lead.intelegence__JobID).trim();
  }

  if (
    lead.intelegence__JobId &&
    String(lead.intelegence__JobId).trim().length > 3
  ) {
    return String(lead.intelegence__JobId).trim();
  }

  const candidateFields = [
    FIELD_LEAD_JOB_ID, // "intelligence360zoho__Intelligence_JobID"
    "intelligence360zoho__Intelligence_JobID",
    "intelligence__JobID",
    "intelegence__JobID",
  ];

  for (const f of candidateFields) {
    if (lead[f] && String(lead[f]).trim().length > 3) {
      return String(lead[f]).trim();
    }
  }

  for (const k of Object.keys(lead)) {
    const lk = k.toLowerCase();
    if (
      lk.includes("job_id") ||
      lk.includes("jobid") ||
      lk.includes("request_id")
    ) {
      const v = lead[k];
      if (v && typeof v === "string" && v.trim().length > 3) {
        return v.trim();
      }
    }
  }

  return null;
}

async function saveJobIdToLead(jobId) {
  if (!currentLeadId || !jobId) return false;

  const entityName = currentEntity || "Leads";
  const primaryField = "intelligence360zoho__Intelligence_JobID";
  const candidateFields = [
    primaryField,
    FIELD_LEAD_JOB_ID, // "intelligence360zoho__Intelligence_JobID"
    "intelligence360zoho__JobID",
    "intelligence__JobID",
    "intelegence__JobID",
    "JobID",
  ];

  const uniqueCandidates = [...new Set(candidateFields.filter(Boolean))];

  const record = currentEntity === "Deals" ? currentDeal : currentLead;
  if (record) {
    for (const k of Object.keys(record)) {
      const lk = k.toLowerCase();
      if (lk.includes("job") || lk.includes("request")) {
        if (!uniqueCandidates.includes(k)) {
          uniqueCandidates.push(k);
        }
      }
    }
  }

  addLog(
    `[SAVE JOB ID] Saving Job ID '${jobId}' to ${entityName} (${currentLeadId}). Primary field: '${primaryField}'. Candidate fields: [${uniqueCandidates.join(", ")}]`,
    "info",
  );

  for (const f of uniqueCandidates) {
    try {
      addLog(`Writing Job ID '${jobId}' to ${entityName} field '${f}'...`, "info");
      const res = await ZOHO.CRM.API.updateRecord({
        Entity: entityName,
        APIData: { id: currentLeadId, [f]: jobId },
        RecordID: currentLeadId,
      });

      if (res && res.data && res.data[0]) {
        const item = res.data[0];
        if (item.code === "SUCCESS" || item.status === "success") {
          addLog(
            `[SUCCESS] Saved Job ID '${jobId}' into ${entityName} field '${f}' successfully.`,
            "success",
          );
          if (record) {
            record[f] = jobId;
            record.intelligence360zoho__Intelligence_JobID = jobId;
          }
          if (currentDeal) currentDeal.intelligence360zoho__Intelligence_JobID = jobId;
          if (currentLead) currentLead.intelligence360zoho__Intelligence_JobID = jobId;
          activeJobId = jobId;
          return true;
        } else {
          addLog(
            `${entityName} field '${f}' update response: ${item.code} - ${item.message || JSON.stringify(item.details || "")}`,
            "warn",
          );
        }
      } else {
        addLog(
          `Unexpected response updating ${entityName} field '${f}': ${JSON.stringify(res)}`,
          "warn",
        );
      }
    } catch (e) {
      addLog(
        `Exception updating ${entityName} field '${f}': ${e.message || JSON.stringify(e)}`,
        "warn",
      );
    }
  }

  addLog(
    `Warning: Job ID could not be saved to any ${entityName} candidate field. Available record keys: [${record ? Object.keys(record).join(", ") : "none"}]`,
    "error",
  );
  return false;
}

// ---------------------------------------------------------------
// LEAD ENRICHMENT LIFECYCLE
// ---------------------------------------------------------------
async function startEnrichment(forceNew = false) {
  clearError();
  if (!licenseKey || String(licenseKey).trim().length === 0) {
    addLog(
      "startEnrichment called without a valid license. Redirecting to Registration.",
      "warn",
    );
    switchView("registration");
    return;
  }
  document.getElementById("reportCard").style.display = "none";
  document.getElementById("rawResultCard").style.display = "none";
  document.getElementById("queuedCard").style.display = "none";
  document.getElementById("statusBadge").textContent = "In Progress";
  document.getElementById("statusBadge").className = "badge badge-progress";

  addLog(`Beginning Enrichment process (forceNew=${forceNew}, entity=${currentEntity})...`, "info");

  try {
    // Resolve context (Leads or Deals)
    resolveLeadContext();
    addLog(
      `Resolved context: entity=${currentEntity}, recordId=${currentLeadId || "None found"}`,
      currentLeadId ? "success" : "warn",
    );

    if (!currentLeadId) {
      throw new Error(
        `No ${currentEntity} record detected. Please launch this widget from a ${currentEntity} record's button.`,
      );
    }

    let firstName = "";
    let lastName = "";
    let fullName = "";
    let company = "No Company";
    let email = "No Email";
    let title = "";
    let recordForJobId = null;

    if (currentEntity === "Deals") {
      // ----- DEALS FLOW -----
      addLog(`Calling ZOHO.CRM.API.getRecord for Deal ID: ${currentLeadId}...`, "info");
      const dealRes = await ZOHO.CRM.API.getRecord({
        Entity: "Deals",
        RecordID: currentLeadId,
      });
      if (!dealRes || !dealRes.data || !dealRes.data[0]) {
        throw new Error("Could not retrieve Deal details for record ID: " + currentLeadId);
      }
      currentDeal = dealRes.data[0];
      recordForJobId = currentDeal;

      const dealName = currentDeal.Deal_Name || "Deal #" + currentLeadId;
      addLog(`Deal record loaded: '${dealName}'`, "info");
      addLog(`Deal fields available: [${Object.keys(currentDeal).join(", ")}]`, "info");

      // Check if Job ID is already present on this Deal (e.g. from a previous request)
      const existingDealJobId =
        (currentDeal.intelligence360zoho__Intelligence_JobID && String(currentDeal.intelligence360zoho__Intelligence_JobID).trim()) ||
        findJobIdOnLead(currentDeal);

      addLog(
        `[DEAL JOB ID CHECK] ${existingDealJobId ? `Existing Job ID found in 'intelligence360zoho__Intelligence_JobID': '${existingDealJobId}'` : "No Job ID found on Deal (First request)"}`,
        existingDealJobId ? "success" : "info",
      );

      if (existingDealJobId && !forceNew) {
        addLog(
          `[DEAL SECOND VISIT] Existing Job ID detected on Deal ('${existingDealJobId}'). Skipping new request. Checking status directly...`,
          "success",
        );
        activeJobId = existingDealJobId;
        const dealNameEl = document.getElementById("leadName");
        if (dealNameEl) dealNameEl.textContent = dealName;
        showEnrichmentLoading(
          "Loading Intelligence Report...",
          "Checking status and retrieving report...",
        );
        await fetchAndShowJobResult(existingDealJobId, dealName);
        return;
      }

      // --- Resolve Company from associated Account_Name ---
      const accountLookup = currentDeal.Account_Name;
      if (accountLookup && typeof accountLookup === "object" && accountLookup.id) {
        addLog(`Deal has associated Account ID: ${accountLookup.id} (name: ${accountLookup.name || "N/A"})`, "info");
        company = accountLookup.name || "No Company";
      } else if (accountLookup && typeof accountLookup === "string") {
        company = accountLookup;
        addLog(`Deal Account_Name is a string: '${company}'`, "info");
      } else {
        addLog("Deal has no associated Account_Name. Company will be 'No Company'.", "warn");
      }

      // --- Resolve Contact details from associated Contact_Name ---
      const contactLookup = currentDeal.Contact_Name;
      if (contactLookup && typeof contactLookup === "object" && contactLookup.id) {
        addLog(`Deal has associated Contact ID: ${contactLookup.id} (name: ${contactLookup.name || "N/A"}). Fetching full Contact record...`, "info");
        try {
          const contactRes = await ZOHO.CRM.API.getRecord({
            Entity: "Contacts",
            RecordID: contactLookup.id,
          });
          if (contactRes && contactRes.data && contactRes.data[0]) {
            const contact = contactRes.data[0];
            firstName = contact.First_Name || "";
            lastName = contact.Last_Name || "";
            email = contact.Email || "No Email";
            title = contact.Title || contact.Designation || "";
            addLog(
              `[DEAL ENRICHMENT] Contact resolved → First_Name: '${firstName}', Last_Name: '${lastName}', Email: '${email}', Title: '${title}'`,
              "success",
            );
          } else {
            addLog(`Contact record ${contactLookup.id} returned no data.`, "warn");
          }
        } catch (contactErr) {
          addLog(`Failed to fetch Contact ${contactLookup.id}: ${contactErr.message || contactErr}`, "warn");
          // Fallback: use the contact name from the lookup
          const parts = (contactLookup.name || "").split(" ");
          firstName = parts[0] || "";
          lastName = parts.slice(1).join(" ") || "";
          addLog(`Fallback from Contact lookup name: firstName='${firstName}', lastName='${lastName}'`, "info");
        }
      } else {
        addLog("Deal has no associated Contact_Name. Contact details will be empty.", "warn");
      }

      fullName = (firstName + " " + lastName).trim() || dealName;

      addLog("─────────────────────────────────────────", "info");
      addLog(`[DEAL ENRICHMENT SUMMARY]`, "info");
      addLog(`  Deal Name  : ${dealName}`, "info");
      addLog(`  Company    : ${company}`, "info");
      addLog(`  First Name : ${firstName}`, "info");
      addLog(`  Last Name  : ${lastName}`, "info");
      addLog(`  Email      : ${email}`, "info");
      addLog(`  Title      : ${title}`, "info");
      addLog("─────────────────────────────────────────", "info");

    } else {
      // ----- LEADS FLOW (original) -----
      addLog(`Calling ZOHO.CRM.API.getRecord for Lead ID: ${currentLeadId}...`, "info");
      const leadRes = await ZOHO.CRM.API.getRecord({
        Entity: "Leads",
        RecordID: currentLeadId,
      });
      if (!leadRes || !leadRes.data || !leadRes.data[0]) {
        throw new Error("Could not retrieve Lead details for record ID: " + currentLeadId);
      }
      currentLead = leadRes.data[0];
      recordForJobId = currentLead;

      addLog(
        `Lead record loaded. Job ID: "${currentLead[FIELD_LEAD_JOB_ID] || "None"}"`,
        "info",
      );

      firstName = currentLead.First_Name || "";
      lastName = currentLead.Last_Name || "";
      fullName = (firstName + " " + lastName).trim() || "Lead #" + currentLeadId;
      company = currentLead.Company || "No Company";
      email = currentLead.Email || "No Email";
      title = currentLead.Title || currentLead.Designation || "";

      addLog(
        `Lead loaded: ${fullName} | Company: ${company} | Email: ${email} | Title: ${title}`,
        "success",
      );
    }

    const leadNameEl = document.getElementById("leadName");
    if (leadNameEl) leadNameEl.textContent = fullName;
    const leadSubEl = document.getElementById("leadSub");
    if (leadSubEl) leadSubEl.textContent = `${company} • ${email}`;

    // -------------------------------------------------------------
    // CHECK IF JOB ID IS ALREADY STORED ON THIS RECORD
    // -------------------------------------------------------------
    const existingJobId = findJobIdOnLead(recordForJobId);
    if (existingJobId && !forceNew) {
      addLog(
        `Existing Job ID detected on ${currentEntity} in '${FIELD_LEAD_JOB_ID}' (${existingJobId}). Skipping POST /requests. Checking status directly...`,
        "info",
      );
      activeJobId = existingJobId;
      showEnrichmentLoading(
        "Loading Intelligence Report...",
        "Checking status and retrieving report...",
      );
      await fetchAndShowJobResult(existingJobId, fullName);
      return;
    }

    // -------------------------------------------------------------
    // NO EXISTING JOB ID (OR FORCE NEW) -> SUBMIT POST /requests
    // -------------------------------------------------------------
    if (!licenseKey) {
      await checkAndLoadLicense();
    }
    if (!licenseKey) {
      throw new Error(
        "No active license record with Name 'lisense key' found in CRM. Please complete Company Registration first.",
      );
    }

    // Ensure CRM tokens exist and are fresh (reusing valid tokens, refreshing, or handshaking as needed)
    await ensureValidTokens();

    const payload = {
      orgId: String(orgId || "ZOHO-ORG"),
      leadId: String(currentLeadId),
      requestType: currentEntity === "Deals" ? "DealEnrichment" : "LeadEnrichment",
      payload: {
        first_name: firstName,
        last_name: lastName,
        email: email,
        title: title,
        company_name: company,
      },
    };

    addLog(`Sending POST ${REQUESTS_URL}`, "api", payload);
    const reqRes = await makeAuthorizedPost(REQUESTS_URL, payload);

    const reqText = await reqRes.text().catch(() => "");
    let reqData = null;
    try {
      reqData = JSON.parse(reqText);
    } catch (e) {}

    addLog(
      `Server response from POST /requests (HTTP ${reqRes.status}):`,
      reqRes.ok || reqRes.status === 202 ? "info" : "warn",
      reqData || reqText,
    );

    if (!reqRes.ok && reqRes.status !== 202) {
      let customMsg = `Enrichment request failed (HTTP ${reqRes.status}): ${reqText}`;
      let isQuota = false;
      if (reqData) {
        if (
          reqData.errorCode === "CREDIT_LIMIT_EXCEEDED" ||
          reqData.errorCode === "QUOTA_EXCEEDED" ||
          reqData.errorCode === "INSUFFICIENT_CREDITS" ||
          (reqData.message && /quota|credit/i.test(reqData.message)) ||
          (reqText && /quota|credit limit|insufficient credit/i.test(reqText))
        ) {
          customMsg = "Your credits are over. Please buy credits for doing enrichment.";
          isQuota = true;
        } else if (reqData.message) {
          customMsg = reqData.message;
        }
      }
      const enrichErr = new Error(customMsg);
      enrichErr.isQuota = isQuota;
      throw enrichErr;
    }

    const jobId =
      (reqData &&
        (reqData.jobId ||
          reqData.requestId ||
          reqData.id ||
          (reqData.data &&
            (reqData.data.jobId ||
              reqData.data.requestId ||
              reqData.data.id)))) ||
      "";

    // Save jobId to CRM record field 'intelligence360zoho__Intelligence_JobID' immediately
    if (jobId) {
      addLog(
        `[FIRST REQUEST COMPLETE] Received Job ID '${jobId}'. Saving into ${currentEntity} field 'intelligence360zoho__Intelligence_JobID'...`,
        "info",
      );
      await saveJobIdToLead(jobId);
    }

    // If server returned failure or error message directly
    if (reqData && (reqData.status === "Failed" || reqData.errorMessage)) {
      const errDetail =
        reqData.errorMessage ||
        reqData.message ||
        "Enrichment failed on backend.";
      addLog(`Backend reported failure: ${errDetail}`, "warn");
      displayRawResult(reqData, jobId, reqRes.status);
      return;
    }

    if (!jobId) {
      throw new Error(
        "No jobId returned by server: " + (reqText || JSON.stringify(reqData)),
      );
    }

    addLog(`Enrichment request accepted! Assigned Job ID: ${jobId}`, "success");

    // Show 8-10 minute notice card with refresh button
    showQueuedNotice(jobId, fullName);
  } catch (err) {
    addLog("Lead Enrichment failure: " + (err.message || err), "error");
    document.getElementById("statusBadge").textContent = "Error";
    document.getElementById("statusBadge").className = "badge badge-error";

    if (err.isQuota) {
      showError(
        "Your credits are over. Please buy credits for doing enrichment.",
        "Credits Over",
        "View Credits",
        () => openCreditsDashboard(),
      );
    } else {
      showError(
        err.message || JSON.stringify(err),
        "Enrichment Notice",
        "Retry Analysis",
        () => startEnrichment(),
      );
    }
  }
}

function showEnrichmentLoading(
  title = "Loading Intelligence Report...",
  desc = "Checking status and retrieving report...",
) {
  const loadingCard = document.getElementById("enrichmentLoadingCard");
  if (loadingCard) loadingCard.style.display = "block";

  const titleEl = document.getElementById("enrichmentLoadingTitle");
  if (titleEl) titleEl.textContent = title;
  const descEl = document.getElementById("enrichmentLoadingDesc");
  if (descEl) descEl.textContent = desc;

  const queuedCard = document.getElementById("queuedCard");
  if (queuedCard) queuedCard.style.display = "none";
  const reportCard = document.getElementById("reportCard");
  if (reportCard) reportCard.style.display = "none";
  const rawResultCard = document.getElementById("rawResultCard");
  if (rawResultCard) rawResultCard.style.display = "none";

  const statusBadge = document.getElementById("statusBadge");
  if (statusBadge) {
    statusBadge.textContent = "Checking...";
    statusBadge.className = "badge badge-progress";
  }
}

function hideEnrichmentLoading() {
  const loadingCard = document.getElementById("enrichmentLoadingCard");
  if (loadingCard) loadingCard.style.display = "none";
}

function showQueuedNotice(jobId, fullName) {
  activeJobId = jobId || activeJobId;
  hideEnrichmentLoading();
  document.getElementById("reportCard").style.display = "none";
  document.getElementById("rawResultCard").style.display = "none";

  const queuedCard = document.getElementById("queuedCard");
  if (queuedCard) {
    queuedCard.style.display = "block";
  }

  const statusBadge = document.getElementById("statusBadge");
  if (statusBadge) {
    statusBadge.textContent = "Processing";
    statusBadge.className = "badge badge-progress";
  }

  const titleEl = document.getElementById("queuedTitle");
  if (titleEl) {
    titleEl.textContent = "Enrichment in Progress";
  }

  const descEl = document.getElementById("queuedDesc");
  if (descEl) {
    descEl.innerHTML = `Enrichment has been initiated for <strong>${escapeHtml(fullName || "this lead")}</strong>.<br>The intelligence report will be shown in <strong>8 to 10 minutes</strong> here.`;
  }

  const badgeEl = document.getElementById("queuedJobIdBadge");
  if (badgeEl) {
    badgeEl.textContent = "";
    badgeEl.style.display = "none";
  }

  const btn = document.getElementById("btnPollStatus");
  if (btn) {
    btn.disabled = false;
    btn.textContent = "🔄 Refresh / Check Status";
  }

  const feedback = document.getElementById("pollStatusFeedback");
  if (feedback) {
    feedback.style.display = "none";
    feedback.textContent = "";
  }

  addLog(
    `Queued notice displayed for Job ID: ${jobId}. Report will be ready in 8-10 minutes.`,
    "info",
  );
}

async function fetchAndShowJobResult(jobId, fullName = "") {
  activeJobId = jobId;
  const getUrl = `${REQUESTS_URL}/${encodeURIComponent(jobId)}?orgId=${encodeURIComponent(orgId || "ZOHO-ORG")}`;
  addLog(`Calling GET ${getUrl}...`, "api");

  const btn = document.getElementById("btnPollStatus");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "⏳ Checking Status...";
  }

  const feedback = document.getElementById("pollStatusFeedback");
  if (feedback) {
    feedback.style.display = "block";
    feedback.style.color = "#2563eb";
    feedback.textContent = "Checking whether report data is prepared...";
  }

  let res;
  try {
    res = await makeAuthorizedGet(getUrl);
  } catch (netErr) {
    addLog("GET request failed: " + (netErr.message || netErr), "error");
    showQueuedNotice(jobId, fullName);
    if (btn) {
      btn.disabled = false;
      btn.textContent = "🔄 Refresh / Check Status";
    }
    if (feedback) {
      feedback.style.display = "block";
      feedback.style.color = "#dc2626";
      feedback.textContent =
        "Could not connect to backend server. Make sure ngrok is online.";
    }
    return;
  }

  const rawText = await res.text().catch(() => "");
  addLog(
    `Server responded (HTTP ${res.status}): ${rawText.substring(0, 300)}`,
    res.ok ? "info" : "warn",
  );

  let data = null;
  try {
    data = JSON.parse(rawText);
  } catch (e) {}

  // Case 1: Pure HTML response
  if (
    rawText.trim().startsWith("<!DOCTYPE") ||
    (rawText.includes("<html") && rawText.includes("</html>"))
  ) {
    addLog(
      "Received pure HTML report from server. Rendering report.",
      "success",
    );
    displayReport(rawText, jobId);
    document.getElementById("statusBadge").textContent = "Completed";
    document.getElementById("statusBadge").className = "badge badge-success";
    return;
  }

  // Case 2: JSON response
  if (data) {
    const htmlReport =
      (data.data &&
        (data.data.html_report ||
          data.data.html ||
          data.data.report ||
          data.data.htmlReport)) ||
      data.html_report ||
      data.htmlReport ||
      data.html ||
      data.report;

    const isHtmlString =
      typeof htmlReport === "string" &&
      htmlReport.trim().length > 30 &&
      (htmlReport.includes("<div") ||
        htmlReport.includes("<p") ||
        htmlReport.includes("<table") ||
        htmlReport.includes("<!DOCTYPE") ||
        htmlReport.includes("<html") ||
        htmlReport.includes("</"));

    if (
      ((data.status === "Completed" || data.status === "success") &&
        htmlReport) ||
      isHtmlString
    ) {
      addLog("Received Completed status with HTML report.", "success");
      displayReport(htmlReport, jobId);
      document.getElementById("statusBadge").textContent = "Completed";
      document.getElementById("statusBadge").className = "badge badge-success";
      return;
    }

    // If still Processing / Queued / InProgress / Pending
    const statusLower = (data.status || "").toLowerCase();
    if (
      statusLower === "processing" ||
      statusLower === "queued" ||
      statusLower === "pending" ||
      statusLower === "inprogress" ||
      statusLower === "in_progress"
    ) {
      addLog(
        `Job ${jobId} is in progress (status: ${data.status}). Notice updated.`,
        "info",
      );
      showQueuedNotice(jobId, fullName);
      if (feedback) {
        feedback.style.display = "block";
        feedback.style.color = "#0369a1";
        feedback.textContent =
          "Data is still being prepared. The report will be shown in 8 to 10 minutes here.";
      }
      return;
    }

    // If backend returned Failed or error, show whatever received
    if (btn) {
      btn.disabled = false;
      btn.textContent = "🔄 Refresh / Check Status";
    }
    displayRawResult(data, jobId, res.status);
    return;
  }

  // Case 3: Plain text or unknown format
  if (btn) {
    btn.disabled = false;
    btn.textContent = "🔄 Refresh / Check Status";
  }
  displayRawResult({ response: rawText }, jobId, res.status);
}

function displayRawResult(data, jobId, httpStatus = 200) {
  activeJobId = jobId || "";
  currentRawData = data;
  hideEnrichmentLoading();

  document.getElementById("reportCard").style.display = "none";
  document.getElementById("queuedCard").style.display = "none";
  document.getElementById("rawResultCard").style.display = "block";

  const statusStr =
    (data && data.status) || (httpStatus >= 400 ? "Failed" : "Received");
  const statusBadge = document.getElementById("statusBadge");

  if (
    statusStr.toLowerCase() === "completed" ||
    statusStr.toLowerCase() === "success"
  ) {
    statusBadge.textContent = "Completed";
    statusBadge.className = "badge badge-success";
  } else if (
    statusStr.toLowerCase() === "failed" ||
    statusStr.toLowerCase() === "error" ||
    httpStatus >= 400
  ) {
    statusBadge.textContent = "Failed";
    statusBadge.className = "badge badge-error";
  } else {
    statusBadge.textContent = statusStr;
    statusBadge.className = "badge badge-progress";
  }

  const titleEl = document.getElementById("rawResultTitle");
  if (titleEl) {
    titleEl.textContent = `Job Status: ${statusStr}`;
  }

  const jobLabel = document.getElementById("rawJobIdLabel");
  if (jobLabel) {
    jobLabel.textContent = `Job ID: ${jobId || "N/A"} | HTTP Status: ${httpStatus}`;
  }

  const alertBox = document.getElementById("rawAlertBox");
  const errMsg =
    (data && (data.errorMessage || data.message || data.error)) || "";
  if (errMsg && alertBox) {
    alertBox.style.display = "block";
    if (statusStr.toLowerCase() === "failed" || httpStatus >= 400) {
      alertBox.className = "raw-alert-box raw-alert-error";
      alertBox.innerHTML = `<strong>Backend Error:</strong> ${escapeHtml(errMsg)}`;
    } else {
      alertBox.className = "raw-alert-box raw-alert-info";
      alertBox.innerHTML = `<strong>Server Notice:</strong> ${escapeHtml(errMsg)}`;
    }
  } else if (alertBox) {
    alertBox.style.display = "none";
  }

  const codeEl = document.getElementById("rawJsonCode");
  if (codeEl) {
    codeEl.textContent =
      typeof data === "string" ? data : JSON.stringify(data, null, 2);
  }

  addLog(
    `Rendered server response for Job ID '${jobId}' in UI (status: ${statusStr}).`,
    "info",
  );
}

async function recheckCurrentJob() {
  const jobIdToUse =
    activeJobId || (currentLead && findJobIdOnLead(currentLead));
  if (!jobIdToUse) {
    addLog("No active Job ID found. Running full enrichment...", "info");
    startEnrichment(false);
    return;
  }
  addLog(`Manual status re-check initiated for Job ID: ${jobIdToUse}`, "info");
  const leadDisplayName = currentLead
    ? (
        (currentLead.First_Name || "") +
        " " +
        (currentLead.Last_Name || "")
      ).trim()
    : "";
  await fetchAndShowJobResult(jobIdToUse, leadDisplayName);
}

async function pollForResult(requestId) {
  const pollUrl = `${REQUESTS_URL}/${requestId}?orgId=${encodeURIComponent(orgId || "ZOHO-ORG")}`;
  let attempts = 0;

  addLog(`Beginning polling on ${pollUrl}...`, "info");

  while (attempts < MAX_POLL_ATTEMPTS) {
    attempts++;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const pDesc = document.getElementById("progressDesc");
    if (pDesc) {
      pDesc.textContent = `Analyzing signals and building intelligence report (${attempts * 3}s)...`;
    }

    let res = await makeAuthorizedGet(pollUrl);

    if (!res.ok) {
      addLog(`Poll #${attempts} returned HTTP ${res.status}`, "warn");
      continue;
    }

    const data = await res.json();
    addLog(`Poll #${attempts}: status = ${data.status}`, "info");

    if (data.status === "Completed") {
      const html = data.data && data.data.html_report;
      if (!html)
        throw new Error(
          "Report status was Completed but HTML content was empty.",
        );
      addLog(`Report received (${html.length} characters).`, "success");
      return html;
    }
    if (data.status === "Failed" || data.status === "Error") {
      displayRawResult(data, requestId, 200);
      return null;
    }
  }
  throw new Error(
    "Analysis timed out after 2 minutes. You can click retry at any time.",
  );
}

function displayReport(htmlContent, jobId) {
  rawReportHtml = htmlContent;
  if (jobId) activeJobId = jobId;
  hideEnrichmentLoading();
  document.getElementById("queuedCard").style.display = "none";
  document.getElementById("rawResultCard").style.display = "none";
  document.getElementById("reportCard").style.display = "block";

  const topNav = document.getElementById("topNav") || document.querySelector(".top-nav");
  if (topNav) topNav.style.display = "none";
  const headerCard = document.getElementById("leadHeaderCard") || document.querySelector(".header-card");
  if (headerCard) headerCard.style.display = "none";

  const statusBadge = document.getElementById("statusBadge");
  if (statusBadge) {
    statusBadge.textContent = "Completed";
    statusBadge.className = "badge badge-success";
  }

  const frame = document.getElementById("reportFrame");
  if (!frame) return;

  function updateFrameHeight() {
    try {
      const d = frame.contentDocument || frame.contentWindow.document;
      if (!d || !d.body) return;

      const header = d.querySelector(".brandbar");
      if (header) header.style.display = "none";
      const report = d.querySelector(".report");
      const footer = d.querySelector(".brandfoot") || d.querySelector("footer");

      let totalHeight = 0;
      if (report) {
        const headerH = header && header.style.display !== "none" ? header.offsetHeight : 0;
        const reportH = report.offsetHeight || 0;
        const footerH = footer ? footer.offsetHeight : 0;
        totalHeight = headerH + reportH + footerH + 20;
      } else {
        totalHeight = Math.max(
          d.body.scrollHeight,
          d.documentElement.scrollHeight,
        );
      }

      if (totalHeight > 250) {
        frame.style.height = totalHeight + "px";
      }
    } catch (e) {}
  }

  const doc = frame.contentDocument || frame.contentWindow.document;
  doc.open();
  doc.write(htmlContent);
  doc.close();

  try {
    const brandbar = doc.querySelector(".brandbar");
    if (brandbar) brandbar.style.display = "none";
  } catch (e) {}

  try {
    if (doc.documentElement) doc.documentElement.style.overflow = "hidden";
    if (doc.body) doc.body.style.overflow = "hidden";
  } catch (e) {}

  // Run dynamic height adjustment at staggered intervals for image/font rendering
  setTimeout(updateFrameHeight, 60);
  setTimeout(updateFrameHeight, 200);
  setTimeout(updateFrameHeight, 600);

  // Hook into tab switching inside the iframe
  try {
    const tabs = doc.querySelectorAll(".tab");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        // Recalculate as soon as the tab switch changes active section
        setTimeout(updateFrameHeight, 30);
        setTimeout(updateFrameHeight, 150);
      });
    });

    // Also observe DOM changes (class toggles like .visible) inside the report container
    if (doc.defaultView && doc.defaultView.MutationObserver) {
      const observer = new doc.defaultView.MutationObserver(() => {
        updateFrameHeight();
      });
      observer.observe(doc.body, {
        attributes: true,
        childList: true,
        subtree: true,
      });
    }
  } catch (e) {}
}

function downloadReport() {
  if (!rawReportHtml) {
    alert("No report available to download.");
    return;
  }
  try {
    let filename = "Lead_Intelligence_Report";
    if (currentLead) {
      const company = (currentLead.Company || "").trim();
      const fullName = [currentLead.First_Name, currentLead.Last_Name]
        .filter(Boolean)
        .join(" ")
        .trim();
      const identifier = company || fullName;
      if (identifier) {
        filename += "_" + identifier.replace(/[^a-zA-Z0-9_-]/g, "_");
      }
    } else if (activeJobId) {
      filename += "_" + activeJobId;
    }
    filename += ".html";

    const blob = new Blob([rawReportHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
    addLog(`Report downloaded as '${filename}'.`, "success");
  } catch (err) {
    addLog("Error downloading report: " + (err.message || err), "error");
    alert("Failed to download report: " + (err.message || err));
  }
}

function copyReport() {
  downloadReport();
}
