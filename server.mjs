import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "data");
const uploadDir = path.join(dataDir, "uploads");
const dbPath = path.join(dataDir, "db.json");
const port = Number(process.env.PORT || 4173);
const sessionDays = 7;

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".step": "application/octet-stream",
  ".stp": "application/octet-stream",
  ".dwg": "application/octet-stream",
  ".sldprt": "application/octet-stream",
  ".sldasm": "application/octet-stream",
};

const defaultConfig = {
  company: { code: "BZ", name: "上海泊展科技", domain: "水下清洗机器人" },
  rules: [
    { code: "PD", name: "产品图样", pattern: "BZ-PD-{product}-{module}-{drawingType}-{seq3}", groups: ["productCategories", "systemModules", "drawingTypes"], description: "整机、部件、组件、零件图" },
    { code: "GP", name: "通用件", pattern: "BZ-GP-{gpType}-{seq3}", groups: ["gpTypes"], description: "企业内部复用件" },
    { code: "SP", name: "标准件", pattern: "BZ-SP-{spType}-{seq3}", groups: ["spTypes"], description: "国标件、外购标准件引用" },
    { code: "TL", name: "工装", pattern: "BZ-TL-{toolingType}-{seq3}", groups: ["toolingTypes"], description: "装配、定位、测试、维修工装" },
    { code: "IG", name: "检具", pattern: "BZ-IG-{inspectionType}-{seq3}", groups: ["inspectionTypes"], description: "尺寸、电气、水密、功能检测治具" },
    { code: "MT", name: "材料", pattern: "BZ-MT-{materialType}-{seq3}", groups: ["materialTypes"], description: "原材料、型材、板材、特殊材料" },
    { code: "BL", name: "毛坯", pattern: "BZ-BL-{product}-{materialType}-{seq3}", groups: ["productCategories", "materialTypes"], description: "加工前毛坯或专用坯料" },
    { code: "PK", name: "包装", pattern: "BZ-PK-{packageType}-{seq3}", groups: ["packageTypes"], description: "包装箱、内衬、标签" },
    { code: "TR", name: "运输", pattern: "BZ-TR-{transportType}-{seq3}", groups: ["transportTypes"], description: "运输框架、周转架、运输箱" },
    { code: "TD", name: "技术文件", pattern: "BZ-TD-{documentType}-{seq3}", groups: ["documentTypes"], description: "工艺、检验、测试、说明书" },
    { code: "SW", name: "软件/电控文件", pattern: "BZ-SW-{softwareType}-{seq3}", groups: ["softwareTypes"], description: "固件、上位机、配置文件" }
  ],
  groups: {
    productCategories: [
      ["01", "水下清洗机器人", "Underwater Cleaning Robot", "整机及核心产品平台"],
      ["02", "水下作业工具/附件", "Underwater Tool", "可单独销售或挂载的工具"],
      ["03", "岸基控制设备", "Deck Control Equipment", "岸基控制箱、遥控台"],
      ["04", "测试验证设备", "Test Platform", "研发和试制测试平台"],
      ["05", "通用产品平台", "Common Platform", "跨产品复用平台"],
      ["99", "预留", "Reserved", "后期扩展"]
    ],
    systemModules: [
      ["00", "整机/总成", "Assembly", "整机级图样"],
      ["01", "机架与外壳", "Frame & Shell", "骨架、外壳、防护罩"],
      ["02", "密封与耐压结构", "Sealing & Pressure", "密封舱、端盖、视窗"],
      ["03", "推进系统", "Thruster", "推进器、安装架、导流罩"],
      ["04", "清洗执行系统", "Cleaning Actuator", "滚刷、盘刷、高压水清洗部件"],
      ["05", "吸附/贴附系统", "Attachment", "负压、磁吸、履带贴附"],
      ["06", "浮力与姿态调节", "Buoyancy & Attitude", "浮力块、配重、姿态调节"],
      ["07", "电控系统", "Electrical Control", "控制箱、电控安装件"],
      ["08", "线束与连接器", "Harness & Connector", "线束、接插件、走线件"],
      ["09", "传感器与视觉", "Sensor & Vision", "摄像头、灯光、传感器"],
      ["10", "通讯与遥控", "Communication", "通信模块、遥控器"],
      ["11", "供电系统", "Power", "电池、电源、配电"],
      ["12", "管路/水路", "Piping", "水管、喷嘴、阀组"],
      ["99", "预留", "Reserved", "后期扩展"]
    ],
    drawingTypes: [
      ["00", "整机总图", "General Drawing", "整机级总图"],
      ["01", "部件图", "Subassembly Drawing", "功能部件图"],
      ["02", "装配图", "Assembly Drawing", "装配关系图"],
      ["03", "零件图", "Part Drawing", "单件加工图"],
      ["04", "安装图", "Installation Drawing", "安装位置/接口"],
      ["05", "爆炸图", "Exploded Drawing", "装配分解关系"],
      ["06", "接口图", "Interface Drawing", "机械/电气接口"],
      ["99", "其他", "Other", "专项图样"]
    ],
    gpTypes: [["SE", "密封件", "Seal", "通用 O 型圈、密封垫"], ["CN", "连接件/接插件", "Connector", "通用水密接插件"], ["FX", "紧固件", "Fastener", "通用固定件"], ["BR", "支架", "Bracket", "跨产品复用支架"], ["CB", "线缆附件", "Cable Accessory", "线夹、扎带座"], ["RB", "橡胶件", "Rubber", "减震垫"], ["OT", "其他", "Other", "临时扩展"]],
    spTypes: [["FX", "紧固件", "Fastener", "螺钉、螺母、垫圈"], ["SE", "标准密封件", "Seal", "标准 O 型圈、油封"], ["CN", "标准连接器", "Connector", "外购标准接插件"], ["BE", "轴承", "Bearing", "标准轴承"], ["EL", "电气件", "Electrical", "标准电气元件"], ["OT", "其他", "Other", "临时扩展"]],
    toolingTypes: [["AS", "装配工装", "Assembly", "装配定位、压装"], ["PS", "定位工装", "Positioning", "零部件定位固定"], ["WT", "水密测试工装", "Waterproof Test", "密封、水压、浸水测试"], ["MT", "维修工装", "Maintenance", "售后维修拆装"], ["LD", "吊装/搬运工装", "Lifting", "吊装、翻转、转运"], ["OT", "其他", "Other", "临时扩展"]],
    inspectionTypes: [["DM", "尺寸检具", "Dimension", "尺寸、形位、装配尺寸检测"], ["SE", "密封检测", "Seal", "密封圈、压缩量、漏点检查"], ["EL", "电气检测", "Electrical", "导通、绝缘、耐压"], ["PR", "压力检测", "Pressure", "耐压、压力保持"], ["FN", "功能检测", "Function", "功能验证、性能检查"], ["OT", "其他", "Other", "临时扩展"]],
    materialTypes: [["AL", "铝材", "Aluminum", "铝板、铝棒、铝型材"], ["SS", "不锈钢", "Stainless Steel", "不锈钢板、棒、轴料"], ["PL", "塑料", "Plastic", "POM、尼龙、PEEK"], ["RB", "橡胶", "Rubber", "密封橡胶、减震橡胶"], ["FM", "浮力材料", "Foam", "浮力块、深水浮力材料"], ["PC", "透明材料", "Polycarbonate", "透明盖板、视窗材料"], ["CF", "复合材料", "Composite", "碳纤维、玻纤"], ["CT", "涂层/防腐材料", "Coating", "防腐涂料、表面处理材料"], ["OT", "其他", "Other", "临时扩展"]],
    packageTypes: [["WC", "木箱", "Wooden Case", "整机或重型设备包装"], ["CT", "纸箱", "Carton", "轻型部件包装"], ["FO", "泡棉/内衬", "Foam", "防震、防护内衬"], ["BG", "包装袋", "Bag", "小件、防潮包装"], ["LB", "标签/铭牌", "Label", "包装标签、识别标签"], ["OT", "其他", "Other", "临时扩展"]],
    transportTypes: [["FR", "运输框架", "Frame", "整机或大部件固定运输"], ["BX", "运输箱", "Box", "可重复使用运输箱"], ["RT", "周转架", "Rack", "车间或仓储周转"], ["OT", "其他", "Other", "临时扩展"]],
    documentTypes: [["DS", "设计规范", "Design Specification", "设计要求、接口规范"], ["PI", "工艺文件", "Process Instruction", "装配、加工、作业指导"], ["QI", "检验文件", "Quality Inspection", "来料、过程、出厂检验"], ["TP", "测试规程", "Test Procedure", "水密、功能、寿命测试"], ["UM", "用户手册", "User Manual", "客户使用说明"], ["MM", "维护手册", "Maintenance Manual", "维修、保养、售后"], ["BOM", "BOM 文件", "Bill of Material", "物料清单"], ["ECN", "工程变更", "Engineering Change Notice", "设计变更通知"], ["OT", "其他", "Other", "临时扩展"]],
    softwareTypes: [["FW", "固件", "Firmware", "嵌入式控制程序"], ["APP", "上位机/应用程序", "Application", "岸基控制软件、调试软件"], ["UI", "界面", "User Interface", "操作界面、HMI"], ["CFG", "配置文件", "Configuration", "参数、标定、设备配置"], ["LOG", "日志模板", "Log Template", "运行日志、测试日志模板"], ["OT", "其他", "Other", "临时扩展"]]
  }
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

const permissionCatalog = [
  ["*", "全部权限"],
  ["records:read", "查看编号"],
  ["records:create", "新建编号"],
  ["records:update", "修改草稿/驳回记录"],
  ["records:attach", "上传/删除附件"],
  ["records:submit", "提交审批"],
  ["records:revise", "创建修订申请"],
  ["approvals:read", "查看待审批"],
  ["records:approve", "审批通过"],
  ["records:reject", "审批退回"],
  ["records:delete", "删除记录"],
  ["categories:manage", "分类维护"],
  ["users:manage", "账户管理"],
  ["audit:read", "查看修改日志"],
  ["config:manage", "系统配置"],
  ["ecn:read", "查看 ECN"],
  ["ecn:create", "创建 ECN"],
  ["sn:read", "查看 SN"],
  ["sn:manage", "管理 SN"],
  ["bom:read", "查看 BOM"],
  ["bom:manage", "管理 BOM"],
  ["export:read", "导出数据"],
].map(([code, name]) => ({ code, name }));

const permissionCodes = new Set(permissionCatalog.map((item) => item.code));
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
  const selected = Array.isArray(permissions) ? permissions.filter((permission) => permissionCodes.has(permission)) : [];
  if (selected.includes("*")) return ["*"];
  const expanded = new Set(selected);
  for (const permission of selected) {
    for (const implied of permissionImplications[permission] || []) expanded.add(implied);
  }
  return [...expanded];
}

