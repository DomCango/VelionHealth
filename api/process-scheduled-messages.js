const SUPABASE_URL = 'https://lhavkiozawvlujstilhn.supabase.co';

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

  const nowISO = new Date().toISOString();

  try {
    const findRes = await fetch(
      `${SUPABASE_URL}/rest/v1/scheduled_messages?status=eq.scheduled&scheduled_at=lte.${encodeURIComponent(nowISO)}&select=id`,
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

    if (!due.length) {
      res.status(200).json({ processed: 0 });
      return;
    }

    const ids = due.map((row) => row.id);
    const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/scheduled_messages?id=in.(${ids.join(',')})`, {
      method: 'PATCH',
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        'content-type': 'application/json',
        prefer: 'return=minimal',
      },
      body: JSON.stringify({ status: 'sent', sent_at: nowISO }),
    });

    if (!updateRes.ok) {
      const errBody = await updateRes.json().catch(() => ({}));
      res.status(500).json({ error: errBody?.message || 'Could not update due messages.' });
      return;
    }

    res.status(200).json({ processed: ids.length });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong processing scheduled messages.' });
  }
};
