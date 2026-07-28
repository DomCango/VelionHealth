const SUPABASE_URL = 'https://lhavkiozawvlujstilhn.supabase.co';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { token, responses } = req.body || {};
  if (!token || !responses) {
    res.status(400).json({ error: 'Missing form token or responses.' });
    return;
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    res.status(500).json({ error: 'Intake forms are not configured on the server.' });
    return;
  }

  const adminHeaders = {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    'content-type': 'application/json',
  };

  try {
    const formRes = await fetch(
      `${SUPABASE_URL}/rest/v1/intake_forms?token=eq.${encodeURIComponent(token)}&select=id,status,expires_at`,
      { headers: adminHeaders }
    );
    const forms = await formRes.json();

    if (!formRes.ok || !Array.isArray(forms) || !forms.length) {
      res.status(404).json({ error: 'This form link is not valid.' });
      return;
    }
    const form = forms[0];
    if (form.status === 'completed') {
      res.status(400).json({ error: 'This form has already been submitted.' });
      return;
    }
    if (new Date(form.expires_at) < new Date()) {
      res.status(400).json({ error: 'This form link has expired. Ask the clinic to send a new one.' });
      return;
    }

    const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/intake_forms?id=eq.${form.id}`, {
      method: 'PATCH',
      headers: { ...adminHeaders, prefer: 'return=minimal' },
      body: JSON.stringify({
        status: 'completed',
        responses,
        completed_at: new Date().toISOString(),
      }),
    });

    if (!updateRes.ok) {
      res.status(500).json({ error: 'Could not save your responses. Please try again.' });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong submitting this form.' });
  }
};
