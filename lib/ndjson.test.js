import { describe, expect, it } from "vitest";
import { createNdjsonParser, readNdjsonStream } from "./ndjson.js";

function collect(chunks) {
  const events = [];
  const parser = createNdjsonParser((event) => events.push(event));
  chunks.forEach((chunk) => parser.push(chunk));
  parser.end();
  return events;
}

describe("createNdjsonParser", () => {
  it("reassembles lines split across chunks", () => {
    const events = collect(['{"type":"log","mes', 'sage":"a"}\n{"type":"do', 'ne","runner":{"id":"x"}}\n']);
    expect(events).toEqual([
      { type: "log", message: "a" },
      { type: "done", runner: { id: "x" } },
    ]);
  });

  it("emits a trailing line that never got its newline", () => {
    expect(collect(['{"type":"done","runner":null}'])).toEqual([{ type: "done", runner: null }]);
  });

  it("ignores blank and corrupt lines without dropping the rest", () => {
    const events = collect(['\n{bad json}\n{"type":"log","message":"ok"}\n']);
    expect(events).toEqual([{ type: "log", message: "ok" }]);
  });
});

describe("readNdjsonStream", () => {
  it("reads a web stream to the end", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('{"type":"phase","phase":"image"}\n{"type":'));
        controller.enqueue(encoder.encode('"done","runner":{"id":"abc"}}\n'));
        controller.close();
      },
    });

    const events = [];
    await readNdjsonStream(body, (event) => events.push(event));
    expect(events).toEqual([
      { type: "phase", phase: "image" },
      { type: "done", runner: { id: "abc" } },
    ]);
  });
});
