const SUPABASE_URL = 'https://lhavkiozawvlujstilhn.supabase.co';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { token, fullName, password } = req.body || {};
  if (!token || !fullName || !password) {
    res.status(400).json({ error: 'Missing name, password, or invite token.' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters.' });
    return;
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    res.status(500).json({ error: 'Invites are not configured on the server.' });
    return;
  }

  const adminHeaders = {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    'content-type': 'application/json',
  };

  try {
    const inviteRes = await fetch(
      `${SUPABASE_URL}/rest/v1/employee_invites?token=eq.${encodeURIComponent(token)}&select=id,clinic_id,email,role,status,expires_at`,
      { headers: adminHeaders }
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

    const createUserRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ email: invite.email, password, email_confirm: true }),
    });
    const newUser = await createUserRes.json();

    if (!createUserRes.ok) {
      res.status(400).json({ error: newUser?.msg || newUser?.message || 'Could not create your account.' });
      return;
    }

    const employeeRes = await fetch(`${SUPABASE_URL}/rest/v1/employees`, {
      method: 'POST',
      headers: { ...adminHeaders, prefer: 'return=minimal' },
      body: JSON.stringify({
        id: newUser.id,
        clinic_id: invite.clinic_id,
        full_name: fullName,
        role: invite.role,
      }),
    });

    if (!employeeRes.ok) {
      const errBody = await employeeRes.json().catch(() => ({}));
      res.status(500).json({ error: errBody?.message || 'Account created, but could not finish setting up your profile. Contact your admin.' });
      return;
    }

    await fetch(`${SUPABASE_URL}/rest/v1/employee_invites?id=eq.${invite.id}`, {
      method: 'PATCH',
      headers: { ...adminHeaders, prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'accepted' }),
    });

    res.status(200).json({ ok: true, email: invite.email });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong accepting this invite.' });
  }
};
