import { describe, expect, it } from "vitest";
import { parseRegisterCommand } from "./register-command.js";

describe("parseRegisterCommand", () => {
  it("extracts url and token from the GitHub config.sh command", () => {
    expect(
      parseRegisterCommand("./config.sh --url https://github.com/user/repository --token ATPAjhgfsdhjgfhjsd78677634")
    ).toEqual({ url: "https://github.com/user/repository", token: "ATPAjhgfsdhjgfhjsd78677634", name: null });
  });

  it("accepts --flag=value and quoted values", () => {
    expect(parseRegisterCommand(`./config.sh --url="https://github.com/org" --token='ABC 123'`)).toEqual({
      url: "https://github.com/org",
      token: "ABC 123",
      name: null,
    });
  });

  it("accepts the Windows command", () => {
    expect(parseRegisterCommand(".\\config.cmd --url https://github.com/org/repo --token XYZ")).toMatchObject({
      url: "https://github.com/org/repo",
      token: "XYZ",
    });
  });

  it("joins commands split across lines", () => {
    const text = "./config.sh \\\n  --url https://github.com/org/repo \\\n  --token XYZ\n";
    expect(parseRegisterCommand(text)).toMatchObject({ url: "https://github.com/org/repo", token: "XYZ" });
    const powershell = "./config.cmd `\r\n  --url https://github.com/org/repo `\r\n  --token XYZ";
    expect(parseRegisterCommand(powershell)).toMatchObject({ url: "https://github.com/org/repo", token: "XYZ" });
  });

  it("picks up --name when present", () => {
    expect(parseRegisterCommand("./config.sh --url https://github.com/o/r --token T --name build-01").name).toBe(
      "build-01"
    );
  });

  it("understands the GitLab register command", () => {
    expect(
      parseRegisterCommand("gitlab-runner register --url https://gitlab.com --token glrt-abc123")
    ).toMatchObject({ url: "https://gitlab.com", token: "glrt-abc123" });
    expect(
      parseRegisterCommand("sudo gitlab-runner register --url https://gitlab.com --registration-token GR1348941xyz")
    ).toMatchObject({ token: "GR1348941xyz" });
  });

  it("ignores plain values and incomplete commands", () => {
    expect(parseRegisterCommand("https://github.com/org/repo")).toBeNull();
    expect(parseRegisterCommand("ATPAjhgfsdhjgfhjsd78677634")).toBeNull();
    expect(parseRegisterCommand("./config.sh --url https://github.com/org/repo")).toBeNull();
    expect(parseRegisterCommand("./config.sh --url --token XYZ")).toBeNull();
    expect(parseRegisterCommand(undefined)).toBeNull();
  });
});
