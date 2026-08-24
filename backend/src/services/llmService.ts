import { env } from "../config/env";

export interface PreVisitSummary {
  urgency: "Low" | "Medium" | "High";
  chiefComplaint: string;
  suggestedQuestions: string[];
}

export interface LlmResult<T> {
  ok: boolean;
  data?: T;
  fallbackUsed: boolean;
  error?: string;
}

const GEMINI_URL_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Calls the Gemini generateContent API with a system prompt that forces
 * JSON-only output, and parses the result. Never throws: callers always
 * get a result object so a flaky LLM call can never break booking flow.
 */
async function callGeminiJson<T>(systemPrompt: string, userPrompt: string, timeoutMs = 15000): Promise<LlmResult<T>> {
  if (!env.geminiApiKey) {
    return { ok: false, fallbackUsed: true, error: "GEMINI_API_KEY is not configured" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${GEMINI_URL_BASE}/${env.geminiModel}:generateContent?key=${env.geminiApiKey}`;
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
          maxOutputTokens: 800,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, fallbackUsed: true, error: `LLM API returned ${res.status}: ${body.slice(0, 300)}` };
    }

    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const textBlock = json.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;
    if (!textBlock) {
      return { ok: false, fallbackUsed: true, error: "LLM response had no text content" };
    }

    const cleaned = textBlock.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned) as T;
    return { ok: true, data: parsed, fallbackUsed: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown LLM error";
    return { ok: false, fallbackUsed: true, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Pre-visit summary: "Analyse these symptoms and return: urgency level
 * (Low / Medium / High), chief complaint, and three suggested questions
 * for the doctor."
 *
 * On failure, returns a safe fallback (Medium urgency, so a human always
 * reviews it) instead of throwing, per the "LLM failures must be handled
 * gracefully" requirement.
 */
export async function generatePreVisitSummary(symptomsText: string): Promise<LlmResult<PreVisitSummary>> {
  const system = [
    "You are a clinical triage assistant helping a doctor prepare for a patient visit.",
    "You are not diagnosing. Analyse the patient-reported symptoms and return STRICT JSON only,",
    "with this exact shape and no extra commentary or markdown fences:",
    '{"urgency":"Low"|"Medium"|"High","chiefComplaint":"<one short sentence>","suggestedQuestions":["<q1>","<q2>","<q3>"]}',
    "Use High urgency for anything suggesting a medical emergency (chest pain, difficulty breathing,",
    "severe bleeding, stroke signs, etc.) so the clinic can escalate.",
  ].join(" ");

  const user = `Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: ${symptomsText}`;

  const result = await callGeminiJson<PreVisitSummary>(system, user);
  if (result.ok && result.data) {
    return result;
  }

  // Graceful fallback: default to Medium urgency (never silently "Low", so
  // nothing slips through unreviewed) and flag it clearly for the doctor.
  return {
    ok: false,
    fallbackUsed: true,
    error: result.error,
    data: {
      urgency: "Medium",
      chiefComplaint: "Automatic summary unavailable — please review the patient's raw symptom notes below.",
      suggestedQuestions: [
        "Can you describe when these symptoms started and how they've changed?",
        "Have you noticed anything that makes symptoms better or worse?",
        "Are you currently taking any medications or have relevant medical history?",
      ],
    },
  };
}

/**
 * Post-visit summary: "Convert these clinical notes into a patient-friendly
 * summary with medication schedule and follow-up steps."
 */
export async function generatePostVisitSummary(
  doctorNotes: string,
  prescription: Array<{ medication: string; dosage: string; frequencyPerDay: number; durationDays: number }>
): Promise<LlmResult<string>> {
  const system = [
    "You are a medical communication assistant. Rewrite clinical notes into a warm, plain-language",
    "summary a patient with no medical background can understand. Include a clear medication schedule",
    "and concrete follow-up steps. Return STRICT JSON only, no markdown fences:",
    '{"summary":"<patient-friendly text, may include newlines>"}',
  ].join(" ");

  const user = `Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: ${doctorNotes}\n\nPrescription: ${JSON.stringify(
    prescription
  )}`;

  const result = await callGeminiJson<{ summary: string }>(system, user);
  if (result.ok && result.data?.summary) {
    return { ok: true, fallbackUsed: false, data: result.data.summary };
  }

  const scheduleLines = prescription
    .map((p) => `- ${p.medication} (${p.dosage}): ${p.frequencyPerDay}x/day for ${p.durationDays} days`)
    .join("\n");

  return {
    ok: false,
    fallbackUsed: true,
    error: result.error,
    data: [
      "Your doctor's notes are below. Our automatic summary tool is temporarily unavailable,",
      "so please read this carefully or call the clinic if anything is unclear.",
      "",
      doctorNotes,
      "",
      "Medication schedule:",
      scheduleLines || "No medication prescribed.",
    ].join("\n"),
  };
}
