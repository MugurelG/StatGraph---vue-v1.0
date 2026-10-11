<template>
  <div class="home-wrapper">

    <!-- ================= NAV ================= -->
    <nav>
      <div class="logo"><div class="logo-dot"></div>StatGraph</div>
      <div class="nav-links">
        <a href="#" @click.prevent>Disclaimer</a>
        <a href="#" @click.prevent>Instrucțiuni</a>
        <a href="#" @click.prevent>Contact</a>
        <a href="#" class="nav-cta" @click.prevent="goDashboard">Accesează platforma</a>
      </div>
    </nav>

    <!-- ================= HERO ================= -->
    <section class="hero">
      <canvas ref="canvasRef" id="network"></canvas>
      <div class="hero-content">
        <div class="eyebrow">
          <span class="dots"><i></i><i></i><i></i></span>
          Platformă de transparență instituțională
        </div>
        <h1>STATGRAPH,<br><span class="hl">explicarea vizuală a statului român.</span></h1>
        <p class="hero-sub">
          StatGraph transformă organigramele oficiale ale instituțiilor publice
          în hărți interactive ale puterii — accesibile oricui, înțelese de toți.
        </p>
        <div class="hero-ctas">
          <a href="#" class="btn-primary" @click.prevent="openAuth('register')">Creează cont gratuit</a>
          <a href="#" class="btn-secondary" @click.prevent="openAuth('login')">Autentificare</a>
        </div>
      </div>
      <div class="scroll-hint">↓ Derulează</div>
    </section>

    <!-- ================= ORGANIGRAMA-DEMONSTRAȚIE ================= -->
    <section class="block" id="structura">
      <div class="section-label">Structura</div>
      <h2 class="section-title">Fiecare instituție, un întreg univers de relații și conexiuni</h2>
      <p class="section-sub">
        StatGraph îți arată ierarhiile clare, conexiunile și profunzimea reală —
        de la instituție, trecând prin departament și birou, până la ultimul rol.
      </p>

      <div class="og-wrap">
        <svg class="og-svg" :class="{ in: ogIn }" ref="ogSvgRef" viewBox="0 0 1000 520" xmlns="http://www.w3.org/2000/svg">

          <!-- ===== LINII SOLIDE — se desenează la scroll (lungimi precalculate) ===== -->
          <line class="og-line" x1="500" y1="76" x2="500" y2="120" stroke="#334155" stroke-width="2" style="--d:.15s; --len:44"/>
          <line class="og-line" x1="170" y1="120" x2="830" y2="120" stroke="#334155" stroke-width="2" style="--d:.35s; --len:660"/>
          <line class="og-line" x1="170" y1="120" x2="170" y2="168" stroke="#2563eb" stroke-width="2.5" style="--d:.5s; --len:48"/>
          <line class="og-line" x1="500" y1="120" x2="500" y2="168" stroke="#f59e0b" stroke-width="2.5" style="--d:.6s; --len:48"/>
          <line class="og-line" x1="830" y1="120" x2="830" y2="168" stroke="#dc2626" stroke-width="2.5" style="--d:.7s; --len:48"/>
          <line class="og-line" x1="90" y1="216" x2="90" y2="248" stroke="#334155" stroke-width="1.5" style="--d:.95s; --len:32"/>
          <line class="og-line" x1="255" y1="216" x2="255" y2="248" stroke="#334155" stroke-width="1.5" style="--d:1.0s; --len:32"/>
          <line class="og-line" x1="415" y1="216" x2="415" y2="248" stroke="#334155" stroke-width="1.5" style="--d:1.05s; --len:32"/>
          <line class="og-line" x1="585" y1="216" x2="585" y2="248" stroke="#334155" stroke-width="1.5" style="--d:1.1s; --len:32"/>
          <line class="og-line" x1="745" y1="216" x2="745" y2="248" stroke="#334155" stroke-width="1.5" style="--d:1.15s; --len:32"/>
          <line class="og-line" x1="915" y1="216" x2="915" y2="248" stroke="#334155" stroke-width="1.5" style="--d:1.2s; --len:32"/>

          <!-- ===== LINII PUNCTATE DECORATIVE — fade-in ===== -->
          <line class="og-line-dashed" x1="415" y1="288" x2="415" y2="352" stroke="#f59e0b" stroke-width="2" stroke-dasharray="4 6" style="--d:1.5s"/>
          <line class="og-line-dashed" x1="415" y1="392" x2="415" y2="432" stroke="#334155" stroke-width="1.5" stroke-dasharray="4 6" style="--d:1.75s"/>
          <line class="og-line-dashed" x1="90" y1="288" x2="90" y2="312" stroke="#334155" stroke-width="1.5" stroke-dasharray="3 5" style="--d:1.55s"/>
          <line class="og-line-dashed" x1="915" y1="288" x2="915" y2="312" stroke="#334155" stroke-width="1.5" stroke-dasharray="3 5" style="--d:1.6s"/>

          <!-- ===== NODURI ===== -->

          <!-- Nivel 1 — Rădăcină -->
          <g class="og-node" style="--d:0s; --c:#93c5fd;">
            <rect x="395" y="22" width="210" height="54" rx="12" fill="#16213c" stroke="#3b82f6" stroke-width="1.5"/>
            <text x="500" y="55" text-anchor="middle" fill="#eef2f7" font-size="16" font-weight="700" font-family="inherit">STATUL ROMÂNESC</text>
          </g>

          <!-- Nivel 2 — tricolor -->
          <g class="og-node" style="--d:.65s; --c:#60a5fa;">
            <rect x="70" y="168" width="200" height="48" rx="10" fill="#111a30" stroke="#334155" stroke-width="1.2"/>
            <text x="170" y="198" text-anchor="middle" fill="#eef2f7" font-size="14.5" font-weight="600" font-family="inherit">Președinția</text>
          </g>
          <g class="og-node" style="--d:.75s; --c:#fbbf24;">
            <rect x="400" y="168" width="200" height="48" rx="10" fill="#111a30" stroke="#334155" stroke-width="1.2"/>
            <text x="500" y="198" text-anchor="middle" fill="#eef2f7" font-size="14.5" font-weight="600" font-family="inherit">Guvernul</text>
          </g>
          <g class="og-node" style="--d:.85s; --c:#f87171;">
            <rect x="730" y="168" width="200" height="48" rx="10" fill="#111a30" stroke="#334155" stroke-width="1.2"/>
            <text x="830" y="198" text-anchor="middle" fill="#eef2f7" font-size="14.5" font-weight="600" font-family="inherit">Parlamentul</text>
          </g>

          <!-- Nivel 3 -->
          <g class="og-node" style="--d:1.05s; --c:#60a5fa;">
            <rect x="10" y="248" width="160" height="40" rx="9" fill="#0e1526" stroke="#2a3a5c" stroke-width="1"/>
            <text x="90" y="273" text-anchor="middle" fill="#aab6cc" font-size="12.5" font-family="inherit">Adm. Prezidențială</text>
          </g>
          <g class="og-node" style="--d:1.1s; --c:#60a5fa;">
            <rect x="175" y="248" width="160" height="40" rx="9" fill="#0e1526" stroke="#2a3a5c" stroke-width="1"/>
            <text x="255" y="273" text-anchor="middle" fill="#aab6cc" font-size="12.5" font-family="inherit">C.S.A.T.</text>
          </g>
          <g class="og-node" style="--d:1.15s; --c:#fbbf24;">
            <rect x="335" y="248" width="160" height="40" rx="9" fill="#0e1526" stroke="#2a3a5c" stroke-width="1"/>
            <text x="415" y="273" text-anchor="middle" fill="#aab6cc" font-size="12.5" font-family="inherit">Ministere</text>
          </g>
          <g class="og-node" style="--d:1.2s; --c:#fbbf24;">
            <rect x="505" y="248" width="160" height="40" rx="9" fill="#0e1526" stroke="#2a3a5c" stroke-width="1"/>
            <text x="585" y="273" text-anchor="middle" fill="#aab6cc" font-size="12.5" font-family="inherit">Autorități</text>
          </g>
          <g class="og-node" style="--d:1.25s; --c:#f87171;">
            <rect x="665" y="248" width="160" height="40" rx="9" fill="#0e1526" stroke="#2a3a5c" stroke-width="1"/>
            <text x="745" y="273" text-anchor="middle" fill="#aab6cc" font-size="12.5" font-family="inherit">Camera Deputaților</text>
          </g>
          <g class="og-node" style="--d:1.3s; --c:#f87171;">
            <rect x="835" y="248" width="160" height="40" rx="9" fill="#0e1526" stroke="#2a3a5c" stroke-width="1"/>
            <text x="915" y="273" text-anchor="middle" fill="#aab6cc" font-size="12.5" font-family="inherit">Senatul</text>
          </g>

          <!-- Nivel 4 — drill-down demo -->
          <g class="og-node" style="--d:1.6s; --c:#fbbf24;">
            <rect x="320" y="352" width="190" height="40" rx="9" fill="#0e1526" stroke="#3a4a6e" stroke-width="1"/>
            <text x="415" y="377" text-anchor="middle" fill="#aab6cc" font-size="12.5" font-family="inherit">Direcții generale</text>
          </g>
          <g class="og-node" style="--d:1.85s; --c:#93c5fd;">
            <rect x="310" y="432" width="210" height="40" rx="9" fill="#0e1526" stroke="#3a4a6e" stroke-width="1"/>
            <text x="415" y="457" text-anchor="middle" fill="#aab6cc" font-size="12.5" font-family="inherit">Birouri · Roluri · Posturi</text>
          </g>

          <g class="og-node" style="--d:2.05s;">
            <text x="415" y="502" text-anchor="middle" fill="#5b6b85" font-size="12" font-style="italic" font-family="inherit">… și se continuă, nivel cu nivel</text>
          </g>
        </svg>

        <div class="og-caption">
          Fiecare nod se deschide în subordonații lui — <b>exact experiența din platformă</b>.
        </div>
      </div>
    </section>
    <!-- ================= PILONII CA ORGANIGRAMĂ ================= -->
    <section class="block" id="piloni">
      <div class="section-label">Ce oferă StatGraph</div>
      <h2 class="section-title">O misiune, trei piloni</h2>
      <p class="section-sub">
        Ca orice structură bine făcută, și misiunea noastră are o organigramă.
      </p>

      <!-- Rădăcina pilonilor -->
      <div class="pillars-root">
        <div class="pillars-root-pill"><div>STATGRAPH</div></div>
      </div>

      <!-- Conectorii tricolore (se aprind la scroll) -->
      <svg class="pillars-connectors" :class="{ in: pcIn }" ref="pcSvgRef" viewBox="0 0 100 96" preserveAspectRatio="none">
        <path d="M50,0 C50,38 16,50 16.6,96" stroke="#2563eb" style="--d:.15s"/>
        <path d="M50,0 L50,96" stroke="#f59e0b" style="--d:.3s"/>
        <path d="M50,0 C50,38 84,50 83.3,96" stroke="#dc2626" style="--d:.15s"/>
      </svg>

      <div class="pillars-grid" :class="{ in: pillarsIn }" ref="pillarsGridRef">
        <div class="pillar" style="--c:#2563eb; --d:.35s;">
          <div class="pillar-icon">🏛️</div>
          <h3>Transparență</h3>
          <p>Organigramele complete ale instituțiilor publice — structurate, navigabile și cu surse documentate, pentru ca fiecare cetățean să vadă cine răspunde de ce.</p>
          <div class="pillar-kids">
            <div class="kid-line"></div>
            <div class="kid-row">
              <span class="kid">Organigrame drill-down</span>
              <span class="kid">Surse citate</span>
            </div>
          </div>
        </div>

        <div class="pillar" style="--c:#f59e0b; --d:.5s;">
          <div class="pillar-icon">🎓</div>
          <h3>Educație sistemică</h3>
          <p>Înțelegi nu doar cine sunt instituțiile, ci cum funcționează împreună: ierarhii, competențe, fluxuri de decizie. Cunoașterea sistemului e prima formă de implicare civică.</p>
          <div class="pillar-kids">
            <div class="kid-line"></div>
            <div class="kid-row">
              <span class="kid">Ghiduri interactive</span>
              <span class="kid">Quiz-uri</span>
            </div>
          </div>
        </div>

        <div class="pillar" style="--c:#dc2626; --d:.65s;">
          <div class="pillar-icon">📊</div>
          <h3>Analiză</h3>
          <p>Posturi, vacanțe și structuri comparabile între instituții — instrumente pentru jurnaliști, cercetători și orice om care vrea să vadă dincolo de aparențe.</p>
          <div class="pillar-kids">
            <div class="kid-line"></div>
            <div class="kid-row">
              <span class="kid">Posturi &amp; vacanțe</span>
              <span class="kid">Comparații</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ================= MISIUNEA ================= -->
    <section class="mission" id="misiune">
      <div class="quote-mark">"</div>
      <h2 class="mission-quote">
        Transparența statului face<br>
        <span class="hl">puterea înțeleasă.</span>
      </h2>
      <div class="tri-bar"></div>
      <p class="mission-text">
        Când structurile puterii devin vizibile și înțelese, cetățenii pot cere mai mult,
        pot participa mai inteligent și pot avea încredere informate în instituțiile care îi servesc.
      </p>
      <a href="#" class="btn-primary" @click.prevent="goDashboard">Începe explorarea</a>
    </section>

    <!-- ================= CTA FINAL ================= -->
    <section class="final-cta">
      <h2>Pregătit să vezi statul altfel?</h2>
      <p>Crează cont gratuit și deblochează accesul complet la organigramele publicate.</p>
      <a href="#" class="btn-primary big" @click.prevent="openAuth('register')">Creează cont gratuit</a>
    </section>

    <!-- ================= FOOTER ================= -->
    <div class="footer-tri"></div>
    <footer>
      <div>© 2025 StatGraph — Transparența statului face puterea înțeleasă</div>
    </footer>

    </div>

  <!-- Modalul stă AFARĂ din .home-wrapper, ca reset-ul paginii să nu-l mai atingă -->
  <AuthModal v-if="showAuthModal" :initial-mode="authMode" @close="showAuthModal = false" />
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import AuthModal from '../components/auth/AuthModal.vue';

