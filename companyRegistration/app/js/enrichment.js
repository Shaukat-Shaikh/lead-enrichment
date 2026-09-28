"use strict";

// ---------------------------------------------------------------
// LEAD CONTEXT & IDENTIFICATION
// ---------------------------------------------------------------
function resolveLeadContext() {
  currentLeadId = null;
  const params = new URLSearchParams(window.location.search);
  const urlEntity = params.get("entity");

  // If entity is explicitly not Leads (e.g. Dynamics360, intelligence__name_of_lead, intelegence__name_of_lead), do not treat as lead
  if (urlEntity && urlEntity.toLowerCase() !== "leads") {
    addLog(
      `Context entity is '${urlEntity}' (not 'Leads'). Skipping Lead ID assignment.`,
      "info",
    );
    return;
  }

  if (
    zohoPageData &&
    zohoPageData.Entity &&
    zohoPageData.Entity.toLowerCase() !== "leads"
  ) {
    addLog(
      `Zoho PageLoad entity is '${zohoPageData.Entity}' (not 'Leads'). Skipping Lead ID assignment.`,
      "info",
    );
    return;
  }

  if (params.get("entityId")) {
    currentLeadId = params.get("entityId");
    addLog("Lead ID found in URL parameters: " + currentLeadId, "info");
    return;
  }

  if (zohoPageData && zohoPageData.EntityId) {
    currentLeadId = Array.isArray(zohoPageData.EntityId)
      ? zohoPageData.EntityId[0]
      : zohoPageData.EntityId;
    addLog("Lead ID found in PageLoad event: " + currentLeadId, "info");
    return;
  }

  return;
}

