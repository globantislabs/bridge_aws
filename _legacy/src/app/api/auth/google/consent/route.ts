import { NextRequest, NextResponse } from 'next/server'

/**
 * Google-style account picker shown when Supabase is not configured.
 *
 * In production with real Supabase env vars, this route is never hit —
 * Google renders its own consent screen. In the sandbox, we render a
 * polished Google-like picker so the OAuth flow feels complete and the
 * user lands on a real session afterward.
 */

const ACCOUNTS = [
  {
    email: 'demo@bridge.app',
    name: 'Bridge Demo',
    initials: 'BD',
    color: '#16a34a',
  },
  {
    email: 'admin@bridge.app',
    name: 'Bridge Admin',
    initials: 'BA',
    color: '#dc2626',
  },
]

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin
  const returnTo = req.nextUrl.searchParams.get('return_to') || '/'

  const accountList = ACCOUNTS.map(
    (a, i) => `
    <button class="acct" data-email="${a.email}" data-name="${a.name}">
      <div class="avatar" style="background:${a.color}">${a.initials}</div>
      <div class="meta">
        <div class="name">${a.name}</div>
        <div class="email">${a.email}</div>
      </div>
    </button>
  `
  ).join('')

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Sign in with Google — Bridge</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600&family=Roboto:wght@400;500&display=swap" rel="stylesheet" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Roboto', system-ui, sans-serif;
    background: #f8fafc;
    color: #202124;
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
  }
  .card {
    background: #fff;
    border-radius: 16px;
    box-shadow: 0 1px 3px rgba(60,64,67,.08), 0 8px 24px rgba(60,64,67,.12);
    width: 100%;
    max-width: 400px;
    padding: 36px 32px;
    border: 1px solid #e5e7eb;
  }
  .logo {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 24px;
  }
  .logo-mark {
    width: 38px;
    height: 38px;
    border-radius: 8px;
    background: linear-gradient(135deg, #16a34a, #059669);
    display: grid;
    place-items: center;
    color: #fff;
    font-family: 'Google Sans', sans-serif;
    font-weight: 600;
    font-size: 18px;
  }
  .logo-text {
    font-family: 'Google Sans', sans-serif;
    font-size: 18px;
    font-weight: 500;
    color: #5f6368;
  }
  h1 {
    font-family: 'Google Sans', sans-serif;
    font-size: 24px;
    font-weight: 400;
    color: #202124;
    margin-bottom: 8px;
  }
  .sub {
    font-size: 14px;
    color: #5f6368;
    margin-bottom: 28px;
  }
  .acct {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 14px;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    background: #fff;
    cursor: pointer;
    margin-bottom: 10px;
    text-align: left;
    transition: background .15s, border-color .15s, box-shadow .15s;
  }
  .acct:hover {
    background: #f8fafc;
    border-color: #d1d5db;
    box-shadow: 0 1px 2px rgba(60,64,67,.08);
  }
  .avatar {
    width: 40px; height: 40px;
    border-radius: 50%;
    display: grid; place-items: center;
    color: #fff;
    font-weight: 600;
    font-size: 14px;
    flex-shrink: 0;
  }
  .meta { min-width: 0; }
  .name {
    font-size: 14px; font-weight: 500; color: #202124;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .email {
    font-size: 13px; color: #5f6368;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .footer {
    margin-top: 28px;
    padding-top: 20px;
    border-top: 1px solid #f1f3f4;
    font-size: 12px;
    color: #80868b;
    line-height: 1.5;
  }
  .note {
    margin-top: 16px;
    padding: 10px 12px;
    background: #fef3c7;
    border: 1px solid #fde68a;
    border-radius: 8px;
    font-size: 12px;
    color: #92400e;
    line-height: 1.4;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <div class="logo-mark">B</div>
      <div class="logo-text">Bridge</div>
    </div>
    <h1>Choose an account</h1>
    <div class="sub">to continue to Bridge</div>
    ${accountList}
    <div class="note">
      <strong>Sandbox mode:</strong> Supabase env vars are not set, so we're
      showing a built-in account picker. Add <code>NEXT_PUBLIC_SUPABASE_URL</code>
      and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to enable real Google OAuth
      via Supabase Auth.
    </div>
    <div class="footer">
      Bridge uses your Google account to sign you in. By continuing,
      you agree to our Terms of Service and Privacy Policy.
    </div>
  </div>
  <script>
    document.querySelectorAll('.acct').forEach(btn => {
      btn.addEventListener('click', async () => {
        const email = btn.dataset.email;
        const name = btn.dataset.name;
        const params = new URLSearchParams({
          provider: 'google',
          email,
          name,
          return_to: ${JSON.stringify(returnTo)},
        });
        window.location.href = '/api/auth/callback?' + params.toString();
      });
    });
  </script>
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
