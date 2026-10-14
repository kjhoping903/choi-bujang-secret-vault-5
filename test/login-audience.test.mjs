import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateKeyPair, SignJWT } from 'jose';
import { createLoginVerifier } from '../src/verify-login.mjs';

test('judge login accepts the configured production audience and rejects the previous host', async () => {
  const config = JSON.parse(readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8'));
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const verify = createLoginVerifier({ config, judgeKeySet: async () => publicKey,
    supabaseClient: { auth: { getClaims() { throw new Error('unexpected student login'); } } } });
  const subject = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const issue = audience => new SignJWT({ aleph_run: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    aleph_role: 'judge', aleph_identity: 'a' })
    .setProtectedHeader({ alg: 'ES256' }).setIssuer(config.judgeIssuer)
    .setSubject(subject).setAudience(audience).setIssuedAt().setExpirationTime('5m').sign(privateKey);
  const current = await issue(new URL(config.publicAppUrl).hostname);
  assert.equal((await verify(`Bearer ${current}`))?.userId, subject);
  const previous = await issue('choi-bujang-secret-vault-7zk7.vercel.app');
  assert.equal(await verify(`Bearer ${previous}`), null);
});
