// The settings page: save the Gemini key, test it, and choose a model.

import { getSettings, saveSettings, removeKey } from "../src/shared/settings.js";
import { listModels, pickDefaultModel, ping } from "../src/background/gemini.js";

const $ = (id) => document.getElementById(id);
const form = $("form");
const keyInput = $("key");
const modelSelect = $("model");
const mark = document.querySelector(".dc-mark");

function setStatus(text, kind) {
  $("status").textContent = text;
  $("status").className = `status${kind ? ` is-${kind}` : ""}`;
  mark.dataset.state = { ok: "verified", error: "issues", busy: "checking" }[kind] || "watching";
}

function fillModels(names, selected) {
  modelSelect.replaceChildren(
    ...names.map((name) => Object.assign(document.createElement("option"), { value: name, textContent: name }))
  );
  modelSelect.value = selected;
}

async function init() {
  const { geminiKey, geminiModel } = await getSettings();
  keyInput.value = geminiKey;
  fillModels([geminiModel], geminiModel);
  if (geminiKey) setStatus(`Key saved. Using ${geminiModel}.`, "ok");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const key = keyInput.value.trim();
  if (!key) return setStatus("Paste your key first.", "error");

  $("save").disabled = true;
  setStatus("Checking your key…", "busy");
  try {
    const names = await listModels(key);
    if (!names.length) throw new Error("This key can't use any Gemini models.");
    const model = names.includes(modelSelect.value) ? modelSelect.value : pickDefaultModel(names);
    fillModels(names, model);

    setStatus(`Testing ${model}…`, "busy");
    await ping(key, model);
    await saveSettings({ geminiKey: key, geminiModel: model });
    setStatus(`Connected. doublechckr will use ${model}. Reload Gmail to start.`, "ok");
  } catch (err) {
    setStatus(err.message || String(err), "error");
  } finally {
    $("save").disabled = false;
  }
});

modelSelect.addEventListener("change", async () => {
  await saveSettings({ geminiModel: modelSelect.value });
  setStatus(`Model changed to ${modelSelect.value}.`, "ok");
});

$("toggle").addEventListener("click", () => {
  const hidden = keyInput.type === "password";
  keyInput.type = hidden ? "text" : "password";
  $("toggle").textContent = hidden ? "Hide" : "Show";
});

$("remove").addEventListener("click", async () => {
  await removeKey();
  keyInput.value = "";
  setStatus("Key removed.", null);
});

init();
