// Vision embeddings with Gemini Embedding 2: turns page IMAGES and the email
// text into vectors in the same space, so we can measure which pages match
// what the email is about. Runs in the background, where the API key lives.

import { getSettings } from "../shared/settings.js";
import { request, GeminiError } from "./gemini.js";

const MODEL = "gemini-embedding-2";
const DIMENSIONS = 768; // smaller than the 3072 default: faster, and plenty for ranking pages
const IMAGES_PER_CALL = 6; // the API's limit on images per request

async function key() {
  const { geminiKey } = await getSettings();
  if (!geminiKey) throw new GeminiError("no-key", "Gemini isn't set up yet.");
  return geminiKey;
}

// One embedding per item in `contents`.
async function batchEmbed(apiKey, contents) {
  try {
    const data = await request(`models/${MODEL}:batchEmbedContents`, apiKey, {
      requests: contents.map((content) => ({
        model: `models/${MODEL}`,
        content,
        output_dimensionality: DIMENSIONS,
      })),
    });
    const vectors = (data.embeddings || []).map((e) => e.values);
    if (vectors.length !== contents.length) throw new GeminiError("api", "Embedding answer was incomplete.");
    return vectors;
  } catch (err) {
    if (err.code === "no-model") throw new GeminiError("no-embed-model", `${MODEL} isn't available for this key.`);
    throw err;
  }
}

// images: base64 JPEGs, one per page. Sent in groups of 6, all at once.
export async function embedPages(images) {
  const apiKey = await key();
  const groups = [];
  for (let i = 0; i < images.length; i += IMAGES_PER_CALL) {
    const group = images.slice(i, i + IMAGES_PER_CALL);
    groups.push(batchEmbed(apiKey, group.map((data) => ({ parts: [{ inline_data: { mime_type: "image/jpeg", data } }] }))));
  }
  return (await Promise.all(groups)).flat();
}

// Claims from the email, each phrased as a search query (the format Gemini
// Embedding 2 expects). All in one request.
export async function embedQueries(texts) {
  const apiKey = await key();
  return batchEmbed(
    apiKey,
    texts.map((text) => ({ parts: [{ text: `task: search result | query: ${text}` }] }))
  );
}
