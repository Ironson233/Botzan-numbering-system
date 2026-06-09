import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const testPort = 4193;
const testDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "bz-numbering-test-"));
const server = spawn(process.execPath, ["server.mjs"], {
  cwd: new URL(".", import.meta.url),
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, PORT: String(testPort), DATA_DIR: testDataDir },
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createClient() {
  let cookie = "";
  return async function request(path, options = {}) {
    const response = await fetch(`http://localhost:${testPort}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...(options.headers || {}),
      },
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    const type = response.headers.get("content-type") || "";
    const payload = type.includes("application/json") ? await response.json() : await response.text();
    if (!response.ok) {
      const error = typeof payload === "string" ? payload : payload.error;
      throw Object.assign(new Error(error || response.statusText), { status: response.status });
    }
    return payload;
  };
}

async function waitForServer() {
  for (let i = 0; i < 20; i += 1) {
    try {
      const anon = createClient();
      await anon("/api/auth/me");
      return;
    } catch {
      await wait(250);
    }
  }
  throw new Error("server did not start");
}

async function expectForbidden(fn) {
  try {
    await fn();
  } catch (error) {
    if ([400, 401, 403, 423].includes(error.status)) return true;
    throw error;
  }
  throw new Error("expected request to be forbidden");
}

try {
  await waitForServer();
  const admin = createClient();
  const testViewer = createClient();
  const testLimitedEngineer = createClient();
  const engineerA = createClient();
  const engineerB = createClient();
  const approver = createClient();
  const viewer = createClient();

  await admin("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "admin", password: "123", permissions: ["*"] }) });
  await testViewer("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "admin", password: "123", permissions: ["records:read"] }) });
  await testLimitedEngineer("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: "admin", password: "123", permissions: ["records:read", "records:create", "records:update", "records:submit"] }),
  });
  await engineerA("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "engineer", password: "eng123" }) });
  await viewer("/api/auth/login", { method: "POST", body: JSON.stringify({ username: "viewer", password: "view123" }) });

  const suffix = String(Date.now()).slice(-7);
  const engineerUser = await admin("/api/users", {
    method: "POST",
    body: JSON.stringify({
      username: `eng_${suffix}`,
      name: "Smoke Engineer",
      password: "pass123",
      permissions: ["records:read", "records:update", "records:attach", "records:submit", "records:revise", "export:read"],
    }),
  });
  const approverUser = await admin("/api/users", {
    method: "POST",
    body: JSON.stringify({
      username: `approval_${suffix}`,
      name: "Smoke Approver",
      password: "pass123",
      permissions: ["records:read", "approvals:read", "records:approve", "records:reject", "audit:read"],
    }),
  });

  await engineerB("/api/auth/login", { method: "POST", body: JSON.stringify({ username: engineerUser.username, password: "pass123" }) });
  await approver("/api/auth/login", { method: "POST", body: JSON.stringify({ username: approverUser.username, password: "pass123" }) });

  const viewerCreateBlocked = await expectForbidden(() => testViewer("/api/records", {
    method: "POST",
    body: JSON.stringify({
      rule: "PD",
      title: `Smoke viewer blocked ${suffix}`,
      version: "A0",
      fields: { productCategories: "01", systemModules: "04", drawingTypes: "02" },
    }),
  }));

  const testDraft = await testLimitedEngineer("/api/records", {
    method: "POST",
    body: JSON.stringify({
      rule: "PD",
      title: `Smoke selected permissions ${suffix}`,
      version: "A0",
      fields: { productCategories: "01", systemModules: "04", drawingTypes: "02" },
    }),
  });
  await testLimitedEngineer(`/api/records/${testDraft.id}/submit`, { method: "POST", body: JSON.stringify({ comment: "submit with selected permissions" }) });
  const selectedApprovalBlocked = await expectForbidden(() => testLimitedEngineer(`/api/records/${testDraft.id}/approve`, {
    method: "POST",
    body: JSON.stringify({ comment: "should not approve without approval permission" }),
  }));
  await testLimitedEngineer(`/api/records/${testDraft.id}/withdraw`, { method: "POST", body: JSON.stringify({ comment: "withdraw for edit" }) });
  const withdrawn = await testLimitedEngineer(`/api/records/${testDraft.id}`, {
    method: "PUT",
    body: JSON.stringify({ title: `Smoke selected permissions withdrawn ${suffix}` }),
  });
  await admin(`/api/records/${testDraft.id}`, { method: "DELETE" });

  const draft = await engineerA("/api/records", {
    method: "POST",
    body: JSON.stringify({
      rule: "PD",
      title: `Smoke draft ${suffix}`,
      version: "A0",
      fields: { productCategories: "01", systemModules: "04", drawingTypes: "02" },
    }),
  });

  const aMine = await engineerA("/api/records?scope=mine&pageSize=50");
  const bVisibleBefore = await engineerB("/api/records?scope=visible&pageSize=200");
  const viewerBefore = await viewer("/api/records?scope=visible&pageSize=200");

  await expectForbidden(() => engineerB(`/api/records/${draft.id}`));
  await engineerA(`/api/records/${draft.id}/submit`, { method: "POST", body: JSON.stringify({ comment: "submit new record" }) });
  const pendingEditBlocked = await expectForbidden(() => engineerA(`/api/records/${draft.id}`, {
    method: "PUT",
    body: JSON.stringify({ title: "should not edit pending" }),
  }));
  const adminPendingEditBlocked = await expectForbidden(() => admin(`/api/records/${draft.id}`, {
    method: "PUT",
    body: JSON.stringify({ title: "admin should not bypass pending workflow" }),
  }));
  const pending = await approver("/api/records?scope=pending&pageSize=200");
  const approved = await approver(`/api/records/${draft.id}/approve`, { method: "POST", body: JSON.stringify({ comment: "approve new record" }) });
  const approvedInitial = await engineerA(`/api/records/${draft.id}`);

  const bCompanyAfter = await engineerB("/api/records?scope=company&pageSize=200");
  const controlledEditBlocked = await expectForbidden(() => engineerB(`/api/records/${draft.id}`, {
    method: "PUT",
    body: JSON.stringify({ title: "should not directly edit controlled record" }),
  }));

  const revision = await engineerB(`/api/records/${draft.id}/revision`, {
    method: "POST",
    body: JSON.stringify({ comment: "request controlled record change" }),
  });
  await engineerB(`/api/records/${revision.id}`, {
    method: "PUT",
    body: JSON.stringify({ title: `Smoke revision ${suffix}`, version: "A1" }),
  });
  await engineerB(`/api/records/${revision.id}/submit`, { method: "POST", body: JSON.stringify({ comment: "submit revision" }) });
  const pendingRevisionEditBlocked = await expectForbidden(() => engineerB(`/api/records/${revision.id}`, {
    method: "PUT",
    body: JSON.stringify({ title: "should not edit pending revision" }),
  }));
  await approver(`/api/records/${revision.id}/reject`, { method: "POST", body: JSON.stringify({ comment: "return revision" }) });
  await engineerB(`/api/records/${revision.id}`, {
    method: "PUT",
    body: JSON.stringify({ title: `Smoke revision accepted ${suffix}` }),
  });
  await engineerB(`/api/records/${revision.id}/submit`, { method: "POST", body: JSON.stringify({ comment: "resubmit revision" }) });
  const pendingRevision = await approver("/api/records?scope=pending&pageSize=200");
  await approver(`/api/records/${revision.id}/approve`, { method: "POST", body: JSON.stringify({ comment: "approve revision" }) });

  const historicalA0 = await engineerA(`/api/records/${draft.id}`);
  const merged = await engineerA(`/api/records/${revision.id}`);
  const historicalRevisionBlocked = await expectForbidden(() => engineerB(`/api/records/${draft.id}/revision`, {
    method: "POST",
    body: JSON.stringify({ comment: "should not revise historical version" }),
  }));
  const secondRevision = await engineerB(`/api/records/${revision.id}/revision`, {
    method: "POST",
    body: JSON.stringify({ comment: "request second controlled record change" }),
  });
  await engineerB(`/api/records/${secondRevision.id}`, {
    method: "PUT",
    body: JSON.stringify({ title: `Smoke second revision accepted ${suffix}` }),
  });
  await engineerB(`/api/records/${secondRevision.id}/submit`, { method: "POST", body: JSON.stringify({ comment: "submit second revision" }) });
  await approver(`/api/records/${secondRevision.id}/approve`, { method: "POST", body: JSON.stringify({ comment: "approve second revision" }) });
  const mergedSecond = await engineerA(`/api/records/${secondRevision.id}`);
  const historicalA1 = await engineerA(`/api/records/${revision.id}`);
  const finalCompany = await engineerB("/api/records?scope=company&pageSize=200");
  const finalSameNumberRows = finalCompany.records.filter((record) => record.number === draft.number);
  const finalVersions = Object.fromEntries(finalSameNumberRows.map((record) => [record.version, record]));
  const audit = await approver("/api/audit?limit=80");

  await admin(`/api/records/${secondRevision.id}`, { method: "DELETE" });
  await admin(`/api/records/${revision.id}`, { method: "DELETE" });
  await admin(`/api/records/${draft.id}`, { method: "DELETE" });
  await admin(`/api/users/${engineerUser.id}`, { method: "PUT", body: JSON.stringify({ active: false }) });
  await admin(`/api/users/${approverUser.id}`, { method: "PUT", body: JSON.stringify({ active: false }) });

  console.log(JSON.stringify({
    customEngineer: engineerUser.username,
    customApprover: approverUser.username,
    viewerCreateBlocked,
    selectedApprovalBlocked,
    withdrawnEditable: withdrawn.title.includes("withdrawn"),
    ownDraftVisible: aMine.records.some((record) => record.id === draft.id),
    draftHiddenFromOtherEngineer: !bVisibleBefore.records.some((record) => record.id === draft.id),
    draftHiddenFromViewer: !viewerBefore.records.some((record) => record.id === draft.id),
    pendingEditBlocked,
    adminPendingEditBlocked,
    pendingVisibleToApprover: pending.records.some((record) => record.id === draft.id),
    approvedStatus: approved.status,
    initialVersionSnapshotted: approvedInitial.revisionHistory?.some((item) => item.version === "A0"),
    companyVisibleAfterApprove: bCompanyAfter.records.some((record) => record.id === draft.id),
    controlledEditBlocked,
    revisionKeepsNumber: revision.number === draft.number,
    revisionVersion: revision.version,
    pendingRevisionEditBlocked,
    revisionVisibleToApprover: pendingRevision.records.some((record) => record.id === revision.id),
    historicalA0Status: historicalA0.status,
    historicalA0Version: historicalA0.version,
    mergedTitle: merged.title,
    mergedVersion: merged.version,
    mergedIsLatest: merged.isLatest,
    historicalRevisionBlocked,
    secondRevisionKeepsNumber: secondRevision.number === draft.number,
    secondRevisionVersion: secondRevision.version,
    mergedSecondVersion: mergedSecond.version,
    mergedSecondIsLatest: mergedSecond.isLatest,
    historicalA1Status: historicalA1.status,
    versionChainVisible: finalSameNumberRows.length === 3 &&
      finalVersions.A0?.status === "历史版本" &&
      finalVersions.A1?.status === "历史版本" &&
      finalVersions.A2?.status === "受控" &&
      finalVersions.A2?.isLatest === true &&
      finalVersions.A0?.isLatest === false &&
      finalVersions.A1?.isLatest === false,
    auditCount: audit.length,
  }, null, 2));
} finally {
  server.kill();
  await fs.rm(testDataDir, { recursive: true, force: true });
}
