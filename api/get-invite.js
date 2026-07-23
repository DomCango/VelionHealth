const SUPABASE_URL = 'https://lhavkiozawvlujstilhn.supabase.co';

module.exports = async (req, res) => {
  const token = req.query.token;
  if (!token) {
    res.status(400).json({ error: 'Missing invite token.' });
    return;
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    res.status(500).json({ error: 'Invites are not configured on the server.' });
    return;
  }

  try {
    const inviteRes = await fetch(
      `${SUPABASE_URL}/rest/v1/employee_invites?token=eq.${encodeURIComponent(token)}&select=id,email,role,status,expires_at,clinics(name)`,
      {
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );
    const invites = await inviteRes.json();

    if (!inviteRes.ok || !Array.isArray(invites) || !invites.length) {
      res.status(404).json({ error: 'This invite link is not valid.' });
      return;
    }

    const invite = invites[0];

    if (invite.status !== 'pending') {
      res.status(400).json({ error: 'This invite has already been used or revoked.' });
      return;
    }
    if (new Date(invite.expires_at) < new Date()) {
      res.status(400).json({ error: 'This invite has expired. Ask your clinic admin to send a new one.' });
      return;
    }

    res.status(200).json({
      email: invite.email,
      role: invite.role,
      clinicName: invite.clinics?.name || 'your clinic',
    });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong looking up this invite.' });
  }
};
