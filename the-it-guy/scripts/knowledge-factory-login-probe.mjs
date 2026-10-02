import { probeSupplierLogin } from '../server/services/knowledgeFactoryLoginProbe.js';

// Off by default. Only explicitly requested private builds run this diagnostic.
if (process.env.KNOWLEDGE_FACTORY_RUN_LOGIN_PROBE === 'true') {
  const result = await probeSupplierLogin({
    endpoint: process.env.KNOWLEDGE_FACTORY_GRAPHQL_ENDPOINT,
    email: process.env.KNOWLEDGE_FACTORY_EMAIL,
    password: process.env.KNOWLEDGE_FACTORY_PASSWORD,
  });
  console.log('KF_PRIVATE_LOGIN_RESULT ' + JSON.stringify(result));
}
