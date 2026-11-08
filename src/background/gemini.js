// Talks to the Gemini API. Runs in the extension's background, so the API key
// never touches Gmail's page.

import { getSettings, saveSettings } from "../shared/settings.js";
import { SYSTEM_PROMPT, RESPONSE_SCHEMA, SCREEN_PROMPT, SCREEN_SCHEMA, buildParts } from "./prompt.js";

const API = "https://generativelanguage.googleapis.com/v1beta";
const TIMEOUT_MS = 45000;

export class GeminiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // no-key, bad-key, no-model, rate-limit, timeout, api, empty, bad-json
  }
}

// Gemini answers "too many requests" (429) when the free tier's per-minute
// limit is hit, often with how long to wait. If that wait is short, wait and
// try once more instead of failing.
const MAX_RETRY_WAIT_S = 10;

export async function request(path, key, body) {
  try {
    return await requestOnce(path, key, body);
  } catch (err) {
    if (err.code !== "rate-limit" || err.retryAfter == null || err.retryAfter > MAX_RETRY_WAIT_S) throw err;
    await new Promise((resolve) => setTimeout(resolve, (err.retryAfter + 0.5) * 1000));
    return requestOnce(path, key, body);
  }
}

async function requestOnce(path, key, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API}/${path}`, {
      method: body ? "POST" : "GET",
      headers: { "x-goog-api-key": key, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw toError(res.status, data);
    return data;
  } catch (err) {
    if (err.name === "AbortError") throw new GeminiError("timeout", "Gemini took too long to answer.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function toError(status, data) {
  const message = data?.error?.message || `HTTP ${status}`;
  if (status === 401 || status === 403 || (status === 400 && /api key/i.test(message))) {
    return new GeminiError("bad-key", "Gemini didn't accept the API key.");
  }
  if (status === 404) return new GeminiError("no-model", message);
  if (status === 429) {
    const err = new GeminiError("rate-limit", "Gemini's free limit was hit. Try again in a minute.");
    // e.g. { "@type": "...RetryInfo", "retryDelay": "7s" }
    const delay = (data?.error?.details || []).find((d) => d.retryDelay)?.retryDelay;
    if (delay) err.retryAfter = parseFloat(delay);
    return err;
  }
  if (status >= 500) return new GeminiError("busy", `Gemini is having trouble right now (${status}).`);
  return new GeminiError("api", `Gemini error: ${message}`);
}

// Gemini models this key can use for text + images.
export async function listModels(key) {
  const data = await request("models?pageSize=200", key);
  return (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((name) => /^gemini-/.test(name) && !/(tts|image|embedding|live|audio|robotics|computer)/.test(name));
}

// Prefer the newest plain "flash" model: fast and cheap.
export function pickDefaultModel(names) {
  const flash = names
    .map((name) => ({ name, version: /^gemini-(\d+(?:\.\d+)?)-flash$/.exec(name)?.[1] }))
    .filter((m) => m.version)
    .sort((a, b) => Number(b.version) - Number(a.version));
  return flash[0]?.name || names.find((n) => n.includes("flash")) || names[0] || null;
}

// A tiny request to confirm the key and model work.
export function ping(key, model) {
  return request(`models/${model}:generateContent`, key, {
    contents: [{ role: "user", parts: [{ text: "Reply with the word OK." }] }],
  });
}

// Gemini "thinks" before answering, which is the slowest part. A match check
// doesn't need much, so turn it down. Each model family names this setting
// differently; unknown models keep their default.
function lowThinking(model) {
  if (/^gemini-2\.5-flash/.test(model)) return { thinkingBudget: 0 }; // off
  if (/^gemini-2\.5-pro/.test(model)) return { thinkingBudget: 128 }; // lowest allowed
  if (/^gemini-([3-9]|\d\d)/.test(model)) return { thinkingLevel: "low" };
  return null;
}

// Models that rejected the low-thinking setting; skip it for them from now on.
const thinkingUnsupported = new Set();

async function generate(model, key, body) {
  const thinking = thinkingUnsupported.has(model) ? null : lowThinking(model);
  const withThinking = thinking
    ? { ...body, generationConfig: { ...body.generationConfig, thinkingConfig: thinking } }
    : body;
  try {
    return await request(`models/${model}:generateContent`, key, withThinking);
  } catch (err) {
    if (!thinking || err.code !== "api" || !/think/i.test(err.message)) throw err;
    thinkingUnsupported.add(model);
    return request(`models/${model}:generateContent`, key, body);
  }
}

// Send one request and return { model, parsed } with the JSON answer.
async function askForJson(systemPrompt, parts, schema) {
  const { geminiKey, geminiModel } = await getSettings();
  if (!geminiKey) throw new GeminiError("no-key", "Gemini isn't set up yet.");

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts }],
    generationConfig: { responseMimeType: "application/json", responseSchema: schema },
  };

  let model = geminiModel;
  let data;
  try {
    data = await generate(model, geminiKey, body);
  } catch (err) {
    // The saved model was retired or renamed: pick a current one and retry.
    if (err.code !== "no-model") throw err;
    model = pickDefaultModel(await listModels(geminiKey));
    if (!model) throw err;
    await saveSettings({ geminiModel: model });
    data = await generate(model, geminiKey, body);
  }

  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts || [])
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text)
    .join("");
  if (!text) {
    const reason = candidate?.finishReason || data.promptFeedback?.blockReason || "unknown reason";
    throw new GeminiError("empty", `Gemini didn't answer (${reason}).`);
  }

  try {
    return { model, parsed: JSON.parse(text) };
  } catch {
    throw new GeminiError("bad-json", "Gemini's answer was in the wrong format.");
  }
}

// Ask Gemini to compare an email with one attachment.
export async function compare(payload) {
  const { model, parsed } = await askForJson(SYSTEM_PROMPT, buildParts(payload), RESPONSE_SCHEMA);
  return {
    model,
    summary: parsed.summary || "",
    findings: Array.isArray(parsed.findings) ? parsed.findings : [],
    sensitive_document: parsed.sensitive_document || "none",
    sensitive_page: parsed.sensitive_page || 1,
  };
}

// Privacy screen: are any of these small, blurred thumbnails an ID or a card?
// The thumbnails are too blurry to read numbers from.
export async function screen(images) {
  const parts = images.flatMap((image) => [
    { text: `Blurred thumbnail of page ${image.page}:` },
    { inline_data: { mime_type: "image/jpeg", data: image.data } },
  ]);
  const { model, parsed } = await askForJson(SCREEN_PROMPT, parts, SCREEN_SCHEMA);
  return {
    model,
    sensitive_document: parsed.sensitive_document || "none",
    sensitive_page: parsed.sensitive_page || images[0]?.page || 1,
  };
}
