#!/usr/bin/env bun
export {};

const prompt = await Bun.stdin.text();
const emit = (value: unknown) => console.log(JSON.stringify(value));
emit({ type: "system", subtype: "init", session_id: "T-fake-remote-thread" });
emit({ type: "assistant", message: { content: [{ type: "text", text: "Onderzoek afgerond ✓" }] } });
if (!prompt.includes("FAKE_DISCONNECT")) {
  emit({
    type: "result",
    subtype: "success",
    is_error: false,
    session_id: "T-fake-remote-thread",
    result: JSON.stringify({
      summary: "Onderzocht",
      questions: [{ question: "Welke doelgroep?", recipient: "client", blocks: "implementation" }],
      ...(prompt.includes("FAKE_MISSING_SCREENSHOT")
        ? {
            evidence: [
              {
                title: "Login required",
                kind: "screenshot",
                url: "",
                notes: "Screenshot stored at .amp/in/artifacts/login.png",
                revision: "synthetic-revision",
                criterion: "The original flow works",
                checkStatus: "passed",
              },
              { title: "Source inspected", kind: "document", revision: "synthetic-revision" },
            ],
          }
        : {}),
    }),
  });
}
