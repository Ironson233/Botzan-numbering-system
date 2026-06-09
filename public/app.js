const state = {
  config: null,
  stats: null,
  records: [],
  page: 1,
  pageSize: 30,
  total: 0,
  activeRecord: null,
  user: null,
  trace: { ecns: [], serialNumbers: [], bomLinks: [] },
  audit: [],
  users: [],
  approvals: [],
  permissionCatalog: [],
};

const groupLabels = {
  productCategories: "产品类别",
  systemModules: "系统模块",
  drawingTypes: "图样类型",
  gpTypes: "通用件类别",
  spTypes: "标准件类别",
  toolingTypes: "工装类别",
  inspectionTypes: "检具类别",
  materialTypes: "材料类别",
  packageTypes: "包装类别",
  transportTypes: "运输类别",
  documentTypes: "技术文件类别",
  softwareTypes: "软件类别",
};

const fieldAliases = {
  productCategories: "product",
  systemModules: "module",
  drawingTypes: "drawingType",
  gpTypes: "gpType",
  spTypes: "spType",
  toolingTypes: "toolingType",
  inspectionTypes: "inspectionType",
  materialTypes: "materialType",
  packageTypes: "packageType",
  transportTypes: "transportType",
  documentTypes: "documentType",
  softwareTypes: "softwareType",
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[char]));
}

const permissionImplications = {
  "records:create": ["records:read"],
  "records:update": ["records:read"],
  "records:attach": ["records:read", "records:update"],
  "records:submit": ["records:read", "records:update"],
  "records:revise": ["records:read", "records:update"],
  "approvals:read": ["records:read"],
  "records:approve": ["records:read", "approvals:read"],
  "records:reject": ["records:read", "approvals:read"],
  "records:delete": ["records:read"],
  "ecn:create": ["ecn:read", "records:read"],
  "sn:manage": ["sn:read"],
  "bom:manage": ["bom:read"],
  "export:read": ["records:read"],
};

function normalizePermissions(permissions = []) {
  if (permissions.includes("*")) return ["*"];
  const expanded = new Set(permissions);
  for (const permission of permissions) {
    for (const implied of permissionImplications[permission] || []) expanded.add(implied);
  }
  return [...expanded];
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      state.user = null;
      document.body.classList.remove("authenticated");
      $("#loginScreen").style.display = "grid";
    }
    throw new Error(payload.error || "请求失败");
  }
  return payload;
}

function hasPermission(permission) {
  const permissions = normalizePermissions(state.user?.permissions || []);
  return permissions.includes("*") || permissions.includes(permission);
}

function canManageApprovals() {
  return hasPermission("*") || hasPermission("approvals:read") || hasPermission("records:approve") || hasPermission("records:reject");
}

function applyPermissions() {
  $("#userPill").textContent = state.user ? `${state.user.name} · ${state.user.roleName}` : "";
  document.querySelector('[data-view="categories"]')?.classList.toggle("is-hidden", !hasPermission("categories:manage"));
  document.querySelector('[data-view="audit"]')?.classList.toggle("is-hidden", !hasPermission("audit:read"));
  document.querySelector('[data-view="users"]')?.classList.toggle("is-hidden", !hasPermission("users:manage"));
  document.querySelector('[data-view="approvals"]')?.classList.toggle("is-hidden", !canManageApprovals());
  document.querySelector('[data-view="create"]')?.classList.toggle("is-hidden", !hasPermission("records:create"));
  $("#categoryForm")?.classList.toggle("is-hidden", !hasPermission("categories:manage"));
  $("#deleteRecord")?.classList.toggle("is-hidden", !hasPermission("records:delete"));
  $("#approveRecord")?.classList.toggle("is-hidden", !hasPermission("records:approve"));
  $("#rejectRecord")?.classList.toggle("is-hidden", !hasPermission("records:reject"));
  $("#submitApproval")?.classList.toggle("is-hidden", !hasPermission("records:submit"));
  $("#withdrawApproval")?.classList.toggle("is-hidden", !hasPermission("records:submit"));
  $("#createEcn")?.classList.toggle("is-hidden", !hasPermission("ecn:create"));
  $("#createRevision")?.classList.toggle("is-hidden", !hasPermission("records:revise"));
  $("#ecnForm")?.classList.toggle("is-hidden", !hasPermission("ecn:create"));
  $("#snForm")?.classList.toggle("is-hidden", !hasPermission("sn:manage"));
  $("#bomForm")?.classList.toggle("is-hidden", !hasPermission("bom:manage"));
  const forbiddenActive =
    (!hasPermission("categories:manage") && $("#categoriesView")?.classList.contains("active")) ||
    (!hasPermission("audit:read") && $("#auditView")?.classList.contains("active")) ||
    (!hasPermission("users:manage") && $("#usersView")?.classList.contains("active")) ||
    (!canManageApprovals() && $("#approvalsView")?.classList.contains("active")) ||
    (!hasPermission("records:create") && $("#createView")?.classList.contains("active"));
  if (forbiddenActive) {
    switchView("dashboard");
  }
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2400);
}

