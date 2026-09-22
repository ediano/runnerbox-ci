import { describe, expect, it, vi } from "vitest";
import { ensureRunnerImage, imageFor } from "./images.js";

// Um docker falso: o objetivo é o que sai em `onProgress`, não o daemon.
function fakeDocker({ imageExists = false, events = [] } = {}) {
  const notFound = Object.assign(new Error("no such image"), { statusCode: 404 });
  return {
    buildCalls: [],
    getImage() {
      return {
        inspect: () => (imageExists ? Promise.resolve({}) : Promise.reject(notFound)),
      };
    },
    buildImage(context, opts) {
      this.buildCalls.push({ context, opts });
      return Promise.resolve("stream");
    },
    modem: {
      followProgress(_stream, done, onEvent) {
        events.forEach(onEvent);
        done(null, events);
      },
    },
  };
}

describe("ensureRunnerImage", () => {
  it("skips the build and says so when the image is already there", async () => {
    const docker = fakeDocker({ imageExists: true });
    const onProgress = vi.fn();

    await expect(ensureRunnerImage(docker, "github", onProgress)).resolves.toBe(imageFor("github"));
    expect(docker.buildCalls).toHaveLength(0);
    expect(onProgress).toHaveBeenCalledWith({
      type: "phase",
      phase: "image",
      message: `Image ${imageFor("github")} is already available.`,
    });
  });

  it("forwards build output and base-image pull progress as structured events", async () => {
    const docker = fakeDocker({
      events: [
        { status: "Pulling from library/ubuntu", id: "latest" },
        { status: "Downloading", id: "a1b2", progressDetail: { current: 10, total: 100 } },
        { stream: "Step 1/9 : FROM ubuntu\n" },
        { stream: "   \n" },
        { status: "Downloading" },
      ],
    });
    const onProgress = vi.fn();

    await ensureRunnerImage(docker, "gitlab", onProgress);

    const events = onProgress.mock.calls.map(([event]) => event);
    expect(events).toEqual([
      { type: "phase", phase: "image", message: `Building image ${imageFor("gitlab")}…` },
      { type: "pull", layer: "latest", status: "Pulling from library/ubuntu", current: undefined, total: undefined },
      { type: "pull", layer: "a1b2", status: "Downloading", current: 10, total: 100 },
      { type: "log", message: "Step 1/9 : FROM ubuntu" },
    ]);
  });

  it("rejects when the build stream reports an error mid-output", async () => {
    // O daemon devolve 200 mesmo assim: o erro só aparece como evento.
    const docker = fakeDocker({
      events: [{ stream: "Step 1/9\n" }, { error: "returned a non-zero code: 1" }],
    });

    await expect(ensureRunnerImage(docker, "github", () => {})).rejects.toThrow(
      "returned a non-zero code: 1"
    );
  });
});
