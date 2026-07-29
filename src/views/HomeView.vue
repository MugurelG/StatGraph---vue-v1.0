<template>
  <!-- Înlocuim <body> cu un wrapper -->
  <div class="home-wrapper">
    <div class="container">
      
      <!-- PARTEA STÂNGĂ -->
      <div class="left-content">
        <h1>StatGraph</h1>
        <p class="subtitle">Transparența statului face puterea înțeleasă.</p>
        
        <!-- LINIA ALBASTRĂ + TEXTUL NOU -->
        <div class="description-block">
          STATGRAPH centralizează organigramele instituțiilor publice, relațiile administrative și datele organizaționale într-o singură platformă inteligentă de analiză.
        </div>

        <div class="actions-wrapper">
          <!-- BUTONUL PRINCIPAL DUCE LA DASHBOARD -->
          <a href="#" class="btn-primary" @click.prevent="$router.push('/dashboard')">Accesează platforma</a>
          
          <div class="secondary-links">
            <!-- LINK-URI CU CULORI SPECIFICE -->
            <a href="#" class="link-green">Disclaimer</a>
            <a href="#" class="link-blue">Instrucțiuni</a>
            <a href="#" class="link-yellow" @click.prevent="openAuth(false)">Creează cont</a>
            <a href="#" class="link-red" @click.prevent="openAuth(true)">Autentificare</a>
          </div>
        </div>
      </div>

      <!-- PARTEA DREAPTĂ: GRAFICUL TRICOLOR -->
      <div class="right-graphic">
        <div class="tri-line-bg"></div>
        <div class="tri-circle-bg"></div>

        <svg class="org-svg" viewBox="0 0 600 500" xmlns="http://www.w3.org/2000/svg">
          
          <!-- LINII TRICOLOARE -->
          <path class="line-blue" d="M300 80 L300 180" />
          <path class="line-red" d="M300 180 L150 280 M150 280 L80 380 M150 280 L220 380" />
          <path class="line-yellow" d="M300 180 L450 280 M450 280 L380 380 M450 280 L520 380" />

          <!-- Nodul Principal -->
          <g class="node-main-group">
            <circle class="pulse-circle" cx="300" cy="80" r="24" />
            <circle class="node-main" cx="300" cy="80" r="24" />
            <text x="300" y="130" class="node-text">GUVERN</text>
          </g>

          <!-- Noduri Intermediare -->
          <circle class="node-sec" cx="300" cy="180" r="16" />
          <circle class="node-sec" cx="150" cy="280" r="16" />
          <circle class="node-sec" cx="450" cy="280" r="16" />

          <!-- Noduri Terminale -->
          <circle class="node-sec" cx="80" cy="380" r="12" style="stroke: #dc2626;" />
          <circle class="node-sec" cx="220" cy="380" r="12" style="stroke: #dc2626;" />
          <circle class="node-sec" cx="380" cy="380" r="12" style="stroke: #f59e0b;" />
          <circle class="node-accent-yellow" cx="520" cy="380" r="12" />

          <!-- Etichete -->
          <text x="80" y="410" class="node-text" style="font-size: 10px; fill: #dc2626;">DEP 1</text>
          <text x="220" y="410" class="node-text" style="font-size: 10px; fill: #dc2626;">DEP 2</text>
          <text x="380" y="410" class="node-text" style="font-size: 10px; fill: #f59e0b;">SERV 1</text>
          <text x="520" y="410" class="node-text" style="font-size: 10px; fill: #f59e0b;">AGENTIE</text>

        </svg>
      </div>
    </div>

    <!-- MODALUL DE AUTENTIFICARE -->
    <AuthModal v-if="showAuthModal" @close="showAuthModal = false" />
  </div>
</template>

<script setup>
import { ref } from 'vue';
import AuthModal from '../components/auth/AuthModal.vue';

const showAuthModal = ref(false);

// Păstrăm logica ta veche: true = Login, false = Register
const openAuth = (isLogin) => {
  showAuthModal.value = true;
};
</script>

<style scoped>
/* 1. RESET & BAZĂ (Acum pe wrapper, nu pe body) */
.home-wrapper {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  background-color: #f8fafc; 
  color: #0f172a;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  position: relative;
  margin: 0;
  padding: 0;
}

/* 2. GRID-UL DE FUNAL */
.home-wrapper::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background-image: radial-gradient(#94a3b8 1px, transparent 1px);
  background-size: 40px 40px;
  opacity: 0.15;
  z-index: 1;
}

/* 3. LAYOUT PRINCIPAL */
.container {
  position: relative;
  z-index: 10;
  display: flex;
  height: 100vh;
  width: 100vw;
}

.left-content {
  flex: 0 0 45%;
  display: flex;
  flex-direction: column;
  padding: 0 60px;
  padding-top: 15vh; 
}