window.addEventListener("unhandledrejection", (event) => {
  console.error(event.reason);
  toast(event.reason?.message || "操作失败");
});

function ruleName(code) {
  return state.config?.rules.find((rule) => rule.code === code)?.name || code;
}

function groupOptions(groupName) {
  return state.config.groups[groupName] || [];
}

function optionText(item) {
  return `${item.code} ${item.name}`;
}

function switchView(name) {
  $$(".nav-item").forEach((btn) => btn.classList.toggle("active", btn.dataset.view === name));
  $$(".view").forEach((view) => view.classList.remove("active"));
  $(`#${name}View`).classList.add("active");
  const titles = {
    dashboard: ["总览", "按分类规则自动生成编号，支持图纸、照片和技术资料记录。"],
    records: ["编号台账", "查询、编辑、归档和维护所有编号记录。"],
    create: ["新建编号", "选择分类后自动生成企业编号。"],
    approvals: ["待审批", "管理员处理员工提交的新增申请和修订申请。"],
    traceability: ["SN/BOM/ECN", "管理实物序列号、BOM 关联和受控变更单。"],
    categories: ["分类维护", "维护分类代码，支持后续手动扩展。"],
    audit: ["修改日志", "查看近期所有登录、创建、编辑、审批、删除、分类维护等操作。"],
    users: ["账户管理", "创建测试账号，并为账号勾选细分功能权限。"],
    architecture: ["接口与扩展", "为云端部署、权限、对象存储和系统集成预留接口。"],
  };
  $("#pageTitle").textContent = titles[name][0];
  $("#pageSubtitle").textContent = titles[name][1];
}

function renderDashboard() {
  const stats = state.stats || { total: 0, attachments: 0, byStatus: {}, byRule: {} };
  const controlled = stats.byStatus?.["受控"] || 0;
  const trial = stats.byStatus?.["试制"] || 0;
  $("#kpiGrid").innerHTML = [
    ["编号记录", stats.total || 0],
    ["受控文件", controlled],
    ["试制记录", trial],
    ["附件数量", stats.attachments || 0],
  ].map(([label, value]) => `<div class="kpi-card"><span>${label}</span><strong>${value}</strong></div>`).join("");

  $("#ruleList").innerHTML = state.config.rules.map((rule) => `
    <div class="rule-card">
      <strong>${rule.code} ${rule.name}</strong>
      <code>${rule.pattern}</code>
      <span>${rule.description}</span>
    </div>
  `).join("");

  $("#recentRows").innerHTML = state.records.slice(0, 8).map((record) => `
    <tr>
      <td>${escapeHtml(record.number)}</td>
      <td>${escapeHtml(record.title)}</td>
      <td><span class="status">${record.statusLabel || record.status}</span></td>
      <td>${escapeHtml(record.version)}</td>
    </tr>
  `).join("") || `<tr><td colspan="4">暂无记录</td></tr>`;
}

function renderFilters() {
  const currentScope = $("#scopeFilter")?.value || "visible";
  const ruleOptions = `<option value="">全部大类</option>` + state.config.rules.map((rule) => `<option value="${rule.code}">${rule.code} ${rule.name}</option>`).join("");
  $("#ruleFilter").innerHTML = ruleOptions;
  $("#ruleSelect").innerHTML = state.config.rules.map((rule) => `<option value="${rule.code}">${rule.code} ${rule.name}</option>`).join("");
  $("#groupSelect").innerHTML = Object.keys(state.config.groups).map((key) => `<option value="${key}">${groupLabels[key] || key}</option>`).join("");
  $("#scopeFilter").innerHTML = `
    <option value="visible">我可见的全部</option>
    <option value="mine">我的申请</option>
    <option value="company">公司受控</option>
    ${canManageApprovals() ? `<option value="pending">待审批</option>` : ""}
    ${hasPermission("*") ? `<option value="all">全部记录</option>` : ""}
  `;
  if ([...$("#scopeFilter").options].some((option) => option.value === currentScope)) {
    $("#scopeFilter").value = currentScope;
  }
}

function buildFieldsForRule(ruleCode) {
  const rule = state.config.rules.find((item) => item.code === ruleCode);
  const fields = $("#dynamicFields");
  fields.innerHTML = rule.groups.map((groupName) => `
    <label>
      <span>${groupLabels[groupName] || groupName}</span>
      <select name="${groupName}">
        ${groupOptions(groupName).map((item) => `<option value="${item.code}">${optionText(item)}</option>`).join("")}
      </select>
    </label>
  `).join("");
  fields.querySelectorAll("select").forEach((select) => select.addEventListener("change", updatePreview));
  updatePreview();
}

