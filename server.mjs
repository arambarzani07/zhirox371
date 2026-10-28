import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;
const HOST = "0.0.0.0";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".sql": "text/plain; charset=utf-8"
};

const LOCAL_DB_DIR_PATH = path.join(__dirname, "db");
const D_DRIVE_ROOT = "D:\\SupermarketPOS_Data";
const TARGET_DISK_DISPLAY_PATH = "D:\\SupermarketPOS_Data";
const TARGET_BACKUP_DISPLAY_PATH = "D:\\SupermarketPOS_Data\\backups";

function resolvePrimaryStorageRoot() {
  if (process.env.RETAIL_STORAGE_DIR) {
    return process.env.RETAIL_STORAGE_DIR;
  }
  try {
    if (process.platform === "win32" && fs.existsSync("D:\\")) {
      return D_DRIVE_ROOT;
    }
  } catch (_e) {}
  return LOCAL_DB_DIR_PATH;
}

const DB_DIR_PATH = resolvePrimaryStorageRoot();
const BACKUP_DIR_PATH = path.join(DB_DIR_PATH, "backups");
const SYNC_FILE_PATH = path.join(DB_DIR_PATH, "offline_server_sync.json");
const LATEST_BACKUP_PATH = path.join(BACKUP_DIR_PATH, "backup-latest.json");

const MIRROR_BACKUP_DIR_PATH = path.join(LOCAL_DB_DIR_PATH, "backups");
const MIRROR_SYNC_FILE_PATH = path.join(LOCAL_DB_DIR_PATH, "offline_server_sync.json");
const MIRROR_LATEST_BACKUP_PATH = path.join(MIRROR_BACKUP_DIR_PATH, "backup-latest.json");

function ensurePcStorageProvisioned() {
  const dirs = new Set([DB_DIR_PATH, BACKUP_DIR_PATH, LOCAL_DB_DIR_PATH, MIRROR_BACKUP_DIR_PATH]);
  for (const dir of dirs) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (_e) {}
  }
  const initial = {
    auto_provisioned: true,
    preferred_disk: "D:",
    storage_root: TARGET_DISK_DISPLAY_PATH,
    backup_dir: TARGET_BACKUP_DISPLAY_PATH,
    provisioned_at: new Date().toISOString(),
    last_synced_at: null,
    sync_count: 0,
    total_operations_received: 0,
    latest_store: null,
    latest_summary: {},
    recent_batches: []
  };
  const serializedInitial = JSON.stringify(initial, null, 2);
  for (const syncFile of new Set([SYNC_FILE_PATH, MIRROR_SYNC_FILE_PATH])) {
    try {
      if (!fs.existsSync(syncFile)) {
        fs.writeFileSync(syncFile, serializedInitial, "utf8");
      }
    } catch (_e) {}
  }
}

ensurePcStorageProvisioned();

function listPcBackupFiles() {
  try {
    ensurePcStorageProvisioned();
    const targetDir = fs.existsSync(BACKUP_DIR_PATH) ? BACKUP_DIR_PATH : MIRROR_BACKUP_DIR_PATH;
    return fs.readdirSync(targetDir)
      .filter(f => f.endsWith(".json"))
      .sort()
      .reverse();
  } catch (_e) {
    return [];
  }
}

