import { createRouter, createWebHistory } from 'vue-router'
import { auth, restoreSession } from './auth'
import LoginView from './views/LoginView.vue'
import MachinesView from './views/MachinesView.vue'
import PartsView from './views/PartsView.vue'
import PartTemplatesView from './views/PartTemplatesView.vue'
import AdminView from './views/AdminView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
    { path: '/', redirect: { name: 'machines' } },
    { path: '/machines', name: 'machines', component: MachinesView },
    { path: '/parts', name: 'parts', component: PartsView },
    { path: '/part-templates', name: 'part-templates', component: PartTemplatesView, meta: { role: 'admin' } },
    { path: '/admin', name: 'admin', component: AdminView, meta: { role: 'admin' } },
    { path: '/:pathMatch(.*)*', redirect: { name: 'machines' } },
  ],
})

router.beforeEach(async to => {
  await restoreSession()
  if (to.meta.public) return auth.user ? { name: 'machines' } : true
  if (!auth.user) return { name: 'login', query: { redirect: to.fullPath } }
  if (to.meta.role === 'admin' && auth.user.role !== 'admin') return { name: 'machines' }
  return true
})