function updatePreview() {
  const ruleCode = $("#ruleSelect").value;
  const rule = state.config.rules.find((item) => item.code === ruleCode);
  const fields = collectDynamicFields();
  const patternFields = {};
  Object.entries(fields).forEach(([groupName, value]) => {
    patternFields[fieldAliases[groupName]] = value;
  });
  const preview = rule.pattern.replace(/\{(\w+)\}/g, (_, key) => key === "seq3" ? "001" : (patternFields[key] || "XX"));
  $("#numberPreview").textContent = preview;
}

function collectDynamicFields() {
  return Object.fromEntries(Array.from($("#dynamicFields").querySelectorAll("select")).map((select) => [select.name, select.value]));
}

async function loadRecords() {
  if (!hasPermission("records:read")) {
    state.records = [];
    state.total = 0;
    state.page = 1;
    renderRecords();
    return { records: [], total: 0, page: 1, pageSize: state.pageSize };
  }
  const params = new URLSearchParams({
    page: state.page,
    pageSize: state.pageSize,
    search: $("#searchInput")?.value || "",
    scope: $("#scopeFilter")?.value || "visible",
    rule: $("#ruleFilter")?.value || "",
    status: $("#statusFilter")?.value || "",
  });
  const payload = await api(`/api/records?${params}`);
  state.records = payload.records;
  state.total = payload.total;
  state.page = payload.page;
  renderRecords();
  return payload;
}

function recordKindLabel(record) {
  return record.recordKind === "revision" ? "修订申请" : "新增申请";
}

function renderApprovals() {
  $("#approvalRows").innerHTML = state.approvals.map((record) => `
    <tr>
      <td>${escapeHtml(record.number)}</td>
      <td>${escapeHtml(record.title)}</td>
      <td>${recordKindLabel(record)}</td>
      <td>${escapeHtml(record.owner || record.createdBy || "")}</td>
      <td>${escapeHtml(record.sourceNumber || "")}</td>
      <td>${new Date(record.updatedAt).toLocaleString()}</td>
      <td>
        <button data-open="${record.id}">详情</button>
        ${hasPermission("records:approve") ? `<button class="primary" data-approve="${record.id}">批准</button>` : ""}
        ${hasPermission("records:reject") ? `<button class="secondary" data-reject="${record.id}">驳回</button>` : ""}
      </td>
    </tr>
  `).join("") || `<tr><td colspan="7">暂无待审批记录</td></tr>`;
  $("#approvalRows").querySelectorAll("[data-open]").forEach((btn) => btn.addEventListener("click", () => openDetail(btn.dataset.open)));
  $("#approvalRows").querySelectorAll("[data-approve]").forEach((btn) => btn.addEventListener("click", () => approveRecordById(btn.dataset.approve)));
  $("#approvalRows").querySelectorAll("[data-reject]").forEach((btn) => btn.addEventListener("click", () => rejectRecordById(btn.dataset.reject)));
}

async function loadApprovals() {
  if (!canManageApprovals()) {
    state.approvals = [];
    renderApprovals();
    return;
  }
  const payload = await api("/api/records?scope=pending&pageSize=200").catch(() => ({ records: [] }));
  state.approvals = payload.records || [];
  renderApprovals();
}

function renderUsers() {
  $("#userRows").innerHTML = state.users.map((user) => `
    <tr>
      <td>${escapeHtml(user.username)}</td>
      <td>${escapeHtml(user.name)}</td>
      <td>${user.permissions?.includes("*") ? "全部权限" : `${user.permissions?.length || 0} 项权限`}</td>
      <td>${user.active ? "启用" : "停用"}</td>
      <td>
        ${user.username === "admin" ? `<span class="muted">固定测试账号</span>` : `
          <button type="button" data-user-load="${user.id}">载入权限</button>
          <button type="button" data-user-save="${user.id}">保存权限</button>
          <button type="button" data-user-password="${user.id}">重置密码</button>
          <button type="button" class="${user.active ? "danger" : "secondary"}" data-user-toggle="${user.id}">${user.active ? "停用" : "启用"}</button>
        `}
      </td>
    </tr>
  `).join("") || `<tr><td colspan="5">暂无用户</td></tr>`;
  $("#userRows").querySelectorAll("[data-user-load]").forEach((btn) => btn.addEventListener("click", () => loadUserPermissions(btn.dataset.userLoad)));
  $("#userRows").querySelectorAll("[data-user-save]").forEach((btn) => btn.addEventListener("click", () => saveUserPermissions(btn.dataset.userSave)));
  $("#userRows").querySelectorAll("[data-user-password]").forEach((btn) => btn.addEventListener("click", () => resetUserPassword(btn.dataset.userPassword)));
  $("#userRows").querySelectorAll("[data-user-toggle]").forEach((btn) => btn.addEventListener("click", () => toggleUser(btn.dataset.userToggle)));
}

function renderPermissionGrid() {
  const grid = $("#permissionGrid");
  if (!grid) return;
  grid.innerHTML = state.permissionCatalog.map((item) => `
    <label><input type="checkbox" value="${item.code}" name="permission"> ${item.name}</label>
  `).join("");
}