const router = useRouter();

// ---------- AUTH ----------
const showAuthModal = ref(false);
const authMode = ref('login'); // 'login' | 'register'

// FIX (bug vechi): parametrul este acum folosit efectiv și trimis ca prop.
// AuthModal interpretează 'register' ca mod de înregistrare, altfel login.
const openAuth = (mode) => {
  authMode.value = mode;
  showAuthModal.value = true;
};

// ---------- NAVIGARE ----------
// Butonul "Accesează platforma" = intrare ca vizitator pe Dashboard
const goDashboard = () => router.push('/dashboard');

// ---------- ANIMAȚII LA SCROLL (stare reactivă) ----------
const ogSvgRef = ref(null);
const pcSvgRef = ref(null);
const pillarsGridRef = ref(null);

const ogIn = ref(false);
const pcIn = ref(false);
const pillarsIn = ref(false);

// ---------- REȚEAUA ANIMATĂ ----------
const canvasRef = ref(null);
let animationId = null;
let resizeHandler = null;
let observer = null;

onMounted(() => {
  // --- Canvas: particule tricolore conectate ---
  const canvas = canvasRef.value;
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0;

  const setCanvasSize = () => {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  };
  setCanvasSize();
  resizeHandler = setCanvasSize;
  window.addEventListener('resize', resizeHandler);

  const COLORS = [
    'rgba(96,165,250,.6)', 'rgba(96,165,250,.6)', 'rgba(96,165,250,.6)',
    'rgba(96,165,250,.6)', 'rgba(96,165,250,.6)',
    'rgba(245,158,11,.55)',
    'rgba(220,38,38,.5)'
  ];
  const particles = Array.from({ length: 70 }, () => ({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3,
    r: Math.random() * 2 + 0.8,
    c: COLORS[Math.floor(Math.random() * COLORS.length)]
  }));

  const animate = () => {
    ctx.clearRect(0, 0, W, H);

    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.c;
      ctx.fill();
    });

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 130) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(96,165,250,${0.12 * (1 - d / 130)})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
    animationId = requestAnimationFrame(animate);
  };
  animate();

  // --- Observer pentru animațiile la scroll ---
  observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      if (e.target === ogSvgRef.value) ogIn.value = true;
      if (e.target === pcSvgRef.value) pcIn.value = true;
      if (e.target === pillarsGridRef.value) pillarsIn.value = true;
      observer.unobserve(e.target);
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });

  [ogSvgRef, pcSvgRef, pillarsGridRef].forEach(r => {
    if (r.value) observer.observe(r.value);
  });
});

