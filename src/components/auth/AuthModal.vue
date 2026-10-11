<template>
  <div class="auth-overlay" @click.self="$emit('close')">
    <div class="auth-card">

      <!-- bara tricoloră de identitate -->
      <div class="card-tri"></div>
      <button class="close-btn" @click="$emit('close')">✕</button>

      <div class="brand-dot"></div>

      <h2>{{ isLoginMode ? 'Conectează-te' : 'Creează cont' }}</h2>
      <p class="subtitle">
        {{ isLoginMode
            ? 'Accesează organigramele complete'
            : 'Alătură-te comunității StatGraph' }}
      </p>

      <form @submit.prevent="handleSubmit">

        <div class="input-group">
          <label for="auth-email">Adresa de email</label>
          <div class="input-wrap">
            <Mail class="input-icon" :size="17" />
            <input
              id="auth-email"
              type="email"
              v-model="email"
              placeholder="ex: nume@domeniu.ro"
              autocomplete="email"
              required
            />
          </div>
        </div>

        <div class="input-group">
          <label for="auth-password">Parola</label>
          <div class="input-wrap">
            <Lock class="input-icon" :size="17" />
            <input
              id="auth-password"
              :type="showPassword ? 'text' : 'password'"
              v-model="password"
              placeholder="Minim 6 caractere"
              :autocomplete="isLoginMode ? 'current-password' : 'new-password'"
              minlength="6"
              required
            />
            <button
              type="button"
              class="toggle-pass"
              @click="showPassword = !showPassword"
              :title="showPassword ? 'Ascunde parola' : 'Arată parola'"
              tabindex="-1"
            >
              <EyeOff v-if="showPassword" :size="17" />
              <Eye v-else :size="17" />
            </button>
          </div>
        </div>

        <a
          v-if="isLoginMode"
          href="#"
          class="forgot-link"
          @click.prevent="handleForgotPassword"
        >
          Ai uitat parola?
        </a>

        <button type="submit" class="submit-btn" :disabled="loading">
          {{ loading
              ? 'Se procesează…'
              : (isLoginMode ? 'Intră în cont' : 'Creează contul') }}
        </button>

        <div v-if="errorMessage" class="message error">{{ errorMessage }}</div>
        <div v-if="successMessage" class="message success">{{ successMessage }}</div>
      </form>

      <div class="switch-mode">
        <span>{{ isLoginMode ? 'Nu ai cont?' : 'Ai deja cont?' }}</span>
        <button type="button" @click="toggleMode">
          {{ isLoginMode ? 'Creează cont' : 'Conectează-te' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Mail, Lock, Eye, EyeOff } from 'lucide-vue-next';
import { useAuth } from '../../composables/useAuth';

const emit = defineEmits(['close']);
const router = useRouter();
const { login, register, resetPassword } = useAuth();

const props = defineProps({
  initialMode: {
    type: String,
    default: 'login' // 'login' | 'register'
  }
});

const isLoginMode = ref(props.initialMode !== 'register');
const showPassword = ref(false);

const email = ref('');
const password = ref('');
const loading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

const toggleMode = () => {
  isLoginMode.value = !isLoginMode.value;
  errorMessage.value = '';
  successMessage.value = '';
};

const handleSubmit = async () => {
  loading.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  try {
    if (isLoginMode.value) {
      await login(email.value, password.value);
      emit('close');
      router.push('/dashboard');
    } else {
      await register(email.value, password.value);
      // Onest indiferent de configurație: dacă confirmarea pe email e activă,
      // utilizatorul trebuie să o confirme; dacă nu, se poate autentifica direct.
      successMessage.value =
        '✔ Cont creat! Dacă ți s-a cerut confirmarea emailului, verifică inbox-ul, apoi autentifică-te.';
      // Trecem în modul Login, păstrând emailul deja completat
      isLoginMode.value = true;
    }
  } catch (error) {
    if (error.message.includes('Invalid login credentials')) {
      errorMessage.value = 'Email sau parolă incorecte.';
    } else {
      errorMessage.value = error.message;
    }
  } finally {
    loading.value = false;
  }
};

const handleForgotPassword = async () => {
  if (!email.value) {
    errorMessage.value = 'Introdu adresa de email pentru a reseta parola.';
    return;
  }
  try {
    loading.value = true;
    await resetPassword(email.value);
    successMessage.value = '✔ Un email de resetare a parolei a fost trimis la adresa introdusă.';
    errorMessage.value = '';
  } catch (error) {
    errorMessage.value = 'Eroare la trimiterea emailului de resetare.';
  } finally {
    loading.value = false;
  }
};
</script>
<style scoped>
/* ================= OVERLAY ================= */
.auth-overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 15, 30, 0.8);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 24px;
}