function collectSelectedPermissions() {
  return Array.from(document.querySelectorAll("#permissionGrid input[name='permission']:checked")).map((input) => input.value);
}

function setSelectedPermissions(permissions = []) {
  const normalized = normalizePermissions(permissions);
  document.querySelectorAll("#permissionGrid input[name='permission']").forEach((input) => {
    input.checked = normalized.includes("*") || normalized.includes(input.value);
  });
}

function renderLoginPermissionGrid() {
  const grid = $("#loginPermissionGrid");
  if (!grid) return;
  grid.innerHTML = state.permissionCatalog.map((item) => `
    <label><input type="checkbox" value="${item.code}" name="loginPermission" ${item.code === "records:read" ? "checked" : ""}> ${item.name}</label>
  `).join("");
}

function collectLoginPermissions() {
  return Array.from(document.querySelectorAll("#loginPermissionGrid input[name='loginPermission']:checked")).map((input) => input.value);
}

function setLoginPermissions(checked) {
  document.querySelectorAll("#loginPermissionGrid input[name='loginPermission']").forEach((input) => {
    input.checked = checked;
  });
}

async function loadUsers() {
  if (!hasPermission("users:manage")) {
    state.users = [];
    renderUsers();
    return;
  }
  state.users = await api("/api/users").catch(() => []);
  renderUsers();
}

function findUser(id) {
  return state.users.find((user) => user.id === id);
}

function loadUserPermissions(id) {
  const user = findUser(id);
  if (!user) return;
  setSelectedPermissions(user.permissions || []);
  toast(`已载入 ${user.username} 的权限`);
}

async function saveUserPermissions(id) {
  const user = findUser(id);
  if (!user) return;
  await api(`/api/users/${id}`, { method: "PUT", body: JSON.stringify({ permissions: collectSelectedPermissions() }) });
  toast(`已更新 ${user.username} 的权限`);
  await refreshWorkspace();
}

async function resetUserPassword(id) {
  const user = findUser(id);
  if (!user || !confirm(`确认将 ${user.username} 的密码重置为 123？`)) return;
  await api(`/api/users/${id}`, { method: "PUT", body: JSON.stringify({ password: "123" }) });
  toast(`已重置 ${user.username} 的密码`);
  await refreshWorkspace();
}

async function toggleUser(id) {
  const user = findUser(id);
  if (!user || !confirm(`确认${user.active ? "停用" : "启用"} ${user.username}？`)) return;
  await api(`/api/users/${id}`, { method: "PUT", body: JSON.stringify({ active: !user.active }) });
  toast(`已${user.active ? "停用" : "启用"} ${user.username}`);
  await refreshWorkspace();
}

function renderRecords() {
  $("#recordRows").innerHTML = state.records.map((record) => `
    <tr>
      <td>${escapeHtml(record.number)}</td>
      <td>${escapeHtml(record.title)}</td>
      <td>${record.rule} ${ruleName(record.rule)}</td>
      <td>${escapeHtml(record.version)}</td>
      <td><span class="status">${record.statusLabel || record.status}</span></td>
      <td>${escapeHtml(record.owner || "")}</td>
      <td>${record.attachments?.length || 0}</td>
      <td>${new Date(record.updatedAt).toLocaleString()}</td>
      <td><button data-open="${record.id}">详情</button></td>
    </tr>
  `).join("") || `<tr><td colspan="9">暂无记录</td></tr>`;
  $("#pageInfo").textContent = `第 ${state.page} 页 / 共 ${Math.max(1, Math.ceil(state.total / state.pageSize))} 页，${state.total} 条`;
  $("#recordRows").querySelectorAll("[data-open]").forEach((btn) => btn.addEventListener("click", () => openDetail(btn.dataset.open)));
}

function renderCategories() {
  const groupName = $("#groupSelect").value;
  const rows = groupOptions(groupName);
  $("#categoryRows").innerHTML = rows.map((item) => `
    <tr>
      <td>${escapeHtml(item.code)}</td>
      <td><input data-code="${escapeHtml(item.code)}" data-key="name" value="${escapeHtml(item.name || "")}"></td>
      <td><input data-code="${escapeHtml(item.code)}" data-key="nameEn" value="${escapeHtml(item.nameEn || "")}"></td>
      <td><input data-code="${escapeHtml(item.code)}" data-key="description" value="${escapeHtml(item.description || "")}"></td>
      <td>
        <button data-save-code="${escapeHtml(item.code)}">保存</button>
        <button class="danger" data-delete-code="${escapeHtml(item.code)}">删除</button>
      </td>
    </tr>
  `).join("");
  $("#categoryRows").querySelectorAll("[data-save-code]").forEach((btn) => btn.addEventListener("click", () => saveCategory(btn.dataset.saveCode)));
  $("#categoryRows").querySelectorAll("[data-delete-code]").forEach((btn) => btn.addEventListener("click", () => deleteCategory(btn.dataset.deleteCode)));
}

