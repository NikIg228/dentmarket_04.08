import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  createReadStream,
  existsSync,
  openSync,
  readdirSync,
  statSync,
} from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const apiDirectory = path.join(root, "apps", "api");
const apiEntry = path.join(apiDirectory, "dist", "src", "main.js");
const tempRoot = path.join(root, ".tmp", "backup-restore");
const startedAt = new Date();
const runId = `${startedAt.toISOString().replace(/[-:.TZ]/g, "")}_${process.pid}_${randomBytes(4).toString("hex")}`;
const targetDatabaseName = `dentmarket_restore_drill_${runId}`.toLowerCase();
const runDirectory = path.join(tempRoot, runId);
const backupDirectory = path.join(runDirectory, "backup");
const backupObjectsDirectory = path.join(backupDirectory, "objects");
const restoredObjectsDirectory = path.join(runDirectory, "restored-objects");
const dumpPath = path.join(backupDirectory, "database.dump");
const manifestPath = path.join(backupDirectory, "backup-manifest.json");
const checksumPath = path.join(backupDirectory, "SHA256SUMS");
const evidencePath = path.join(runDirectory, "restore-evidence.json");
const sourceDatabaseUrl =
  process.env.POSTGRES_TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://marketplace:marketplace@127.0.0.1:5432/marketplace?schema=public";
const sourceUrl = parsePostgresUrl(sourceDatabaseUrl, "source database");
const adminUrl = parsePostgresUrl(
  process.env.RESTORE_DRILL_ADMIN_DATABASE_URL ??
    withDatabase(sourceUrl, "postgres", false),
  "restore drill admin database",
);
const targetToolUrl = withDatabase(adminUrl, targetDatabaseName, false);
const targetPrismaUrl = withDatabase(adminUrl, targetDatabaseName, true);
const sourceToolUrl = toPostgresToolUrl(sourceUrl);
const deepHashMaxRows = parsePositiveInteger(
  process.env.RESTORE_DRILL_DEEP_HASH_MAX_ROWS ?? "100000",
  "RESTORE_DRILL_DEEP_HASH_MAX_ROWS",
);
const keepArtifacts = process.env.KEEP_BACKUP_RESTORE_ARTIFACTS === "true";
const keepTargetDatabase = process.env.KEEP_RESTORE_DRILL_DATABASE === "true";
const useObjectFixture =
  process.env.RESTORE_DRILL_USE_OBJECT_FIXTURE === "true";
const objectFixtureDirectory = path.join(runDirectory, "object-source-fixture");
const marker = `dentmarket-backup-restore-drill:${runId}`;
const apiPort = Number(
  process.env.BACKUP_RESTORE_VERIFY_API_PORT ?? 5700 + (process.pid % 500),
);
const apiBase = `http://127.0.0.1:${apiPort}/api`;

let api;
let databaseCreated = false;
const apiLogLines = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parsePostgresUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid PostgreSQL URL`);
  }
  assert(
    ["postgresql:", "postgres:"].includes(parsed.protocol),
    `${label} must use postgresql:// or postgres://`,
  );
  assert(parsed.hostname, `${label} must include a hostname`);
  assert(databaseName(parsed), `${label} must include a database name`);
  return parsed;
}