const legacyRolePermissions = {
  admin: ["*"],
  engineer: ["records:read", "records:create", "records:update", "records:attach", "records:submit", "records:revise", "ecn:create", "sn:manage", "bom:manage", "export:read"],
  reviewer: ["records:read", "ecn:read", "sn:read", "bom:read", "export:read"],
  viewer: ["records:read", "ecn:read", "sn:read", "bom:read", "export:read"],
};

const roleNames = {
  admin: "系统管理员",
  engineer: "工程师",
  reviewer: "评审员",
  viewer: "只读用户",
};

const defaultUsers = [
  { username: "admin", name: "测试账号", role: "custom", permissions: ["*"], password: "123" },
  { username: "engineer", name: "研发工程师", role: "custom", permissions: legacyRolePermissions.engineer, password: "eng123" },
  { username: "reviewer", name: "只读评审测试", role: "custom", permissions: legacyRolePermissions.reviewer, password: "rev123" },
  { username: "viewer", name: "只读访客", role: "custom", permissions: legacyRolePermissions.viewer, password: "view123" },
];

function normalizeGroups(groups) {
  return Object.fromEntries(Object.entries(groups).map(([key, rows]) => [
    key,
    rows.map((row) => Array.isArray(row) ? { code: row[0], name: row[1], nameEn: row[2], description: row[3] || "" } : row)
  ]));
}

async function ensureDb() {
  await fs.mkdir(uploadDir, { recursive: true });
  try {
    const raw = await fs.readFile(dbPath, "utf8");
    const db = JSON.parse(raw);
    db.config.groups = normalizeGroups(db.config.groups || {});
    db.records ||= [];
    db.counters ||= {};
    db.audit ||= [];
    db.users ||= defaultUsers.map(createUser);
    db.sessions ||= {};
    db.ecns ||= [];
    db.serialNumbers ||= [];
    db.bomLinks ||= [];
    const beforeMigration = JSON.stringify(db);
    migrateUsers(db);
    migrateVersionHistories(db);
    if (JSON.stringify(db) !== beforeMigration) await saveDb(db);
    return db;
  } catch {
    const db = {
      config: { ...defaultConfig, groups: normalizeGroups(defaultConfig.groups) },
      records: [],
      counters: {},
      users: defaultUsers.map(createUser),
      sessions: {},
      ecns: [],
      serialNumbers: [],
      bomLinks: [],
      audit: [],
      createdAt: new Date().toISOString()
    };
    await saveDb(db);
    return db;
  }
}

async function saveDb(db) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(dbPath, JSON.stringify(db, null, 2), "utf8");
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, passwordHash) {
  const [salt, hash] = String(passwordHash || "").split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(String(password), salt, 64);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), candidate);
}

function createUser(user) {
  return {
    id: crypto.randomUUID(),
    username: user.username,
    name: user.name,
    role: user.role || "custom",
    permissions: normalizePermissions(Array.isArray(user.permissions) ? user.permissions : (legacyRolePermissions[user.role] || [])),
    active: true,
    passwordHash: hashPassword(user.password),
    createdAt: new Date().toISOString(),
  };
}

