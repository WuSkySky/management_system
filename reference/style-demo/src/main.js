// STYLE REFERENCE ONLY: this page's layout, labels, sample data, and interactions are placeholders.
// For approved visual principles, see ../../docs/ui-style.md from this Demo's root.
// Build actual pages from confirmed requirements.
import { createApp, computed, ref } from 'vue/dist/vue.esm-bundler.js'
import './style.css'

const orders = [
  { id: 'PO-240928-01', name: '精密连接件 A', client: '华衡设备', stage: '表面处理', progress: 72, status: '进行中', due: '10.02', owner: '林工', timeline: ['材料确认', '下料', '加工', '表面处理', '质检', '交付'] },
  { id: 'PO-240928-02', name: '控制箱体 B', client: '博源科技', stage: '等待上游', progress: 38, status: '受阻', due: '09.30', owner: '陈工', timeline: ['材料确认', '下料', '焊接', '装配', '质检', '交付'] },
  { id: 'PO-240928-03', name: '铝制支架 C', client: '东辰制造', stage: '质检', progress: 89, status: '进行中', due: '10.05', owner: '周工', timeline: ['材料确认', '下料', '加工', '表面处理', '质检', '交付'] },
  { id: 'PO-240928-04', name: '传动组件 D', client: '启新工业', stage: '已交付', progress: 100, status: '已完成', due: '09.27', owner: '吴工', timeline: ['材料确认', '下料', '加工', '装配', '质检', '交付'] },
  { id: 'PO-240928-05', name: '定制面板 E', client: '星拓电子', stage: '加工', progress: 54, status: '进行中', due: '10.08', owner: '赵工', timeline: ['材料确认', '下料', '加工', '表面处理', '质检', '交付'] },
]

const Icon = {
  props: ['name', 'size'],
  template: `<svg :width="size || 20" :height="size || 20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="name === 'grid'"><rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><rect x="13.5" y="13.5" width="7" height="7" rx="1"/></template>
    <template v-else-if="name === 'list'"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></template>
    <template v-else-if="name === 'layers'"><path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/></template>
    <template v-else-if="name === 'users'"><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6M21 20v-2a6 6 0 0 0-4-5.6"/></template>
    <template v-else-if="name === 'search'"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></template>
    <template v-else-if="name === 'arrow'"><path d="M5 12h14m-6-6 6 6-6 6"/></template>
    <template v-else-if="name === 'close'"><path d="M5 5 19 19M19 5 5 19"/></template>
    <template v-else-if="name === 'bell'"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/></template>
  </svg>`,
}

