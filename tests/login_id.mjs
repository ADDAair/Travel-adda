// Login address for a test phone: through login_id() once step 016 exists, else the old phone-based address.
export async function loginId(client, phone) {
  const r = await client.rpc('login_id', { p_ident: phone });
  if (!r.error && typeof r.data === 'string' && r.data.includes('@')) return r.data;
  return `${phone}@users.traveladda.app`;
}