.right-graphic {
  flex: 1; 
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 4. TIPOGRAFIE VOLUMETRICĂ */
h1 {
  font-size: 6rem;
  font-weight: 900;
  letter-spacing: -3px;
  line-height: 0.9;
  margin-bottom: 12px;
  background: linear-gradient(180deg, #0f172a 0%, #334155 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-shadow: 
    0px 1px 1px rgba(255,255,255,0.4),
    0px -1px 2px rgba(0,0,0,0.2),
    0px 6px 15px rgba(15, 23, 42, 0.15);
}

.subtitle {
  font-size: 1.4rem;
  color: #475569;
  font-weight: 500;
  margin-bottom: 30px;
  line-height: 1.4;
}

/* 5. ELEMENTUL CU LINIA ALBASTRĂ */
.description-block {
  border-left: 3px solid #2563eb; 
  padding-left: 20px;
  font-size: 1rem;
  color: #475569;
  line-height: 1.7;
  max-width: 450px;
  margin-bottom: 40px;
}

/* 6. WRAPER PENTRU ALINIERE BUTOANE */
.actions-wrapper {
  display: flex;
  flex-direction: column;
  gap: 30px;
}

.secondary-links {
  display: flex;
  gap: 32px;
  width: 520px; 
}

/* 7. BUTONUL CTA LA MIJLOC */
.btn-primary {
  display: inline-block;
  background: linear-gradient(180deg, #3b82f6 0%, #2563eb 100%);
  color: #ffffff;
  font-size: 1.15rem;
  font-weight: 600;
  padding: 18px 48px;
  border-radius: 10px;
  text-decoration: none;
  letter-spacing: 0.5px;
  box-shadow: 0 10px 25px -5px rgba(37, 99, 235, 0.4), 0 4px 6px -2px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.2);
  transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  margin-left: 120px; 
  align-self: flex-start;
  cursor: pointer;
}

.btn-primary:hover {
  transform: translateY(-3px);
  box-shadow: 0 20px 40px -10px rgba(37, 99, 235, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.3);
}

/* 8. LINK-URILE SECUNDARE */
.secondary-links a {
  color: #64748b;
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  position: relative;
  transition: color 0.2s ease;
  padding-bottom: 4px;
  cursor: pointer;
}

.secondary-links a::after {
  content: '';
  position: absolute;
  width: 100%;
  height: 1.5px;
  bottom: 0;
  left: 0;
  transform: scaleX(0);
  transform-origin: right;
  transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

/* CULORILE SPECIFICE PENTRU ANIMAȚIA LINIEI */
.secondary-links a.link-red::after { background-color: #dc2626; }
.secondary-links a.link-yellow::after { background-color: #f59e0b; }
.secondary-links a.link-blue::after { background-color: #2563eb; }
.secondary-links a.link-green::after { background-color: #16a34a; }

.secondary-links a:hover { color: #0f172a; }
.secondary-links a:hover::after { transform: scaleX(1); transform-origin: left; }

/* 9. GRAFICUL SVG */
.org-svg {
  width: 80%;
  height: 80%;
  opacity: 0.9;
}

.line-red { stroke: #dc2626; stroke-width: 2.5; fill: none; opacity: 0.7; }
.line-yellow { stroke: #f59e0b; stroke-width: 2.5; fill: none; opacity: 0.7; }
.line-blue { stroke: #2563eb; stroke-width: 2.5; fill: none; opacity: 0.7; }

.node-main {
  fill: #2563eb;
  filter: drop-shadow(0 4px 6px rgba(37, 99, 235, 0.3));
}

.node-sec {
  fill: #ffffff;
  stroke: #e2e8f0;
  stroke-width: 2;
  filter: drop-shadow(0 4px 4px rgba(0,0,0,0.05));
}

.node-accent-yellow { fill: #f59e0b; opacity: 0.8; }

.node-text {
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  fill: #64748b;
  text-anchor: middle;
  dominant-baseline: central;
}

.pulse-circle {
  fill: #2563eb;
  opacity: 0;
  transform-origin: center;
  animation: pulse 3s infinite cubic-bezier(0.215, 0.61, 0.355, 1);
}

@keyframes pulse {
  0% { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(2.5); opacity: 0; }
}

.tri-line-bg {
  position: absolute;
  width: 150px;
  height: 4px;
  background: #dc2626;
  opacity: 0.1;
  bottom: 20%;
  right: 10%;
  transform: rotate(-45deg);
}

.tri-circle-bg {
  position: absolute;
  width: 120px;
  height: 120px;
  border: 3px solid #f59e0b;
  border-radius: 50%;
  opacity: 0.1;
  top: 15%;
  right: 25%;
}
</style>
