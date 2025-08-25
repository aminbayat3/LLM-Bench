import express from "express";
import client from "prom-client";

// ---- config via env vars ----
const OLLAMA_BASE = process.env.OLLAMA_BASE || "http://localhost:11434";
const RUNTIME_LABEL = process.env.RUNTIME_LABEL || "ollama";
const TEST_ENV_LABEL = process.env.TEST_ENV_LABEL || "in-cluster";

const app = express();
app.use(express.json());

// ---- Prometheus metrics ----
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const ttft = new client.Histogram({
  name: "inference_ttft_seconds",
  help: "Time to first token (seconds).",
  labelNames: ["model", "runtime", "test_env"],
  registers: [register],
});

const total = new client.Histogram({
  name: "inference_total_time_seconds",
  help: "Total time from request to completion (seconds).",
  labelNames: ["model", "runtime", "test_env"],
  registers: [register],
});

const tps = new client.Gauge({
  name: "inference_tokens_per_second",
  help: "Tokens per second (as reported by runtime if available).",
  labelNames: ["model", "runtime", "test_env"],
  registers: [register],
});

const reqs = new client.Counter({
  name: "inference_requests_total",
  help: "Total benchmarked requests.",
  labelNames: ["model", "runtime", "test_env", "status"],
  registers: [register],
});

// ---- routes ----

// health
app.get("/healthz", (req, res) => res.send("ok"));

// simple docs
app.get("/", (req, res) => {
  res.type("text").send(`
BenchClient (Node.js)
POST /bench       -> run one benchmark call
GET  /metrics     -> Prometheus metrics
`);
});

// Prometheus scrape
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// ---- single-run benchmark ----
app.post("/bench", async (req, res) => {
  const { model = "unknown", ...rest } = req.body || {};
  const labels = { model, runtime: RUNTIME_LABEL, test_env: TEST_ENV_LABEL };

  // force stream=true
  const payload = { ...rest, model, stream: true };

  const url = `${OLLAMA_BASE}/api/generate`;
  const start = process.hrtime.bigint();
  let ttftSec = 0;
  let first = false;
  let evalCount = null;
  let evalDurationNs = null;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      reqs.labels({ ...labels, status: "error" }).inc();
      return res.status(500).json({ error: response.statusText });
    }

    // Web Streams API (Node 18+)
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Ollama sends JSONL — split on newlines
      let lines = buffer.split("\n");
      buffer = lines.pop(); // keep partial line

      for (let line of lines) {
        if (!line.trim()) continue;

        let chunk;
        try {
          chunk = JSON.parse(line);
        } catch {
          continue;
        }

        if (!first && chunk.response) {
          const now = process.hrtime.bigint();
          ttftSec = Number(now - start) / 1e9; // ns -> s
          ttft.labels(labels).observe(ttftSec);
          first = true;
        }

        if (chunk.done) {
          evalCount = chunk.eval_count;
          evalDurationNs = chunk.eval_duration;
        }
      }
    }

    // (optional) flush any leftover partial line
    if (buffer.trim()) {
      try {
        const chunk = JSON.parse(buffer);
        if (!first && chunk.response) {
          const now = process.hrtime.bigint();
          ttftSec = Number(now - start) / 1e9;
          ttft.labels(labels).observe(ttftSec);
          first = true;
        }
        if (chunk.done) {
          evalCount = chunk.eval_count;
          evalDurationNs = chunk.eval_duration;
        }
      } catch(e) {
        return res.status(500).json({ error: err.message });
      }
    }

    const end = process.hrtime.bigint();
    const totalSec = Number(end - start) / 1e9;
    total.labels(labels).observe(totalSec);

    if (evalCount && evalDurationNs > 0) {
      const seconds = evalDurationNs / 1e9;
      if (seconds > 0) tps.labels(labels).set(evalCount / seconds);
    }

    reqs.labels({ ...labels, status: "ok" }).inc();

    return res.json({
      model,
      runtime: RUNTIME_LABEL,
      test_env: TEST_ENV_LABEL,
      ttft_seconds: ttftSec,
      total_seconds: totalSec,
      tokens_per_second:
        evalCount && evalDurationNs > 0
          ? evalCount / (evalDurationNs / 1e9)
          : null,
    });
  } catch (err) {
    reqs.labels({ ...labels, status: "error" }).inc();
    return res.status(500).json({ error: err.message });
  }
});

// ---- start server ----
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`BenchClient running on :${port}`);
});
