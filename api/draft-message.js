const FLAG_PATTERNS = [
  /\b\d+\s?(mg|mcg|ml|milligrams?|micrograms?)\b/i,
  /\b(twice|once|three times)\s+(a|per)\s+day\b/i,
  /\bdiagnos(e|is|ed|ing)\b/i,
  /\bprescri(be|bed|ption)\b/i,
  /\b(guarantee|promise|will (cure|heal|fix))\b/i,
];

const SYSTEM_PROMPT = `You are a clinical communication assistant for a small medical practice. You write short, warm, patient-friendly follow-up messages on behalf of clinic staff.

Strict rules you must never break:
- Never diagnose a patient or suggest a diagnosis.
- Never invent medical information, medication names, dosages, or schedules.
- Never state or imply aftercare instructions beyond what is explicitly given to you.
- Never promise a medical outcome ("you will heal", "this will fix it", etc).
- Never independently address urgent or emergency clinical concerns — if the note mentions anything urgent, tell the patient to contact the clinic directly instead of giving guidance yourself.
- Only reference the clinic-approved instructions given to you below; do not add your own medical advice beyond them.
- Keep the tone warm, concise, and professional — 2 to 4 short sentences.
- Do not include a signature block or repeat the clinic's name more than once.`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { patientFirstName, followUpType, doctorNote, clinicInstructions } = req.body || {};

  if (!doctorNote || !followUpType) {
    res.status(400).json({ error: "Missing follow-up type or doctor's note." });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'AI drafting is not configured yet — the ANTHROPIC_API_KEY environment variable is missing on the server.' });
    return;
  }

  const userPrompt = `Patient first name: ${patientFirstName || 'the patient'}
Follow-up type: ${followUpType}
Doctor's note: ${doctorNote}

Clinic-approved standard instructions (reference these, do not contradict them; if empty, none were provided):
${clinicInstructions || '(none provided)'}

Write the follow-up message to send to this patient.`;

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    const data = await aiRes.json();

    if (!aiRes.ok) {
      res.status(aiRes.status).json({ error: data?.error?.message || 'The AI request failed.' });
      return;
    }

    const draftText = (data.content || []).map((block) => block.text || '').join('').trim();
    const flagged = FLAG_PATTERNS.some((pattern) => pattern.test(draftText));

    res.status(200).json({ draftText, flagged });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong generating the message.' });
  }
};
