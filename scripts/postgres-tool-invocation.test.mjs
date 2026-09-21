import assert from "node:assert/strict";
import { test } from "node:test";
import { postgresInvocation } from "./lib/postgres-tool-invocation.mjs";

const docker = { mode: "docker", image: "postgres:17-alpine" };

for (const args of [
  ["--list"],
  ["--dbname", "synthetic_restore_target", "--no-owner", "--no-acl", "--exit-on-error"],
]) {
  test(`Docker pg_restore ${args[0]} forwards archive stdin without a TTY`, () => {
    const invocation = postgresInvocation(docker, "pg_restore", args, {
      stdinFile: "C:/synthetic fixtures/database.dump",
    });
    assert.deepEqual(invocation, {
      command: "docker",
      args: ["run", "--rm", "--interactive", "--network", "host", docker.image, "pg_restore", ...args],
    });
    assert.ok(!invocation.args.includes("--tty") && !invocation.args.includes("-t"));
    assert.ok(!invocation.args.includes("C:/synthetic fixtures/database.dump"));
  });
}

for (const [name, args] of [
  ["pg_dump", ["--dbname", "synthetic_source", "--format", "custom"]],
  ["psql", ["--command", "SELECT 1"]],
  ["pg_restore", ["--version"]],
]) {
  test(`Docker ${name} ${args[0]} without stdin retains its command`, () => {
    assert.deepEqual(postgresInvocation(docker, name, args), {
      command: "docker",
      args: ["run", "--rm", "--network", "host", docker.image, name, ...args],
    });
  });
}

test("native restore keeps its executable and argument boundaries with stdin", () => {
  const native = { mode: "native", commands: { pg_restore: "C:/Program Files/PostgreSQL/17/bin/pg_restore.exe" } };
  const args = ["--dbname", "synthetic target with spaces", "--exit-on-error"];
  assert.deepEqual(postgresInvocation(native, "pg_restore", args, { stdinFile: "synthetic.dump" }), {
    command: native.commands.pg_restore, args,
  });
});

test("Docker keeps the configured image, tool and original arguments", () => {
  const tools = { ...docker, image: "postgres:17.11-alpine" };
  const args = ["--list"];
  const before = [...args];
  const invocation = postgresInvocation(tools, "pg_restore", args, { stdinFile: "synthetic.dump" });
  assert.deepEqual(args, before);
  assert.deepEqual(invocation.args.slice(-3), [tools.image, "pg_restore", "--list"]);
});