/* ================= CARD — mai lat și aerisit ================= */
.auth-card {
  position: relative;
  width: 100%;
  max-width: 400px;              /* ↑ de la 430px */
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  background: #111827;
  border: 1px solid #223050;
  border-radius: 22px;
  padding: 60px 60px 30px;       /* ↑ de la 42/36/28 — respirație reală */
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.55);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  animation: modalIn 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

@keyframes modalIn {
  from { opacity: 0; transform: translateY(18px) scale(0.97); }
  to   { opacity: 1; transform: none; }
}

/* bara tricoloră — accent flotant, departe de colțuri */
.card-tri {
  position: absolute;
  top: 70px;                    /* ↓ coborâtă sub marginea cardului */
  left: 50%;                    /* centrată; pentru „spre dreapta" vezi mai jos */
  transform: translateX(-50%);
  width: 80px;                 /* scurtă, discretă */
  height: 4px;
  border-radius: 4px;
  background: linear-gradient(90deg, #2563eb 33%, #f59e0b 33% 66%, #dc2626 66%);
}

/* dot-ul tricolor de brand — mai mare */
/* dot-ul tricolor — aliniat cu titlul, la mică distanță de marginea stângă */
.brand-dot {
  position: absolute;
  top: 20px;        /* ← knob vertical: ±2-4px până se aliniază cu „Creează cont" */
  left: 15px;       /* ← knob orizontal: distanța de marginea cardului */
  width: 18px;
  height: 18px;
  border-radius: 50%;
  margin: 0;        /* anulează vechea centrare */
  background: linear-gradient(180deg, #2563eb 33%, #f59e0b 33% 66%, #dc2626 66%);
  box-shadow: 0 0 14px rgba(59, 130, 246, 0.5);
}

.close-btn {
  position: absolute;
  top: 18px; right: 18px;
  background: none;
  border: none;
  font-size: 1.35rem;           /* ↑ — mai ușor de prins */
  cursor: pointer;
  color: #64748b;
  padding: 6px 10px;
  border-radius: 8px;
  transition: color 0.2s, background 0.2s;
}
.close-btn:hover { color: #eef2f7; background: rgba(255, 255, 255, 0.06); }

/* ================= TITLURI — mai prezente ================= */
h2 {
  text-align: center;
  color: #eef2f7;
  font-size: 1.75rem;           /* ↑ de la 1.5rem */
  font-weight: 800;
  letter-spacing: -0.5px;
  margin-bottom: 10px;
}
.subtitle {
  text-align: center;
  color: #8b98ad;
  margin-bottom: 34px;          /* ↑ mai mult aer după titlu */
  font-size: 0.95rem;           /* ↑ */
  line-height: 1.6;
}

/* ================= INPUTURI — înalte, clare, confortabile ================= */
.input-group { margin-bottom: 22px; text-align: left; }   /* ↑ de la 18px */
.input-group label {
  display: block;
  font-weight: 700;
  margin-bottom: 20px;
  color: #d7dfeb;
  font-size: 0.95rem;           /* ↑ de la 0.85 — label-uri cu adevărat citibile */
}

.input-wrap { position: relative; }
.input-icon {
  position: absolute;
  left: 16px; top: 50%;
  transform: translateY(-50%);
  color: #64748b;
  pointer-events: none;
}
.input-wrap input {
  width: 100%;
  height: 52px;                 /* ↑ inputuri ÎNALTE (de la ~46px implicit) */
  padding: 0 52px 0 46px;
  background: #0e1526;
  border: 1.5px solid #223050;  /* ↑ chenar mai vizibil */
  border-radius: 12px;
  color: #eef2f7;
  font-size: 1.02rem;           /* ↑ textul din input — clare la prima vedere */
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
}
.input-wrap input::placeholder { color: #4b5871; }
.input-wrap input:focus {
  border-color: #3b82f6;
  background: #0f1830;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.16);
}

/* iconițe + toggle scalate la inputul înalt */
.input-icon { width: 19px; height: 19px; }

.toggle-pass {
  position: absolute;
  right: 10px; top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: color 0.2s;
}
.toggle-pass:hover { color: #93c5fd; }
.toggle-pass svg { width: 20px; height: 20px; }

/* ================= LINK PAROLĂ UITATĂ ================= */
.forgot-link {
  display: block;
  text-align: right;
  font-size: 0.88rem;           /* ↑ */
  color: #93c5fd;
  text-decoration: none;
  margin: -6px 0 22px;
}
.forgot-link:hover { text-decoration: underline; }

/* ================= BUTON PRINCIPAL — înalt și impresionant ================= */
.submit-btn {
  width: 100%;
  height: 54px;                 /* ↑ de la ~50px */
  border-radius: 12px;
  border: none;
  background: linear-gradient(180deg, #3b82f6 0%, #2563eb 100%);
  color: #fff;
  font-size: 1.08rem;           /* ↑ */
  font-weight: 700;
  letter-spacing: 0.3px;
  cursor: pointer;
  transition: all 0.25s;
  box-shadow: 0 10px 28px rgba(59, 130, 246, 0.32);
  margin-top: 6px;
}
.submit-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 14px 36px rgba(59, 130, 246, 0.48);
}
.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* ================= MESAJE ================= */
.message {
  margin-top: 18px;
  padding: 13px 16px;
  border-radius: 12px;
  font-size: 0.9rem;            /* ↑ */
  line-height: 1.55;
}
.error {
  background: rgba(220, 38, 38, 0.09);
  border: 1px solid rgba(220, 38, 38, 0.35);
  color: #fca5a5;
}
.success {
  background: rgba(22, 163, 74, 0.09);
  border: 1px solid rgba(22, 163, 74, 0.35);
  color: #86efac;
}

/* ================= SCHIMBARE MOD ================= */
.switch-mode {
  margin-top: 30px;             /* ↑ */
  padding-top: 26px;
  border-top: 1px dashed #223050;
  text-align: center;
  font-size: 0.95rem;           /* ↑ */
  color: #8b98ad;
}
.switch-mode button {
  background: none;
  border: none;
  color: #93c5fd;
  font-weight: 700;
  cursor: pointer;
  font-size: 1rem;              /* ↑ */
}
.switch-mode button:hover { text-decoration: underline; }

/* ================= RESPONSIVE ================= */
@media (max-width: 560px) {
  .auth-card {
    padding: 44px 26px 30px;    /* padding lateral redus, dar aerisit */
    border-radius: 18px;
  }
  h2 { font-size: 1.5rem; }
  .subtitle { font-size: 0.9rem; margin-bottom: 28px; }
  .input-group { margin-bottom: 18px; }
  .input-group label { font-size: 0.9rem; }
  .input-wrap input { height: 50px; font-size: 1rem; }
  .submit-btn { height: 52px; font-size: 1.02rem; }
}

/* ecrane foarte joase (landscape mobil): cardul derulează confortabil */
@media (max-height: 640px) {
  .auth-card { padding-top: 38px; }
  h2 { margin-bottom: 6px; }
  .subtitle { margin-bottom: 22px; }
  .input-group { margin-bottom: 14px; }
}
</style>
