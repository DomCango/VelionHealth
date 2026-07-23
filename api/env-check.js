module.exports = async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  res.status(200).json({
    TWILIO_ACCOUNT_SID: Boolean(process.env.TWILIO_ACCOUNT_SID),
    TWILIO_AUTH_TOKEN: Boolean(process.env.TWILIO_AUTH_TOKEN),
    TWILIO_PHONE_NUMBER: Boolean(process.env.TWILIO_PHONE_NUMBER),
    TWILIO_PHONE_NUMBER_VALUE: process.env.TWILIO_PHONE_NUMBER || null,
  });
};
