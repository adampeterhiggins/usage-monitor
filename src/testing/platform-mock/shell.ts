interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

function run(name: string, args: string[]): CommandResult {
  // The only shell call the app makes is `gh auth token` for GitHub auth import.
  if (name === "gh" && args[0] === "auth" && args[1] === "token") {
    return { code: 0, stdout: "ghp_mock_github_token\n", stderr: "" };
  }
  return { code: 1, stdout: "", stderr: `[mock-tauri] unstubbed command: ${name} ${args.join(" ")}` };
}

/** plugin-shell `Command` subset: the app only uses `Command.create().execute()`. */
export class Command {
  static create(name: string, args: string[] = []) {
    return {
      execute: async (): Promise<CommandResult> => run(name, args),
    };
  }
}
