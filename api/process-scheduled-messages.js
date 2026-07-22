const SUPABASE_URL = 'https://lhavkiozawvlujstilhn.supabase.co';

function toE164(phone) {
  if (!phone) return null;
  if (phone.startsWith('+')) return phone;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return null;
}

async function sendSms(to, body) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const params = new URLSearchParams({ To: to, From: fromNumber, Body: body });

  const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${auth}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const data = await twilioRes.json();
  if (!twilioRes.ok) {
    throw new Error(data?.message || 'Twilio request failed.');
  }
  return data;
}

module.exports = async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server.' });
    return;
  }
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
    res.status(500).json({ error: 'Twilio credentials are not fully configured on the server.' });
    return;
  }

  const nowISO = new Date().toISOString();

  try {
    const findRes = await fetch(
      `${SUPABASE_URL}/rest/v1/scheduled_messages?status=eq.scheduled&scheduled_at=lte.${encodeURIComponent(nowISO)}&select=id,message_text,patients(phone)`,
      {
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );

    const due = await findRes.json();

    if (!findRes.ok) {
      res.status(500).json({ error: due?.message || 'Could not query due messages.' });
      return;
    }

    let sent = 0;
    let failed = 0;

    for (const row of due) {
      const phone = toE164(row.patients?.phone);
      let update;

      if (!phone) {
        update = { status: 'failed', send_error: 'Missing or invalid patient phone number.' };
        failed++;
      } else {
        try {
          await sendSms(phone, row.message_text);
          update = { status: 'sent', sent_at: nowISO };
          sent++;
        } catch (err) {
          update = { status: 'failed', send_error: err.message };
          failed++;
        }
      }

      await fetch(`${SUPABASE_URL}/rest/v1/scheduled_messages?id=eq.${row.id}`, {
        method: 'PATCH',
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          'content-type': 'application/json',
          prefer: 'return=minimal',
        },
        body: JSON.stringify(update),
      });
    }

    res.status(200).json({ processed: due.length, sent, failed });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong processing scheduled messages.' });
  }
};