function migrateUsers(db) {
  for (const user of db.users) {
    if (user.password && !user.passwordHash) {
      user.passwordHash = hashPassword(user.password);
      delete user.password;
    }
    user.active ??= true;
    user.role ||= "custom";
    if (!Array.isArray(user.permissions)) {
      user.permissions = legacyRolePermissions[user.role] || [];
    }
    user.permissions = normalizePermissions(user.permissions);
    if (user.username === "admin") {
      user.name = "测试账号";
      user.role = "custom";
      user.passwordHash = hashPassword("123");
      user.permissions = ["*"];
    }
  }
  for (const fallback of defaultUsers) {
    if (!db.users.some((user) => user.username === fallback.username)) {
      db.users.push(createUser(fallback));
    }
  }
}

function migrateVersionHistories(db) {
  const approvedByNumber = new Map();
  for (const record of db.records || []) {
    if (!record.deleted && record.number && record.approvalStatus === "approved") {
      approvedByNumber.set(record.number, [...(approvedByNumber.get(record.number) || []), record]);
    }
  }

  for (const source of db.records || []) {
    if (!source || source.deleted || source.recordKind === "revision" || source.approvalStatus !== "approved") continue;
    const approvedRevisions = (db.records || [])
      .filter((record) => !record.deleted && record.recordKind === "revision" && record.sourceRecordId === source.id && record.approvalStatus === "approved")
      .sort((a, b) => String(a.version || "").localeCompare(String(b.version || ""), undefined, { numeric: true }));
    if (!approvedRevisions.length) continue;
    const latestRevision = approvedRevisions[approvedRevisions.length - 1];
    if (source.version !== latestRevision.version && !source.revisionHistory?.some((item) => item.revisionId)) continue;

    source.version = previousVersion(approvedRevisions[0].version);
    source.status = "历史版本";
    source.changeStatus = "";
    source.locked = true;
    source.isLatest = false;
    source.rootRecordId ||= source.id;

    for (const revision of approvedRevisions) {
      revision.recordKind = "normal";
      revision.status = revision.id === latestRevision.id ? "受控" : "历史版本";
      revision.changeStatus = "";
      revision.locked = true;
      revision.isLatest = revision.id === latestRevision.id;
      revision.rootRecordId = source.rootRecordId || source.id;
      revision.sourceRecordId = source.id;
      revision.sourceNumber = source.number;
      revision.hiddenFromLedger = false;
    }
  }

  for (const records of approvedByNumber.values()) {
    const normalRecords = records.filter((record) => record.recordKind !== "revision");
    if (!normalRecords.length) continue;
    normalRecords.sort((a, b) => String(a.version || "").localeCompare(String(b.version || ""), undefined, { numeric: true }));
    const latest = normalRecords[normalRecords.length - 1];
    const rootRecordId = normalRecords[0].rootRecordId || normalRecords[0].id;

    for (const record of normalRecords) {
      record.rootRecordId ||= rootRecordId;
      record.locked = true;
      record.isLatest = record.id === latest.id;
      record.status = record.isLatest ? "受控" : "历史版本";
      record.changeStatus = record.isLatest ? (record.changeStatus || "") : "";
    }

    if (latest.version !== "A0" && !records.some((record) => record.version === "A0" && record.recordKind !== "revision")) {
      db.records.push({
        ...latest,
        id: crypto.randomUUID(),
        version: "A0",
        title: "历史初始版本（系统补录）",
        status: "历史版本",
        changeStatus: "",
        description: "旧数据迁移补录：原始版本内容已被历史流程覆盖，无法反推。",
        attachments: [],
        revisionHistory: [],
        locked: true,
        isLatest: false,
        rootRecordId,
        sourceRecordId: "",
        sourceNumber: latest.number,
        hiddenFromLedger: false,
        createdAt: latest.createdAt || latest.approvedAt || new Date().toISOString(),
        updatedAt: latest.updatedAt || latest.approvedAt || new Date().toISOString()
      });
    }

    for (const revision of records.filter((record) => record.recordKind === "revision")) {
      revision.rootRecordId ||= rootRecordId;
      revision.sourceRecordId ||= latest.id;
      revision.sourceNumber ||= latest.number;
      revision.locked = true;
      revision.changeStatus = "";
      if (revision.version === latest.version) {
        revision.hiddenFromLedger = true;
        continue;
      }
      revision.recordKind = "normal";
      revision.status = "历史版本";
      revision.isLatest = false;
    }
  }

  for (const record of db.records || []) {
    if (record.deleted || record.recordKind === "revision" || record.approvalStatus !== "approved") continue;
    record.revisionHistory ||= [];
    if (record.version !== "A0" && !record.revisionHistory.some((item) => item.version === "A0")) {
      record.revisionHistory.unshift({
        recordId: record.id,
        number: record.number,
        version: "A0",
        title: "历史初始版本（系统补录）",
        status: "受控",
        owner: record.owner || "",
        department: record.department || "",
        project: record.project || "",
        model: record.model || "",
        relatedNumber: record.relatedNumber || "",
        description: "旧数据迁移补录：原始版本内容已被历史流程覆盖，无法反推。",
        attachments: [],
        approvedBy: record.approvedBy || "",
        approvedAt: record.createdAt || record.approvedAt || "",
        source: "legacy"
      });
    }
  }
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "").split(";").map((part) => {
    const idx = part.indexOf("=");
    if (idx < 0) return ["", ""];
    return [part.slice(0, idx).trim(), decodeURIComponent(part.slice(idx + 1).trim())];
  }).filter(([key]) => key));
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    roleName: user.permissions?.includes("*") ? "全部权限" : "自定义权限",
    active: user.active !== false,
    sessionPermissions: Boolean(user.sessionPermissions),
    permissions: normalizePermissions(user.permissions || []),
  };
}

function getSessionUser(db, req) {
  const token = parseCookies(req).bz_session || req.headers["x-session-token"];
  if (!token) return null;
  const session = db.sessions[token];
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) {
    if (session) delete db.sessions[token];
    return null;
  }
  const user = db.users.find((item) => item.id === session.userId && item.active !== false);
  if (!user) return null;
  if (Array.isArray(session.permissions)) {
    return { ...user, permissions: session.permissions, sessionPermissions: true };
  }
  return user;
}

function hasPermission(user, permission) {
  const permissions = normalizePermissions(user?.permissions || legacyRolePermissions[user?.role] || []);
  return permissions.includes("*") || permissions.includes(permission);
}

function requireUser(db, req) {
  const user = getSessionUser(db, req);
  if (!user) throw Object.assign(new Error("请先登录"), { status: 401 });
  return user;
}

function requirePermission(user, permission) {
  if (!hasPermission(user, permission)) {
    throw Object.assign(new Error("当前账号没有此操作权限"), { status: 403 });
  }
}

