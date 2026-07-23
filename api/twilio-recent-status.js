module.exports = async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  try {
    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json?PageSize=5`,
      { headers: { authorization: `Basic ${auth}` } }
    );
    const data = await twilioRes.json();
    const summary = (data.messages || []).map((m) => ({
      sid: m.sid,
      to: m.to,
      from: m.from,
      status: m.status,
      error_code: m.error_code,
      error_message: m.error_message,
      date_created: m.date_created,
    }));
    res.status(200).json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
