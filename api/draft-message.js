const SUPABASE_URL = 'https://lhavkiozawvlujstilhn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoYXZraW96YXd2bHVqc3RpbGhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NTQ1MjUsImV4cCI6MjEwMDEzMDUyNX0.8rJtscjlZ2MdUH6X8P9bI4waMzSjdO-IBWpkxEwcOYs';

const FLAG_PATTERNS = [
  /\b\d+\s?(mg|mcg|ml|milligrams?|micrograms?)\b/i,
  /\b(twice|once|three times)\s+(a|per)\s+day\b/i,
  /\bdiagnos(e|is|ed|ing)\b/i,
  /\bprescri(be|bed|ption)\b/i,
  /\b(guarantee|promise|will (cure|heal|fix))\b/i,
];

async function isValidSession(accessToken) {
  if (!accessToken) return false;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${accessToken}` },
  });
  return res.ok;
}

const SYSTEM_PROMPT = `You are a clinical communication assistant for a small medical practice. You write short, warm, patient-friendly follow-up messages on behalf of clinic staff.

The doctor's note is the source of truth. Your job is to turn it into patient-friendly wording, not to add clinical judgment of your own.

Strict rules you must never break:
- Never independently diagnose a patient or introduce a diagnosis, assessment, or clinical conclusion that is not explicitly stated in the doctor's note. If the doctor's note explicitly states a diagnosis or assessment, you may relay it in warm, plain-language wording. You are communicating what the doctor already determined, not diagnosing anything yourself.
- Never invent medical information, medication names, dosages, or schedules beyond exactly what the doctor's note gives you.
- Never state or imply aftercare instructions beyond what is explicitly given to you.
- Never independently promise a medical outcome ("this will definitely go away", etc). You may relay a specific outcome or timeline the doctor's note explicitly states, but do not add reassurance beyond what it says.
- Never independently address urgent or unresolved clinical concerns. If the note describes something urgent, or something still pending (e.g. test results not back yet), tell the patient to contact the clinic directly rather than reassuring them or offering guidance yourself, even if the note also includes a preliminary assessment.
- Only reference the clinic-approved instructions given to you below; do not add your own medical advice beyond them or beyond what the doctor's note explicitly states.
- Keep the tone warm, concise, and professional: 2 to 4 short sentences.
- Do not include a signature block or repeat the clinic's name more than once.
- Never use an em dash (—) anywhere in the message. Use a period, comma, or "and" instead.`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { patientFirstName, followUpType, doctorNote, clinicInstructions, accessToken } = req.body || {};

  if (!(await isValidSession(accessToken))) {
    res.status(401).json({ error: 'Please log in again.' });
    return;
  }

  if (!doctorNote || !followUpType) {
    res.status(400).json({ error: "Missing follow-up type or doctor's note." });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'AI drafting is not configured yet. The ANTHROPIC_API_KEY environment variable is missing on the server.' });
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