async function saveCategory(code) {
  const groupName = $("#groupSelect").value;
  const inputs = $$("#categoryRows input").filter((input) => input.dataset.code === code);
  const body = Object.fromEntries(inputs.map((input) => [input.dataset.key, input.value]));
  await api(`/api/groups/${groupName}/${encodeURIComponent(code)}`, { method: "PUT", body: JSON.stringify(body) });
  await refreshConfig();
  toast("分类已保存");
}

async function deleteCategory(code) {
  if (!confirm(`确认删除分类 ${code}？`)) return;
  await api(`/api/groups/${$("#groupSelect").value}/${encodeURIComponent(code)}`, { method: "DELETE" });
  await refreshConfig();
  toast("分类已删除");
}

async function refreshConfig() {
  state.config = await api("/api/config");
  renderFilters();
  buildFieldsForRule($("#ruleSelect").value || state.config.rules[0].code);
  renderCategories();
}

async function createRecord(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const body = Object.fromEntries(form.entries());
  body.fields = collectDynamicFields();
  const record = await api("/api/records", { method: "POST", body: JSON.stringify(body) });
  toast(`已生成 ${record.number}`);
  formElement.reset();
  switchView("records");
  $("#scopeFilter").value = "mine";
  state.page = 1;
  await refreshWorkspace();
}

async function openDetail(id) {
  const record = await api(`/api/records/${id}`);
  state.activeRecord = record;
  $("#detailNumber").textContent = record.number;
  $("#detailMeta").textContent = `${ruleName(record.rule)} · 创建于 ${new Date(record.createdAt).toLocaleString()}`;
  const form = $("#detailForm");
  ["title", "version", "status", "owner", "department", "project", "model", "relatedNumber", "description"].forEach((key) => {
    form.elements[key].value = record[key] || "";
  });
  renderAttachments(record);
  renderVersionHistory(record);
  applyPermissions();
  applyDetailPermissions();
  if (!$("#detailDialog").open) $("#detailDialog").showModal();
}

function renderAttachments(record) {
  $("#attachmentList").innerHTML = (record.attachments || []).map((item) => `
    <div class="attachment-item">
      <a href="${escapeHtml(item.url)}" target="_blank">${escapeHtml(item.name)}</a>
      <span>${formatSize(item.size)}</span>
      <button class="danger" data-attachment-delete="${item.id}">删除</button>
    </div>
  `).join("") || `<p>暂无附件。可上传图纸、照片、PDF、STEP 等文件。</p>`;
  $("#attachmentList").querySelectorAll("[data-attachment-delete]").forEach((btn) => btn.addEventListener("click", () => deleteAttachment(btn.dataset.attachmentDelete)));
  $("#attachmentList").querySelectorAll("[data-attachment-delete]").forEach((btn) => btn.classList.toggle("is-hidden", !canEditActiveRecord() || !hasPermission("records:attach")));
}

function renderVersionHistory(record) {
  const list = $("#versionHistoryList");
  const latest = $("#latestVersionLabel");
  if (!list || !latest) return;
  latest.textContent = record.recordKind === "revision"
    ? `修订申请：${record.sourceNumber || record.number} / ${record.version}`
    : record.status === "历史版本"
      ? `历史版本：${record.version || ""}`
    : `当前最新：${record.version || ""}`;
  const history = Array.isArray(record.revisionHistory) ? [...record.revisionHistory] : [];
  if (record.recordKind !== "revision" && record.approvalStatus === "approved" && !history.some((item) => item.version === record.version)) {
    history.push({ version: record.version, title: record.title, approvedAt: record.approvedAt, source: "current" });
  }
  history.sort((a, b) => String(a.version || "").localeCompare(String(b.version || ""), undefined, { numeric: true }));
  list.innerHTML = history.map((item) => `
    <div class="version-history-item">
      <strong>${escapeHtml(item.version || "")}</strong>
      <span>${escapeHtml(item.title || "")}</span>
      <small>${item.approvedAt ? new Date(item.approvedAt).toLocaleString() : ""}</small>
    </div>
  `).join("") || `<p class="muted">暂无版本历史，首次批准受控后会生成初始版本。</p>`;
}

function canEditActiveRecord() {
  if (!state.activeRecord) return false;
  if (state.activeRecord.locked || ["pending", "approved"].includes(state.activeRecord.approvalStatus) || ["评审中", "修订评审中", "受控", "历史版本"].includes(state.activeRecord.status)) return false;
  return hasPermission("records:update") &&
    (state.activeRecord.createdBy === state.user?.id || hasPermission("*")) &&
    !state.activeRecord?.locked &&
    !["pending", "approved"].includes(state.activeRecord?.approvalStatus) &&
    !["评审中", "修订评审中", "受控", "历史版本"].includes(state.activeRecord?.status);
}

