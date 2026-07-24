import { generateKeyPair, exportPKCS8, exportJWK, SignJWT, jwtVerify, createLocalJWKSet, importPKCS8 } from 'jose';

const { privateKey } = await generateKeyPair('RS256', { extractable: true });
const pkcs8 = await exportPKCS8(privateKey);
const signingKey = await importPKCS8(pkcs8, 'RS256', { extractable: true });
const jwk = await exportJWK(signingKey);
delete jwk.d; delete jwk.p; delete jwk.q; delete jwk.dp; delete jwk.dq; delete jwk.qi;
const publicJwk = { ...jwk, kid: 'mcp-1', alg: 'RS256', use: 'sig' };
const token = await new SignJWT({ client_id: 'spike', scope: 'read write' })
  .setProtectedHeader({ alg: 'RS256', kid: 'mcp-1' })
  .setSubject('user123|mcp:grant456')
  .setIssuer('http://localhost:3000')
  .setAudience('fragrances-mcp')
  .setIssuedAt()
  .setExpirationTime('15m')
  .sign(signingKey);
const jwks = createLocalJWKSet({ keys: [publicJwk] });
const { payload } = await jwtVerify(token, jwks, { issuer: 'http://localhost:3000', audience: 'fragrances-mcp' });
console.log('VERIFIED', payload.sub, payload.client_id, payload.scope);