function setSessionCookie(res, token, expiresAt) {
  const maxAge = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
  res.setHeader("Set-Cookie", `bz_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "bz_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
}

function send(res, status, payload, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type.startsWith("application/json") ? JSON.stringify(payload) : payload);
}

async function readJson(req, maxBytes = 30 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error("Payload too large"), { status: 413 });
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function getRule(db, code) {
  const rule = db.config.rules.find((item) => item.code === code);
  if (!rule) throw Object.assign(new Error("未知编号规则"), { status: 400 });
  return rule;
}

function getCounterKey(rule, fields) {
  return [rule.code, ...rule.groups.map((group) => fields[group] || "")].join("|");
}

function renderPattern(pattern, fields, sequence) {
  return pattern.replace(/\{(\w+)\}/g, (_, key) => {
    if (key === "seq3") return String(sequence).padStart(3, "0");
    if (key === "seq4") return String(sequence).padStart(4, "0");
    if (key === "seq5") return String(sequence).padStart(5, "0");
    return fields[key] || "";
  });
}

function toPatternFields(fields) {
  const patternFields = { ...fields };
  for (const [groupName, alias] of Object.entries(fieldAliases)) {
    if (fields[groupName]) patternFields[alias] = fields[groupName];
  }
  return patternFields;
}

function validateFields(rule, fields) {
  for (const group of rule.groups) {
    if (!fields[group]) {
      throw Object.assign(new Error(`缺少分类字段：${group}`), { status: 400 });
    }
  }
}

function publicRecord(record) {
  const statusLabel = record.changeStatus ? `${record.status}（${record.changeStatus}）` : record.status;
  const isLatest = record.isLatest ?? (record.status === "受控" && record.approvalStatus === "approved" && record.recordKind !== "revision");
  return { ...record, isLatest, statusLabel, deleted: undefined };
}

function canManageApprovals(user) {
  return hasPermission(user, "*") || hasPermission(user, "approvals:read") || hasPermission(user, "records:approve") || hasPermission(user, "records:reject");
}

function canReadRecord(user, record) {
  if (!record || record.deleted || record.hiddenFromLedger) return false;
  if (hasPermission(user, "*")) return true;
  if (record.createdBy === user.id) return true;
  if (record.approvalStatus === "pending" && canManageApprovals(user)) return true;
  return record.recordKind !== "revision" && ["受控", "历史版本"].includes(record.status) && record.approvalStatus === "approved";
}

function shouldShowInLedger(record, scope) {
  if (!record || record.deleted || record.hiddenFromLedger) return false;
  if (scope === "pending") return record.approvalStatus === "pending";
  return !(record.recordKind === "revision" && record.approvalStatus === "approved");
}

function canEditRecord(user, record) {
  if (record.locked || record.status === "受控" || record.status === "历史版本" || record.status === "评审中" || record.status === "修订评审中" || record.approvalStatus === "approved" || record.approvalStatus === "pending") return false;
  if (!hasPermission(user, "records:update")) return false;
  if (record.createdBy !== user.id && !hasPermission(user, "*")) return false;
  return true;
}

function canSubmitRecord(user, record) {
  if (!hasPermission(user, "records:submit")) return false;
  if (record.createdBy !== user.id && !hasPermission(user, "*")) return false;
  return !record.locked && ["draft", "rejected"].includes(record.approvalStatus || "draft");
}

function nextCounter(db, key) {
  const seq = (db.counters[key] || 0) + 1;
  db.counters[key] = seq;
  return seq;
}

function nextVersion(version = "A0") {
  const text = String(version || "A0").trim().toUpperCase();
  const match = text.match(/^([A-Z]+)(\d+)$/);
  if (!match) return "A1";
  return `${match[1]}${Number(match[2]) + 1}`;
}

function previousVersion(version = "A1") {
  const text = String(version || "A1").trim().toUpperCase();
  const match = text.match(/^([A-Z]+)(\d+)$/);
  if (!match) return "A0";
  return `${match[1]}${Math.max(0, Number(match[2]) - 1)}`;
}

function cloneAttachments(attachments = []) {
  return attachments.map((item) => ({ ...item }));
}

function versionSnapshot(record, meta = {}) {
  return {
    recordId: record.id,
    number: record.number,
    version: record.version,
    title: record.title,
    status: "受控",
    owner: record.owner || "",
    department: record.department || "",
    project: record.project || "",
    model: record.model || "",
    relatedNumber: record.relatedNumber || "",
    description: record.description || "",
    attachments: cloneAttachments(record.attachments || []),
    approvedBy: record.approvedBy || meta.approvedBy || "",
    approvedAt: record.approvedAt || meta.approvedAt || "",
    source: meta.source || "record"
  };
}

function ensureVersionSnapshot(record, meta = {}) {
  record.revisionHistory ||= [];
  if (record.version && !record.revisionHistory.some((item) => item.version === record.version)) {
    record.revisionHistory.push(versionSnapshot(record, meta));
  }
}

function approveRevisionAsNewVersion(db, source, revision, currentUser, now) {
  const sourceVersion = source.version;
  ensureVersionSnapshot(source, { approvedBy: source.approvedBy, approvedAt: source.approvedAt, source: "baseline" });
  source.version = sourceVersion;
  source.status = "历史版本";
  source.changeStatus = "";
  source.approvalStatus = "approved";
  source.locked = true;
  source.isLatest = false;
  source.updatedAt = now;

  revision.recordKind = "normal";
  revision.status = "受控";
  revision.changeStatus = "";
  revision.approvalStatus = "approved";
  revision.locked = true;
  revision.isLatest = true;
  revision.rootRecordId = source.rootRecordId || source.id;
  revision.sourceRecordId = source.id;
  revision.sourceNumber = source.number;
  revision.approvedBy = currentUser.id;
  revision.approvedAt = now;
  revision.updatedAt = now;
  revision.revisionHistory = [...(source.revisionHistory || [])];
  if (!revision.revisionHistory.some((item) => item.version === revision.version)) {
    revision.revisionHistory.push(versionSnapshot(revision, { approvedBy: currentUser.id, approvedAt: now, source: "revision" }));
  }

  for (const item of db.records) {
    if (!item.deleted && item.id !== revision.id && item.number === revision.number && item.approvalStatus === "approved" && item.recordKind !== "revision") {
      item.isLatest = false;
      if (item.status === "受控") item.status = "历史版本";
      item.locked = true;
      item.changeStatus = "";
    }
  }
}

function toCsv(records) {
  const headers = ["number", "title", "rule", "version", "status", "owner", "department", "project", "model", "createdAt", "updatedAt", "description"];
  const esc = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [headers.join(","), ...records.map((record) => headers.map((key) => esc(record[key])).join(","))].join("\n");
}

async function handleApi(req, res, url) {
  const db = await ensureDb();
  const parts = url.pathname.split("/").filter(Boolean);

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readJson(req);
    const username = String(body.username || "admin").trim() || "admin";
    const password = String(body.password || "123");
    const user = db.users.find((item) => item.username === username && item.active !== false);
    const testLogin = username === "admin" && password === "123";
    if (!user || (!verifyPassword(password, user.passwordHash) && !testLogin)) {
      throw Object.assign(new Error("用户名或密码不正确"), { status: 401 });
    }
    const sessionPermissions = testLogin ? normalizePermissions(Array.isArray(body.permissions) ? body.permissions : ["records:read"]) : undefined;
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000).toISOString();
    db.sessions[token] = { userId: user.id, permissions: sessionPermissions, createdAt: new Date().toISOString(), expiresAt };
    db.audit.push({ id: crypto.randomUUID(), action: "login", userId: user.id, at: new Date().toISOString() });
    await saveDb(db);
    setSessionCookie(res, token, expiresAt);
    return send(res, 200, { user: publicUser({ ...user, permissions: sessionPermissions || user.permissions, sessionPermissions: Boolean(sessionPermissions) }) });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = parseCookies(req).bz_session || req.headers["x-session-token"];
    if (token) delete db.sessions[token];
    await saveDb(db);
    clearSessionCookie(res);
    return send(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    return send(res, 200, { user: publicUser(getSessionUser(db, req)), permissions: permissionCatalog });
  }

  const currentUser = requireUser(db, req);

  if (req.method === "GET" && url.pathname === "/api/users") {
    requirePermission(currentUser, "users:manage");
    return send(res, 200, db.users.map(publicUser));
  }

  if (req.method === "POST" && url.pathname === "/api/users") {
    requirePermission(currentUser, "users:manage");
    const body = await readJson(req);
    if (!body.username || !body.password || !body.name) {
      throw Object.assign(new Error("账号、姓名和密码不能为空"), { status: 400 });
    }
    if (db.users.some((user) => user.username === body.username)) {
      throw Object.assign(new Error("账号已存在"), { status: 409 });
    }
    const user = createUser({ username: body.username.trim(), name: body.name.trim(), role: "custom", permissions: normalizePermissions(body.permissions || []), password: body.password });
    db.users.push(user);
    db.audit.push({ id: crypto.randomUUID(), action: "create_user", userId: currentUser.id, targetUserId: user.id, targetUsername: user.username, role: user.role, at: new Date().toISOString() });
    await saveDb(db);
    return send(res, 201, publicUser(user));
  }

  if (req.method === "PUT" && parts[1] === "users" && parts[2]) {
    requirePermission(currentUser, "users:manage");
    const user = db.users.find((item) => item.id === parts[2]);
    if (!user) throw Object.assign(new Error("用户不存在"), { status: 404 });
    const body = await readJson(req);
    if (user.username === "admin") throw Object.assign(new Error("固定测试账号不能在账号管理中修改"), { status: 400 });
    if (body.name) user.name = body.name;
    if (Array.isArray(body.permissions)) user.permissions = normalizePermissions(body.permissions);
    if ("active" in body) {
      if (user.id === currentUser.id && body.active === false) throw Object.assign(new Error("不能停用当前登录账号"), { status: 400 });
      user.active = Boolean(body.active);
    }
    if (body.password) user.passwordHash = hashPassword(body.password);
    db.audit.push({ id: crypto.randomUUID(), action: "update_user", userId: currentUser.id, targetUserId: user.id, targetUsername: user.username, at: new Date().toISOString() });
    await saveDb(db);
    return send(res, 200, publicUser(user));
  }

  if (req.method === "GET" && url.pathname === "/api/config") {
    return send(res, 200, db.config);
  }

  if (req.method === "PUT" && url.pathname === "/api/config") {
    requirePermission(currentUser, "config:manage");
    const body = await readJson(req);
    db.config = body;
    db.audit.push({ id: crypto.randomUUID(), action: "update_config", userId: currentUser.id, at: new Date().toISOString() });
    await saveDb(db);
    return send(res, 200, db.config);
  }

  if (req.method === "POST" && parts[1] === "groups" && parts[2]) {
    requirePermission(currentUser, "categories:manage");
    const groupName = parts[2];
    const body = await readJson(req);
    db.config.groups[groupName] ||= [];
    if (!body.code || !body.name) throw Object.assign(new Error("分类代码和名称不能为空"), { status: 400 });
    if (db.config.groups[groupName].some((item) => item.code === body.code)) {
      throw Object.assign(new Error("分类代码已存在"), { status: 409 });
    }
    const item = { code: body.code.trim(), name: body.name.trim(), nameEn: body.nameEn || "", description: body.description || "" };
    db.config.groups[groupName].push(item);
    db.audit.push({ id: crypto.randomUUID(), action: "add_group_item", userId: currentUser.id, groupName, item, at: new Date().toISOString() });
    await saveDb(db);
    return send(res, 201, item);
  }

  if (req.method === "PUT" && parts[1] === "groups" && parts[2] && parts[3]) {
    requirePermission(currentUser, "categories:manage");
    const groupName = parts[2];
    const code = decodeURIComponent(parts[3]);
    const body = await readJson(req);
    const group = db.config.groups[groupName] || [];
    const idx = group.findIndex((item) => item.code === code);
    if (idx < 0) throw Object.assign(new Error("分类不存在"), { status: 404 });
    group[idx] = { ...group[idx], ...body, code };
    db.audit.push({ id: crypto.randomUUID(), action: "update_group_item", userId: currentUser.id, groupName, code, at: new Date().toISOString() });
    await saveDb(db);
    return send(res, 200, group[idx]);
  }

  if (req.method === "DELETE" && parts[1] === "groups" && parts[2] && parts[3]) {
    requirePermission(currentUser, "categories:manage");
    const groupName = parts[2];
    const code = decodeURIComponent(parts[3]);
    db.config.groups[groupName] = (db.config.groups[groupName] || []).filter((item) => item.code !== code);
    db.audit.push({ id: crypto.randomUUID(), action: "delete_group_item", userId: currentUser.id, groupName, code, at: new Date().toISOString() });
    await saveDb(db);
    return send(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/stats") {
    requirePermission(currentUser, "records:read");
    const active = db.records.filter((record) => canReadRecord(currentUser, record));
    const byRule = Object.fromEntries(db.config.rules.map((rule) => [rule.code, active.filter((record) => record.rule === rule.code).length]));
    const byStatus = active.reduce((acc, record) => {
      acc[record.status] = (acc[record.status] || 0) + 1;
      return acc;
    }, {});
    return send(res, 200, { total: active.length, byRule, byStatus, attachments: active.reduce((sum, item) => sum + (item.attachments?.length || 0), 0) });
  }

  if (req.method === "GET" && url.pathname === "/api/records") {
    requirePermission(currentUser, "records:read");
    const search = (url.searchParams.get("search") || "").trim().toLowerCase();
    const rule = url.searchParams.get("rule") || "";
    const status = url.searchParams.get("status") || "";
    const scope = url.searchParams.get("scope") || "visible";
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = Math.min(200, Math.max(10, Number(url.searchParams.get("pageSize") || 30)));
    let records = db.records.filter((record) => canReadRecord(currentUser, record));
    if (scope === "mine") records = records.filter((record) => record.createdBy === currentUser.id);
    if (scope === "company") records = records.filter((record) => record.recordKind !== "revision" && ["受控", "历史版本"].includes(record.status) && record.approvalStatus === "approved");
    if (scope === "pending") {
      if (!canManageApprovals(currentUser)) throw Object.assign(new Error("当前账号没有待审批查看权限"), { status: 403 });
      records = db.records.filter((record) => !record.deleted && record.approvalStatus === "pending");
    }
    if (scope === "all") {
      requirePermission(currentUser, "*");
      records = db.records.filter((record) => !record.deleted);
    }
    records = records.filter((record) => shouldShowInLedger(record, scope));
    if (rule) records = records.filter((record) => record.rule === rule);
    if (status) records = records.filter((record) => record.status === status);
    if (search) {
      records = records.filter((record) => [record.number, record.title, record.owner, record.project, record.model, record.description].some((value) => String(value || "").toLowerCase().includes(search)));
    }
    records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const total = records.length;
    const start = (page - 1) * pageSize;
    return send(res, 200, { records: records.slice(start, start + pageSize).map(publicRecord), total, page, pageSize });
  }

  if (req.method === "POST" && url.pathname === "/api/records") {
    requirePermission(currentUser, "records:create");
    const body = await readJson(req);
    const rule = getRule(db, body.rule);
    const fields = body.fields || {};
    validateFields(rule, fields);
    const counterKey = getCounterKey(rule, fields);
    const nextSeq = (db.counters[counterKey] || 0) + 1;
    const number = renderPattern(rule.pattern, toPatternFields(fields), nextSeq);
    if (db.records.some((record) => record.number === number && !record.deleted)) {
      throw Object.assign(new Error("编号已存在，请检查流水号"), { status: 409 });
    }
    db.counters[counterKey] = nextSeq;
    const now = new Date().toISOString();
    const record = {
      id: crypto.randomUUID(),
      number,
      rule: rule.code,
      title: body.title || "未命名",
      version: body.version || "A0",
      status: "草稿",
      fields,
      owner: body.owner || currentUser.name || "",
      department: body.department || "",
      project: body.project || "",
      model: body.model || "",
      relatedNumber: body.relatedNumber || "",
      description: body.description || "",
      attachments: [],
      approvalStatus: "draft",
      approvalHistory: [],
      locked: false,
      recordKind: "normal",
      rootRecordId: "",
      isLatest: false,
      createdBy: currentUser.id,
      createdAt: now,
      updatedAt: now
    };
    db.records.push(record);
    db.audit.push({ id: crypto.randomUUID(), action: "create_record", userId: currentUser.id, recordId: record.id, number, at: now });
    await saveDb(db);
    return send(res, 201, publicRecord(record));
  }

  if (parts[1] === "records" && parts[2]) {
    const id = parts[2];
    const record = db.records.find((item) => item.id === id && !item.deleted);
    if (!record) throw Object.assign(new Error("记录不存在"), { status: 404 });

    if (req.method === "GET" && parts.length === 3) {
      requirePermission(currentUser, "records:read");
      if (!canReadRecord(currentUser, record)) throw Object.assign(new Error("无权查看此记录"), { status: 403 });
      return send(res, 200, publicRecord(record));
    }

    if (req.method === "PUT" && parts.length === 3) {
      if (!canEditRecord(currentUser, record)) throw Object.assign(new Error("当前状态不可编辑，请创建修订申请或等待审批处理"), { status: 403 });
      const body = await readJson(req);
      const editable = record.recordKind === "revision"
        ? ["title", "owner", "department", "project", "model", "relatedNumber", "description"]
        : ["title", "version", "owner", "department", "project", "model", "relatedNumber", "description"];
      for (const key of editable) {
        if (key in body) record[key] = body[key];
      }
      if (body.manualNumber && body.manualNumber !== record.number) {
        record.previousNumbers ||= [];
        record.previousNumbers.push({ number: record.number, changedAt: new Date().toISOString(), reason: body.changeReason || "手动修改" });
        record.number = body.manualNumber;
      }
      record.updatedAt = new Date().toISOString();
      db.audit.push({ id: crypto.randomUUID(), action: "update_record", userId: currentUser.id, recordId: record.id, at: record.updatedAt });
      await saveDb(db);
      return send(res, 200, publicRecord(record));
    }

    if (req.method === "DELETE" && parts.length === 3) {
      requirePermission(currentUser, "records:delete");
      record.deleted = true;
      record.updatedAt = new Date().toISOString();
      db.audit.push({ id: crypto.randomUUID(), action: "delete_record", userId: currentUser.id, recordId: record.id, at: record.updatedAt });
      await saveDb(db);
      return send(res, 200, { ok: true });
    }

    if (req.method === "POST" && parts[3] === "revision") {
      requirePermission(currentUser, "records:revise");
      if (record.recordKind === "revision") throw Object.assign(new Error("修订申请不能再次创建修订"), { status: 400 });
      if (!(record.status === "受控" && record.approvalStatus === "approved" && record.isLatest !== false)) {
        throw Object.assign(new Error("只有最新版受控文件可以创建修订申请"), { status: 400 });
      }
      const existingRevision = db.records.find((item) => !item.deleted && item.recordKind === "revision" && item.number === record.number && item.approvalStatus !== "approved");
      if (existingRevision) {
        throw Object.assign(new Error(`已存在未完成的修订申请：${existingRevision.number} ${existingRevision.version}`), { status: 409 });
      }
      const body = await readJson(req);
      const now = new Date().toISOString();
      const version = nextVersion(record.version);
      const revision = {
        ...record,
        id: crypto.randomUUID(),
        number: record.number,
        title: body.title || record.title,
        version,
        status: "修订草稿",
        changeStatus: "",
        approvalStatus: "draft",
        approvalHistory: [{ action: "create_revision", userId: currentUser.id, userName: currentUser.name, comment: body.comment || "", at: now }],
        locked: false,
        recordKind: "revision",
        rootRecordId: record.rootRecordId || record.id,
        isLatest: false,
        sourceRecordId: record.id,
        sourceNumber: record.number,
        createdBy: currentUser.id,
        approvedBy: undefined,
        approvedAt: undefined,
        attachments: cloneAttachments(record.attachments),
        revisionHistory: Array.isArray(record.revisionHistory) ? record.revisionHistory.map((item) => ({ ...item })) : [],
        createdAt: now,
        updatedAt: now
      };
      record.changeStatus = `${version} 修订草稿`;
      record.updatedAt = now;
      db.records.push(revision);
      db.audit.push({ id: crypto.randomUUID(), action: "create_revision", userId: currentUser.id, recordId: revision.id, sourceRecordId: record.id, number: revision.number, version, at: now });
      await saveDb(db);
      return send(res, 201, publicRecord(revision));
    }

    if (req.method === "POST" && parts[3] === "submit") {
      if (!canSubmitRecord(currentUser, record)) throw Object.assign(new Error("当前记录不可提交审批"), { status: 403 });
      const body = await readJson(req);
      const now = new Date().toISOString();
      record.approvalStatus = "pending";
      record.status = record.recordKind === "revision" ? "修订评审中" : "评审中";
      record.locked = false;
      if (record.recordKind === "revision" && record.sourceRecordId) {
        const source = db.records.find((item) => item.id === record.sourceRecordId && !item.deleted);
        if (source) {
          source.changeStatus = `${record.version} 修订评审中`;
          source.updatedAt = now;
        }
      }
      record.approvalHistory ||= [];
      record.approvalHistory.push({ action: "submit", userId: currentUser.id, userName: currentUser.name, comment: body.comment || "", at: now });
      record.updatedAt = now;
      db.audit.push({ id: crypto.randomUUID(), action: "submit_record", userId: currentUser.id, recordId: record.id, at: now });
      await saveDb(db);
      return send(res, 200, publicRecord(record));
    }

    if (req.method === "POST" && parts[3] === "withdraw") {
      if (!hasPermission(currentUser, "records:submit")) throw Object.assign(new Error("当前账号没有撤回审批权限"), { status: 403 });
      if (record.createdBy !== currentUser.id && !hasPermission(currentUser, "*")) throw Object.assign(new Error("只能撤回自己提交的审批申请"), { status: 403 });
      if (record.approvalStatus !== "pending") throw Object.assign(new Error("只有审批中的记录可以撤回修改"), { status: 400 });
      const body = await readJson(req);
      const now = new Date().toISOString();
      record.approvalStatus = "draft";
      record.status = record.recordKind === "revision" ? "修订草稿" : "草稿";
      record.locked = false;
      if (record.recordKind === "revision" && record.sourceRecordId) {
        const source = db.records.find((item) => item.id === record.sourceRecordId && !item.deleted);
        if (source) {
          source.changeStatus = `${record.version} 修订草稿`;
          source.updatedAt = now;
        }
      }
      record.approvalHistory ||= [];
      record.approvalHistory.push({ action: "withdraw", userId: currentUser.id, userName: currentUser.name, comment: body.comment || "", at: now });
      record.updatedAt = now;
      db.audit.push({ id: crypto.randomUUID(), action: "withdraw_record", userId: currentUser.id, recordId: record.id, at: now });
      await saveDb(db);
      return send(res, 200, publicRecord(record));
    }

    if (req.method === "POST" && parts[3] === "approve") {
      requirePermission(currentUser, "records:approve");
      if (record.approvalStatus !== "pending") throw Object.assign(new Error("只有待审批记录可以批准"), { status: 400 });
      const body = await readJson(req);
      const now = new Date().toISOString();
      if (record.recordKind === "revision" && record.sourceRecordId) {
        const source = db.records.find((item) => item.id === record.sourceRecordId && !item.deleted);
        if (!source) throw Object.assign(new Error("原受控版本不存在，无法批准修订"), { status: 404 });
        if (source.isLatest === false || source.status !== "受控") throw Object.assign(new Error("原受控版本已不是最新版，无法批准修订"), { status: 409 });
        approveRevisionAsNewVersion(db, source, record, currentUser, now);
      } else {
        record.approvalStatus = "approved";
        record.status = "受控";
        record.locked = true;
        record.isLatest = true;
        record.rootRecordId ||= record.id;
        record.approvedBy = currentUser.id;
        record.approvedAt = now;
        record.updatedAt = now;
        ensureVersionSnapshot(record, { approvedBy: currentUser.id, approvedAt: now, source: "initial" });
      }
      record.approvalHistory ||= [];
      record.approvalHistory.push({ action: "approve", userId: currentUser.id, userName: currentUser.name, comment: body.comment || "", at: now });
      record.updatedAt = now;
      db.audit.push({ id: crypto.randomUUID(), action: "approve_record", userId: currentUser.id, recordId: record.id, at: now });
      await saveDb(db);
      return send(res, 200, publicRecord(record));
    }

    if (req.method === "POST" && parts[3] === "reject") {
      requirePermission(currentUser, "records:reject");
      if (record.approvalStatus !== "pending") throw Object.assign(new Error("只有待审批记录可以退回"), { status: 400 });
      const body = await readJson(req);
      const now = new Date().toISOString();
      record.approvalStatus = "rejected";
      record.status = record.recordKind === "revision" ? "修订退回" : "草稿";
      record.locked = false;
      if (record.recordKind === "revision" && record.sourceRecordId) {
        const source = db.records.find((item) => item.id === record.sourceRecordId && !item.deleted);
        if (source) {
          source.changeStatus = `${record.version} 修订退回`;
          source.updatedAt = now;
        }
      }
      record.approvalHistory ||= [];
      record.approvalHistory.push({ action: "reject", userId: currentUser.id, userName: currentUser.name, comment: body.comment || "", at: now });
      record.updatedAt = now;
      db.audit.push({ id: crypto.randomUUID(), action: "reject_record", userId: currentUser.id, recordId: record.id, at: now });
      await saveDb(db);
      return send(res, 200, publicRecord(record));
    }

    if (req.method === "POST" && parts[3] === "ecn") {
      requirePermission(currentUser, "ecn:create");
      const body = await readJson(req);
      const now = new Date().toISOString();
      const seq = (db.counters.ECN || 0) + 1;
      db.counters.ECN = seq;
      const ecn = {
        id: crypto.randomUUID(),
        number: `BZ-TD-ECN-${String(seq).padStart(3, "0")}`,
        recordId: record.id,
        recordNumber: record.number,
        title: body.title || `ECN-${record.number}`,
        reason: body.reason || "",
        impact: body.impact || "",
        status: "open",
        createdBy: currentUser.id,
        createdAt: now,
        updatedAt: now
      };
      db.ecns.push(ecn);
      record.ecnIds ||= [];
      record.ecnIds.push(ecn.id);
      record.updatedAt = now;
      db.audit.push({ id: crypto.randomUUID(), action: "create_ecn", userId: currentUser.id, recordId: record.id, ecnId: ecn.id, at: now });
      await saveDb(db);
      return send(res, 201, ecn);
    }

    if (req.method === "POST" && parts[3] === "attachments") {
      requirePermission(currentUser, "records:attach");
      if (!canEditRecord(currentUser, record)) throw Object.assign(new Error("当前状态不可修改附件"), { status: 403 });
      const body = await readJson(req);
      const match = String(body.dataUrl || "").match(/^data:(.+?);base64,(.+)$/);
      if (!match) throw Object.assign(new Error("附件数据格式不正确"), { status: 400 });
      const ext = path.extname(body.name || "") || ".bin";
      const safeName = `${crypto.randomUUID()}${ext}`;
      const bytes = Buffer.from(match[2], "base64");
      await fs.writeFile(path.join(uploadDir, safeName), bytes);
      const attachment = {
        id: crypto.randomUUID(),
        name: body.name || safeName,
        type: body.type || match[1],
        size: bytes.length,
        url: `/uploads/${safeName}`,
        uploadedBy: currentUser.id,
        uploadedAt: new Date().toISOString()
      };
      record.attachments.push(attachment);
      record.updatedAt = new Date().toISOString();
      db.audit.push({ id: crypto.randomUUID(), action: "add_attachment", userId: currentUser.id, recordId: record.id, attachmentId: attachment.id, at: record.updatedAt });
      await saveDb(db);
      return send(res, 201, attachment);
    }

    if (req.method === "DELETE" && parts[3] === "attachments" && parts[4]) {
      requirePermission(currentUser, "records:attach");
      if (!canEditRecord(currentUser, record)) throw Object.assign(new Error("当前状态不可修改附件"), { status: 403 });
      const attachmentId = parts[4];
      record.attachments = record.attachments.filter((item) => item.id !== attachmentId);
      record.updatedAt = new Date().toISOString();
      db.audit.push({ id: crypto.randomUUID(), action: "delete_attachment", userId: currentUser.id, recordId: record.id, attachmentId, at: record.updatedAt });
      await saveDb(db);
      return send(res, 200, { ok: true });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/export.json") {
    requirePermission(currentUser, "export:read");
    return send(res, 200, db.records.filter((record) => canReadRecord(currentUser, record)).map(publicRecord));
  }

  if (req.method === "GET" && url.pathname === "/api/export.csv") {
    requirePermission(currentUser, "export:read");
    return send(res, 200, "\ufeff" + toCsv(db.records.filter((record) => canReadRecord(currentUser, record))), "text/csv; charset=utf-8");
  }

  if (req.method === "GET" && url.pathname === "/api/ecns") {
    requirePermission(currentUser, "ecn:read");
    return send(res, 200, db.ecns);
  }

  if (req.method === "POST" && url.pathname === "/api/ecns") {
    requirePermission(currentUser, "ecn:create");
    const body = await readJson(req);
    const now = new Date().toISOString();
    const seq = (db.counters.ECN || 0) + 1;
    db.counters.ECN = seq;
    const relatedRecord = body.recordId
      ? db.records.find((item) => item.id === body.recordId && !item.deleted)
      : db.records.find((item) => item.number === body.recordNumber && !item.deleted);
    const ecn = {
      id: crypto.randomUUID(),
      number: `BZ-TD-ECN-${String(seq).padStart(3, "0")}`,
      recordId: relatedRecord?.id || "",
      recordNumber: relatedRecord?.number || body.recordNumber || "",
      title: body.title || `ECN-${body.recordNumber || "UNLINKED"}`,
      reason: body.reason || "",
      impact: body.impact || "",
      status: "open",
      createdBy: currentUser.id,
      createdAt: now,
      updatedAt: now
    };
    db.ecns.push(ecn);
    if (relatedRecord) {
      relatedRecord.ecnIds ||= [];
      relatedRecord.ecnIds.push(ecn.id);
      relatedRecord.updatedAt = now;
    }
    db.audit.push({ id: crypto.randomUUID(), action: "create_ecn", userId: currentUser.id, recordId: relatedRecord?.id || "", ecnId: ecn.id, at: now });
    await saveDb(db);
    return send(res, 201, ecn);
  }

  if (req.method === "GET" && url.pathname === "/api/audit") {
    requirePermission(currentUser, "audit:read");
    const userMap = Object.fromEntries(db.users.map((user) => [user.id, publicUser(user)]));
    const recordMap = Object.fromEntries((db.records || []).map((record) => [record.id, record]));
    const ecnMap = Object.fromEntries((db.ecns || []).map((ecn) => [ecn.id, ecn]));
    const snMap = Object.fromEntries((db.serialNumbers || []).map((sn) => [sn.id, sn]));
    const linkMap = Object.fromEntries((db.bomLinks || []).map((link) => [link.id, link]));
    const auditTarget = (item) => {
      const record = recordMap[item.recordId];
      if (record) return { type: "图纸编号", label: `${record.number} / ${record.version || ""}`, title: record.title || "" };
      const source = recordMap[item.sourceRecordId];
      if (source) return { type: "源版本", label: `${source.number} / ${source.version || ""}`, title: source.title || "" };
      const ecn = ecnMap[item.ecnId];
      if (ecn) return { type: "ECN", label: ecn.number, title: ecn.title || "" };
      const sn = snMap[item.snId];
      if (sn) return { type: "SN", label: sn.number, title: sn.model || "" };
      const link = linkMap[item.linkId];
      if (link) return { type: "BOM", label: `${link.parentNumber} -> ${link.childNumber}`, title: link.usage || "" };
      if (item.targetUsername) return { type: "账号", label: item.targetUsername, title: "" };
      if (item.groupName) return { type: "分类", label: `${item.groupName}${item.code ? ` / ${item.code}` : ""}`, title: item.item?.name || "" };
      if (item.number) return { type: "编号", label: item.number, title: item.version || "" };
      return { type: "系统", label: "-", title: "" };
    };
    const limit = Math.min(500, Math.max(20, Number(url.searchParams.get("limit") || 100)));
    const audit = [...db.audit]
      .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))
      .slice(0, limit)
      .map((item) => ({ ...item, user: userMap[item.userId] || null, target: auditTarget(item) }));
    return send(res, 200, audit);
  }

  if (req.method === "GET" && url.pathname === "/api/serial-numbers") {
    requirePermission(currentUser, "sn:read");
    return send(res, 200, db.serialNumbers);
  }

  if (req.method === "POST" && url.pathname === "/api/serial-numbers") {
    requirePermission(currentUser, "sn:manage");
    const body = await readJson(req);
    const yearMonth = body.yearMonth || new Date().toISOString().slice(2, 7).replace("-", "");
    const model = body.model || "UCR01";
    const key = `SN|${model}|${yearMonth}`;
    const seq = (db.counters[key] || 0) + 1;
    db.counters[key] = seq;
    const sn = {
      id: crypto.randomUUID(),
      number: `BZ-SN-${model}-${yearMonth}-${String(seq).padStart(3, "0")}`,
      model,
      yearMonth,
      relatedRecordId: body.relatedRecordId || "",
      relatedRecordNumber: body.relatedRecordNumber || "",
      customer: body.customer || "",
      status: body.status || "在制",
      createdBy: currentUser.id,
      createdAt: new Date().toISOString()
    };
    db.serialNumbers.push(sn);
    db.audit.push({ id: crypto.randomUUID(), action: "create_sn", userId: currentUser.id, snId: sn.id, at: sn.createdAt });
    await saveDb(db);
    return send(res, 201, sn);
  }

  if (req.method === "GET" && url.pathname === "/api/bom-links") {
    requirePermission(currentUser, "bom:read");
    return send(res, 200, db.bomLinks);
  }

  if (req.method === "POST" && url.pathname === "/api/bom-links") {
    requirePermission(currentUser, "bom:manage");
    const body = await readJson(req);
    const link = {
      id: crypto.randomUUID(),
      parentNumber: body.parentNumber || "",
      childNumber: body.childNumber || "",
      quantity: Number(body.quantity || 1),
      usage: body.usage || "",
      createdBy: currentUser.id,
      createdAt: new Date().toISOString()
    };
    db.bomLinks.push(link);
    db.audit.push({ id: crypto.randomUUID(), action: "create_bom_link", userId: currentUser.id, linkId: link.id, at: link.createdAt });
    await saveDb(db);
    return send(res, 201, link);
  }

  send(res, 404, { error: "接口不存在" });
}

async function serveStatic(req, res, url) {
  let requested = decodeURIComponent(url.pathname);
  if (requested === "/") requested = "/index.html";
  if (requested.startsWith("/uploads/")) {
    const fileName = path.basename(requested);
    const filePath = path.join(uploadDir, fileName);
    const ext = path.extname(filePath).toLowerCase();
    const data = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream" });
    res.end(data);
    return;
  }
  const filePath = path.normalize(path.join(publicDir, requested));
  if (!filePath.startsWith(publicDir)) {
    send(res, 403, { error: "Forbidden" });
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const data = await fs.readFile(filePath);
  res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream" });
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(req, res, url);
  } catch (error) {
    if (error.code === "ENOENT") return send(res, 404, { error: "Not found" });
    console.error(error);
    send(res, error.status || 500, { error: error.message || "服务器错误" });
  }
});

server.listen(port, () => {
  console.log(`Bozhan numbering system running at http://localhost:${port}`);
});