// CLEANUP: fără asta, la navigarea Home → Dashboard → Home, canvas-ul și
// observerul s-ar dubla (bug clasic SPA)
onUnmounted(() => {
  if (animationId) cancelAnimationFrame(animationId);
  if (resizeHandler) window.removeEventListener('resize', resizeHandler);
  if (observer) observer.disconnect();
});
</script>
<style scoped>
/* ================= RESET (identic cu simularea HTML) ================= */
.home-wrapper *,
.home-wrapper *::before,
.home-wrapper *::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* ================= BAZĂ + VARIABELE LOCALE ================= */
/* variabilele locale (înlocuiesc :root, imposibil în scoped) */
.home-wrapper {
  --bg: #0a0f1e;
  --panel: #111827;
  --border: #1f2a44;
  --blue: #3b82f6;
  --blue-soft: #93c5fd;
  --tri-blue: #2563eb;
  --tri-yellow: #f59e0b;
  --tri-red: #dc2626;
  --text: #eef2f7;
  --dim: #8b98ad;

  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  background: var(--bg);
  color: var(--text);
  overflow-x: hidden;
  min-height: 100vh;
  width: 100%;
  position: relative;
}

/* utilitar tricolor */
.tri-bar {
  height: 3px; border-radius: 2px;
  background: linear-gradient(90deg,
    var(--tri-blue) 0% 33.3%, var(--tri-yellow) 33.3% 66.6%, var(--tri-red) 66.6% 100%);
}

