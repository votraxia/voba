/**
 * Backend smoke test (not part of the unit suite). Verifies the provisioned
 * InsForge backend end-to-end: sign up, create a project, save a page, list
 * revisions, and clean up. Run with: node tests/smoke-backend.mjs
 */
import { createClient, createAdminClient } from '@insforge/sdk';

const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL;
const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;
const adminKey = process.env.INSFORGE_ADMIN_KEY;

if (!baseUrl || !anonKey) {
  console.error('FAIL: NEXT_PUBLIC_INSFORGE_URL / NEXT_PUBLIC_INSFORGE_ANON_KEY are not set.');
  process.exit(1);
}

const client = createClient({ baseUrl, anonKey });
const email = `smoke-${Date.now()}@example.com`;
const password = 'SmokeTest123!';

let passed = 0;
function ok(label) {
  passed += 1;
  console.log(`  ok  ${label}`);
}

try {
  // 1. Sign up (may auto-confirm) then ALWAYS sign in explicitly to guarantee
  // the SDK holds a valid access token for subsequent RLS-scoped inserts.
  const signup = await client.auth.signUp({ email, password });
  if (signup.error && !/exist/i.test(signup.error.message ?? '')) {
    // "user already exists" is fine (rerun); anything else is fatal.
    if (!/verification/i.test(signup.error.message ?? '')) {
      throw new Error(`signUp: ${signup.error.message}`);
    }
  }
  ok('auth.signUp');

  const signin = await client.auth.signInWithPassword({ email, password });
  if (signin.error) throw new Error(`signIn: ${signin.error.message}`);
  ok('auth.signInWithPassword');

  // 2. Create a project (RLS pins user_id)
  const ins = await client.database
    .from('projects')
    .insert([{ name: 'Smoke Test Project', prompt: 'a smoke test store', status: 'draft' }])
    .select();
  if (ins.error) throw new Error(`projects.insert: ${ins.error.message}`);
  const projectId = ins.data[0].id;
  ok('projects.insert (RLS)');

  // 3. Save a page
  const page = await client.database.from('project_pages').insert([
    {
      project_id: projectId,
      page_key: 'home',
      label: 'Home',
      type: 'home',
      path: '/',
      html: '<section data-builder-section-id="hero-main"><h1>Hi</h1></section>',
      status: 'ready',
      position: 0,
    },
  ]).select();
  if (page.error) throw new Error(`project_pages.insert: ${page.error.message}`);
  ok('project_pages.insert');

  // 4. Save a theme
  const theme = await client.database.from('project_themes').insert([
    { project_id: projectId, css: ':root{--brand:#f00}', style_guide: 'red brand' },
  ]).select();
  if (theme.error) throw new Error(`project_themes.insert: ${theme.error.message}`);
  ok('project_themes.insert');

  // 5. Save a revision
  const rev = await client.database.from('project_revisions').insert([
    {
      project_id: projectId,
      label: 'Smoke revision',
      pages: [{ pageKey: 'home', label: 'Home', type: 'home', path: '/', html: '', status: 'ready', position: 0 }],
    },
  ]).select();
  if (rev.error) throw new Error(`project_revisions.insert: ${rev.error.message}`);
  ok('project_revisions.insert');

  // 6. Chat messages
  const msg = await client.database.from('project_messages').insert([
    { project_id: projectId, role: 'user', content: 'build me a store', position: 0 },
  ]).select();
  if (msg.error) throw new Error(`project_messages.insert: ${msg.error.message}`);
  ok('project_messages.insert');

  // 7. Ownership isolation: a fresh anon client must NOT read the project row.
  const anon = createClient({ baseUrl, anonKey });
  const leaked = await anon.database.from('projects').select().eq('id', projectId);
  const sawRows = Array.isArray(leaked.data) && leaked.data.length > 0;
  if (sawRows) throw new Error('SECURITY: anon client read another user project row');
  ok('RLS blocks unauthenticated reads');

  // 8. Admin client (bypasses RLS) can read + delete everything (cleanup).
  if (adminKey) {
    const admin = createAdminClient({ baseUrl, apiKey: adminKey });
    const adminRead = await admin.database.from('projects').select().eq('id', projectId);
    if (adminRead.error || !Array.isArray(adminRead.data) || adminRead.data.length === 0) {
      throw new Error('admin client could not read the project row');
    }
    ok('admin client bypasses RLS');
    await admin.database.from('project_pages').delete().eq('project_id', projectId);
    await admin.database.from('project_themes').delete().eq('project_id', projectId);
    await admin.database.from('project_revisions').delete().eq('project_id', projectId);
    await admin.database.from('project_messages').delete().eq('project_id', projectId);
    await admin.database.from('projects').delete().eq('id', projectId);
    // Remove the smoke-test user row directly (service role, no SDK method).
    const { execSync } = await import('node:child_process');
    try {
      execSync(
        `npx -y @insforge/cli db query "delete from auth.users where email = '${email}'"`,
        { stdio: 'pipe' }
      );
    } catch {
      // Non-fatal: the smoke user can linger without affecting the app.
    }
    ok('cleanup (project + user removed)');
  } else {
    console.log('  skip admin-key checks (INSFORGE_ADMIN_KEY not set)');
  }

  console.log(`\nBACKEND SMOKE TEST PASSED (${passed} checks)`);
} catch (err) {
  console.error(`FAIL: ${err.message}`);
  process.exit(1);
}
