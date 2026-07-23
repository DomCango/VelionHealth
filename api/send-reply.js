const SUPABASE_URL = 'https://lhavkiozawvlujstilhn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoYXZraW96YXd2bHVqc3RpbGhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NTQ1MjUsImV4cCI6MjEwMDEzMDUyNX0.8rJtscjlZ2MdUH6X8P9bI4waMzSjdO-IBWpkxEwcOYs';

function toE164(phone) {
  if (!phone) return null;
  if (phone.startsWith('+')) return phone;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { patientId, body, accessToken } = req.body || {};
  if (!patientId || !body || !accessToken) {
    res.status(400).json({ error: 'Missing patient, message body, or session.' });
    return;
  }

  const userHeaders = {
    apikey: SUPABASE_ANON_KEY,
    authorization: `Bearer ${accessToken}`,
  };

  try {
    const patientRes = await fetch(
      `${SUPABASE_URL}/rest/v1/patients?id=eq.${patientId}&select=id,clinic_id,phone`,
      { headers: userHeaders }
    );
    const patients = await patientRes.json();

    if (!patientRes.ok || !Array.isArray(patients) || !patients.length) {
      res.status(403).json({ error: 'Patient not found or not in your clinic.' });
      return;
    }

    const patient = patients[0];
    const phone = toE164(patient.phone);
    if (!phone) {
      res.status(400).json({ error: 'This patient has no valid phone number on file.' });
      return;
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;
    if (!accountSid || !authToken || !fromNumber) {
      res.status(500).json({ error: 'Twilio is not configured on the server.' });
      return;
    }

    const twilioAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const params = new URLSearchParams({ To: phone, From: fromNumber, Body: body });

    const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${twilioAuth}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const twilioData = await twilioRes.json();

    if (!twilioRes.ok) {
      res.status(500).json({ error: twilioData?.message || 'Twilio request failed.' });
      return;
    }

    await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
      method: 'POST',
      headers: { ...userHeaders, 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify({
        clinic_id: patient.clinic_id,
        patient_id: patient.id,
        direction: 'outbound',
        body,
        needs_attention: false,
      }),
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong sending the reply.' });
  }
};