function findJobIdOnLead(lead) {
  if (!lead) return null;

  // Exact API field name: intelligence360__Intelligence_JobID
  if (
    lead.intelligence360__Intelligence_JobID &&
    String(lead.intelligence360__Intelligence_JobID).trim().length > 3
  ) {
    return String(lead.intelligence360__Intelligence_JobID).trim();
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
    FIELD_LEAD_JOB_ID, // "intelligence360__Intelligence_JobID"
    "intelligence360__Intelligence_JobID",
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

  const candidateFields = [
    FIELD_LEAD_JOB_ID, // "intelligence360__Intelligence_JobID"
    "intelligence360__Intelligence_JobID",
    "intelligence__JobID",
    "intelegence__JobID",
  ];

  if (currentLead) {
    for (const k of Object.keys(currentLead)) {
      const lk = k.toLowerCase();
      if (lk.includes("job") || lk.includes("request")) {
        if (!candidateFields.includes(k)) {
          candidateFields.unshift(k);
        }
      }
    }
  }

  for (const f of candidateFields) {
    try {
      addLog(`Writing Job ID '${jobId}' to Lead field '${f}'...`, "info");
      const res = await ZOHO.CRM.API.updateRecord({
        Entity: "Leads",
        APIData: { id: currentLeadId, [f]: jobId },
        RecordID: currentLeadId,
      });

      if (res && res.data && res.data[0]) {
        const item = res.data[0];
        if (item.code === "SUCCESS" || item.status === "success") {
          addLog(
            `Saved Job ID into Lead field '${f}' successfully.`,
            "success",
          );
          if (currentLead) {
            currentLead[f] = jobId;
            currentLead.intelligence360__Intelligence_JobID = jobId;
            currentLead.intelligence__JobId = jobId;
            currentLead.intelligence__JobID = jobId;
            currentLead.intelegence__JobId = jobId;
            currentLead.intelegence__JobID = jobId;
          }
          return true;
        } else {
          addLog(
            `Lead field '${f}' update response: ${item.code} (${item.message || JSON.stringify(item.details || "")})`,
            "warn",
          );
        }
      } else {
        addLog(
          `Unexpected response updating Lead field '${f}': ${JSON.stringify(res)}`,
          "warn",
        );
      }
    } catch (e) {
      addLog(
        `Exception updating Lead field '${f}': ${e.message || JSON.stringify(e)}`,
        "warn",
      );
    }
  }

  addLog(
    `Warning: Job ID could not be saved to any Lead candidate field. Available Lead keys: [${currentLead ? Object.keys(currentLead).join(", ") : "none"}]`,
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

  addLog(`Beginning Lead Enrichment process (forceNew=${forceNew})...`, "info");

  try {
    // Resolve Lead context
    resolveLeadContext();
    addLog(
      "Resolved Lead ID context: " + (currentLeadId || "None found"),
      currentLeadId ? "success" : "warn",
    );

    if (!currentLeadId) {
      throw new Error(
        "No Lead record detected. Please launch this widget from a Lead record's 'Lead Enrichment' button.",
      );
    }

    // Fetch full lead details
    addLog(
      `Calling ZOHO.CRM.API.getRecord for Lead ID: ${currentLeadId}...`,
      "info",
    );
    const leadRes = await ZOHO.CRM.API.getRecord({
      Entity: "Leads",
      RecordID: currentLeadId,
    });
    if (!leadRes || !leadRes.data || !leadRes.data[0]) {
      throw new Error(
        "Could not retrieve Lead details for record ID: " + currentLeadId,
      );
    }
    currentLead = leadRes.data[0];

    addLog(
      `Lead record loaded. Job ID: "${currentLead[FIELD_LEAD_JOB_ID] || "None"}"`,
      "info",
    );

    const firstName = currentLead.First_Name || "";
    const lastName = currentLead.Last_Name || "";
    const fullName =
      (firstName + " " + lastName).trim() || "Lead #" + currentLeadId;
    const company = currentLead.Company || "No Company";
    const email = currentLead.Email || "No Email";

    addLog(
      `Lead loaded: ${fullName} | Company: ${company} | Email: ${email}`,
      "success",
    );

    document.getElementById("leadName").textContent = fullName;
    document.getElementById("leadSub").textContent = `${company} • ${email}`;

    // -------------------------------------------------------------
    // CHECK IF JOB ID IS ALREADY STORED ON THIS LEAD (intelligence__JobID / intelegence__JobId)
    // -------------------------------------------------------------
    const existingJobId = findJobIdOnLead(currentLead);
    if (existingJobId && !forceNew) {
      addLog(
        `Existing Job ID detected on Lead in '${FIELD_LEAD_JOB_ID}' (${existingJobId}). Skipping POST /requests. Checking status directly...`,
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
      requestType: "LeadEnrichment",
      payload: {
        first_name: firstName,
        last_name: lastName,
        email: email,
        title: currentLead.Title || currentLead.Designation || "",
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
          (reqData.message && reqData.message.includes("quota exceeded"))
        ) {
          customMsg = `License Quota Exceeded: The credit quota for license key (${licenseKey}) has been reached on the server. Please register a new license or top up credits.`;
          isQuota = true;
        } else if (reqData.message) {
          customMsg = reqData.message;
        }
      }
      const enrichErr = new Error(customMsg);
      enrichErr.isQuota = isQuota;
      throw enrichErr;
    }

    const jobId = reqData && (reqData.jobId || reqData.requestId || reqData.id);

    // Save jobId to Lead record field 'intelligence__JobID' / 'intelegence__JobId' immediately
    if (jobId) {
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
      showError(err.message, "Quota Exceeded", "Register New License", () =>
        switchView("registration"),
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
    badgeEl.textContent = `Job ID: ${jobId || "N/A"}`;
    badgeEl.style.display = jobId ? "inline-block" : "none";
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
      const report = d.querySelector(".report");
      const footer = d.querySelector(".brandfoot") || d.querySelector("footer");

      let totalHeight = 0;
      if (report) {
        const headerH = header ? header.offsetHeight : 0;
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

function copyReport() {
  if (!rawReportHtml) return;
  navigator.clipboard
    .writeText(rawReportHtml)
    .then(() => alert("Report HTML copied!"))
    .catch(() => alert("Unable to copy."));
}
