/*  Momentum OS — Auth, Pricing & Tier-gating module
    Loads Supabase client, injects auth overlay + pricing view,
    manages sign-in/sign-up/sign-out, and gates features by tier.
    Drop a single <script src="auth.js"></script> before </body>. */

(function () {
  'use strict';

  // ── Config ──
  const SUPABASE_URL = 'https://ajqdlpzrnlloqbdbacxo.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_jHdAPTfcG3eFNASC4SOB_w_6ff_uAcU';
  let db = null;
  let currentUser = null;
  let currentTier = 'free';
  let coachUsesToday = 0;
  const COACH_FREE_LIMIT = 3;   const TESTING_MODE = true; // TESTING: set to false to re-enable pricing/tier gating

  // ── Inject CSS ──
  const css = document.createElement('style');
  css.textContent = `
    .auth-overlay{position:fixed;inset:0;background:var(--bg);z-index:9999;display:flex;align-items:center;justify-content:center}
    .auth-overlay.hidden{display:none}
    .auth-card{background:var(--surface);border-radius:var(--radius-xl,22px);padding:40px 32px;max-width:400px;width:90%;box-shadow:var(--shadow);text-align:center}
    .auth-brand h1{margin:12px 0 4px;font-size:1.4rem}
    .auth-brand p{color:var(--muted);font-size:.9rem;margin:0 0 24px}
    .auth-brand .logo-circle{width:56px;height:56px;border-radius:50%;background:var(--gradient-accent,#6f8f72);display:inline-flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:1.1rem}
    .auth-tabs{display:flex;gap:8px;margin-bottom:20px}
    .auth-tab{flex:1;padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm,8px);background:transparent;cursor:pointer;font-weight:500;color:var(--muted);font-family:inherit;font-size:.95rem}
    .auth-tab.active{background:var(--accent);color:#fff;border-color:var(--accent)}
    .auth-input{width:100%;padding:12px 16px;border:1px solid var(--border);border-radius:var(--radius-sm,8px);margin-bottom:12px;font-size:.95rem;background:var(--surface-2);color:var(--text);box-sizing:border-box;font-family:inherit}
    .auth-error{color:var(--danger,#93665a);font-size:.85rem;margin-bottom:12px;min-height:20px}
    .auth-submit{width:100%;padding:14px;font-size:1rem;font-family:inherit;cursor:pointer}
    .auth-footer{color:var(--muted);font-size:.8rem;margin-top:16px}
    .pricing-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px;margin-top:20px}
    .pricing-card{background:var(--surface);border-radius:var(--radius-lg,18px);padding:28px 24px;text-align:center;border:2px solid var(--border);position:relative}
    .pricing-card.featured{border-color:var(--accent)}
    .pricing-badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:var(--accent);color:#fff;padding:4px 16px;border-radius:var(--radius-sm,8px);font-size:.75rem;font-weight:600}
    .pricing-tier{font-weight:700;font-size:1.1rem;margin-bottom:8px}
    .pricing-price{font-size:2.2rem;font-weight:800;color:var(--text)}
    .pricing-period{color:var(--muted);font-size:.85rem;margin-bottom:16px}
    .pricing-features{list-style:none;padding:0;margin:0 0 20px;text-align:left}
    .pricing-features li{padding:6px 0;font-size:.9rem;color:var(--text);border-bottom:1px solid var(--border)}
    .pricing-features li:last-child{border:none}
    .plan-banner{background:var(--surface-2);padding:12px 20px;border-radius:var(--radius-sm,8px);margin-bottom:8px;font-size:.95rem}
    .tier-locked{position:relative;pointer-events:none;opacity:.5}
    .tier-locked::after{content:'Upgrade';position:absolute;top:8px;right:8px;background:var(--accent);color:#fff;padding:2px 10px;border-radius:var(--radius-sm,8px);font-size:.7rem;font-weight:600}
  `;
  document.head.appendChild(css);

  // ── Inject Auth Overlay HTML ──
  function injectAuthOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'authOverlay';
    overlay.className = 'auth-overlay';
    overlay.innerHTML = `
      <div class="auth-card">
        <div class="auth-brand">
          <div class="logo-circle"><span>MO</span></div>
          <h1>Momentum OS</h1>
          <p>Reset. Refocus. Move.</p>
        </div>
        <div class="auth-tabs">
          <button class="auth-tab active" id="tabSignIn" type="button">Sign In</button>
          <button class="auth-tab" id="tabSignUp" type="button">Create Account</button>
        </div>
        <form id="authForm" onsubmit="return false">
          <div id="signupFields" style="display:none">
            <input type="text" id="authName" placeholder="Full name" class="auth-input" />
          </div>
          <input type="email" id="authEmail" placeholder="Email address" class="auth-input" required />
          <input type="password" id="authPassword" placeholder="Password (min 6 chars)" class="auth-input" required />
          <div id="authError" class="auth-error"></div>
          <button type="button" id="authSubmitBtn" class="btn btn-primary auth-submit">Sign In</button>
        </form>
        <p class="auth-footer">Free to start. Upgrade anytime.</p>
      </div>`;
    document.body.insertBefore(overlay, document.body.firstChild);

    let mode = 'signin';
    const tabIn = overlay.querySelector('#tabSignIn');
    const tabUp = overlay.querySelector('#tabSignUp');
    const fields = overlay.querySelector('#signupFields');
    const btn = overlay.querySelector('#authSubmitBtn');
    const err = overlay.querySelector('#authError');

    tabIn.addEventListener('click', function () {
      mode = 'signin'; tabIn.classList.add('active'); tabUp.classList.remove('active');
      fields.style.display = 'none'; btn.textContent = 'Sign In'; err.textContent = '';
    });
    tabUp.addEventListener('click', function () {
      mode = 'signup'; tabUp.classList.add('active'); tabIn.classList.remove('active');
      fields.style.display = 'block'; btn.textContent = 'Create Account'; err.textContent = '';
    });
    btn.addEventListener('click', async function () {
      const email = overlay.querySelector('#authEmail').value.trim();
      const pass = overlay.querySelector('#authPassword').value;
      err.textContent = '';
      if (!email || !pass) { err.textContent = 'Please enter email and password.'; return; }
      if (pass.length < 6) { err.textContent = 'Password must be at least 6 characters.'; return; }
      btn.disabled = true; btn.textContent = mode === 'signin' ? 'Signing in...' : 'Creating account...';
      try {
        if (mode === 'signup') {
          const { error } = await db.auth.signUp({ email, password: pass });
          if (error) throw error;
          err.style.color = 'var(--success,#5f7f63)';
          err.textContent = 'Check your email to confirm your account.';
          btn.disabled = false; btn.textContent = 'Create Account';
        } else {
          const { error } = await db.auth.signInWithPassword({ email, password: pass });
          if (error) throw error;
        }
      } catch (e) {
        err.style.color = 'var(--danger,#93665a)';
        err.textContent = e.message || 'Authentication failed.';
        btn.disabled = false; btn.textContent = mode === 'signin' ? 'Sign In' : 'Create Account';
      }
    });
  }

  // ── Inject Pricing View ──
  function injectPricingView() {
    const main = document.querySelector('main.main');
    if (!main) return;
    const section = document.createElement('section');
    section.id = 'pricing';
    section.className = 'view';
    section.style.display = 'none';
    section.innerHTML = `
      <div class="section-header"><h2>Choose Your Plan</h2><p>Start free, upgrade when you're ready.</p></div>
      <div id="currentPlanBanner" class="plan-banner"><span>Current plan: </span><strong id="currentPlanLabel">Free</strong></div>
      <div class="pricing-grid">
        <article class="pricing-card" id="cardFree">
          <div class="pricing-tier">Free</div>
          <div class="pricing-price">$0</div>
          <div class="pricing-period">forever</div>
          <ul class="pricing-features"><li>Dashboard and scores</li><li>Health and personal tracking</li><li>Basic journal</li><li>7-day history</li><li>AI Coach — 3 messages/day</li></ul>
          <button class="btn" disabled>Current Plan</button>
        </article>
        <article class="pricing-card featured" id="cardPro">
          <div class="pricing-badge">Most Popular</div>
          <div class="pricing-tier">Pro</div>
          <div class="pricing-price">$9</div>
          <div class="pricing-period">per month</div>
          <ul class="pricing-features"><li>Everything in Free</li><li>Unlimited AI Coach</li><li>30-day history and trends</li><li>Journal analysis</li><li>Data export (CSV)</li></ul>
          <button class="btn btn-primary" id="btnUpgradePro">Upgrade to Pro</button>
        </article>
        <article class="pricing-card" id="cardPremium">
          <div class="pricing-tier">Premium</div>
          <div class="pricing-price">$19</div>
          <div class="pricing-period">per month</div>
          <ul class="pricing-features"><li>Everything in Pro</li><li>AI Coach with memory</li><li>Unlimited history and exports</li><li>PDF reports</li><li>Priority support</li></ul>
          <button class="btn btn-primary" id="btnUpgradePremium">Upgrade to Premium</button>
        </article>
      </div>`;
    main.appendChild(section);

    // Wire upgrade buttons (placeholder until Stripe is configured)
    const btnPro = section.querySelector('#btnUpgradePro');
    const btnPrem = section.querySelector('#btnUpgradePremium');
    if (btnPro) btnPro.addEventListener('click', function () { startCheckout('pro'); });
    if (btnPrem) btnPrem.addEventListener('click', function () { startCheckout('premium'); });
  }

  // ── Inject Pricing Nav Link ──
  function injectPricingNav() {
    const nav = document.querySelector('.nav-list');
    if (!nav) return;
    // Add Pricing link
    const pBtn = document.createElement('button');
    pBtn.className = 'nav-link';
    pBtn.type = 'button';
    pBtn.onclick = function () { if (typeof switchView === 'function') switchView('pricing'); };
    pBtn.innerHTML = '<span class="nav-dot"></span><span class="nav-copy"><strong>Pricing</strong><span>Plans and billing</span></span>';
    nav.appendChild(pBtn);
    // Add Sign Out link
    const sBtn = document.createElement('button');
    sBtn.className = 'nav-link';
    sBtn.id = 'navSignOut';
    sBtn.type = 'button';
    sBtn.style.cssText = 'margin-top:16px;opacity:1;border-top:1px solid var(--border);padding:12px 0 4px;position:sticky;bottom:0;background:var(--bg)';
    sBtn.onclick = function () { handleSignOut(); };
    sBtn.innerHTML = '<span class="nav-dot"></span><span class="nav-copy"><strong id="userEmailNav">Sign out</strong><span>Manage account</span></span>';
    var rBtn = document.createElement('button'); rBtn.className = 'nav-link'; rBtn.id = 'navResetData'; rBtn.type = 'button'; rBtn.style.cssText = 'margin-top:8px;opacity:0.7'; rBtn.onclick = function () { if (typeof clearData === 'function') { clearData(); } else if (confirm('Reset all info for a new user? This clears saved data on this device and cannot be undone.')) { ['momentum-daily-entries','momentum-current-draft','momentum-first-visit'].forEach(function(k){ localStorage.removeItem(k); }); location.reload(); } }; rBtn.innerHTML = ' <strong>Reset for new user</strong><br><small>Clear saved data</small> '; nav.appendChild(rBtn); nav.appendChild(sBtn);
  }

  // ── Stripe Checkout (placeholder) ──
  async function startCheckout(tier) {
    if (!currentUser) { alert('Please sign in first.'); return; }
    try {
      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: tier, userId: currentUser.id, email: currentUser.email })
      });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; }
      else { alert(data.error || 'Checkout not available yet. Stripe setup required.'); }
    } catch (e) {
      alert('Checkout is not configured yet. Set up your Stripe account to enable subscriptions.');
    }
  }
  window.startCheckout = startCheckout;

  // ── Sign Out ──
  async function handleSignOut() {
    if (!db) return;
    await db.auth.signOut();
  }
  window.handleSignOut = handleSignOut;

  // ── Tier Gating ──
  function applyTierGating(tier) {
    currentTier = TESTING_MODE ? 'pro' : (tier || 'free');
    // Update pricing page
    const label = document.getElementById('currentPlanLabel');
    if (label) label.textContent = currentTier.charAt(0).toUpperCase() + currentTier.slice(1);
    // Update coach limit display if needed
    coachUsesToday = parseInt(localStorage.getItem('coach-uses-today') || '0', 10);
  }

  // ── Coach Rate Limiting ──
  window.canUseCoach = function () {
    if (TESTING_MODE) return true; if (currentTier !== 'free') return true;
    const today = new Date().toISOString().slice(0, 10);
    const key = 'coach-day-' + today;
    coachUsesToday = parseInt(localStorage.getItem(key) || '0', 10);
    return coachUsesToday < COACH_FREE_LIMIT;
  };
  window.incrementCoachUse = function () {
    const today = new Date().toISOString().slice(0, 10);
    const key = 'coach-day-' + today;
    coachUsesToday = parseInt(localStorage.getItem(key) || '0', 10) + 1;
    localStorage.setItem(key, coachUsesToday.toString());
  };
  window.getCoachRemaining = function () {
    if (currentTier !== 'free') return 999;
    const today = new Date().toISOString().slice(0, 10);
    const key = 'coach-day-' + today;
    return Math.max(0, COACH_FREE_LIMIT - parseInt(localStorage.getItem(key) || '0', 10));
  };
  window.getCurrentTier = function () { return currentTier; };

  // ── Auth State Listener & Init ──
  async function boot() {
    // Load Supabase from CDN
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.onload = function () {
      db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      injectAuthOverlay();
      injectPricingView();
      injectPricingNav();
injectAccountView();
injectAccountNav();        

      // Listen for auth state changes
      db.auth.onAuthStateChange(async function (event, session) {
        const overlay = document.getElementById('authOverlay');
        if (session && session.user) {
          currentUser = session.user;
          if (overlay) overlay.classList.add('hidden');
          // Update nav email display
          const emailNav = document.getElementById('userEmailNav');
          if (emailNav) emailNav.textContent = currentUser.email;
if (typeof renderAccount === 'function') renderAccount();            
          // Fetch tier from Supabase (placeholder — defaults to free)
          try {
            const { data } = await db.from('subscriptions').select('tier').eq('user_id', currentUser.id).single();
            if (data && data.tier) applyTierGating(data.tier);
            else applyTierGating('free');
          } catch (e) {
            applyTierGating('free');
          }
        } else {
          currentUser = null;
          currentTier = 'free';
          if (overlay) overlay.classList.remove('hidden');
if (typeof renderAccount === 'function') renderAccount();            
        }
      });
    };
    document.head.appendChild(script);
  }
