// Private release diagnostic: login only, never requests property data.
export async function probeSupplierLogin(runtime, fetcher = fetch) {
  const result = (category) => ({ loginAccepted: category === 'accepted', environment: 'uat_v1', category });
  if (!runtime.email?.trim() || !runtime.password) return result('config_missing');
  if (runtime.endpoint?.trim() !== 'https://propinfoapi.co.za/uat/v1/graphql/') return result('endpoint_not_uat_v1');
  try {
    const response = await fetcher(runtime.endpoint.trim(), {
      method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        query: 'mutation ($input: LoginInput!) { login(login: $input) { tokenPayload { token } errors { ... on Error { message } } } }',
        variables: { input: { email: runtime.email.trim(), password: runtime.password } },
      }),
    });
    if (!response.ok) return result('http_error');
    const payload = await response.json();
    const errors = [...(payload?.errors || []), ...(payload?.data?.login?.errors || [])];
    const message = errors.map((error) => typeof error?.message === 'string' ? error.message : '').join(' ');
    if (/does not exist|disabled/i.test(message)) return result('account_not_found_or_disabled');
    if (/password|credentials|unauthori[sz]ed|invalid login/i.test(message)) return result('credentials_rejected');
    if (errors.length) return result('graphql_login_error');
    if (typeof payload?.data?.login?.tokenPayload?.token === 'string' && payload.data.login.tokenPayload.token.trim()) return result('accepted');
    return result('graphql_login_error');
  } catch (error) {
    return result(['TimeoutError', 'AbortError'].includes(error?.name) ? 'timeout' : 'network_or_response_error');
  }
}
