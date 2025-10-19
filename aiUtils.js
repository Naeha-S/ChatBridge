// aiUtils.js

// Wait for Gemini Nano to be ready
export async function waitForGeminiReady() {
  while (true) {
    const ready = await window.ai.canCreatePrompt();
    if (ready === 'readily') break;
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log("✅ Gemini Nano is ready!");
}

// Summarizer
export async function summarizeText(text) {
  await waitForGeminiReady();
  const session = await window.ai.createPromptSession();
  const result = await session.prompt(`Summarize this text clearly:\n${text}`);
  return result;
}

// Rewriter
export async function rewriteText(text, tone = "concise and clear") {
  await waitForGeminiReady();
  const session = await window.ai.createPromptSession();
  const result = await session.prompt(`Rewrite this text in a ${tone} tone:\n${text}`);
  return result;
}

// Translator
export async function translateText(text, targetLang = "English") {
  await waitForGeminiReady();
  const session = await window.ai.createPromptSession();
  const result = await session.prompt(`Translate this text to ${targetLang}:\n${text}`);
  return result;
}
