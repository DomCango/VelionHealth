const SUPABASE_URL = 'https://lhavkiozawvlujstilhn.supabase.co';

function digitsOnly(phone) {
  const d = (phone || '').replace(/\D/g, '');
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
}

const ATTENTION_KEYWORDS = [
  'worse', 'worsening', 'emergency', 'bleeding', 'blood', 'severe',
  "can't breathe", 'cant breathe', 'chest pain', 'fever', 'infection',
  'help', 'urgent', 'hospital', 'swelling', 'allergic reaction',
];

function needsAttention(body) {
  const lower = (body || '').toLowerCase();
  return ATTENTION_KEYWORDS.some((kw) => lower.includes(kw));
}

module.exports = async (req, res) => {
  res.setHeader('content-type', 'text/xml');

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const from = req.body?.From;
  const body = req.body?.Body;

  if (!serviceRoleKey || !from || !body) {
    res.status(200).send('<Response></Response>');
    return;
  }

  try {
    const incomingDigits = digitsOnly(from);

    const patientsRes = await fetch(`${SUPABASE_URL}/rest/v1/patients?select=id,clinic_id,phone`, {
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
      },
    });
    const patients = await patientsRes.json();

    const match = (Array.isArray(patients) ? patients : []).find(
      (p) => digitsOnly(p.phone) === incomingDigits
    );

    if (match) {
      await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
        method: 'POST',
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          'content-type': 'application/json',
          prefer: 'return=minimal',
        },
        body: JSON.stringify({
          clinic_id: match.clinic_id,
          patient_id: match.id,
          direction: 'inbound',
          body,
          needs_attention: needsAttention(body),
        }),
      });
    }

    res.status(200).send('<Response></Response>');
  } catch (err) {
    res.status(200).send('<Response></Response>');
  }
};