function applyDetailPermissions() {
  const editable = canEditActiveRecord();
  const form = $("#detailForm");
  ["title", "version", "status", "owner", "department", "project", "model", "relatedNumber", "description"].forEach((key) => {
    if (form.elements[key]) form.elements[key].disabled = !editable;
  });
  if (form.elements.version && state.activeRecord?.recordKind === "revision") form.elements.version.disabled = true;
  if (form.elements.status) form.elements.status.disabled = true;
  $("#saveDetail")?.classList.toggle("is-hidden", !editable);
  $("#attachmentInput").disabled = !editable || !hasPermission("records:attach");
  $("#attachmentInput")?.classList.toggle("is-hidden", !editable || !hasPermission("records:attach"));
  const canSubmit = hasPermission("records:submit") &&
    state.activeRecord?.createdBy === state.user?.id &&
    ["draft", "rejected"].includes(state.activeRecord?.approvalStatus || "draft") &&
    !state.activeRecord?.locked;
  const isPending = state.activeRecord?.approvalStatus === "pending";
  const canWithdraw = hasPermission("records:submit") &&
    isPending &&
    (state.activeRecord?.createdBy === state.user?.id || hasPermission("*"));
  const isControlled = state.activeRecord?.status === "受控" && state.activeRecord?.approvalStatus === "approved" && state.activeRecord?.recordKind !== "revision" && state.activeRecord?.isLatest !== false;
  $("#submitApproval")?.classList.toggle("is-hidden", !canSubmit);
  $("#withdrawApproval")?.classList.toggle("is-hidden", !canWithdraw);
  $("#createEcn")?.classList.toggle("is-hidden", !hasPermission("ecn:create") || !isControlled);
  $("#createRevision")?.classList.toggle("is-hidden", !hasPermission("records:revise") || !isControlled);
  $("#approveRecord")?.classList.toggle("is-hidden", !hasPermission("records:approve") || !isPending);
  $("#rejectRecord")?.classList.toggle("is-hidden", !hasPermission("records:reject") || !isPending);
  $("#deleteRecord")?.classList.toggle("is-hidden", !hasPermission("records:delete"));
}

