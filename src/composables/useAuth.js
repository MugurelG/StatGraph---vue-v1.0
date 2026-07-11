// src/composables/useAuth.js
import { ref } from 'vue'
import { supabase } from '../supabaseClient'

const user = ref(null)
const userRole = ref('vizitator') // Default

// Ascultăm schimbările de stare din Supabase (Login/Logout)
// AM SCOS "async" de aici ca să nu blocheze procesul de login dacă RLS-ul dă eroare
supabase.auth.onAuthStateChange((event, session) => {
  console.log("Auth Event:", event); 
  
  if (session) {
    user.value = session.user
    
    // Folosim .then() în loc de await. Astfel, dacă interogarea dă eroare, 
    // login-ul tot se termină cu succes în AuthModal.
    supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.error("Eroare la preluarea rolului (probabil RLS):", error.message);
          userRole.value = 'utilizator'; // Fallback safe
        } else {
          console.log("Rol preluat din DB:", data?.role);
          userRole.value = data?.role || 'utilizator';
        }
      })
      .catch((err) => {
        console.error("Catch error la profil:", err);
        userRole.value = 'utilizator';
      });
  } else {
    user.value = null
    userRole.value = 'vizitator'
  }
})

export function useAuth() {
  const login = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const register = async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
  }

  const logout = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  const resetPassword = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    if (error) throw error
  }

  return { user, userRole, login, register, logout, resetPassword }
}