function pruneOldDailyBackups(dirPath) {
  try {
    const dailyFiles = fs.readdirSync(dirPath)
      .filter(f => /^backup-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort();
    while (dailyFiles.length > 30) {
      const oldest = dailyFiles.shift();
      if (oldest) {
        try { fs.unlinkSync(path.join(dirPath, oldest)); } catch (_e) {}
      }
    }
  } catch (_e) {}
}

function writeRollingPcDiskBackup(fullDbState, snapshot, storeInfo, reason = "auto") {
  try {
    ensurePcStorageProvisioned();
    const now = new Date();
    const iso = now.toISOString();
    const dayKey = iso.slice(0, 10);
    const backupPayload = {
      backup_version: 1,
      preferred_disk: "D:",
      disk_path: TARGET_BACKUP_DISPLAY_PATH,
      saved_at: iso,
      reason,
      store: storeInfo || null,
      full_db: fullDbState || null,
      snapshot: snapshot || null
    };
    const serialized = JSON.stringify(backupPayload, null, 2);

    for (const bDir of new Set([BACKUP_DIR_PATH, MIRROR_BACKUP_DIR_PATH])) {
      try {
        fs.mkdirSync(bDir, { recursive: true });
        fs.writeFileSync(path.join(bDir, "backup-latest.json"), serialized, "utf8");
        fs.writeFileSync(path.join(bDir, `backup-${dayKey}.json`), serialized, "utf8");
        pruneOldDailyBackups(bDir);
      } catch (_e) {}
    }
  } catch (_e) {}
}

function readSavedServerSync() {
  try {
    ensurePcStorageProvisioned();
    for (const candidate of [SYNC_FILE_PATH, MIRROR_SYNC_FILE_PATH]) {
      if (fs.existsSync(candidate)) {
        return JSON.parse(fs.readFileSync(candidate, "utf8"));
      }
    }
  } catch (_e) {}
  return {
    auto_provisioned: true,
    preferred_disk: "D:",
    storage_root: TARGET_DISK_DISPLAY_PATH,
    backup_dir: TARGET_BACKUP_DISPLAY_PATH,
    last_synced_at: null,
    sync_count: 0,
    total_operations_received: 0,
    latest_store: null,
    latest_summary: {},
    recent_batches: []
  };
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  if (pathname === "/api/sync/status" && req.method === "GET") {
    const state = readSavedServerSync();
    const backups = listPcBackupFiles();
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({
      ok: true,
      auto_provisioned: true,
      preferred_disk: "D:",
      storage_root: TARGET_DISK_DISPLAY_PATH,
      server_time: new Date().toISOString(),
      last_synced_at: state.last_synced_at,
      sync_count: state.sync_count,
      total_operations_received: state.total_operations_received,
      latest_summary: state.latest_summary || {},
      pc_backup_dir: TARGET_BACKUP_DISPLAY_PATH,
      pc_backup_files_count: backups.length,
      pc_backup_files: backups.slice(0, 10)
    }));
    return;
  }

  if (pathname === "/api/local-backup/restore" && req.method === "GET") {
    ensurePcStorageProvisioned();
    let restored = null;
    try {
      for (const candidate of [LATEST_BACKUP_PATH, MIRROR_LATEST_BACKUP_PATH]) {
        if (fs.existsSync(candidate)) {
          restored = JSON.parse(fs.readFileSync(candidate, "utf8"));
          if (restored) break;
        }
      }
      if (!restored) {
        for (const syncCandidate of [SYNC_FILE_PATH, MIRROR_SYNC_FILE_PATH]) {
          if (fs.existsSync(syncCandidate)) {
            const syncData = JSON.parse(fs.readFileSync(syncCandidate, "utf8"));
            if (syncData.full_db || syncData.latest_snapshot) {
              restored = {
                preferred_disk: "D:",
                disk_path: TARGET_BACKUP_DISPLAY_PATH,
                saved_at: syncData.last_synced_at,
                full_db: syncData.full_db || null,
                snapshot: syncData.latest_snapshot || null
              };
              break;
            }
          }
        }
      }
    } catch (_e) {}
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({
      ok: Boolean(restored),
      preferred_disk: "D:",
      pc_backup_dir: TARGET_BACKUP_DISPLAY_PATH,
      backup: restored
    }));
    return;
  }

  if (pathname === "/api/local-backup" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 25 * 1024 * 1024) req.destroy();
    });
    req.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        writeRollingPcDiskBackup(payload.full_db || null, payload.snapshot || null, payload.store || null, payload.reason || "auto_local_pc");
        const backups = listPcBackupFiles();
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({
          ok: true,
          preferred_disk: "D:",
          pc_backup_dir: TARGET_BACKUP_DISPLAY_PATH,
          saved_at: new Date().toISOString(),
          pc_backup_files_count: backups.length
        }));
      } catch (err) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: String(err?.message || err) }));
      }
    });
    return;
  }

  if (pathname === "/api/sync" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 25 * 1024 * 1024) req.destroy();
    });
    req.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        const prev = readSavedServerSync();
        const syncedAt = new Date().toISOString();
        const opsList = Array.isArray(payload.operations) ? payload.operations : [];
        const snapshot = payload.snapshot && typeof payload.snapshot === "object" ? payload.snapshot : {};
        const fullDb = payload.full_db && typeof payload.full_db === "object" ? payload.full_db : (prev.full_db || null);
        const summary = {
          products: Array.isArray(snapshot.products) ? snapshot.products.length : 0,
          barcodes: Array.isArray(snapshot.barcodes) ? snapshot.barcodes.length : 0,
          sales: Array.isArray(snapshot.sales) ? snapshot.sales.length : 0,
          customers: Array.isArray(snapshot.customers) ? snapshot.customers.length : 0,
          suppliers: Array.isArray(snapshot.suppliers) ? snapshot.suppliers.length : 0,
          finance_entries: Array.isArray(snapshot.finance_entries) ? snapshot.finance_entries.length : 0
        };
        const updated = {
          auto_provisioned: true,
          preferred_disk: "D:",
          storage_root: TARGET_DISK_DISPLAY_PATH,
          backup_dir: TARGET_BACKUP_DISPLAY_PATH,
          last_synced_at: syncedAt,
          sync_count: Number(prev.sync_count || 0) + 1,
          total_operations_received: Number(prev.total_operations_received || 0) + opsList.length,
          latest_store: payload.store || prev.latest_store || null,
          latest_summary: summary,
          latest_snapshot: snapshot,
          full_db: fullDb,
          recent_batches: [
            {
              batch_id: payload.batch_id || `sync_${Date.now()}`,
              synced_at: syncedAt,
              reason: payload.reason || "hourly",
              operations_count: opsList.length,
              summary
            },
            ...(Array.isArray(prev.recent_batches) ? prev.recent_batches : []).slice(0, 29)
          ]
        };
        ensurePcStorageProvisioned();
        const serializedSync = JSON.stringify(updated, null, 2);
        for (const syncTarget of new Set([SYNC_FILE_PATH, MIRROR_SYNC_FILE_PATH])) {
          try { fs.writeFileSync(syncTarget, serializedSync, "utf8"); } catch (_e) {}
        }
        writeRollingPcDiskBackup(fullDb, snapshot, updated.latest_store, payload.reason || "hourly_sync");
        const backups = listPcBackupFiles();
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({
          ok: true,
          preferred_disk: "D:",
          pc_backup_dir: TARGET_BACKUP_DISPLAY_PATH,
          synced_at: syncedAt,
          sync_count: updated.sync_count,
          received_operations: opsList.length,
          pc_backup_files_count: backups.length,
          summary
        }));
      } catch (err) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: String(err?.message || err) }));
      }
    });
    return;
  }

  if (pathname === "/" || pathname === "") {
    pathname = "/index.html";
  }

  const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, "");
  let filePath = path.join(__dirname, safePath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(`404 Not Found: ${pathname}`);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.statusCode = 200;
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-cache");
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Retail OS PC running on http://${HOST}:${PORT}`);
});