function injectAccountView(){var main=document.querySelector('main.main')||document.querySelector('.main');if(!main||document.getElementById('account'))return;var s=document.createElement('section');s.id='account';s.className='view';s.style.display='none';s.innerHTML='<div class="card" style="max-width:560px"><h2 style="margin:0 0 4px">Account</h2><p style="color:var(--muted);margin:0 0 20px">Manage your login and subscription</p><div id="acctStatus" style="margin-bottom:24px"></div><div style="border-top:1px solid var(--border);padding-top:20px"><h3 style="margin:0 0 4px">Subscription</h3><p style="color:var(--muted);margin:0 0 12px">Current plan: <strong id="currentPlanLabel">Free</strong></p><div id="acctSubActions"></div></div></div>';main.appendChild(s);}
function injectAccountNav(){var nav=document.querySelector('.nav-list');if(!nav||document.getElementById('navAccount'))return;var a=document.createElement('button');a.className='nav-link';a.id='navAccount';a.type='button';a.onclick=function(){if(typeof switchView==='function')switchView('account');};a.innerHTML='<span class="nav-dot"></span><span class="nav-copy"><strong>Account</strong><span>Login and subscription</span></span>';nav.appendChild(a);}
function renderAccount(){var st=document.getElementById('acctStatus');var sub=document.getElementById('acctSubActions');var pl=document.getElementById('currentPlanLabel');var t=currentTier||'free';if(pl)pl.textContent=t.charAt(0).toUpperCase()+t.slice(1);if(st){if(currentUser){st.innerHTML='<p style="margin:0 0 4px;color:var(--muted)">Signed in as</p><p style="margin:0 0 16px;font-weight:600">'+currentUser.email+'</p><button id="acctLogout" class="auth-submit" style="width:auto;padding:10px 20px">Log out</button>';var lo=document.getElementById('acctLogout');if(lo)lo.onclick=function(){if(typeof handleSignOut==='function')handleSignOut();};}else{st.innerHTML='<p style="margin:0 0 16px;color:var(--muted)">You are not signed in.</p><button id="acctLogin" class="auth-submit" style="width:auto;padding:10px 20px">Log in</button>';var li=document.getElementById('acctLogin');if(li)li.onclick=function(){var o=document.getElementById('authOverlay');if(o)o.classList.remove('hidden');};}}if(sub){if(t!=='free'){sub.innerHTML='<p style="color:var(--muted);margin:0">You are on the '+t+' plan. Thank you for subscribing.</p>';}else{var b=document.createElement('button');b.className='auth-submit';b.style.cssText='width:auto;padding:10px 20px';b.textContent='View plans & upgrade';b.onclick=function(){if(typeof switchView==='function')switchView('pricing');};sub.innerHTML='';sub.appendChild(b);}}}    
  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
