import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import Dashboard from '../views/Dashboard.vue'
import Educatie from '../views/Educatie.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomeView },
    { path: '/dashboard', component: Dashboard },
    { path: '/educatie', component: Educatie }
  ]
})

export default router