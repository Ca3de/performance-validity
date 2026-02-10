/**
 * AA Performance Hub - Dashboard Script
 * Football Manager style interface
 */

(function() {
  'use strict';

  // State
  const state = {
    warehouseId: 'UNKNOWN',
    allCachedData: [],
    currentView: 'overview',
    // Overview state
    overviewPeriod: 'last30',
    // Lookup state
    lookupPeriod: 'last30',
    lookupPath: 'all',
    selectedAA: null,
    // Data hub state
    dataPeriod: 'today',
    dataSearch: '',
    dataPathFilter: 'all',
    fclmTabId: null,
    // Refresh state
    refreshInterval: null,
    refreshing: false
  };

  // Path configuration
  const PATH_CONFIG = {
    'pick': { name: 'Pick', color: '#4CAF50', goal: 30 },
    'pack': { name: 'Pack', color: '#2196F3', goal: 35 },
    'stow': { name: 'Stow', color: '#9C27B0', goal: 45 },
    'sort_batch': { name: 'Sort-Batch', color: '#FF9800', goal: 280 }
  };

  // Badge photo URL helper
  const BADGE_PHOTO_URL = 'https://badgephotos.corp.amazon.com/?fullsizeimage=1&uid=';

  function getBadgePhotoUrl(login) {
    if (!login) return null;
    return `${BADGE_PHOTO_URL}${encodeURIComponent(login)}`;
  }

  // Default avatar SVG for fallback
  const DEFAULT_AVATAR_SVG = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;

  /**
   * Setup image error handlers for avatar fallback (CSP-safe)
   * Call this after rendering any content with avatar images
   */
  function setupAvatarFallbacks(container) {
    const avatarContainers = container
      ? container.querySelectorAll('.performer-avatar, .employee-avatar, .aa-avatar')
      : document.querySelectorAll('.performer-avatar, .employee-avatar, .aa-avatar');

    avatarContainers.forEach(avatar => {
      const img = avatar.querySelector('img');
      const fallback = avatar.querySelector('.avatar-fallback');
      if (img && fallback) {
        img.addEventListener('error', () => {
          img.style.display = 'none';
          fallback.style.display = 'flex';
        });
        img.addEventListener('load', () => {
          img.style.display = 'block';
          fallback.style.display = 'none';
        });
      }
    });
  }

  // DOM Elements cache
  const el = {};

  /**
   * Initialize dashboard
   */
  async function init() {
    console.log('[Dashboard] Initializing...');

    cacheElements();
    attachEventListeners();
    listenForDataUpdates();
    updateHeaderDate();
    await loadInitialData();

    console.log('[Dashboard] Initialized');
  }

  /**
   * Cache DOM elements
   */
  function cacheElements() {
    // Sidebar
    el.navItems = document.querySelectorAll('.nav-item');
    el.warehouseId = document.getElementById('warehouseId');

    // Header
    el.navToggle = document.getElementById('navToggle');
    el.pageTitle = document.getElementById('pageTitle');
    el.globalSearch = document.getElementById('globalSearch');
    el.headerDate = document.getElementById('headerDate');

    // Views
    el.views = document.querySelectorAll('.view');

    // Overview
    el.totalAAs = document.getElementById('totalAAs');
    el.aboveGoal = document.getElementById('aboveGoal');
    el.belowGoal = document.getElementById('belowGoal');
    el.avgJPH = document.getElementById('avgJPH');
    el.overviewPeriod = document.getElementById('overviewPeriod');
    el.pathGrid = document.getElementById('pathGrid');
    el.topPerformers = document.getElementById('topPerformers');
    el.needsAttention = document.getElementById('needsAttention');
    el.attentionCount = document.getElementById('attentionCount');

    // Lookup
    el.lookupInput = document.getElementById('lookupInput');
    el.lookupBtn = document.getElementById('lookupBtn');
    el.lookupPeriod = document.getElementById('lookupPeriod');
    el.lookupPath = document.getElementById('lookupPath');
    el.aaDetailCard = document.getElementById('aaDetailCard');
    el.closeDetail = document.getElementById('closeDetail');
    el.aaAvatarImg = document.getElementById('aaAvatarImg');
    el.aaAvatarFallback = document.getElementById('aaAvatarFallback');
    el.aaName = document.getElementById('aaName');
    el.aaBadge = document.getElementById('aaBadge');
    el.aaJPH = document.getElementById('aaJPH');
    el.aaJobs = document.getElementById('aaJobs');
    el.aaHours = document.getElementById('aaHours');
    el.aaJPHBar = document.getElementById('aaJPHBar');
    el.aaJobsBar = document.getElementById('aaJobsBar');
    el.aaHoursBar = document.getElementById('aaHoursBar');
    el.aaPathsList = document.getElementById('aaPathsList');
    el.vsComparison = document.getElementById('vsComparison');

    // Data Hub
    el.periodTabs = document.querySelectorAll('.period-tab');
    el.exportBtn = document.getElementById('exportBtn');
    el.dataCount = document.getElementById('dataCount');
    el.dataSearch = document.getElementById('dataSearch');
    el.pathFilter = document.getElementById('pathFilter');
    el.dataTableBody = document.getElementById('dataTableBody');

    // Toast
    el.toastContainer = document.getElementById('toastContainer');
  }

  /**
   * Attach event listeners
   */
  function attachEventListeners() {
    // Sidebar navigation
    el.navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        switchView(item.dataset.view);
      });
    });

    // Mobile nav toggle
    el.navToggle?.addEventListener('click', () => {
      document.querySelector('.sidebar').classList.toggle('open');
    });

    // Global search
    el.globalSearch?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const query = el.globalSearch.value.trim();
        if (query) {
          switchView('lookup');
          el.lookupInput.value = query;
          handleLookup();
        }
      }
    });

    // Overview period
    el.overviewPeriod?.addEventListener('change', (e) => {
      state.overviewPeriod = e.target.value;
      renderOverview();
    });

    // Lookup
    el.lookupBtn?.addEventListener('click', handleLookup);
    el.lookupInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleLookup();
    });
    el.lookupPeriod?.addEventListener('change', (e) => {
      state.lookupPeriod = e.target.value;
    });
    el.lookupPath?.addEventListener('change', (e) => {
      state.lookupPath = e.target.value;
    });
    el.closeDetail?.addEventListener('click', () => {
      el.aaDetailCard.style.display = 'none';
      state.selectedAA = null;
    });

    // Data Hub period tabs
    el.periodTabs?.forEach(tab => {
      tab.addEventListener('click', () => {
        el.periodTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.dataPeriod = tab.dataset.period;
        renderDataTable();
      });
    });

    // Data Hub filters
    el.dataSearch?.addEventListener('input', (e) => {
      state.dataSearch = e.target.value.toLowerCase();
      renderDataTable();
    });

    el.pathFilter?.addEventListener('change', (e) => {
      state.dataPathFilter = e.target.value;
      renderDataTable();
    });

    // Export
    el.exportBtn?.addEventListener('click', handleExport);
  }

  /**
   * Switch view
   */
  function switchView(viewId) {
    state.currentView = viewId;

    // Update nav
    el.navItems.forEach(item => {
      item.classList.toggle('active', item.dataset.view === viewId);
    });

    // Update views
    el.views.forEach(view => {
      view.classList.toggle('active', view.id === `view-${viewId}`);
    });

    // Update page title
    const titles = { overview: 'Overview', lookup: 'AA Lookup', data: 'Data Hub' };
    el.pageTitle.textContent = titles[viewId] || 'Dashboard';

    // Render view-specific content
    if (viewId === 'overview') renderOverview();
    if (viewId === 'data') renderDataTable();

    // Close mobile sidebar
    document.querySelector('.sidebar')?.classList.remove('open');
  }

  /**
   * Update header date
   */
  function updateHeaderDate() {
    const now = new Date();
    const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
    el.headerDate.textContent = now.toLocaleDateString('en-US', options);
  }

  /**
   * Load initial data
   */
  async function loadInitialData() {
    try {
      const storage = await browser.storage.local.get('dashboardData');
      const passedData = storage.dashboardData;

      if (passedData) {
        state.warehouseId = passedData.warehouseId || 'UNKNOWN';
        el.warehouseId.textContent = state.warehouseId;
        await browser.storage.local.remove('dashboardData');

        if (passedData.performanceData?.length > 0) {
          state.allCachedData = passedData.performanceData;
          renderOverview();
          showToast(`Loaded ${state.allCachedData.length} records`, 'success');
          return;
        }
      }

      await loadFromFCLM();
    } catch (error) {
      console.error('[Dashboard] Error loading data:', error);
      showToast('Error loading data', 'error');
    }
  }

  /**
   * Load data from FCLM tab
   */
  async function loadFromFCLM() {
    try {
      const tabs = await browser.tabs.query({ url: '*://fclm-portal.amazon.com/*' });

      if (tabs.length === 0) {
        showToast('FCLM portal not open', 'warning');
        return;
      }

      const fclmTab = tabs[0];
      state.fclmTabId = fclmTab.id;

      const statusResponse = await browser.tabs.sendMessage(fclmTab.id, { action: 'getCacheStatus' });

      if (!statusResponse?.initialized) {
        showToast('Cache initializing...', 'info');
        setTimeout(() => loadFromFCLM(), 3000);
        return;
      }

      const response = await browser.tabs.sendMessage(fclmTab.id, { action: 'getAllCachedData' });

      if (response?.success && response.totalRecords > 0) {
        state.warehouseId = response.warehouseId || state.warehouseId;
        state.allCachedData = response.performanceData || [];
        el.warehouseId.textContent = state.warehouseId;
        renderOverview();
        updateLastRefreshTime();
        showToast(`Loaded ${response.totalRecords} records`, 'success');
      } else {
        showToast('No cached data available', 'warning');
      }
    } catch (error) {
      console.error('[Dashboard] Error loading from FCLM:', error);
      showToast('Error connecting to FCLM', 'error');
    }
  }

  // Auto-refresh interval (5 minutes)
  const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

  /**
   * Start auto-refresh: polls FCLM tab for fresh data every 5 minutes.
   * Also listens for push notifications from the content script for immediate updates.
   */
  function listenForDataUpdates() {
    // Primary: poll on a fixed interval
    state.refreshInterval = setInterval(() => {
      console.log('[Dashboard] Auto-refresh triggered');
      refreshData();
    }, REFRESH_INTERVAL_MS);
    console.log(`[Dashboard] Auto-refresh started (every ${REFRESH_INTERVAL_MS / 1000}s)`);

    // Secondary: listen for push notifications from content script for immediate refresh
    try {
      browser.runtime.onMessage.addListener((message) => {
        if (message.action === 'dataUpdated') {
          console.log(`[Dashboard] Push notification: ${message.recordCount} records at ${message.updatedAt}`);
          refreshData();
        }
      });
    } catch (e) {
      console.log('[Dashboard] Could not register message listener:', e);
    }
  }

  /**
   * Refresh data from FCLM tab and re-render current view
   */
  async function refreshData() {
    if (state.refreshing) return; // Prevent concurrent refreshes
    state.refreshing = true;

    try {
      // Always re-discover the FCLM tab to handle tab closes/reopens
      const tabs = await browser.tabs.query({ url: '*://fclm-portal.amazon.com/*' });
      if (tabs.length === 0) {
        console.log('[Dashboard] No FCLM tab found for refresh');
        return;
      }
      state.fclmTabId = tabs[0].id;

      const response = await browser.tabs.sendMessage(state.fclmTabId, { action: 'getAllCachedData' });

      if (response?.success && response.totalRecords > 0) {
        const oldCount = state.allCachedData.length;
        state.allCachedData = response.performanceData || [];
        state.warehouseId = response.warehouseId || state.warehouseId;
        el.warehouseId.textContent = state.warehouseId;

        // Re-render current view
        if (state.currentView === 'overview') renderOverview();
        if (state.currentView === 'data') renderDataTable();

        updateLastRefreshTime();

        if (oldCount > 0 && state.allCachedData.length !== oldCount) {
          showToast(`Data refreshed (${response.totalRecords} records)`, 'success');
        }
        console.log(`[Dashboard] Refreshed: ${response.totalRecords} records`);
      }
    } catch (err) {
      console.log('[Dashboard] Error refreshing data:', err.message);
      state.fclmTabId = null;
    } finally {
      state.refreshing = false;
    }
  }

  /**
   * Update the header date to show last refresh time
   */
  function updateLastRefreshTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    el.headerDate.textContent = `Updated ${timeStr}`;
  }

  /**
   * Filter data by period
   */
  function filterByPeriod(data, period) {
    if (!data || data.length === 0) return [];

    const now = new Date();
    // Reset to start of day to avoid time comparison issues
    now.setHours(0, 0, 0, 0);

    const formatDate = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    let startDate, endDate;
    const todayStr = formatDate(now);

    switch (period) {
      case 'today':
        startDate = endDate = todayStr;
        break;

      case 'week': {
        // This week: Sunday to today
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        startDate = formatDate(weekStart);
        endDate = todayStr;
        break;
      }

      case 'lastWeek': {
        // Last week: Previous Sunday to Saturday
        const thisWeekSunday = new Date(now);
        thisWeekSunday.setDate(now.getDate() - now.getDay());

        const lastWeekSaturday = new Date(thisWeekSunday);
        lastWeekSaturday.setDate(thisWeekSunday.getDate() - 1);

        const lastWeekSunday = new Date(lastWeekSaturday);
        lastWeekSunday.setDate(lastWeekSaturday.getDate() - 6);

        startDate = formatDate(lastWeekSunday);
        endDate = formatDate(lastWeekSaturday);
        break;
      }

      case 'month': {
        // This Month: 1st of current month to today (calendar month)
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        startDate = formatDate(monthStart);
        endDate = todayStr;
        break;
      }

      case 'last30': {
        // Last 30 days (rolling, not calendar month)
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(now.getDate() - 29); // 30 days including today
        startDate = formatDate(thirtyDaysAgo);
        endDate = todayStr;
        break;
      }

      default:
        console.log('[Dashboard] Unknown period, returning all data:', period);
        return data;
    }

    console.log(`[Dashboard] Filtering period '${period}': ${startDate} to ${endDate}`);

    const filtered = data.filter(r => {
      if (!r.date) return false;
      // Ensure date is string in YYYY-MM-DD format
      const recordDate = String(r.date).substring(0, 10);
      return recordDate >= startDate && recordDate <= endDate;
    });

    console.log(`[Dashboard] Filtered: ${filtered.length} of ${data.length} records`);

    // Debug: show sample dates if no results
    if (filtered.length === 0 && data.length > 0) {
      const sampleDates = [...new Set(data.slice(0, 20).map(r => r.date))];
      console.log('[Dashboard] Sample dates in data:', sampleDates);
    }

    return filtered;
  }

  /**
   * Render overview
   */
  function renderOverview() {
    const data = filterByPeriod(state.allCachedData, state.overviewPeriod);

    // Aggregate by employee
    const employeeMap = new Map();
    data.forEach(r => {
      const id = r.employeeId;
      if (!employeeMap.has(id)) {
        employeeMap.set(id, { id, name: r.employeeName, login: r.login || r.employeeId, hours: 0, jobs: 0, paths: new Set() });
      }
      const emp = employeeMap.get(id);
      emp.hours += r.hours || 0;
      emp.jobs += r.jobs || 0;
      emp.paths.add(r.pathId);
    });

    const employees = Array.from(employeeMap.values()).map(e => ({
      ...e,
      jph: e.hours > 0 ? e.jobs / e.hours : 0
    }));

    // Summary stats
    const totalAAs = employees.length;
    const avgJPH = employees.length > 0
      ? (employees.reduce((sum, e) => sum + e.jph, 0) / employees.length).toFixed(1)
      : 0;

    // Calculate above/below goal (using average goal of 35)
    const avgGoal = 35;
    const aboveGoal = employees.filter(e => e.jph >= avgGoal).length;
    const belowGoal = employees.filter(e => e.jph < avgGoal && e.jph > 0).length;

    el.totalAAs.textContent = totalAAs;
    el.aboveGoal.textContent = aboveGoal;
    el.belowGoal.textContent = belowGoal;
    el.avgJPH.textContent = avgJPH;

    // Path cards
    renderPathCards(data);

    // Top performers (top 5 by JPH)
    const topPerformers = employees
      .filter(e => e.jph > 0)
      .sort((a, b) => b.jph - a.jph)
      .slice(0, 5);

    el.topPerformers.innerHTML = topPerformers.length > 0
      ? topPerformers.map((e, i) => renderPerformerItem(e, i + 1, false)).join('')
      : '<div class="empty-state">No data available</div>';

    // Needs attention (bottom 5 with hours > 0)
    const needsAttention = employees
      .filter(e => e.hours >= 1 && e.jph < avgGoal)
      .sort((a, b) => a.jph - b.jph)
      .slice(0, 5);

    el.attentionCount.textContent = needsAttention.length;
    el.needsAttention.innerHTML = needsAttention.length > 0
      ? needsAttention.map((e, i) => renderPerformerItem(e, i + 1, true)).join('')
      : '<div class="empty-state">Everyone is performing well!</div>';

    // Setup avatar fallbacks after render
    setupAvatarFallbacks(el.topPerformers);
    setupAvatarFallbacks(el.needsAttention);
  }

  /**
   * Render path cards
   */
  function renderPathCards(data) {
    const pathStats = {};

    Object.keys(PATH_CONFIG).forEach(pathId => {
      pathStats[pathId] = { id: pathId, employees: new Set(), hours: 0, jobs: 0 };
    });

    data.forEach(r => {
      const pathId = (r.pathId || '').toLowerCase();
      if (pathStats[pathId]) {
        pathStats[pathId].employees.add(r.employeeId);
        pathStats[pathId].hours += r.hours || 0;
        pathStats[pathId].jobs += r.jobs || 0;
      }
    });

    el.pathGrid.innerHTML = Object.entries(PATH_CONFIG).map(([pathId, config]) => {
      const stats = pathStats[pathId];
      const avgJPH = stats.hours > 0 ? (stats.jobs / stats.hours).toFixed(1) : 0;

      return `
        <div class="path-card ${pathId}">
          <div class="path-card-header">
            <span class="path-card-name">${config.name}</span>
            <span class="path-card-count">${stats.employees.size} AAs</span>
          </div>
          <div class="path-card-stats">
            <div class="path-stat">
              <div class="path-stat-value">${avgJPH}</div>
              <div class="path-stat-label">Avg JPH</div>
            </div>
            <div class="path-stat">
              <div class="path-stat-value">${stats.hours.toFixed(0)}</div>
              <div class="path-stat-label">Hours</div>
            </div>
            <div class="path-stat">
              <div class="path-stat-value">${stats.jobs.toLocaleString()}</div>
              <div class="path-stat-label">Jobs</div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Render performer item
   */
  function renderPerformerItem(employee, rank, isWarning) {
    const pathNames = Array.from(employee.paths).map(p => PATH_CONFIG[p]?.name || p).join(', ');
    const login = employee.login || employee.id;
    const photoUrl = getBadgePhotoUrl(login);

    return `
      <div class="performer-item">
        <div class="performer-rank ${isWarning ? 'warning' : ''}">${rank}</div>
        <div class="performer-avatar">
          <img src="${photoUrl}" alt="${employee.name || login}">
          <div class="avatar-fallback">${DEFAULT_AVATAR_SVG}</div>
        </div>
        <div class="performer-info">
          <div class="performer-name">${employee.name || employee.id}</div>
          <div class="performer-path">${pathNames || 'Unknown'}</div>
        </div>
        <div class="performer-stat">
          <div class="performer-stat-value ${isWarning ? 'warning' : ''}">${employee.jph.toFixed(1)}</div>
          <div class="performer-stat-label">JPH</div>
        </div>
      </div>
    `;
  }

  /**
   * Handle lookup
   */
  async function handleLookup() {
    const input = el.lookupInput.value.trim();

    if (!input) {
      showToast('Enter badge ID or login', 'warning');
      return;
    }

    if (state.allCachedData.length === 0) {
      showToast('No data loaded', 'warning');
      return;
    }

    const searchTerm = input.toLowerCase();

    // Find matches
    let matches = state.allCachedData.filter(r => {
      const id = String(r.employeeId || '').toLowerCase();
      const name = String(r.employeeName || '').toLowerCase();
      const login = String(r.login || '').toLowerCase();
      return id.includes(searchTerm) || name.includes(searchTerm) || login.includes(searchTerm);
    });

    if (matches.length === 0) {
      showToast(`No AA found: "${input}"`, 'error');
      return;
    }

    // Filter by period and path
    matches = filterByPeriod(matches, state.lookupPeriod);

    if (state.lookupPath !== 'all') {
      matches = matches.filter(r => (r.pathId || '').toLowerCase().includes(state.lookupPath));
    }

    if (matches.length === 0) {
      showToast('No data for selected filters', 'warning');
      return;
    }

    displayAADetail(matches);
  }

  /**
   * Display AA detail card
   */
  async function displayAADetail(records) {
    const first = records[0];
    const employeeId = first.employeeId;
    const employeeName = first.employeeName || employeeId;

    // Calculate totals
    const totalHours = records.reduce((sum, r) => sum + (r.hours || 0), 0);
    const totalJobs = records.reduce((sum, r) => sum + (r.jobs || 0), 0);
    const avgJPH = totalHours > 0 ? totalJobs / totalHours : 0;

    // Setup avatar with fallback initially
    el.aaAvatarImg.src = '';
    el.aaAvatarImg.alt = employeeName;
    el.aaAvatarImg.style.display = 'none';
    el.aaAvatarFallback.style.display = 'flex';

    // Remove old listeners by cloning
    const newImg = el.aaAvatarImg.cloneNode(true);
    el.aaAvatarImg.parentNode.replaceChild(newImg, el.aaAvatarImg);
    el.aaAvatarImg = newImg;

    el.aaAvatarImg.addEventListener('load', () => {
      el.aaAvatarImg.style.display = 'block';
      el.aaAvatarFallback.style.display = 'none';
    });
    el.aaAvatarImg.addEventListener('error', () => {
      el.aaAvatarImg.style.display = 'none';
      el.aaAvatarFallback.style.display = 'flex';
    });

    // Try to get login from FCLM for badge photo
    let login = first.login;
    if (!login && state.fclmTabId) {
      try {
        showToast('Loading employee info...', 'info');
        const response = await browser.tabs.sendMessage(state.fclmTabId, {
          action: 'fetchEmployeeInfo',
          employeeId: employeeId
        });
        if (response?.success && response.login) {
          login = response.login;
          console.log(`[Dashboard] Got login for ${employeeId}: ${login}`);
        }
      } catch (err) {
        console.log('[Dashboard] Could not fetch employee info:', err.message);
      }
    }

    // Set photo URL (use login if available, otherwise fall back to employeeId)
    const photoUrl = getBadgePhotoUrl(login || employeeId);
    el.aaAvatarImg.src = photoUrl;

    el.aaName.textContent = employeeName;
    el.aaBadge.textContent = `Badge: ${employeeId}`;
    el.aaJPH.textContent = avgJPH.toFixed(1);
    el.aaJobs.textContent = totalJobs.toLocaleString();
    el.aaHours.textContent = totalHours.toFixed(1);

    // Stat bars (normalize to max of 100 JPH, 10000 jobs, 160 hours)
    el.aaJPHBar.style.width = `${Math.min(avgJPH / 60 * 100, 100)}%`;
    el.aaJobsBar.style.width = `${Math.min(totalJobs / 5000 * 100, 100)}%`;
    el.aaHoursBar.style.width = `${Math.min(totalHours / 160 * 100, 100)}%`;

    // Group by path
    const pathGroups = {};
    records.forEach(r => {
      const pathId = r.pathId || 'other';
      if (!pathGroups[pathId]) {
        pathGroups[pathId] = { name: r.pathName || pathId, hours: 0, jobs: 0 };
      }
      pathGroups[pathId].hours += r.hours || 0;
      pathGroups[pathId].jobs += r.jobs || 0;
    });

    // Render path breakdown
    el.aaPathsList.innerHTML = Object.entries(pathGroups).map(([id, p]) => {
      const jph = p.hours > 0 ? (p.jobs / p.hours).toFixed(1) : 0;
      return `
        <div class="aa-path-item ${id}">
          <span class="aa-path-name">${p.name}</span>
          <span class="aa-path-stats">
            <strong>${jph}</strong> JPH | ${p.hours.toFixed(1)}h | ${p.jobs.toLocaleString()} jobs
          </span>
        </div>
      `;
    }).join('');

    // Calculate comparison with average
    const allData = filterByPeriod(state.allCachedData, state.lookupPeriod);
    const employeeMap = new Map();
    allData.forEach(r => {
      if (!employeeMap.has(r.employeeId)) {
        employeeMap.set(r.employeeId, { hours: 0, jobs: 0 });
      }
      const emp = employeeMap.get(r.employeeId);
      emp.hours += r.hours || 0;
      emp.jobs += r.jobs || 0;
    });

    // Calculate averages for radar chart
    let totalAvgHours = 0, totalAvgJobs = 0, totalAvgJPH = 0;
    let count = 0;
    employeeMap.forEach(emp => {
      if (emp.hours > 0) {
        totalAvgHours += emp.hours;
        totalAvgJobs += emp.jobs;
        totalAvgJPH += emp.jobs / emp.hours;
        count++;
      }
    });

    const avgHoursAll = count > 0 ? totalAvgHours / count : 0;
    const avgJobsAll = count > 0 ? totalAvgJobs / count : 0;
    const overallAvg = count > 0 ? totalAvgJPH / count : 0;

    // Render radar chart
    const radarData = {
      aa: {
        jph: avgJPH,
        hours: totalHours,
        jobs: totalJobs,
        efficiency: overallAvg > 0 ? (avgJPH / overallAvg) * 100 : 100,
        consistency: 85, // Placeholder - would need daily data
        volume: avgJobsAll > 0 ? (totalJobs / avgJobsAll) * 100 : 100
      },
      avg: {
        jph: overallAvg,
        hours: avgHoursAll,
        jobs: avgJobsAll,
        efficiency: 100,
        consistency: 75,
        volume: 100
      }
    };

    renderRadarChart(radarData, employeeName);

    // Update legend name
    const legendName = document.getElementById('radarLegendName');
    if (legendName) legendName.textContent = employeeName.split(' ')[0] || 'This AA';

    const diff = avgJPH - overallAvg;
    const diffClass = diff >= 0 ? 'positive' : 'negative';
    const diffSign = diff >= 0 ? '+' : '';

    el.vsComparison.innerHTML = `
      <div class="vs-item">
        <div class="vs-value">${avgJPH.toFixed(1)}</div>
        <div class="vs-label">Your JPH</div>
      </div>
      <div class="vs-divider"></div>
      <div class="vs-item">
        <div class="vs-value">${overallAvg.toFixed(1)}</div>
        <div class="vs-label">Avg JPH</div>
      </div>
      <div class="vs-divider"></div>
      <div class="vs-item">
        <div class="vs-result ${diffClass}">${diffSign}${diff.toFixed(1)}</div>
        <div class="vs-label">${diff >= 0 ? 'Above' : 'Below'} Avg</div>
      </div>
    `;

    el.aaDetailCard.style.display = 'block';
    state.selectedAA = { id: employeeId, name: employeeName, records };
    showToast(`Found ${records.length} records`, 'success');
  }

  /**
   * Render radar/polygon chart
   */
  function renderRadarChart(data, name) {
    const svg = document.getElementById('radarChart');
    if (!svg) return;

    const cx = 150, cy = 150; // Center
    const maxRadius = 100;
    const levels = 5;

    // Metrics to display
    const metrics = [
      { key: 'jph', label: 'JPH', max: 60 },
      { key: 'efficiency', label: 'Efficiency', max: 150 },
      { key: 'volume', label: 'Volume', max: 150 },
      { key: 'hours', label: 'Hours', max: 160 },
      { key: 'jobs', label: 'Jobs', max: 5000 },
      { key: 'consistency', label: 'Consistency', max: 100 }
    ];

    const angleStep = (2 * Math.PI) / metrics.length;

    // Helper to get point on radar
    const getPoint = (value, max, index) => {
      const normalized = Math.min(value / max, 1);
      const angle = index * angleStep - Math.PI / 2;
      return {
        x: cx + maxRadius * normalized * Math.cos(angle),
        y: cy + maxRadius * normalized * Math.sin(angle)
      };
    };

    // Build SVG content
    let svgContent = '';

    // Grid circles
    for (let i = 1; i <= levels; i++) {
      const r = (maxRadius / levels) * i;
      svgContent += `<circle cx="${cx}" cy="${cy}" r="${r}" class="radar-grid-line" />`;
    }

    // Axis lines and labels
    metrics.forEach((m, i) => {
      const angle = i * angleStep - Math.PI / 2;
      const x2 = cx + maxRadius * Math.cos(angle);
      const y2 = cy + maxRadius * Math.sin(angle);
      const labelX = cx + (maxRadius + 20) * Math.cos(angle);
      const labelY = cy + (maxRadius + 20) * Math.sin(angle);

      svgContent += `<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" class="radar-axis" />`;
      svgContent += `<text x="${labelX}" y="${labelY}" class="radar-label" dy="0.35em">${m.label}</text>`;
    });

    // Average polygon (background)
    const avgPoints = metrics.map((m, i) => {
      const p = getPoint(data.avg[m.key] || 0, m.max, i);
      return `${p.x},${p.y}`;
    }).join(' ');
    svgContent += `<polygon points="${avgPoints}" class="radar-polygon radar-polygon-avg" />`;

    // AA polygon (foreground)
    const aaPoints = metrics.map((m, i) => {
      const p = getPoint(data.aa[m.key] || 0, m.max, i);
      return `${p.x},${p.y}`;
    }).join(' ');
    svgContent += `<polygon points="${aaPoints}" class="radar-polygon radar-polygon-aa" />`;

    // Value dots and labels for AA
    metrics.forEach((m, i) => {
      const p = getPoint(data.aa[m.key] || 0, m.max, i);
      const val = data.aa[m.key] || 0;
      const displayVal = m.key === 'jobs' ? Math.round(val).toLocaleString() :
                         m.key === 'hours' ? val.toFixed(1) :
                         m.key === 'jph' ? val.toFixed(1) :
                         Math.round(val);

      svgContent += `<circle cx="${p.x}" cy="${p.y}" r="4" fill="var(--accent)" />`;

      // Position value label
      const angle = i * angleStep - Math.PI / 2;
      const valX = p.x + 15 * Math.cos(angle);
      const valY = p.y + 15 * Math.sin(angle);
      svgContent += `<text x="${valX}" y="${valY}" class="radar-value" dy="0.35em">${displayVal}</text>`;
    });

    svg.innerHTML = svgContent;
  }

  /**
   * Render data table
   */
  function renderDataTable() {
    let data = filterByPeriod(state.allCachedData, state.dataPeriod);

    // Filter by search
    if (state.dataSearch) {
      data = data.filter(r => {
        const id = String(r.employeeId || '').toLowerCase();
        const name = String(r.employeeName || '').toLowerCase();
        return id.includes(state.dataSearch) || name.includes(state.dataSearch);
      });
    }

    // Filter by path
    if (state.dataPathFilter !== 'all') {
      data = data.filter(r => (r.pathId || '').toLowerCase().includes(state.dataPathFilter));
    }

    // Sort by JPH descending
    data.sort((a, b) => (b.jph || 0) - (a.jph || 0));

    el.dataCount.textContent = `${data.length} records`;

    if (data.length === 0) {
      el.dataTableBody.innerHTML = `
        <tr>
          <td colspan="6" class="empty-state">No data for selected filters</td>
        </tr>
      `;
      return;
    }

    el.dataTableBody.innerHTML = data.map(r => {
      const pathId = (r.pathId || '').toLowerCase();
      const pathClass = PATH_CONFIG[pathId] ? pathId : '';
      const jph = r.jph || (r.hours > 0 ? (r.jobs / r.hours).toFixed(1) : 0);
      const goal = PATH_CONFIG[pathId]?.goal || 35;
      const status = jph >= goal ? 'good' : jph >= goal * 0.85 ? 'warning' : 'poor';
      const login = r.login || r.employeeId;
      const photoUrl = getBadgePhotoUrl(login);

      return `
        <tr>
          <td>
            <div class="employee-cell">
              <div class="employee-avatar">
                <img src="${photoUrl}" alt="${r.employeeName || login}">
                <div class="avatar-fallback">${DEFAULT_AVATAR_SVG}</div>
              </div>
              <div>
                <div class="employee-name">${r.employeeName || r.employeeId}</div>
                <div class="employee-id">${r.employeeId}</div>
              </div>
            </div>
          </td>
          <td><span class="path-badge ${pathClass}">${r.pathName || r.pathId || '-'}</span></td>
          <td>${(r.hours || 0).toFixed(1)}</td>
          <td>${(r.jobs || 0).toLocaleString()}</td>
          <td><span class="jph-value">${jph}</span></td>
          <td><span class="status-badge ${status}">${status === 'good' ? 'On Track' : status === 'warning' ? 'Near' : 'Below'}</span></td>
        </tr>
      `;
    }).join('');

    // Setup avatar fallbacks after render
    setupAvatarFallbacks(el.dataTableBody);
  }

  /**
   * Handle export
   */
  function handleExport() {
    let data = filterByPeriod(state.allCachedData, state.dataPeriod);

    if (data.length === 0) {
      showToast('No data to export', 'warning');
      return;
    }

    const headers = ['Employee ID', 'Employee Name', 'Path', 'Date', 'Hours', 'Jobs', 'JPH'];
    const rows = data.map(r => [
      r.employeeId,
      r.employeeName || '',
      r.pathName || r.pathId || '',
      r.date || '',
      r.hours || 0,
      r.jobs || 0,
      r.jph || 0
    ]);

    const csv = [headers, ...rows].map(row => row.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `performance_${state.warehouseId}_${state.dataPeriod}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();

    URL.revokeObjectURL(url);
    showToast('CSV exported', 'success');
  }

  /**
   * Show toast notification
   */
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    el.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