function databaseName(url) {
  return decodeURIComponent(url.pathname.replace(/^\//, ""));
}

function databaseIdentity(url) {
  return `${url.hostname.toLowerCase()}:${url.port || "5432"}/${databaseName(url)}`;
}

function withDatabase(url, name, prismaSchema) {
  const next = new URL(url.toString());
  next.pathname = `/${encodeURIComponent(name)}`;
  for (const parameter of [
    "schema",
    "connection_limit",
    "pool_timeout",
    "pgbouncer",
  ]) {
    next.searchParams.delete(parameter);
  }
  if (prismaSchema) next.searchParams.set("schema", "public");
  return next.toString();
}

function toPostgresToolUrl(url) {
  return withDatabase(url, databaseName(url), false);
}

function parsePositiveInteger(value, label) {
  const parsed = Number(value);
  assert(Number.isInteger(parsed) && parsed > 0, `${label} must be positive`);
  return parsed;
}

function isLocalHostname(hostname) {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname.toLowerCase());
}

function isInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function redact(value) {
  return String(value)
    .replaceAll(sourceDatabaseUrl, "[SOURCE_DATABASE_URL]")
    .replaceAll(sourceToolUrl, "[SOURCE_DATABASE_URL]")
    .replaceAll(adminUrl.toString(), "[RESTORE_DRILL_ADMIN_DATABASE_URL]")
    .replaceAll(targetPrismaUrl, "[RESTORE_DRILL_DATABASE_URL]")
    .replaceAll(targetToolUrl, "[RESTORE_DRILL_DATABASE_URL]");
}

function commandWorks(command, args = ["--version"]) {
  const result = spawnSync(command, args, {
    windowsHide: true,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0;
}

function nativeToolCandidates(name) {
  const executable = process.platform === "win32" ? `${name}.exe` : name;
  const candidates = [];
  if (process.env.POSTGRES_BIN_DIR) {
    candidates.push(path.join(process.env.POSTGRES_BIN_DIR, executable));
  }
  if (process.platform === "win32") {
    const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
    const postgresRoot = path.join(programFiles, "PostgreSQL");
    if (existsSync(postgresRoot)) {
      const versions = readdirSync(postgresRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      for (const version of versions) {
        candidates.push(path.join(postgresRoot, version, "bin", executable));
      }
    }
  }
  candidates.push(executable);
  return [...new Set(candidates)];
}

function resolveNativeTool(name) {
  for (const candidate of nativeToolCandidates(name)) {
    if (commandWorks(candidate)) return candidate;
  }
  throw new Error(
    `${name} is unavailable. Install a matching PostgreSQL client or set POSTGRES_BIN_DIR.`,
  );
}

function resolvePostgresTools() {
  const mode = process.env.POSTGRES_CLIENT_MODE ?? "native";
  assert(
    ["native", "docker"].includes(mode),
    "POSTGRES_CLIENT_MODE must be native or docker",
  );
  if (mode === "docker") {
    assert(commandWorks("docker", ["version"]), "Docker is unavailable");
    return {
      mode,
      image: process.env.POSTGRES_CLIENT_IMAGE ?? "postgres:17-alpine",
    };
  }
  return {
    mode,
    commands: Object.fromEntries(
      ["pg_dump", "pg_restore", "psql"].map((name) => [
        name,
        resolveNativeTool(name),
      ]),
    ),
  };
}

const postgresTools = resolvePostgresTools();

function postgresInvocation(name, args) {
  if (postgresTools.mode === "docker") {
    return {
      command: "docker",
      args: [
        "run",
        "--rm",
        "--network",
        "host",
        postgresTools.image,
        name,
        ...args,
      ],
    };
  }
  return { command: postgresTools.commands[name], args };
}

function runPostgresTool(
  name,
  args,
  { stdinFile, stdoutFile, inheritStdout = false } = {},
) {
  const invocation = postgresInvocation(name, args);
  let input;
  let output;
  try {
    input = stdinFile ? openSync(stdinFile, "r") : "ignore";
    output = stdoutFile
      ? openSync(stdoutFile, "w")
      : inheritStdout
        ? "inherit"
        : "pipe";
    const result = spawnSync(invocation.command, invocation.args, {
      windowsHide: true,
      env: process.env,
      stdio: [input, output, "pipe"],
      encoding: stdoutFile || inheritStdout ? undefined : "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(
        `${name} failed with exit code ${result.status}: ${redact(result.stderr ?? "")}`,
      );
    }
    return typeof result.stdout === "string" ? result.stdout.trim() : "";
  } finally {
    if (typeof input === "number") closeSync(input);
    if (typeof output === "number") closeSync(output);
  }
}

function psql(url, sql) {
  return runPostgresTool("psql", [
    url,
    "-X",
    "--set",
    "ON_ERROR_STOP=1",
    "--tuples-only",
    "--no-align",
    "--command",
    sql,
  ]);
}

function toolVersion(name) {
  return runPostgresTool(name, ["--version"]);
}

function parseMajorVersion(value) {
  const match = String(value).match(/(\d+)(?:\.\d+)?/);
  assert(match, `Could not parse PostgreSQL version from: ${value}`);
  return Number(match[1]);
}

function runNpm(args, env) {
  const windows = process.platform === "win32";
  const command = windows ? (process.env.ComSpec ?? "cmd.exe") : "npm";
  const commandArgs = windows
    ? ["/d", "/s", "/c", `npm ${args.join(" ")}`]
    : args;
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    env,
    windowsHide: true,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  assert(
    result.status === 0,
    `npm ${args.join(" ")} failed with exit code ${result.status}`,
  );
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

function listFiles(directory, prefix = "") {
  if (!existsSync(directory)) return [];
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    const absolute = path.join(directory, entry.name);
    assert(
      !entry.isSymbolicLink(),
      `Symbolic links are not allowed: ${absolute}`,
    );
    if (entry.isDirectory()) result.push(...listFiles(absolute, relative));
    else if (entry.isFile()) result.push(relative.split(path.sep).join("/"));
  }
  return result.sort();
}

async function fileInventory(directory) {
  const inventory = [];
  for (const relativePath of listFiles(directory)) {
    const absolutePath = path.join(directory, ...relativePath.split("/"));
    inventory.push({
      path: relativePath,
      bytes: statSync(absolutePath).size,
      sha256: await hashFile(absolutePath),
    });
  }
  return inventory;
}

async function copyDirectoryContents(source, target) {
  await mkdir(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    assert(
      !entry.isSymbolicLink(),
      `Symbolic links are not allowed: ${sourcePath}`,
    );
    assert(
      !existsSync(targetPath),
      `Copy target already exists: ${targetPath}`,
    );
    await cp(sourcePath, targetPath, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
  }
}

function databaseSnapshotSql() {
  return `
CREATE TEMP TABLE restore_drill_table_stats (
  table_name text PRIMARY KEY,
  row_count bigint NOT NULL,
  content_hash text
);
DO $restore_drill$
DECLARE
  relation record;
  relation_count bigint;
  relation_hash text;
BEGIN
  FOR relation IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', relation.tablename)
      INTO relation_count;
    relation_hash := NULL;
    IF relation_count <= ${deepHashMaxRows} THEN
      EXECUTE format(
        'SELECT md5(COALESCE(string_agg(md5(row_to_json(t)::text), '''' ORDER BY md5(row_to_json(t)::text)), '''')) FROM public.%I t',
        relation.tablename
      ) INTO relation_hash;
    END IF;
    INSERT INTO restore_drill_table_stats VALUES (
      relation.tablename,
      relation_count,
      relation_hash
    );
  END LOOP;
END
$restore_drill$;
SELECT json_build_object(
  'tables', COALESCE((
    SELECT json_agg(json_build_object(
      'name', table_name,
      'rowCount', row_count::text,
      'contentHash', content_hash
    ) ORDER BY table_name)
    FROM restore_drill_table_stats
  ), '[]'::json),
  'sequences', COALESCE((
    SELECT json_agg(json_build_object(
      'name', sequencename,
      'lastValue', last_value::text
    ) ORDER BY sequencename)
    FROM pg_sequences
    WHERE schemaname = 'public'
  ), '[]'::json)
)::text;
`;
}

function collectDatabaseSnapshot(url) {
  const output = psql(url, databaseSnapshotSql());
  const jsonLine = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("{"));
  assert(jsonLine, "Database snapshot query did not return JSON");
  return JSON.parse(jsonLine);
}

function snapshotDigest(snapshot) {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

function assertSnapshotsEqual(expected, actual, context) {
  const expectedTables = new Map(
    expected.tables.map((table) => [table.name, table]),
  );
  const actualTables = new Map(
    actual.tables.map((table) => [table.name, table]),
  );
  const differences = [];
  for (const name of new Set([
    ...expectedTables.keys(),
    ...actualTables.keys(),
  ])) {
    const before = expectedTables.get(name);
    const after = actualTables.get(name);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      differences.push(
        `${name}: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`,
      );
    }
  }
  if (JSON.stringify(expected.sequences) !== JSON.stringify(actual.sequences)) {
    differences.push("public sequences differ");
  }
  assert(
    differences.length === 0,
    `${context}: ${differences.slice(0, 10).join("; ")}`,
  );
}

async function copyObjectSnapshot() {
  const configuredSource =
    (useObjectFixture
      ? objectFixtureDirectory
      : process.env.BACKUP_RESTORE_OBJECT_SOURCE) ??
    process.env.LOCAL_STORAGE_PATH ??
    path.join(root, ".local-storage");
  const source = path.resolve(configuredSource);
  assert(
    source === objectFixtureDirectory || !isInside(tempRoot, source),
    "Object source cannot be inside the restore drill temporary directory",
  );
  await mkdir(backupObjectsDirectory, { recursive: true });
  if (existsSync(source)) {
    assert(statSync(source).isDirectory(), "Object source must be a directory");
    await copyDirectoryContents(source, backupObjectsDirectory);
  }
  return {
    configured: existsSync(source),
    fixture: useObjectFixture,
    files: await fileInventory(backupObjectsDirectory),
  };
}

async function createObjectFixture() {
  if (!useObjectFixture) return;
  await mkdir(path.join(objectFixtureDirectory, "imports"), {
    recursive: true,
  });
  await mkdir(path.join(objectFixtureDirectory, "documents"), {
    recursive: true,
  });
  await writeFile(
    path.join(objectFixtureDirectory, "imports", "supplier.csv"),
    "sku,price,stock\nDM-001,10000,25\n",
    "utf8",
  );
  await writeFile(
    path.join(objectFixtureDirectory, "documents", "order.bin"),
    Buffer.from([0, 1, 2, 3, 254, 255]),
  );
}

async function writeChecksums(objectInventory) {
  const entries = [
    {
      path: "database.dump",
      sha256: await hashFile(dumpPath),
    },
    {
      path: "backup-manifest.json",
      sha256: await hashFile(manifestPath),
    },
    ...objectInventory.map((entry) => ({
      path: `objects/${entry.path}`,
      sha256: entry.sha256,
    })),
  ];
  await writeFile(
    checksumPath,
    `${entries.map((entry) => `${entry.sha256}  ${entry.path}`).join("\n")}\n`,
    "utf8",
  );
  return entries;
}

async function verifyChecksums(entries) {
  for (const entry of entries) {
    const absolutePath = path.join(backupDirectory, ...entry.path.split("/"));
    assert(existsSync(absolutePath), `Backup file is missing: ${entry.path}`);
    assert(
      (await hashFile(absolutePath)) === entry.sha256,
      `Backup checksum mismatch: ${entry.path}`,
    );
  }
}

function rememberApiLog(chunk) {
  apiLogLines.push(...String(chunk).split(/\r?\n/).filter(Boolean));
  if (apiLogLines.length > 120) {
    apiLogLines.splice(0, apiLogLines.length - 120);
  }
}

async function waitForApiReadiness(timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (api.exitCode !== null) {
      throw new Error(
        `Restored API exited with code ${api.exitCode}:\n${apiLogLines.join("\n")}`,
      );
    }
    try {
      const response = await fetch(`${apiBase}/health/ready`);
      if (response.status === 200) {
        const body = await response.json();
        if (body?.status === "ready") return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(
    `Restored API did not become ready within ${timeoutMs} ms:\n${apiLogLines.join("\n")}`,
  );
}

async function startRestoredApi() {
  assert(
    existsSync(apiEntry),
    "API build is missing before restore verification",
  );
  const environment = {
    ...process.env,
    NODE_ENV: "test",
    DEPLOYMENT_PROFILE: "pilot",
    PROCESS_ROLE: "api",
    DATABASE_URL: targetPrismaUrl,
    AUTH_MODE: "development",
    BACKGROUND_QUEUE_ENABLED: "false",
    OBJECT_STORAGE_DRIVER: "local",
    LOCAL_STORAGE_PATH: restoredObjectsDirectory,
    AV_SCAN_MODE: "disabled",
    LOG_LEVEL: "warn",
    OTEL_EXPORTER_OTLP_ENDPOINT: "",
    SENTRY_DSN: "",
    API_HOST: "127.0.0.1",
    API_PORT: String(apiPort),
  };
  api = spawn(process.execPath, [apiEntry], {
    cwd: apiDirectory,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: environment,
  });
  api.stdout.on("data", rememberApiLog);
  api.stderr.on("data", rememberApiLog);
  await waitForApiReadiness();
}

async function stopApi() {
  if (!api || api.exitCode !== null) return;
  api.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => api.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (api.exitCode === null) api.kill("SIGKILL");
}

function ensureSafeScope() {
  assert(
    /^dentmarket_restore_drill_[a-z0-9_]+$/.test(targetDatabaseName),
    "Generated restore database name is unsafe",
  );
  assert(
    databaseIdentity(sourceUrl) !==
      databaseIdentity(parsePostgresUrl(targetToolUrl, "target database")),
    "Restore target must not be the source database",
  );
  const sourceIsLocal = isLocalHostname(sourceUrl.hostname);
  const adminIsLocal = isLocalHostname(adminUrl.hostname);
  if (!sourceIsLocal || !adminIsLocal) {
    assert(
      process.env.BACKUP_RESTORE_ALLOW_REMOTE === "true",
      "Remote backup/restore drill requires BACKUP_RESTORE_ALLOW_REMOTE=true",
    );
    assert(
      process.env.BACKUP_RESTORE_CONFIRM ===
        "I_UNDERSTAND_REMOTE_RESTORE_DRILL",
      "Remote backup/restore drill requires explicit confirmation",
    );
    const sameServer =
      sourceUrl.hostname.toLowerCase() === adminUrl.hostname.toLowerCase() &&
      (sourceUrl.port || "5432") === (adminUrl.port || "5432");
    assert(
      !sameServer || process.env.BACKUP_RESTORE_ALLOW_SAME_SERVER === "true",
      "Remote target must use a separate server unless BACKUP_RESTORE_ALLOW_SAME_SERVER=true",
    );
  }
}

function createTargetDatabase() {
  const existing = psql(
    toPostgresToolUrl(adminUrl),
    `SELECT count(*) FROM pg_database WHERE datname = ${sqlLiteral(targetDatabaseName)};`,
  );
  assert(existing.trim() === "0", "Generated restore target already exists");
  psql(
    toPostgresToolUrl(adminUrl),
    `CREATE DATABASE ${quoteIdentifier(targetDatabaseName)} TEMPLATE template0 ENCODING 'UTF8';`,
  );
  databaseCreated = true;
  psql(
    toPostgresToolUrl(adminUrl),
    `COMMENT ON DATABASE ${quoteIdentifier(targetDatabaseName)} IS ${sqlLiteral(marker)};`,
  );
}

function verifyAdminCapability() {
  const canCreateDatabase = psql(
    toPostgresToolUrl(adminUrl),
    "SELECT (rolcreatedb OR rolsuper)::text FROM pg_roles WHERE rolname = current_user;",
  );
  assert(
    canCreateDatabase.trim() === "true" || canCreateDatabase.trim() === "t",
    "Restore drill admin role cannot create databases; set RESTORE_DRILL_ADMIN_DATABASE_URL to a dedicated admin connection",
  );
}

function dropTargetDatabase() {
  assert(databaseCreated, "Restore target was not created by this process");
  assert(
    /^dentmarket_restore_drill_[a-z0-9_]+$/.test(targetDatabaseName),
    "Refusing to drop an unsafe database name",
  );
  const actualMarker = psql(
    toPostgresToolUrl(adminUrl),
    `SELECT COALESCE(shobj_description(oid, 'pg_database'), '') FROM pg_database WHERE datname = ${sqlLiteral(targetDatabaseName)};`,
  );
  assert(
    actualMarker.trim() === marker,
    "Restore target ownership marker mismatch",
  );
  psql(
    toPostgresToolUrl(adminUrl),
    `DROP DATABASE ${quoteIdentifier(targetDatabaseName)} WITH (FORCE);`,
  );
  databaseCreated = false;
}

async function main() {
  ensureSafeScope();
  verifyAdminCapability();
  await mkdir(backupDirectory, { recursive: true });
  await mkdir(restoredObjectsDirectory, { recursive: true });
  await createObjectFixture();

  const versions = {
    pgDump: toolVersion("pg_dump"),
    pgRestore: toolVersion("pg_restore"),
    psql: toolVersion("psql"),
  };
  const serverVersionNumber = psql(sourceToolUrl, "SHOW server_version_num;");
  const serverMajor = Math.floor(Number(serverVersionNumber) / 10_000);
  assert(
    Number.isInteger(serverMajor) && serverMajor > 0,
    "Invalid server version",
  );
  assert(
    parseMajorVersion(versions.pgDump) >= serverMajor,
    `pg_dump ${versions.pgDump} is older than PostgreSQL server ${serverMajor}`,
  );

  const sourceBeforeDump = collectDatabaseSnapshot(sourceToolUrl);
  const backupStartedAt = Date.now();
  runPostgresTool(
    "pg_dump",
    ["--dbname", sourceToolUrl, "--format", "custom", "--no-owner", "--no-acl"],
    { stdoutFile: dumpPath },
  );
  const backupSeconds = (Date.now() - backupStartedAt) / 1000;
  assert(statSync(dumpPath).size > 0, "pg_dump produced an empty artifact");
  runPostgresTool("pg_restore", ["--list"], { stdinFile: dumpPath });

  const sourceAfterDump = collectDatabaseSnapshot(sourceToolUrl);
  assertSnapshotsEqual(
    sourceBeforeDump,
    sourceAfterDump,
    "Source changed during backup; use a quiesced database or replica",
  );

  const objectSnapshot = await copyObjectSnapshot();
  const manifest = {
    formatVersion: 1,
    runId,
    createdAt: new Date().toISOString(),
    source: {
      host: sourceUrl.hostname,
      port: sourceUrl.port || "5432",
      database: databaseName(sourceUrl),
      serverMajor,
    },
    tools: versions,
    database: {
      bytes: statSync(dumpPath).size,
      snapshotDigest: snapshotDigest(sourceBeforeDump),
      snapshot: sourceBeforeDump,
    },
    objects: {
      configured: objectSnapshot.configured,
      fixture: objectSnapshot.fixture,
      count: objectSnapshot.files.length,
      bytes: objectSnapshot.files.reduce((sum, file) => sum + file.bytes, 0),
      files: objectSnapshot.files,
    },
  };
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  const checksumEntries = await writeChecksums(objectSnapshot.files);
  await verifyChecksums(checksumEntries);

  const restoreStartedAt = Date.now();
  createTargetDatabase();
  runPostgresTool(
    "pg_restore",
    ["--dbname", targetToolUrl, "--no-owner", "--no-acl", "--exit-on-error"],
    { stdinFile: dumpPath },
  );
  const restoreSeconds = (Date.now() - restoreStartedAt) / 1000;

  if (objectSnapshot.files.length > 0) {
    await copyDirectoryContents(
      backupObjectsDirectory,
      restoredObjectsDirectory,
    );
  }
  const restoredObjects = await fileInventory(restoredObjectsDirectory);
  assert(
    JSON.stringify(objectSnapshot.files) === JSON.stringify(restoredObjects),
    "Restored object inventory does not match the backup",
  );

  const validationStartedAt = Date.now();
  const restoredSnapshot = collectDatabaseSnapshot(targetToolUrl);
  assertSnapshotsEqual(
    sourceBeforeDump,
    restoredSnapshot,
    "Restored PostgreSQL data differs from the source snapshot",
  );
  runNpm(
    [
      "exec",
      "--workspace=@marketplace/api",
      "--",
      "prisma",
      "migrate",
      "status",
      "--schema",
      "prisma/schema.prisma",
    ],
    { ...process.env, DATABASE_URL: targetPrismaUrl },
  );
  await startRestoredApi();
  const healthResponse = await fetch(`${apiBase}/health`);
  assert(healthResponse.status === 200, "Restored API liveness check failed");
  const validationSeconds = (Date.now() - validationStartedAt) / 1000;
  const completedAt = new Date();
  const totalSeconds = (completedAt.getTime() - startedAt.getTime()) / 1000;
  const snapshotAgeSeconds =
    (completedAt.getTime() - new Date(manifest.createdAt).getTime()) / 1000;
  const evidence = {
    status: "BACKUP_RESTORE_DRILL_OK",
    runId,
    completedAt: completedAt.toISOString(),
    targetDatabase: targetDatabaseName,
    sourceDatabaseUnchanged: true,
    databaseSnapshotDigest: manifest.database.snapshotDigest,
    tableCount: restoredSnapshot.tables.length,
    deeplyHashedTableCount: restoredSnapshot.tables.filter(
      (table) => table.contentHash,
    ).length,
    objectCount: restoredObjects.length,
    timingsSeconds: {
      backup: Number(backupSeconds.toFixed(3)),
      restore: Number(restoreSeconds.toFixed(3)),
      validation: Number(validationSeconds.toFixed(3)),
      total: Number(totalSeconds.toFixed(3)),
      logicalSnapshotAgeAtValidation: Number(snapshotAgeSeconds.toFixed(3)),
    },
    policy: {
      rpoTargetSeconds: 900,
      rtoTargetSeconds: 14_400,
      pitrVerified: false,
      note: "This gate verifies a quiesced logical snapshot; managed WAL/PITR needs deployment evidence.",
    },
  };
  await writeFile(
    evidencePath,
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify(evidence, null, 2));
}

let failure;
try {
  await main();
} catch (error) {
  failure = error;
} finally {
  try {
    await stopApi();
  } catch (error) {
    failure ??= error;
  }
  if (databaseCreated && !keepTargetDatabase) {
    try {
      dropTargetDatabase();
    } catch (error) {
      failure ??= error;
    }
  }
  if (!keepArtifacts) {
    try {
      assert(isInside(tempRoot, runDirectory), "Unsafe drill cleanup path");
      await rm(runDirectory, { recursive: true, force: true });
    } catch (error) {
      failure ??= error;
    }
  }
}

if (failure) {
  console.error(
    `BACKUP_RESTORE_DRILL_FAILED: ${redact(failure.stack ?? failure)}`,
  );
  process.exitCode = 1;
} else {
  if (keepTargetDatabase) {
    console.log(`Restore target retained by request: ${targetDatabaseName}`);
  } else {
    console.log(`Restore target safely removed: ${targetDatabaseName}`);
  }
  if (keepArtifacts) console.log(`Drill artifacts retained: ${runDirectory}`);
}