/* ================= NAV ================= */
nav {
  position: fixed; top: 0; left: 0; right: 0; height: 64px;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 40px; z-index: 100;
  background: linear-gradient(180deg, rgba(10,15,30,.92), rgba(10,15,30,0));
}
.logo {
  display: flex; align-items: center; gap: 10px;
  font-weight: 800; font-size: 1.25rem; letter-spacing: -0.5px;
}
.logo-dot {
  width: 12px; height: 12px; border-radius: 50%;
  background: linear-gradient(180deg, var(--tri-blue) 33%, var(--tri-yellow) 33% 66%, var(--tri-red) 66%);
  box-shadow: 0 0 14px rgba(59,130,246,.5);
}
.nav-links { display: flex; gap: 26px; align-items: center; }
.nav-links a {
  color: var(--dim); text-decoration: none;
  font-size: .88rem; font-weight: 500;
  transition: color .2s; cursor: pointer;
}
.nav-links a:hover { color: var(--text); }
.nav-cta {
  background: var(--blue); color: #fff !important;
  padding: 8px 20px; border-radius: 8px; font-weight: 600 !important;
}
.nav-cta:hover { background: #2563eb; }

/* ================= HERO ================= */
.hero {
  position: relative; min-height: 100vh;
  display: flex; align-items: center; justify-content: center;
  text-align: center; padding: 0 24px; overflow: hidden;
}
#network { position: absolute; inset: 0; z-index: 0; opacity: .55; }
.hero::after {
  content:''; position: absolute; inset: 0;
  background: radial-gradient(ellipse at center, transparent 30%, var(--bg) 85%);
  z-index: 1; pointer-events: none;
}
.hero-content { position: relative; z-index: 2; max-width: 840px; }

.eyebrow {
  display: inline-flex; align-items: center; gap: 9px;
  font-size: .74rem; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;
  color: var(--blue-soft); background: rgba(59,130,246,.08);
  border: 1px solid rgba(59,130,246,.25);
  padding: 7px 18px; border-radius: 100px; margin-bottom: 30px;
}
.eyebrow .dots { display: flex; gap: 4px; }
.eyebrow .dots i { width: 6px; height: 6px; border-radius: 50%; display: block; }
.eyebrow .dots i:nth-child(1){ background: var(--tri-blue); }
.eyebrow .dots i:nth-child(2){ background: var(--tri-yellow); }
.eyebrow .dots i:nth-child(3){ background: var(--tri-red); }

h1 {
  font-size: clamp(2.6rem, 6vw, 4.4rem);
  font-weight: 900; letter-spacing: -2.5px; line-height: 1.05;
  margin-bottom: 22px;
}
h1 .hl {
  background: linear-gradient(90deg, #60a5fa, #a78bfa);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.hero-sub {
  font-size: 1.12rem; color: var(--dim); line-height: 1.7;
  max-width: 580px; margin: 0 auto 38px;
}

.hero-ctas { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
.btn-primary {
  background: var(--blue); color: #fff; text-decoration: none;
  font-weight: 700; font-size: 1rem; padding: 14px 34px; border-radius: 12px;
  transition: all .25s; box-shadow: 0 8px 30px rgba(59,130,246,.35);
  display: inline-block; cursor: pointer;
}
.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(59,130,246,.5); }
.btn-secondary {
  background: transparent; color: var(--text); border: 1px solid var(--border);
  text-decoration: none; font-weight: 600; font-size: 1rem;
  padding: 14px 30px; border-radius: 12px;
  transition: all .25s; display: inline-block; cursor: pointer;
}
.btn-secondary:hover { border-color: var(--dim); background: rgba(255,255,255,.03); }

.scroll-hint {
  position: absolute; bottom: 34px; left: 50%; transform: translateX(-50%);
  color: var(--dim); font-size: .72rem; letter-spacing: 1.6px; text-transform: uppercase;
  z-index: 2; animation: floatHint 2.4s ease-in-out infinite;
}
@keyframes floatHint {
  0%,100%{ transform: translate(-50%,0); opacity:.6; }
  50%{ transform: translate(-50%,-6px); opacity:1; }
}

/* ================= SECȚIUNI COMUNE ================= */
section.block { max-width: 1100px; margin: 0 auto; padding: 110px 24px 90px; }
.section-label {
  display: flex; align-items: center; justify-content: center; gap: 12px;
  font-size: .74rem; font-weight: 700; letter-spacing: 2.4px; text-transform: uppercase;
  color: var(--blue-soft); margin-bottom: 14px;
}
.section-label::before {
  content:''; width: 30px; height: 3px; border-radius: 2px;
  background: linear-gradient(90deg, var(--tri-blue) 33%, var(--tri-yellow) 33% 66%, var(--tri-red) 66%);
}
.section-title {
  text-align: center; font-size: clamp(1.7rem, 3.5vw, 2.4rem);
  font-weight: 800; letter-spacing: -1px; margin-bottom: 14px;
}
.section-sub {
  text-align: center; color: var(--dim); max-width: 560px;
  margin: 0 auto 54px; line-height: 1.7; font-size: .98rem;
}

/* ================= ORGANIGRAMA-DEMONSTRAȚIE ================= */
.og-wrap {
  background: var(--panel); border: 1px solid var(--border); border-radius: 22px;
  padding: 34px 18px 22px; position: relative; overflow: hidden;
}
.og-wrap::before {
  content:''; position:absolute; top:0; left:0; right:0; height:2px;
  background: linear-gradient(90deg, transparent, var(--blue), transparent); opacity:.6;
}
.og-svg { width: 100%; height: auto; display: block; }

.og-node {
  opacity: 0; transform: translateY(10px);
  transition: opacity .6s ease var(--d,0s), transform .6s ease var(--d,0s);
  cursor: pointer;
}
.og-svg.in .og-node { opacity: 1; transform: none; }

/* comportamentul hover SVG din simulare (transform-box pe rect/text) */
.og-node rect,
.og-node text {
  transform-box: fill-box;
  transition: transform .25s ease;
}
.og-node:hover { transform: translateY(-3px) !important; }
.og-node:hover rect {
  stroke: var(--c, var(--blue));
  filter: drop-shadow(0 0 12px var(--c, var(--blue)));
}

/* linii solide: se "desenează" prin dashoffset (lungimi precalculate în template) */
.og-line {
  stroke-dasharray: var(--len);
  stroke-dashoffset: var(--len);
  transition: stroke-dashoffset 1s ease var(--d,0s);
}
.og-svg.in .og-line { stroke-dashoffset: 0; }

/* linii punctate decorative: fade-in simplu */
.og-line-dashed { opacity: 0; transition: opacity .8s ease var(--d,0s); }
.og-svg.in .og-line-dashed { opacity: .85; }

.og-caption { text-align: center; color: var(--dim); font-size: .82rem; margin-top: 18px; }
.og-caption b { color: var(--text); }
/* ================= PILONII CA ORGANIGRAMĂ ================= */
.pillars-root { display: flex; justify-content: center; }
.pillars-root-pill {
  background: linear-gradient(90deg, var(--tri-blue), var(--tri-yellow), var(--tri-red));
  padding: 2px; border-radius: 14px;
  box-shadow: 0 6px 26px rgba(59,130,246,.3);
}
.pillars-root-pill > div {
  background: var(--panel); border-radius: 12px; padding: 13px 34px;
  font-weight: 900; letter-spacing: 2.5px; font-size: 1.02rem;
}

.pillars-connectors { width: 100%; height: 96px; display: block; margin: 0; }
.pillars-connectors path {
  fill: none; stroke-width: 2.5; opacity: 0;
  transition: opacity .7s ease var(--d,0s);
}
.pillars-connectors.in path { opacity: .85; }

.pillars-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px;
}

.pillar {
  background: var(--panel); border: 1px solid var(--border); border-radius: 18px;
  padding: 30px 26px 26px; position: relative; overflow: hidden;
  opacity: 0; transform: translateY(14px);
  transition: opacity .7s ease var(--d,0s), transform .7s ease var(--d,0s), border-color .3s;
}
.pillars-grid.in .pillar { opacity: 1; transform: none; }
.pillar:hover { border-color: var(--c); }
.pillar::before {
  content:''; position:absolute; top:0; left:0; right:0; height:3px;
  background: var(--c); opacity:.85;
}
.pillar-icon {
  width: 46px; height: 46px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center; font-size: 1.3rem;
  margin-bottom: 18px;
  background: rgba(255,255,255,.04); border: 1px solid var(--border);
}
.pillar h3 { font-size: 1.12rem; font-weight: 700; margin-bottom: 10px; }
.pillar p { font-size: .88rem; color: var(--dim); line-height: 1.7; margin-bottom: 20px; }

.pillar-kids { border-top: 1px dashed var(--border); padding-top: 14px; }
.pillar-kids .kid-line {
  width: 2px; height: 12px; background: var(--c); opacity: .6;
  margin: 0 auto 10px; border-radius: 2px;
}
.kid-row { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
.kid {
  font-size: .72rem; font-weight: 600; color: var(--text);
  background: rgba(255,255,255,.045); border: 1px solid var(--border);
  padding: 5px 12px; border-radius: 100px; white-space: nowrap;
}

/* ================= MISIUNEA ================= */
.mission { padding: 130px 24px; text-align: center; position: relative; }
.mission::before {
  content:''; position:absolute; inset:0;
  background: radial-gradient(ellipse at 50% 50%, rgba(59,130,246,.07) 0%, transparent 60%);
  pointer-events: none;
}
.quote-mark {
  font-size: 5rem; color: rgba(59,130,246,.25);
  font-family: Georgia, serif; line-height: 1; margin-bottom: -18px;
}
.mission-quote {
  font-size: clamp(1.6rem, 4vw, 2.6rem); font-weight: 800;
  letter-spacing: -1.5px; line-height: 1.25;
  max-width: 780px; margin: 0 auto 26px;
}
.mission-quote .hl {
  background: linear-gradient(90deg, #60a5fa, #a78bfa);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.mission .tri-bar { width: 150px; margin: 0 auto 26px; }
.mission-text {
  font-size: 1rem; color: var(--dim); max-width: 560px;
  margin: 0 auto 44px; line-height: 1.8;
}

/* ================= CTA FINAL ================= */
.final-cta { padding: 90px 24px 110px; text-align: center; }
.final-cta h2 {
  font-size: clamp(1.8rem, 4vw, 2.5rem); font-weight: 900;
  letter-spacing: -1.5px; margin-bottom: 14px;
}
.final-cta p { color: var(--dim); margin-bottom: 34px; font-size: 1.03rem; }
.btn-primary.big { font-size: 1.05rem; padding: 16px 44px; }

/* ================= FOOTER ================= */
.footer-tri {
  height: 3px;
  background: linear-gradient(90deg, var(--tri-blue) 33%, var(--tri-yellow) 33% 66%, var(--tri-red) 66%);
}
footer {
  padding: 30px 40px; display: flex; justify-content: center; align-items: center;
  font-size: .82rem; color: var(--dim); flex-wrap: wrap; gap: 12px;
}

/* ================= RESPONSIVE ================= */
@media (max-width: 860px) {
  .pillars-grid { grid-template-columns: 1fr; }
  .pillars-connectors { display: none; }
  .pillars-root { margin-bottom: 26px; }
  nav { padding: 0 20px; }
  .nav-links a:not(.nav-cta) { display: none; }
  .og-wrap { padding: 20px 8px 14px; }
}
</style>
