/**
 * Live image-resolution smoke test (not part of the unit suite). Signs up a
 * throwaway user, calls /api/images/resolve through the running dev server,
 * and verifies a hotlink-safe Unsplash photo comes back with attribution.
 * Run with: node tests/smoke-unsplash.mjs   (needs the preview running)
 */
import { createClient } from '@insforge/sdk';

const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL;
const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;
const appUrl = process.env.APP_URL ?? 'http://localhost:3000';

if (!baseUrl || !anonKey) {
  console.error('FAIL: InsForge env vars are not set.');
  process.exit(1);
}

const client = createClient({ baseUrl, anonKey });
const email = `img-smoke-${Date.now()}@example.com`;

try {
  await client.auth.signUp({ email, password: 'SmokeTest123!' });
  const signin = await client.auth.signInWithPassword({ email, password: 'SmokeTest123!' });
  const token =
    signin.data?.accessToken ?? signin.data?.session?.accessToken ?? signin.accessToken;
  if (!token) throw new Error('no access token returned from sign-in');
  console.log('  ok  signed in');

  const res = await fetch(`${appUrl}/api/images/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      prompt: 'minimalist ceramic coffee mug on oak table',
      width: 800,
      height: 600,
    }),
  });
  console.log(`  ok  resolve status ${res.status}`);
  const body = await res.json();

  if (res.status !== 200) throw new Error(body.error ?? 'resolve failed');

  const checks = [
    ['url is hotlink-safe Unsplash', typeof body.url === 'string' && body.url.includes('images.unsplash.com/')],
    ['ixid tracking param preserved', body.url?.includes('ixid=')],
    ['sized for slot (w=800,h=600)', body.url?.includes('w=800') && body.url?.includes('h=600')],
    ['photographer attribution present', Boolean(body.photographerName)],
    ['photo page link present', typeof body.photoUrl === 'string' && body.photoUrl.includes('unsplash.com/photos')],
  ];
  let failed = 0;
  for (const [label, ok] of checks) {
    if (ok) console.log(`  ok  ${label}`);
    else {
      console.log(`  FAIL  ${label}`);
      failed++;
    }
  }

  // Second call with the same prompt should hit the server cache (still 200).
  const again = await fetch(`${appUrl}/api/images/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ prompt: 'minimalist ceramic coffee mug on oak table', width: 800, height: 600 }),
  });
  if (again.status === 200) console.log('  ok  cached repeat resolves');
  else {
    console.log(`  FAIL  cached repeat (status ${again.status})`);
    failed++;
  }

  if (failed > 0) {
    console.error(`\nUNSPLASH SMOKE TEST FAILED (${failed} checks)`);
    process.exit(1);
  }
  console.log('\nUNSPLASH IMAGE SMOKE TEST PASSED');
} catch (err) {
  console.error(`FAIL: ${err.message}`);
  process.exit(1);
}