const App = {
  components: { Icon },
  setup() {
    const activeNav = ref('概览')
    const activeFilter = ref('全部')
    const search = ref('')
    const selected = ref(null)
    const showSearch = ref(false)
    const navItems = [
      { label: '概览', icon: 'grid' },
      { label: '生产单', icon: 'list' },
      { label: '环节', icon: 'layers' },
      { label: '人员', icon: 'users' },
    ]
    const filteredOrders = computed(() => orders.filter(order => {
      const matchesStatus = activeFilter.value === '全部' || order.status === activeFilter.value || (activeFilter.value === '进行中' && order.status === '进行中')
      const term = search.value.trim().toLowerCase()
      const matchesSearch = !term || [order.id, order.name, order.client, order.owner].some(value => value.toLowerCase().includes(term))
      return matchesStatus && matchesSearch
    }))
    function selectNav(label) {
      activeNav.value = label
      if (label === '概览') activeFilter.value = '全部'
    }
    return { activeNav, activeFilter, search, selected, showSearch, navItems, filteredOrders, orders, selectNav }
  },
  template: `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand"><span class="brand-mark"><i></i><i></i><i></i></span><span>序线<span class="brand-sub">PRODUCTION</span></span></div>
        <div class="sidebar-group-label">工作台</div>
        <nav class="sidebar-nav" aria-label="主导航">
          <button v-for="item in navItems" :key="item.label" class="nav-item" :class="{ active: activeNav === item.label }" @click="selectNav(item.label)"><Icon :name="item.icon" :size="18"/><span>{{ item.label }}</span></button>
        </nav>
        <div class="sidebar-footer"><span class="avatar">管</span><span><strong>管理员</strong><small>管理账号</small></span><span class="footer-dots">···</span></div>
      </aside>

      <div class="page">
        <header class="topbar">
          <span class="crumb">工作台 <span>/</span> {{ activeNav }}</span>
          <div class="top-actions">
            <div v-if="showSearch" class="search-box"><Icon name="search" :size="17"/><input v-model="search" autofocus placeholder="搜索生产单" aria-label="搜索生产单" /></div>
            <button v-else class="icon-button" aria-label="搜索" @click="showSearch = true"><Icon name="search" :size="20"/></button>
            <button class="icon-button notification" aria-label="通知"><Icon name="bell" :size="20"/><span class="notice-dot"></span></button>
            <span class="top-avatar">管</span>
          </div>
        </header>

        <main class="content">
          <div class="heading-row"><div><div class="eyebrow">2026 / 09 / 28 · 星期一</div><h1>{{ activeNav === '概览' ? '生产概览' : activeNav }}</h1></div><button class="primary-action" @click="activeNav = '生产单'">查看生产单 <Icon name="arrow" :size="17"/></button></div>

          <section class="metrics" aria-label="生产数据">
            <div class="metric"><span>进行中</span><div>03<small>个生产单</small></div></div>
            <div class="metric"><span>受阻</span><div class="warn-number">01<small>需关注</small></div></div>
            <div class="metric"><span>本周完成</span><div>01<small>个生产单</small></div></div>
            <div class="metric"><span>整体完成率</span><div>71<small>%</small></div></div>
          </section>

          <div class="main-grid">
            <section class="orders-section">
              <div class="section-head"><div><h2>生产单</h2></div><span class="section-count">{{ filteredOrders.length }} 项</span></div>
              <div class="filter-row" role="group" aria-label="状态筛选"><button v-for="filter in ['全部', '进行中', '受阻', '已完成']" :key="filter" :class="{ selected: activeFilter === filter }" @click="activeFilter = filter">{{ filter }}</button></div>
              <div class="table-head"><span>生产单 / 客户</span><span>当前环节</span><span>进度</span><span>交期</span></div>
              <button v-for="order in filteredOrders" :key="order.id" class="order-row" @click="selected = order">
                <span class="order-identity"><strong>{{ order.name }}</strong><small>{{ order.id }} · {{ order.client }}</small></span>
                <span class="order-stage"><i class="status-dot" :class="order.status"></i>{{ order.stage }}</span>
                <span class="order-progress"><span>{{ order.progress }}%</span><i><b :style="{ width: order.progress + '%' }" :class="{ blocked: order.status === '受阻' }"></b></i></span>
                <span class="order-due">{{ order.due }}<Icon name="arrow" :size="16"/></span>
              </button>
              <div v-if="filteredOrders.length === 0" class="empty">没有符合条件的生产单</div>
            </section>

            <aside class="attention-section"><div class="section-head"><div><h2>当前关注</h2></div><span class="attention-count">1</span></div>
              <button class="issue" @click="selected = orders[1]"><span class="issue-top"><span class="issue-symbol">!</span><small>待处理 · 09.28</small></span><strong>控制箱体 B 等待上游交付</strong><span class="issue-bottom">焊接环节暂未开始 <Icon name="arrow" :size="16"/></span></button>
            </aside>
          </div>
          <footer class="page-footer">页面示例 · 数据仅用于展示</footer>
        </main>
      </div>

      <nav class="mobile-nav" aria-label="移动端主导航"><button v-for="item in navItems" :key="item.label" :class="{ active: activeNav === item.label }" @click="selectNav(item.label)"><Icon :name="item.icon" :size="20"/><span>{{ item.label }}</span></button></nav>

      <div v-if="selected" class="modal-backdrop" @click.self="selected = null"><section class="detail-panel" role="dialog" aria-modal="true" :aria-label="selected.name + ' 详情'"><div class="detail-top"><span>生产单详情</span><button class="icon-button" aria-label="关闭详情" @click="selected = null"><Icon name="close"/></button></div><div class="detail-body"><span class="detail-id">{{ selected.id }}</span><h2>{{ selected.name }}</h2><p>{{ selected.client }} · 负责人 {{ selected.owner }}</p><div class="detail-stat"><span>当前进度</span><strong>{{ selected.progress }}%</strong></div><div class="detail-bar"><span :style="{ width: selected.progress + '%' }"></span></div><div class="detail-meta"><span>状态</span><strong><i class="status-dot" :class="selected.status"></i>{{ selected.status }}</strong></div><div class="detail-meta"><span>交期</span><strong>2026.{{ selected.due }}</strong></div><h3>环节进度</h3><ol class="timeline"><li v-for="(step, index) in selected.timeline" :key="step" :class="{ complete: index < Math.floor(selected.progress / 17), current: step === selected.stage }"><span class="timeline-mark"></span><span>{{ step }}</span><small v-if="step === selected.stage">当前</small></li></ol></div></section></div>
    </div>
  `,
}

createApp(App).mount('#app')