function formatSize(size) {
  if (!size) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

async function saveDetail() {
  const form = $("#detailForm");
  const body = Object.fromEntries(new FormData(form).entries());
  const record = await api(`/api/records/${state.activeRecord.id}`, { method: "PUT", body: JSON.stringify(body) });
  state.activeRecord = record;
  toast("记录已保存");
  await refreshWorkspace();
  renderAttachments(record);
}

async function saveActiveDetailSilently() {
  if (!state.activeRecord || !canEditActiveRecord()) return state.activeRecord;
  const form = $("#detailForm");
  const body = Object.fromEntries(new FormData(form).entries());
  const record = await api(`/api/records/${state.activeRecord.id}`, { method: "PUT", body: JSON.stringify(body) });
  state.activeRecord = record;
  return record;
}

async function deleteRecord() {
  if (!state.activeRecord || !confirm(`确认删除 ${state.activeRecord.number}？`)) return;
  await api(`/api/records/${state.activeRecord.id}`, { method: "DELETE" });
  $("#detailDialog").close();
  await refreshWorkspace();
  toast("记录已删除");
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadAttachments(event) {
  const input = event.currentTarget;
  const files = Array.from(input.files || []);
  if (!state.activeRecord || files.length === 0) return;
  for (const file of files) {
    const dataUrl = await fileToDataUrl(file);
    await api(`/api/records/${state.activeRecord.id}/attachments`, {
      method: "POST",
      body: JSON.stringify({ name: file.name, type: file.type || "application/octet-stream", dataUrl }),
    });
  }
  const record = await api(`/api/records/${state.activeRecord.id}`);
  state.activeRecord = record;
  renderAttachments(record);
  await refreshWorkspace();
  input.value = "";
  toast("附件已上传");
}

async function deleteAttachment(id) {
  await api(`/api/records/${state.activeRecord.id}/attachments/${id}`, { method: "DELETE" });
  const record = await api(`/api/records/${state.activeRecord.id}`);
  state.activeRecord = record;
  renderAttachments(record);
  await refreshWorkspace();
  toast("附件已删除");
}

async function addCategory(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const body = Object.fromEntries(new FormData(formElement).entries());
  await api(`/api/groups/${$("#groupSelect").value}`, { method: "POST", body: JSON.stringify(body) });
  formElement.reset();
  await refreshConfig();
  toast("分类已添加");
}

async function workflowAction(action) {
  if (!state.activeRecord) return;
  if (action === "submit") {
    await saveActiveDetailSilently();
  }
  const path = action === "ecn" ? "ecn" : action;
  const body = action === "ecn"
    ? { title: `ECN-${state.activeRecord.number}`, reason: "受控文件变更申请", impact: "待评估" }
    : { comment: action === "submit" ? "提交审批" : action === "approve" ? "批准受控" : action === "withdraw" ? "撤回修改" : "驳回修改" };
  const result = await api(`/api/records/${state.activeRecord.id}/${path}`, { method: "POST", body: JSON.stringify(body) });
  if (action !== "ecn") state.activeRecord = result;
  toast(action === "approve" ? "已批准受控" : action === "reject" ? "已驳回" : action === "withdraw" ? "已撤回，可继续修改" : action === "submit" ? "已提交评审" : "ECN 已创建");
  const record = await api(`/api/records/${state.activeRecord.id}`);
  state.activeRecord = record;
  await refreshWorkspace();
  openDetail(record.id);
}

async function createRevision() {
  if (!state.activeRecord) return;
  const revision = await api(`/api/records/${state.activeRecord.id}/revision`, {
    method: "POST",
    body: JSON.stringify({ comment: "创建修订申请" }),
  });
  toast(`已创建修订申请 ${revision.number}`);
  await refreshWorkspace();
  openDetail(revision.id);
}

async function approveRecordById(id) {
  const record = await api(`/api/records/${id}/approve`, { method: "POST", body: JSON.stringify({ comment: "管理员批准" }) });
  toast(`已批准 ${record.number}`);
  await refreshWorkspace();
}

async function rejectRecordById(id) {
  const record = await api(`/api/records/${id}/reject`, { method: "POST", body: JSON.stringify({ comment: "管理员驳回" }) });
  toast(`已驳回 ${record.number}`);
  await refreshWorkspace();
}

function renderTrace() {
  $("#snRows").innerHTML = state.trace.serialNumbers.map((item) => `
    <tr><td>${escapeHtml(item.number)}</td><td>${escapeHtml(item.model)}</td><td>${escapeHtml(item.yearMonth)}</td><td>${escapeHtml(item.customer || "")}</td><td>${escapeHtml(item.relatedRecordNumber || "")}</td></tr>
  `).join("") || `<tr><td colspan="5">暂无 SN 记录</td></tr>`;
  $("#bomRows").innerHTML = state.trace.bomLinks.map((item) => `
    <tr><td>${escapeHtml(item.parentNumber)}</td><td>${escapeHtml(item.childNumber)}</td><td>${escapeHtml(item.quantity)}</td><td>${escapeHtml(item.usage || "")}</td></tr>
  `).join("") || `<tr><td colspan="4">暂无 BOM 关联</td></tr>`;
  $("#ecnRows").innerHTML = state.trace.ecns.map((item) => `
    <tr><td>${escapeHtml(item.number)}</td><td>${escapeHtml(item.recordNumber)}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.reason || "")}</td><td>${escapeHtml(item.impact || "")}</td><td>${escapeHtml(item.status)}</td></tr>
  `).join("") || `<tr><td colspan="6">暂无 ECN 记录</td></tr>`;
}

function renderAudit() {
  $("#auditRows").innerHTML = state.audit.map((item) => `
    <tr>
      <td>${item.at ? new Date(item.at).toLocaleString() : ""}</td>
      <td>${escapeHtml(item.user?.username || "")}</td>
      <td>${escapeHtml(item.user?.roleName || "")}</td>
      <td>${escapeHtml(item.action || "")}</td>
      <td>${escapeHtml(item.number || item.recordId || item.groupName || item.ecnId || item.snId || item.linkId || "")}</td>
      <td>${escapeHtml(Object.entries(item).filter(([key]) => !["id", "user", "userId", "at", "action"].includes(key)).map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`).join("；"))}</td>
    </tr>
  `).join("") || `<tr><td colspan="6">暂无日志</td></tr>`;
}

async function loadTrace() {
  const [ecns, serialNumbers, bomLinks] = await Promise.all([
    api("/api/ecns").catch(() => []),
    api("/api/serial-numbers").catch(() => []),
    api("/api/bom-links").catch(() => []),
  ]);
  state.trace = { ecns, serialNumbers, bomLinks };
  renderTrace();
}

async function loadAudit() {
  if (!hasPermission("audit:read")) {
    state.audit = [];
    renderAudit();
    return;
  }
  state.audit = await api("/api/audit?limit=200").catch(() => []);
  renderAudit();
}

async function createEcnFromForm(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const body = Object.fromEntries(new FormData(formElement).entries());
  const ecn = await api("/api/ecns", { method: "POST", body: JSON.stringify(body) });
  toast(`已创建 ${ecn.number}`);
  formElement.reset();
  await refreshWorkspace();
}

async function createSerialNumber(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const body = Object.fromEntries(new FormData(formElement).entries());
  const sn = await api("/api/serial-numbers", { method: "POST", body: JSON.stringify(body) });
  toast(`已生成 ${sn.number}`);
  formElement.reset();
  await refreshWorkspace();
}

async function createBomLink(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const body = Object.fromEntries(new FormData(formElement).entries());
  await api("/api/bom-links", { method: "POST", body: JSON.stringify(body) });
  toast("BOM 关联已添加");
  formElement.reset();
  await refreshWorkspace();
}

async function createUser(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const body = Object.fromEntries(new FormData(formElement).entries());
  body.permissions = collectSelectedPermissions();
  const user = await api("/api/users", { method: "POST", body: JSON.stringify(body) });
  toast(`已创建账号 ${user.username}`);
  formElement.reset();
  document.querySelectorAll("#permissionGrid input[name='permission']").forEach((input) => { input.checked = false; });
  await refreshWorkspace();
}

async function login(event) {
  event.preventDefault();
  const body = {
    username: "admin",
    password: "123",
    permissions: collectLoginPermissions(),
  };
  await api("/api/auth/login", { method: "POST", body: JSON.stringify(body) });
  const me = await api("/api/auth/me");
  state.user = me.user;
  state.permissionCatalog = me.permissions || [];
  document.body.classList.add("authenticated");
  applyPermissions();
  await loadAppData();
  toast(`欢迎，${state.user.name}`);
}

async function logout() {
  await api("/api/auth/logout", { method: "POST" }).catch(() => {});
  state.user = null;
  document.body.classList.remove("authenticated");
  renderLoginPermissionGrid();
  $("#loginScreen").style.display = "grid";
}

async function refreshAll() {
  if (!hasPermission("records:read")) {
    state.stats = { total: 0, attachments: 0, byStatus: {}, byRule: {} };
    state.records = [];
    state.total = 0;
    renderRecords();
    renderDashboard();
    return;
  }
  state.stats = await api("/api/stats");
  await loadRecords();
  renderDashboard();
}

async function refreshWorkspace() {
  await refreshAll();
  await loadApprovals();
  await loadTrace();
  await loadAudit();
  await loadUsers();
}

async function loadAppData() {
  state.config = await api("/api/config");
  renderFilters();
  renderPermissionGrid();
  buildFieldsForRule(state.config.rules[0].code);
  renderCategories();
  applyPermissions();
  await refreshAll();
  await loadTrace();
  await loadAudit();
  await loadApprovals();
  await loadUsers();
}

function bindEvents() {
  $$(".nav-item").forEach((btn) => btn.addEventListener("click", () => switchView(btn.dataset.view)));
  $("#loginForm").addEventListener("submit", login);
  $("#selectAllLoginPermissions").addEventListener("click", () => setLoginPermissions(true));
  $("#clearLoginPermissions").addEventListener("click", () => setLoginPermissions(false));
  $("#logoutButton").addEventListener("click", logout);
  $("#ruleSelect").addEventListener("change", (event) => buildFieldsForRule(event.target.value));
  $("#createForm").addEventListener("submit", createRecord);
  $("#resetCreate").addEventListener("click", () => {
    $("#createForm").reset();
    buildFieldsForRule($("#ruleSelect").value);
  });
  $("#refreshRecords").addEventListener("click", () => {
    state.page = 1;
    loadRecords();
  });
  $("#searchInput").addEventListener("input", () => {
    clearTimeout(window.__searchTimer);
    window.__searchTimer = setTimeout(() => {
      state.page = 1;
      loadRecords();
    }, 250);
  });
  $("#ruleFilter").addEventListener("change", () => {
    state.page = 1;
    loadRecords();
  });
  $("#scopeFilter").addEventListener("change", () => {
    state.page = 1;
    loadRecords();
  });
  $("#statusFilter").addEventListener("change", () => {
    state.page = 1;
    loadRecords();
  });
  $("#prevPage").addEventListener("click", () => {
    if (state.page > 1) {
      state.page -= 1;
      loadRecords();
    }
  });
  $("#nextPage").addEventListener("click", () => {
    if (state.page * state.pageSize < state.total) {
      state.page += 1;
      loadRecords();
    }
  });
  $("#groupSelect").addEventListener("change", renderCategories);
  $("#categoryForm").addEventListener("submit", addCategory);
  $("#saveDetail").addEventListener("click", saveDetail);
  $("#deleteRecord").addEventListener("click", deleteRecord);
  $("#attachmentInput").addEventListener("change", uploadAttachments);
  $("#submitApproval").addEventListener("click", () => workflowAction("submit"));
  $("#withdrawApproval").addEventListener("click", () => workflowAction("withdraw"));
  $("#approveRecord").addEventListener("click", () => workflowAction("approve"));
  $("#rejectRecord").addEventListener("click", () => workflowAction("reject"));
  $("#createRevision").addEventListener("click", createRevision);
  $("#createEcn").addEventListener("click", () => workflowAction("ecn"));
  $("#ecnForm").addEventListener("submit", createEcnFromForm);
  $("#snForm").addEventListener("submit", createSerialNumber);
  $("#bomForm").addEventListener("submit", createBomLink);
  $("#userForm").addEventListener("submit", createUser);
}

async function init() {
  bindEvents();
  const me = await api("/api/auth/me");
  state.permissionCatalog = me.permissions || [];
  if (!me.user) {
    document.body.classList.remove("authenticated");
    renderLoginPermissionGrid();
    $("#loginScreen").style.display = "grid";
    return;
  }
  state.user = me.user;
  renderLoginPermissionGrid();
  document.body.classList.add("authenticated");
  await loadAppData();
}

init().catch((error) => {
  console.error(error);
  toast(error.message);
});
