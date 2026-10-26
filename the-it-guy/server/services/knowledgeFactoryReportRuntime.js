const UAT = 'https://propinfoapi.co.za/uat/v1/graphql/';
const LIVE = 'https://propinfoapi.co.za/live/v1/graphql/';

export function reportEnvironment(env = process.env) {
  const environment = env.KNOWLEDGE_FACTORY_REPORT_ENVIRONMENT || 'uat';
  if (!['uat', 'live'].includes(environment)) throw new Error('Choose a valid Knowledge Factory report environment.');
  return environment;
}

export function reportSupplierRuntime(env = process.env) {
  const environment = reportEnvironment(env);
  const live = environment === 'live';
  if (live && (env.KNOWLEDGE_FACTORY_LIVE_REPORTS_ENABLED !== 'true' || env.VERCEL_ENV !== 'production'))
    throw new Error('Live Knowledge Factory reports require an enabled production deployment.');
  const endpoint = (live ? env.KNOWLEDGE_FACTORY_LIVE_GRAPHQL_ENDPOINT : env.KNOWLEDGE_FACTORY_GRAPHQL_ENDPOINT)?.trim();
  const email = (live ? env.KNOWLEDGE_FACTORY_LIVE_EMAIL : env.KNOWLEDGE_FACTORY_EMAIL)?.trim();
  const password = live ? env.KNOWLEDGE_FACTORY_LIVE_PASSWORD : env.KNOWLEDGE_FACTORY_PASSWORD;
  if (endpoint !== (live ? LIVE : UAT) || !email || !password)
    throw new Error('The selected report environment needs its exact versioned endpoint and private credentials.');
  return { environment, endpoint, email, password };
}

export function isReportEndpoint(endpoint, environment = 'uat') {
  return environment === 'uat' ? endpoint === UAT : environment === 'live' && endpoint === LIVE;
}
