<!-- src/components/auth/AuthModal.vue -->
<template>
  <div class="auth-overlay" @click.self="$emit('close')">
    <div class="auth-card">
      <button class="close-btn" @click="$emit('close')">✕</button>
      
      <h2>{{ isLoginMode ? 'Conectează-te' : 'Creează cont' }}</h2>
      <p class="subtitle">{{ isLoginMode ? 'Accesează organigrame complete' : 'Alătură-te comunității STATGRAPH' }}</p>

      <form @submit.prevent="handleSubmit">
        <div class="input-group">
          <label>Email</label>
          <input type="email" v-model="email" placeholder="ex: nume@domeniu.ro" required />
        </div>

        <div class="input-group">
          <label>Parolă</label>
          <input type="password" v-model="password" placeholder="Minim 6 caractere" required />
        </div>

        <!-- Buton pentru Resetare Parolă (apare doar în modul Login) -->
        <a v-if="isLoginMode" href="#" class="forgot-link" @click.prevent="handleForgotPassword">
          Ai uitat parola?
        </a>

        <button type="submit" class="submit-btn" :disabled="loading">
          {{ loading ? 'Se procesează...' : (isLoginMode ? 'Intră în cont' : 'Înregistrare') }}
        </button>

        <div v-if="errorMessage" class="message error">{{ errorMessage }}</div>
        <div v-if="successMessage" class="message success">{{ successMessage }}</div>
      </form>

      <div class="switch-mode">
        <span>{{ isLoginMode ? 'Nu ai cont?' : 'Ai deja cont?' }}</span>
        <button @click="toggleMode">{{ isLoginMode ? 'Creează cont' : 'Conectează-te' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth'; // Importăm composable-ul creat anterior

const emit = defineEmits(['close']);
const router = useRouter();

const { login, register, resetPassword } = useAuth();

const props = defineProps({
  initialMode: {
    type: String,
    default: 'login' // Poate fi 'login' sau 'register'
  }
});
const isLoginMode = ref(props.initialMode !== 'register');
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
    console.log("1. Am apasat Login");
    loading.value = true;
    errorMessage.value = '';
    successMessage.value = '';

    try {
      if (isLoginMode.value) {
        console.log("2. Se apeleaza login()");
        await login(email.value, password.value);
        console.log("3. Login Supabase reusit! Se inchide modalul...");
        emit('close'); 
        console.log("4. Se face redirect la Dashboard...");
        router.push('/dashboard'); 
      } else {
        await register(email.value, password.value);
        successMessage.value = '✔ Cont creat!';
      }
    } catch (error) {
      console.error("EROARE CATCH LOGIN:", error);
      if (error.message.includes('Invalid login credentials')) {
        errorMessage.value = 'Email sau parolă incorecte.';
      } else {
        errorMessage.value = error.message;
      }
    } finally {
      console.log("5. Gata procesul (finally)");
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
/* Overlay întunecat cu blur */
.auth-overlay {
  position: fixed;
  top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

/* Card-ul modal (inspirat din design-ul tău) */
.auth-card {
  background: rgba(255, 255, 255, 0.95);
  padding: 40px;
  border-radius: 20px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 20px 40px rgba(0,0,0,0.3);
  position: relative;
}

.close-btn {
  position: absolute; top: 15px; right: 20px;
  background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #666;
}

h2 { text-align: center; color: #0000FF; font-size: 2rem; margin-bottom: 5px; text-transform: uppercase; }
.subtitle { text-align: center; color: #333; margin-bottom: 30px; font-size: 0.9rem; }

.input-group { margin-bottom: 20px; text-align: left; }
.input-group label { display: block; font-weight: bold; margin-bottom: 5px; color: #333; }
.input-group input {
  width: 100%; padding: 12px; border: 2px solid #ccc; border-radius: 50px;
  font-size: 1rem; box-sizing: border-box; outline: none; transition: 0.3s;
}
.input-group input:focus { border-color: #0000FF; }

.forgot-link { display: block; text-align: right; font-size: 0.8rem; color: #0000FF; text-decoration: none; margin-bottom: 20px; }

.submit-btn {
  width: 100%; padding: 14px; border-radius: 50px; border: none;
  background: #0000FF; color: #fff; font-size: 1.1rem; font-weight: bold;
  cursor: pointer; text-transform: uppercase; transition: 0.3s;
}
.submit-btn:hover { background: #0000CC; }
.submit-btn:disabled { background: #999; cursor: not-allowed; }

.message { margin-top: 15px; padding: 10px; border-radius: 10px; text-align: center; font-size: 0.9rem; }
.error { background: #ffe6e6; color: #d32f2f; border: 1px solid #d32f2f; }
.success { background: #e6ffe6; color: #2e7d32; border: 1px solid #2e7d32; }

.switch-mode { margin-top: 25px; text-align: center; font-size: 0.9rem; color: #666; }
.switch-mode button { background: none; border: none; color: #FF0000; font-weight: bold; cursor: pointer; text-decoration: underline; }
</style>