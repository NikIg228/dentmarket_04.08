// Pure command construction: importing this module never connects to a database.
export function postgresInvocation(postgresTools, name, args, { stdinFile } = {}) {
  if (postgresTools.mode === "docker") {
    return {
      command: "docker",
      args: [
        "run",
        "--rm",
        // Host fd0 is not forwarded into Docker unless stdin is kept open.
        // Do not allocate a TTY: the custom-format archive is a binary stream.
        ...(stdinFile ? ["--interactive"] : []),
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
