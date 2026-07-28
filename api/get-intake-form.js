const SUPABASE_URL = 'https://lhavkiozawvlujstilhn.supabase.co';

module.exports = async (req, res) => {
  const token = req.query.token;
  if (!token) {
    res.status(400).json({ error: 'Missing form token.' });
    return;
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    res.status(500).json({ error: 'Intake forms are not configured on the server.' });
    return;
  }

  try {
    const formRes = await fetch(
      `${SUPABASE_URL}/rest/v1/intake_forms?token=eq.${encodeURIComponent(token)}&select=status,expires_at,clinics(name),patients(full_name,date_of_birth,phone,email)`,
      {
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );
    const forms = await formRes.json();

    if (!formRes.ok || !Array.isArray(forms) || !forms.length) {
      res.status(404).json({ error: 'This form link is not valid.' });
      return;
    }

    const form = forms[0];

    if (form.status === 'completed') {
      res.status(200).json({ status: 'completed' });
      return;
    }
    if (new Date(form.expires_at) < new Date()) {
      res.status(400).json({ error: 'This form link has expired. Ask the clinic to send a new one.' });
      return;
    }

    res.status(200).json({
      status: 'pending',
      clinicName: form.clinics?.name || 'your clinic',
      patient: form.patients || {},
    });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong loading this form.' });
  }
};
