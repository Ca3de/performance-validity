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
    // Global filters (affect all views)
    globalPeriod: 'today',
    globalShift: 'all',       // 'all' | 'day' | 'night'
    customDateFrom: null,     // YYYY-MM-DD string for custom range
    customDateTo: null,       // YYYY-MM-DD string for custom range
    // Lookup state
    lookupPath: 'all',
    selectedAA: null,
    // Data hub state
    dataSearch: '',
    dataPathFilter: 'all',
    fclmTabId: null,
    // Refresh state
    refreshInterval: null,
    countdownInterval: null,
    refreshing: false,
    secondsUntilRefresh: 300
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
    el.refreshTimer = document.getElementById('refreshTimer');
    el.countdownText = document.getElementById('countdownText');

    // Views
    el.views = document.querySelectorAll('.view');

    // Global filters
    el.shiftBtns = document.querySelectorAll('.shift-btn');
    el.periodBtns = document.querySelectorAll('.period-btn');
    el.customDateRange = document.getElementById('customDateRange');
    el.dateFrom = document.getElementById('dateFrom');
    el.dateTo = document.getElementById('dateTo');
    el.applyDateRange = document.getElementById('applyDateRange');

    // Overview
    el.totalAAs = document.getElementById('totalAAs');
    el.aboveGoal = document.getElementById('aboveGoal');
    el.belowGoal = document.getElementById('belowGoal');
    el.avgJPH = document.getElementById('avgJPH');
    el.pathGrid = document.getElementById('pathGrid');
    el.pathLeaders = document.getElementById('pathLeaders');
    el.needsAttention = document.getElementById('needsAttention');
    el.attentionCount = document.getElementById('attentionCount');

    // Lookup
    el.lookupInput = document.getElementById('lookupInput');
    el.lookupBtn = document.getElementById('lookupBtn');
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
    el.vsComparison = document.getElementById('vsComparison');

    // Data Hub
    el.exportBtn = document.getElementById('exportBtn');
    el.dataCount = document.getElementById('dataCount');
    el.dataSearch = document.getElementById('dataSearch');
    el.pathFilter = document.getElementById('pathFilter');
    el.dataTableBody = document.getElementById('dataTableBody');

    // Backup & Restore
    el.backupBtn = document.getElementById('backupBtn');
    el.restoreInput = document.getElementById('restoreInput');
    el.backupStatus = document.getElementById('backupStatus');

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

    // Global shift filter
    el.shiftBtns?.forEach(btn => {
      btn.addEventListener('click', () => {
        el.shiftBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.globalShift = btn.dataset.shift;
        renderCurrentView();
      });
    });

    // Global period filter
    el.periodBtns?.forEach(btn => {
      btn.addEventListener('click', () => {
        el.periodBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const period = btn.dataset.period;
        if (period === 'custom') {
          el.customDateRange.style.display = 'flex';
          // Set default dates if empty
          if (!el.dateFrom.value) {
            const d = new Date();
            d.setDate(d.getDate() - 7);
            el.dateFrom.value = formatDateStr(d);
          }
          if (!el.dateTo.value) {
            el.dateTo.value = formatDateStr(new Date());
          }
        } else {
          el.customDateRange.style.display = 'none';
          state.globalPeriod = period;
          state.customDateFrom = null;
          state.customDateTo = null;
          renderCurrentView();
        }
      });
    });

    // Custom date range apply
    el.applyDateRange?.addEventListener('click', () => {
      if (el.dateFrom.value && el.dateTo.value) {
        state.globalPeriod = 'custom';
        state.customDateFrom = el.dateFrom.value;
        state.customDateTo = el.dateTo.value;
        renderCurrentView();
      }
    });

    // Lookup
    el.lookupBtn?.addEventListener('click', handleLookup);
    el.lookupInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleLookup();
    });
    el.lookupPath?.addEventListener('change', (e) => {
      state.lookupPath = e.target.value;
    });
    el.closeDetail?.addEventListener('click', () => {
      el.aaDetailCard.style.display = 'none';
      state.selectedAA = null;
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

    // Backup & Restore
    el.backupBtn?.addEventListener('click', handleBackup);
    el.restoreInput?.addEventListener('change', handleRestore);
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
   * Load initial data.
   * First reads directly from browser.storage.local (works even without FCLM tab).
   * Then tries to discover the FCLM tab for live refresh of today's data.
   */
  async function loadInitialData() {
    try {
      // Check for one-shot data passed from the popup
      const storage = await browser.storage.local.get('dashboardData');
      const passedData = storage.dashboardData;
      if (passedData) {
        state.warehouseId = passedData.warehouseId || 'UNKNOWN';
        el.warehouseId.textContent = state.warehouseId;
        state._suppressStorageListener = true;
        await browser.storage.local.remove('dashboardData');
        state._suppressStorageListener = false;
      }

      // Load all cached data directly from storage (no FCLM tab needed)
      const recordCount = await loadFromStorage();

      // Discover FCLM tab for live refresh
      const tabs = await browser.tabs.query({ url: '*://fclm-portal.amazon.com/*' });
      if (tabs.length > 0) {
        state.fclmTabId = tabs[0].id;
        // If we already have historical data from storage, just refresh today
        if (recordCount > 0) {
          console.log('[Dashboard] Storage had data, will use FCLM tab for live refresh only');
        } else {
          // No data in storage at all — try loading through FCLM content script
          await loadFromFCLM();
        }
      } else if (recordCount === 0) {
        showToast('Open FCLM portal to start collecting data', 'warning');
      }
    } catch (error) {
      console.error('[Dashboard] Error loading data:', error);
      showToast('Error loading data', 'error');
    }
  }

  /**
   * Load all cached records directly from browser.storage.local.
   * The dashboard extension page has full access to the same storage
   * that the content script writes to — no FCLM tab needed for reads.
   *
   * Deduplication: if shift-specific entries (_day / _night) exist for
   * a date, the corresponding _all entry is skipped to avoid counting
   * the same employees twice.
   *
   * Returns the number of records loaded.
   */
  async function loadFromStorage() {
    try {
      const all = await browser.storage.local.get(null);
      let warehouseId = state.warehouseId;

      // First pass: identify which dates have shift-specific entries
      const dateShifts = {};  // date → Set of shifts found
      Object.entries(all).forEach(([key, data]) => {
        if (!key.startsWith('cache_') || !data || !data.records) return;
        const date = data.date;
        const shift = data.shift || 'all';
        if (!dateShifts[date]) dateShifts[date] = new Set();
        dateShifts[date].add(shift);
      });

      // Second pass: load records, skipping _all entries for dates that
      // already have shift-specific data (avoids duplicates)
      const allRecords = [];
      Object.entries(all).forEach(([key, data]) => {
        if (!key.startsWith('cache_') || !data || !data.records) return;

        const shift = data.shift || 'all';
        const date = data.date;

        // Skip the _all entry if shift-specific entries exist for this date
        if (shift === 'all' && dateShifts[date]) {
          const shifts = dateShifts[date];
          if (shifts.has('day') || shifts.has('night')) {
            return; // prefer shift-specific data
          }
        }

        if (warehouseId === 'UNKNOWN' && data.warehouseId) {
          warehouseId = data.warehouseId;
        }

        data.records.forEach(record => {
          allRecords.push({
            ...record,
            date: data.date,
            shift: shift
          });
        });
      });

      if (allRecords.length > 0) {
        state.allCachedData = allRecords;
        state.warehouseId = warehouseId;
        el.warehouseId.textContent = state.warehouseId;
        renderOverview();
        updateLastRefreshTime();
        showToast(`Loaded ${allRecords.length} records from storage`, 'success');
        console.log(`[Dashboard] Loaded ${allRecords.length} records directly from storage`);
      }

      return allRecords.length;
    } catch (error) {
      console.error('[Dashboard] Error reading from storage:', error);
      return 0;
    }
  }

  /**
   * Load data from FCLM tab (fallback when storage is empty)
   */
  async function loadFromFCLM() {
    try {
      if (!state.fclmTabId) {
        const tabs = await browser.tabs.query({ url: '*://fclm-portal.amazon.com/*' });
        if (tabs.length === 0) {
          showToast('FCLM portal not open', 'warning');
          return;
        }
        state.fclmTabId = tabs[0].id;
      }

      const statusResponse = await browser.tabs.sendMessage(state.fclmTabId, { action: 'getCacheStatus' });

      if (!statusResponse?.initialized) {
        showToast('Cache initializing...', 'info');
        setTimeout(() => loadFromFCLM(), 3000);
        return;
      }

      const response = await browser.tabs.sendMessage(state.fclmTabId, { action: 'getAllCachedData' });

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
  const REFRESH_INTERVAL_SECS = 5 * 60; // 5 minutes

  /**
   * Start auto-refresh with a visible countdown timer.
   * Also listens for push notifications from the content script.
   */
  function listenForDataUpdates() {
    // Reset countdown
    state.secondsUntilRefresh = REFRESH_INTERVAL_SECS;
    updateCountdownDisplay();

    // Tick every second to update the countdown
    if (state.countdownInterval) clearInterval(state.countdownInterval);
    state.countdownInterval = setInterval(() => {
      state.secondsUntilRefresh--;
      if (state.secondsUntilRefresh <= 0) {
        console.log('[Dashboard] Countdown reached 0, refreshing...');
        refreshData();
      }
      updateCountdownDisplay();
    }, 1000);

    // Click the timer to force an immediate refresh
    if (el.refreshTimer) {
      el.refreshTimer.addEventListener('click', () => {
        if (!state.refreshing) {
          console.log('[Dashboard] Manual refresh triggered');
          refreshData();
        }
      });
    }

    // Listen for storage changes from the content script.
    // This is the SOLE mechanism for reacting to new data written by the
    // content script.  It eliminates race conditions (we read only AFTER
    // the write completes) and avoids the feedback-loop that occurred when
    // push-notifications triggered refreshData() which re-queried FCLM
    // which re-wrote storage which re-fired onChanged, etc.
    try {
      browser.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;

        // Ignore changes that we triggered ourselves (e.g. import, dashboardData removal)
        if (state._suppressStorageListener) return;

        // Check if any cache_ keys changed (new performance data written)
        const cacheKeysChanged = Object.keys(changes).some(k => k.startsWith('cache_'));
        if (!cacheKeysChanged) return;

        console.log('[Dashboard] Storage changed — scheduling reload');
        // Debounce: the content script may write multiple keys in quick succession
        if (state._storageDebounce) clearTimeout(state._storageDebounce);
        state._storageDebounce = setTimeout(async () => {
          const count = await loadFromStorage();
          if (count > 0) {
            renderCurrentView();
            // Reset countdown since we just got fresh data
            state.secondsUntilRefresh = REFRESH_INTERVAL_SECS;
            updateCountdownDisplay();
          }
        }, 2000); // Wait 2s for all batch writes to settle
      });
    } catch (e) {
      console.log('[Dashboard] Could not register storage.onChanged listener:', e);
    }

    // Listen for push notifications from content script.
    // We just log it — the actual reload happens via storage.onChanged
    // once the content script finishes writing to storage.
    try {
      browser.runtime.onMessage.addListener((message) => {
        if (message.action === 'dataUpdated') {
          console.log(`[Dashboard] Push notification: ${message.recordCount} records at ${message.updatedAt} (storage.onChanged will handle reload)`);
        }
      });
    } catch (e) {
      console.log('[Dashboard] Could not register message listener:', e);
    }

    console.log(`[Dashboard] Auto-refresh started (every ${REFRESH_INTERVAL_SECS}s with countdown)`);
  }

  /**
   * Update the countdown display in the header
   */
  function updateCountdownDisplay() {
    if (!el.countdownText) return;
    const secs = Math.max(0, state.secondsUntilRefresh);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    el.countdownText.textContent = `${m}:${String(s).padStart(2, '0')}`;
  }

  /**
   * Refresh data and re-render current view.
   * Reads directly from browser.storage.local (the source of truth).
   * The content script writes to storage, and storage.onChanged handles
   * real-time updates.  This timer-based refresh is a safety net to catch
   * anything the listener might have missed.
   */
  async function refreshData() {
    if (state.refreshing) return;
    state.refreshing = true;
    if (el.refreshTimer) el.refreshTimer.classList.add('refreshing');

    try {
      const count = await loadFromStorage();
      if (count > 0) {
        renderCurrentView();
        updateLastRefreshTime();
        console.log(`[Dashboard] Timer refresh from storage: ${count} records`);
      } else {
        console.log('[Dashboard] No data available in storage');
      }
    } finally {
      state.refreshing = false;
      if (el.refreshTimer) el.refreshTimer.classList.remove('refreshing');
      state.secondsUntilRefresh = REFRESH_INTERVAL_SECS;
      updateCountdownDisplay();
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
   * Format a Date object as YYYY-MM-DD string
   */
  function formatDateStr(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Determine the current shift based on the hour.
   * Day: 06:00–17:59, Night: 18:00–05:59
   */
  function currentShiftName() {
    const h = new Date().getHours();
    return (h >= 6 && h < 18) ? 'day' : 'night';
  }

  /**
   * Filter data by shift.
   *
   * - 'all' filter: show everything.
   * - 'day'/'night' filter:
   *     1) Records explicitly tagged with the selected shift → included.
   *     2) Records tagged 'all' for TODAY → included if the selected shift
   *        matches the current shift, because FCLM portal data reflects the
   *        shift that is currently active.
   *     3) Records tagged 'all' for historical dates → excluded (we cannot
   *        determine their shift).
   *     4) Records tagged with the opposite shift → excluded.
   */
  function filterByShift(data, shift) {
    if (!shift || shift === 'all') return data;

    const todayStr = formatDateStr(new Date());
    const nowShift = currentShiftName();

    return data.filter(r => {
      const recShift = r.shift || 'all';

      // Exact match (properly tagged records)
      if (recShift === shift) return true;

      // Today's _all records: show under the current shift
      if (recShift === 'all'
          && shift === nowShift
          && String(r.date).substring(0, 10) === todayStr) {
        return true;
      }

      return false;
    });
  }

  /**
   * Apply both period and shift filters (convenience)
   */
  function filterData(data) {
    return filterByShift(filterByPeriod(data, state.globalPeriod), state.globalShift);
  }

  /**
   * Re-render whichever view is currently active
   */
  function renderCurrentView() {
    if (state.currentView === 'overview') renderOverview();
    if (state.currentView === 'data') renderDataTable();
    // For lookup, the detail re-renders on next search
  }

  /**
   * Filter data by period
   */
  function filterByPeriod(data, period) {
    if (!data || data.length === 0) return [];

    const now = new Date();
    // Reset to start of day to avoid time comparison issues
    now.setHours(0, 0, 0, 0);

    let startDate, endDate;
    const todayStr = formatDateStr(now);

    switch (period) {
      case 'today':
        startDate = endDate = todayStr;
        break;

      case 'week': {
        // This week: Sunday to today
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        startDate = formatDateStr(weekStart);
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

        startDate = formatDateStr(lastWeekSunday);
        endDate = formatDateStr(lastWeekSaturday);
        break;
      }

      case 'month': {
        // This Month: 1st of current month to today (calendar month)
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        startDate = formatDateStr(monthStart);
        endDate = todayStr;
        break;
      }

      case 'last30': {
        // Last 30 days (rolling, not calendar month)
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(now.getDate() - 29); // 30 days including today
        startDate = formatDateStr(thirtyDaysAgo);
        endDate = todayStr;
        break;
      }

      case 'custom': {
        // Custom date range from the global filter bar
        if (state.customDateFrom && state.customDateTo) {
          startDate = state.customDateFrom;
          endDate = state.customDateTo;
        } else {
          console.log('[Dashboard] Custom period but no dates set');
          return data;
        }
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
    const data = filterData(state.allCachedData);

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

    // Top performers by path (uses selected period data)
    renderPathLeaders(data);

    // Needs attention (bottom performers with hours > 0)
    const needsAttention = employees
      .filter(e => e.hours >= 1 && e.jph < avgGoal)
      .sort((a, b) => a.jph - b.jph)
      .slice(0, 10);

    el.attentionCount.textContent = needsAttention.length;
    el.needsAttention.innerHTML = needsAttention.length > 0
      ? needsAttention.map((e, i) => renderPerformerItem(e, i + 1, true)).join('')
      : '<div class="empty-state">Everyone is performing well!</div>';

    // Setup avatar fallbacks after render
    setupAvatarFallbacks(el.pathLeaders);
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
   * Render top performers per path (always uses full 30-day data)
   */
  function renderPathLeaders(allData) {
    if (!el.pathLeaders) return;

    const rankClasses = ['gold', 'silver', 'bronze'];

    el.pathLeaders.innerHTML = Object.entries(PATH_CONFIG).map(([pathId, config]) => {
      // Aggregate by employee for this path
      const empMap = new Map();
      allData.forEach(r => {
        if ((r.pathId || '').toLowerCase() !== pathId) return;
        if (!empMap.has(r.employeeId)) {
          empMap.set(r.employeeId, { id: r.employeeId, name: r.employeeName, login: r.login || r.employeeId, hours: 0, jobs: 0 });
        }
        const emp = empMap.get(r.employeeId);
        emp.hours += r.hours || 0;
        emp.jobs += r.jobs || 0;
      });

      const top5 = Array.from(empMap.values())
        .map(e => ({ ...e, jph: e.hours > 0 ? e.jobs / e.hours : 0 }))
        .filter(e => e.jph > 0 && e.hours >= 1)
        .sort((a, b) => b.jph - a.jph)
        .slice(0, 5);

      const leaderItems = top5.length > 0
        ? top5.map((e, i) => {
            const login = e.login || e.id;
            const photoUrl = getBadgePhotoUrl(login);
            const rankClass = i < 3 ? rankClasses[i] : '';
            return `
              <div class="leader-item">
                <div class="leader-rank ${rankClass}">${i + 1}</div>
                <div class="leader-avatar">
                  <img src="${photoUrl}" alt="${e.name || login}">
                  <div class="avatar-fallback">${DEFAULT_AVATAR_SVG}</div>
                </div>
                <div class="leader-name">${e.name || e.id}</div>
                <div class="leader-jph">${e.jph.toFixed(1)}</div>
              </div>
            `;
          }).join('')
        : '<div class="empty-state" style="padding:8px;font-size:12px">No data</div>';

      return `
        <div class="path-leader-column ${pathId}">
          <div class="path-leader-title">
            ${config.name}
            <span class="path-goal">Goal: ${config.goal} JPH</span>
          </div>
          <div class="leader-list">${leaderItems}</div>
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

    // Filter by period and shift
    matches = filterData(matches);

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
   * Calculate percentile rank of a value within an array of values
   */
  function percentileRank(value, allValues) {
    if (allValues.length === 0) return 50;
    const below = allValues.filter(v => v < value).length;
    return Math.round((below / allValues.length) * 100);
  }

  /**
   * Calculate per-path peer stats for FM-style position ratings
   * Returns array of { pathId, pathName, jph, percentile, rating, hours, jobs }
   */
  function calculatePathPositions(employeeId, records, allData) {
    // Group AA's records by pathId
    const aaByPath = {};
    records.forEach(r => {
      const pathId = r.pathId || 'other';
      if (!aaByPath[pathId]) {
        aaByPath[pathId] = { name: r.pathName || pathId, hours: 0, jobs: 0 };
      }
      aaByPath[pathId].hours += r.hours || 0;
      aaByPath[pathId].jobs += r.jobs || 0;
    });

    // For each path, calculate all employees' JPH to find percentile
    const positions = [];
    for (const [pathId, aa] of Object.entries(aaByPath)) {
      if (aa.hours <= 0) continue;
      const aaJPH = aa.jobs / aa.hours;

      // Get all employees' JPH in this path
      const pathEmployees = {};
      allData.forEach(r => {
        if ((r.pathId || '').toLowerCase() !== pathId.toLowerCase()) return;
        if (!pathEmployees[r.employeeId]) {
          pathEmployees[r.employeeId] = { hours: 0, jobs: 0 };
        }
        pathEmployees[r.employeeId].hours += r.hours || 0;
        pathEmployees[r.employeeId].jobs += r.jobs || 0;
      });

      const peerJPHs = Object.values(pathEmployees)
        .filter(e => e.hours > 0)
        .map(e => e.jobs / e.hours);

      const pct = percentileRank(aaJPH, peerJPHs);
      let rating;
      if (pct >= 75) rating = 'natural';
      else if (pct >= 50) rating = 'accomplished';
      else if (pct >= 25) rating = 'competent';
      else rating = 'unconvincing';

      positions.push({
        pathId,
        pathName: aa.name,
        jph: aaJPH,
        percentile: pct,
        rating,
        hours: aa.hours,
        jobs: aa.jobs
      });
    }

    // Sort by percentile (best first)
    positions.sort((a, b) => b.percentile - a.percentile);
    return positions;
  }

  /**
   * Get daily JPH trend for an employee, grouped by path.
   * Returns { pathId: [{label, jph, hours, jobs}, ...], ... }
   */
  function getDailyTrendByPath(employeeId, allData) {
    const byPath = {};
    allData.forEach(r => {
      if (String(r.employeeId) !== String(employeeId)) return;
      const pathId = (r.pathId || 'other').toLowerCase();
      const date = String(r.date).substring(0, 10);
      if (!byPath[pathId]) byPath[pathId] = {};
      if (!byPath[pathId][date]) byPath[pathId][date] = { hours: 0, jobs: 0 };
      byPath[pathId][date].hours += r.hours || 0;
      byPath[pathId][date].jobs += r.jobs || 0;
    });

    const result = {};
    for (const [pathId, dates] of Object.entries(byPath)) {
      const points = Object.entries(dates)
        .map(([date, d]) => ({
          label: date,
          jph: d.hours > 0 ? d.jobs / d.hours : 0,
          hours: d.hours,
          jobs: d.jobs
        }))
        .filter(d => d.hours > 0)
        .sort((a, b) => a.label.localeCompare(b.label));
      if (points.length > 0) {
        result[pathId] = points;
      }
    }
    return result;
  }

  /**
   * Build hourly JPH trend from intraday snapshots for a specific employee.
   * Snapshots keyed by hour: { 7: { time, data: [{e, p, j, h}, ...] }, 8: {...}, ... }
   * Returns { pathId: [{label, jph, hours, jobs}, ...], ... }
   */
  function getHourlyTrendFromSnapshots(employeeId, snapshots) {
    const result = {};
    const hours = Object.keys(snapshots)
      .map(Number)
      .sort((a, b) => a - b);

    for (const hour of hours) {
      const snap = snapshots[hour];
      if (!snap || !snap.data) continue;

      // Find this employee's records in the snapshot
      snap.data.forEach(r => {
        if (String(r.e) !== String(employeeId)) return;
        const pathId = (r.p || 'other').toLowerCase();
        if (!result[pathId]) result[pathId] = [];

        const jobs = r.j || 0;
        const hrs = r.h || 0;
        const jph = hrs > 0 ? jobs / hrs : 0;

        // Format hour label (e.g., "7 AM", "1 PM")
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
        const label = `${h12} ${ampm}`;

        result[pathId].push({ label, jph, hours: hrs, jobs });
      });
    }

    // Filter out empty paths
    for (const pathId of Object.keys(result)) {
      result[pathId] = result[pathId].filter(d => d.hours > 0);
      if (result[pathId].length === 0) delete result[pathId];
    }

    return result;
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

    // Set photo URL
    const photoUrl = getBadgePhotoUrl(login || employeeId);
    el.aaAvatarImg.src = photoUrl;

    el.aaName.textContent = employeeName;
    el.aaBadge.textContent = `Badge: ${employeeId}`;
    el.aaJPH.textContent = avgJPH.toFixed(1);
    el.aaJobs.textContent = totalJobs.toLocaleString();
    el.aaHours.textContent = totalHours.toFixed(1);

    // --- Build peer comparison data ---
    const allData = filterData(state.allCachedData);

    // Identify which paths this AA works
    const aaPaths = new Set(records.map(r => r.pathId));

    // Build employee map from same-path peers (for JPH/Jobs comparisons)
    const peerMap = new Map();
    allData.forEach(r => {
      if (!aaPaths.has(r.pathId)) return; // only same paths
      if (!peerMap.has(r.employeeId)) {
        peerMap.set(r.employeeId, { hours: 0, jobs: 0, dailyJPH: {} });
      }
      const emp = peerMap.get(r.employeeId);
      emp.hours += r.hours || 0;
      emp.jobs += r.jobs || 0;
      const d = String(r.date).substring(0, 10);
      if (!emp.dailyJPH[d]) emp.dailyJPH[d] = { hours: 0, jobs: 0 };
      emp.dailyJPH[d].hours += r.hours || 0;
      emp.dailyJPH[d].jobs += r.jobs || 0;
    });

    // Build full employee map for the current period (used for aaEmp lookup)
    const fullMap = new Map();
    allData.forEach(r => {
      if (!fullMap.has(r.employeeId)) {
        fullMap.set(r.employeeId, { hours: 0, jobs: 0, paths: new Set(), dailyJPH: {} });
      }
      const emp = fullMap.get(r.employeeId);
      emp.hours += r.hours || 0;
      emp.jobs += r.jobs || 0;
      emp.paths.add(r.pathId);
      const d = String(r.date).substring(0, 10);
      if (!emp.dailyJPH[d]) emp.dailyJPH[d] = { hours: 0, jobs: 0 };
      emp.dailyJPH[d].hours += r.hours || 0;
      emp.dailyJPH[d].jobs += r.jobs || 0;
    });

    // Versatility uses ALL cached data (last 30 days) regardless of period.
    // An AA's versatility is about how many paths they've worked over time.
    const versMap = new Map();
    state.allCachedData.forEach(r => {
      if (!versMap.has(r.employeeId)) {
        versMap.set(r.employeeId, new Set());
      }
      versMap.get(r.employeeId).add(r.pathId);
    });

    // Same-path peer aggregates (for JPH, Jobs, Hours)
    const peerJPHs = [], peerJobs = [], peerHours = [];
    peerMap.forEach(emp => {
      if (emp.hours <= 0) return;
      peerJPHs.push(emp.jobs / emp.hours);
      peerJobs.push(emp.jobs);
      peerHours.push(emp.hours);
    });

    // Consistency uses ALL cached data (last 30 days) regardless of period.
    // It measures how steady an AA's daily JPH is over time — needs multiple days.
    const consistencyMap = new Map();
    state.allCachedData.forEach(r => {
      if (!aaPaths.has(r.pathId)) return; // only same paths for fair comparison
      if (!consistencyMap.has(r.employeeId)) {
        consistencyMap.set(r.employeeId, {});
      }
      const dailyMap = consistencyMap.get(r.employeeId);
      const d = String(r.date).substring(0, 10);
      if (!dailyMap[d]) dailyMap[d] = { hours: 0, jobs: 0 };
      dailyMap[d].hours += r.hours || 0;
      dailyMap[d].jobs += r.jobs || 0;
    });

    const peerConsistencies = [];
    consistencyMap.forEach(dailyMap => {
      const dailyJPHs = Object.values(dailyMap)
        .filter(d => d.hours > 0)
        .map(d => d.jobs / d.hours);
      if (dailyJPHs.length >= 2) {
        const mean = dailyJPHs.reduce((s, v) => s + v, 0) / dailyJPHs.length;
        const variance = dailyJPHs.reduce((s, v) => s + (v - mean) ** 2, 0) / dailyJPHs.length;
        const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
        peerConsistencies.push(Math.max(0, 100 - cv * 100));
      }
    });

    // Versatility: computed from all 30 days of cached data, not the current period.
    // Counts distinct paths each employee has worked over the full cache window.
    const peerVersatilities = [];
    const totalPathCount = Object.keys(PATH_CONFIG).length || 1;
    versMap.forEach((paths, empId) => {
      peerVersatilities.push(paths.size);
    });

    // AA's own values
    const aaEmp = fullMap.get(employeeId) || { hours: 0, jobs: 0, paths: new Set(), dailyJPH: {} };
    // AA consistency from full 30-day history
    const aaConsistencyDaily = consistencyMap.get(employeeId) || {};
    const aaDailyJPHs = Object.values(aaConsistencyDaily)
      .filter(d => d.hours > 0)
      .map(d => d.jobs / d.hours);
    let aaConsistency = 50;
    if (aaDailyJPHs.length >= 2) {
      const mean = aaDailyJPHs.reduce((s, v) => s + v, 0) / aaDailyJPHs.length;
      const variance = aaDailyJPHs.reduce((s, v) => s + (v - mean) ** 2, 0) / aaDailyJPHs.length;
      const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
      aaConsistency = Math.max(0, 100 - cv * 100);
    }

    // Path-specific averages for radar
    const peerAvgJPH = peerJPHs.length > 0 ? peerJPHs.reduce((s, v) => s + v, 0) / peerJPHs.length : 0;
    const peerAvgJobs = peerJobs.length > 0 ? peerJobs.reduce((s, v) => s + v, 0) / peerJobs.length : 0;
    const peerAvgHours = peerHours.length > 0 ? peerHours.reduce((s, v) => s + v, 0) / peerHours.length : 0;
    const avgConsistencyAll = peerConsistencies.length > 0 ? peerConsistencies.reduce((s, v) => s + v, 0) / peerConsistencies.length : 50;

    // Versatility: AA's paths (from full 30-day history) vs peers, scaled to 0-100
    const aaPathCount = versMap.get(employeeId)?.size || aaEmp.paths.size;
    const avgPeerVersatility = peerVersatilities.length > 0
      ? peerVersatilities.reduce((s, v) => s + v, 0) / peerVersatilities.length : 1;
    const maxPeerVersatility = peerVersatilities.length > 0
      ? Math.max(...peerVersatilities) : 1;
    const aaVersatility = (aaPathCount / Math.max(maxPeerVersatility, 1)) * 100;
    const avgVersatility = (avgPeerVersatility / Math.max(maxPeerVersatility, 1)) * 100;

    // Dynamic maxes - all from same-path peers
    const maxJPH = peerJPHs.length > 0 ? Math.max(...peerJPHs) : 60;
    const maxJobs = peerJobs.length > 0 ? Math.max(...peerJobs) : 5000;
    const maxHours = peerHours.length > 0 ? Math.max(...peerHours) : 10;
    el.aaJPHBar.style.width = `${Math.min(avgJPH / maxJPH * 100, 100)}%`;
    el.aaJobsBar.style.width = `${Math.min(totalJobs / maxJobs * 100, 100)}%`;
    el.aaHoursBar.style.width = `${Math.min(totalHours / maxHours * 100, 100)}%`;

    // --- Radar chart with dynamic maxes ---
    const radarData = {
      aa: {
        jph: avgJPH,
        hours: totalHours,
        jobs: totalJobs,
        consistency: aaConsistency,
        versatility: aaVersatility
      },
      avg: {
        jph: peerAvgJPH,
        hours: peerAvgHours,
        jobs: peerAvgJobs,
        consistency: avgConsistencyAll,
        versatility: avgVersatility
      },
      maxes: {
        jph: Math.max(maxJPH * 1.1, 1),
        hours: Math.max(maxHours * 1.1, 1),
        jobs: Math.max(maxJobs * 1.1, 1),
        consistency: 100,
        versatility: 100
      }
    };

    renderRadarChart(radarData, employeeName);
    const legendName = document.getElementById('radarLegendName');
    if (legendName) legendName.textContent = employeeName.split(' ')[0] || 'This AA';

    // --- Best Paths (FM-style positions) ---
    const positions = calculatePathPositions(employeeId, records, allData);
    const positionLabels = {
      natural: 'Natural',
      accomplished: 'Accomplished',
      competent: 'Competent',
      unconvincing: 'Unconvincing'
    };
    const positionsList = document.getElementById('aaPositionsList');
    if (positionsList) {
      positionsList.innerHTML = positions.length > 0
        ? positions.map(p => `
          <div class="position-item ${p.rating}">
            <span class="position-badge ${p.rating}">${positionLabels[p.rating]}</span>
            <span class="position-path">${p.pathName}</span>
            <span class="position-stats">
              <strong>${p.jph.toFixed(1)}</strong> JPH &middot; Top ${100 - p.percentile}%
            </span>
          </div>
        `).join('')
        : '<div class="empty-state">No path data</div>';
    }

    // --- JPH Trend by Path ---
    // Single-day periods: try to show hourly trend from intraday snapshots
    // Multi-day periods: show daily trend from cached data
    let trendByPath = {};
    const isToday = state.globalPeriod === 'today';

    // Determine if this is a single-day period where we can show hourly data
    const periodData = filterData(state.allCachedData);
    const uniqueDates = new Set(periodData.map(r => String(r.date).substring(0, 10)));
    const isSingleDay = isToday || uniqueDates.size === 1;
    const singleDayDate = isToday ? null : (uniqueDates.size === 1 ? [...uniqueDates][0] : null);

    if (isSingleDay && state.fclmTabId) {
      try {
        const msg = { action: 'getIntradaySnapshots' };
        if (singleDayDate) msg.date = singleDayDate;
        const resp = await browser.tabs.sendMessage(state.fclmTabId, msg);
        if (resp?.success && resp.snapshots && Object.keys(resp.snapshots).length > 0) {
          trendByPath = getHourlyTrendFromSnapshots(employeeId, resp.snapshots);
        }
      } catch (err) {
        console.log('[Dashboard] Could not load intraday snapshots:', err.message);
      }
    }

    // Fallback to daily trend if no hourly data available
    let gotHourlyData = Object.keys(trendByPath).length > 0 && isSingleDay;
    if (Object.keys(trendByPath).length === 0) {
      // For single-day without hourly snapshots, show full cached history as daily context
      const trendData = isSingleDay ? state.allCachedData : periodData;
      trendByPath = getDailyTrendByPath(employeeId, trendData);
    }

    renderTrendCharts(trendByPath, gotHourlyData);

    // --- Performance vs Average (same-path peers) ---
    const diff = avgJPH - peerAvgJPH;
    const diffClass = diff >= 0 ? 'positive' : 'negative';
    const diffSign = diff >= 0 ? '+' : '';

    el.vsComparison.innerHTML = `
      <div class="vs-item">
        <div class="vs-value">${avgJPH.toFixed(1)}</div>
        <div class="vs-label">Their JPH</div>
      </div>
      <div class="vs-divider"></div>
      <div class="vs-item">
        <div class="vs-value">${peerAvgJPH.toFixed(1)}</div>
        <div class="vs-label">Path Avg</div>
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
   * Render radar/polygon chart with dynamic maxes
   */
  function renderRadarChart(data, name) {
    const svg = document.getElementById('radarChart');
    if (!svg) return;

    const cx = 150, cy = 150;
    const maxRadius = 100;
    const levels = 5;

    const metrics = [
      { key: 'jph', label: 'JPH', format: v => v.toFixed(1) },
      { key: 'consistency', label: 'Consistency', format: v => Math.round(v) + '%' },
      { key: 'versatility', label: 'Versatility', format: v => Math.round(v) + '%' },
      { key: 'hours', label: 'Hours', format: v => v.toFixed(1) },
      { key: 'jobs', label: 'Jobs', format: v => Math.round(v).toLocaleString() }
    ];

    const angleStep = (2 * Math.PI) / metrics.length;

    const getPoint = (value, max, index) => {
      const normalized = Math.min(max > 0 ? value / max : 0, 1);
      const angle = index * angleStep - Math.PI / 2;
      return {
        x: cx + maxRadius * normalized * Math.cos(angle),
        y: cy + maxRadius * normalized * Math.sin(angle)
      };
    };

    let svgContent = '';

    // Grid polygons (pentagons instead of circles)
    for (let lvl = 1; lvl <= levels; lvl++) {
      const r = (maxRadius / levels) * lvl;
      const pts = metrics.map((_, i) => {
        const angle = i * angleStep - Math.PI / 2;
        return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
      }).join(' ');
      svgContent += `<polygon points="${pts}" class="radar-grid-line" />`;
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

    // Average polygon
    const avgPoints = metrics.map((m, i) => {
      const p = getPoint(data.avg[m.key] || 0, data.maxes[m.key], i);
      return `${p.x},${p.y}`;
    }).join(' ');
    svgContent += `<polygon points="${avgPoints}" class="radar-polygon radar-polygon-avg" />`;

    // AA polygon
    const aaPoints = metrics.map((m, i) => {
      const p = getPoint(data.aa[m.key] || 0, data.maxes[m.key], i);
      return `${p.x},${p.y}`;
    }).join(' ');
    svgContent += `<polygon points="${aaPoints}" class="radar-polygon radar-polygon-aa" />`;

    // Value dots and labels
    metrics.forEach((m, i) => {
      const p = getPoint(data.aa[m.key] || 0, data.maxes[m.key], i);
      svgContent += `<circle cx="${p.x}" cy="${p.y}" r="4" fill="var(--accent)" />`;

      const angle = i * angleStep - Math.PI / 2;
      const valX = p.x + 15 * Math.cos(angle);
      const valY = p.y + 15 * Math.sin(angle);
      svgContent += `<text x="${valX}" y="${valY}" class="radar-value" dy="0.35em">${m.format(data.aa[m.key] || 0)}</text>`;
    });

    svg.innerHTML = svgContent;
  }

  /**
   * Render per-path JPH trend mini charts into the trendContainer.
   * @param {Object} trendByPath - { pathId: [{label, jph, hours, jobs}, ...] }
   * @param {boolean} isHourly - true for today's hourly view, false for daily
   */
  function renderTrendCharts(trendByPath, isHourly) {
    const container = document.getElementById('trendContainer');
    if (!container) return;

    const pathIds = Object.keys(trendByPath);
    if (pathIds.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding:20px">No trend data available</div>';
      return;
    }

    // Sort paths by most data points (primary path first)
    pathIds.sort((a, b) => trendByPath[b].length - trendByPath[a].length);

    const modeLabel = isHourly ? 'Hourly' : 'Daily';

    container.innerHTML = pathIds.map(pathId => {
      const config = PATH_CONFIG[pathId] || { name: pathId, color: '#00d4aa', goal: null };
      const trend = trendByPath[pathId];
      const avgJPH = trend.reduce((s, d) => s + d.jph, 0) / trend.length;

      return `
        <div class="trend-path-section">
          <div class="trend-path-header">
            <span class="trend-path-dot" style="background:${config.color}"></span>
            <span class="trend-path-name">${config.name}</span>
            <span class="trend-path-avg">${modeLabel} &middot; Avg ${avgJPH.toFixed(1)} JPH</span>
          </div>
          <svg class="trend-chart" viewBox="0 0 600 100" preserveAspectRatio="none" id="trendChart_${pathId}"></svg>
        </div>
      `;
    }).join('');

    // Render each mini chart
    pathIds.forEach(pathId => {
      const config = PATH_CONFIG[pathId] || { name: pathId, color: '#00d4aa', goal: null };
      const trend = trendByPath[pathId];
      const avgJPH = trend.reduce((s, d) => s + d.jph, 0) / trend.length;
      renderSingleTrendChart(`trendChart_${pathId}`, trend, avgJPH, config.color, config.goal, isHourly);
    });
  }

  /**
   * Render a single path's trend sparkline into an SVG element.
   * Trend points use .label (hour string like "7 AM" or date string like "2026-02-09").
   */
  function renderSingleTrendChart(svgId, trend, avgJPH, color, goal, isHourly) {
    const svg = document.getElementById(svgId);
    if (!svg || trend.length === 0) return;

    const W = 600, H = 100;
    const padL = 40, padR = 10, padT = 12, padB = 22;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;

    const maxJPH = Math.max(...trend.map(d => d.jph), avgJPH, goal || 0) * 1.15;
    const minJPH = 0;

    const xStep = trend.length > 1 ? chartW / (trend.length - 1) : chartW / 2;
    const yScale = (v) => padT + chartH - ((v - minJPH) / (maxJPH - minJPH)) * chartH;
    const xPos = (i) => padL + (trend.length > 1 ? i * xStep : chartW / 2);

    let svgContent = '';

    // Goal line
    if (goal) {
      const goalY = yScale(goal);
      svgContent += `<line x1="${padL}" y1="${goalY}" x2="${W - padR}" y2="${goalY}" stroke="#f39c12" stroke-width="1" stroke-dasharray="6,3" opacity="0.5" />`;
      svgContent += `<text x="${padL - 4}" y="${goalY}" text-anchor="end" fill="#f39c12" font-size="9" dy="0.35em" opacity="0.7">Goal</text>`;
    }

    // Avg line
    const avgY = yScale(avgJPH);
    svgContent += `<line x1="${padL}" y1="${avgY}" x2="${W - padR}" y2="${avgY}" class="trend-avg-line" />`;
    svgContent += `<text x="${padL - 4}" y="${avgY}" text-anchor="end" class="trend-avg-label" dy="0.35em">${avgJPH.toFixed(0)}</text>`;

    // Area fill
    if (trend.length > 1) {
      let areaPath = `M ${xPos(0)} ${yScale(trend[0].jph)}`;
      for (let i = 1; i < trend.length; i++) {
        areaPath += ` L ${xPos(i)} ${yScale(trend[i].jph)}`;
      }
      areaPath += ` L ${xPos(trend.length - 1)} ${padT + chartH} L ${xPos(0)} ${padT + chartH} Z`;
      svgContent += `<path d="${areaPath}" fill="${color}" opacity="0.15" />`;
    }

    // Line
    if (trend.length > 1) {
      let linePath = `M ${xPos(0)} ${yScale(trend[0].jph)}`;
      for (let i = 1; i < trend.length; i++) {
        linePath += ` L ${xPos(i)} ${yScale(trend[i].jph)}`;
      }
      svgContent += `<path d="${linePath}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />`;
    }

    // Dots and labels
    trend.forEach((d, i) => {
      const x = xPos(i);
      const y = yScale(d.jph);
      svgContent += `<circle cx="${x}" cy="${y}" r="3" fill="${color}" />`;

      // JPH value labels
      const showValue = trend.length <= 14 || i % 2 === 0 || i === trend.length - 1;
      if (showValue) {
        svgContent += `<text x="${x}" y="${y - 8}" text-anchor="middle" fill="${color}" font-size="10" font-weight="600">${d.jph.toFixed(0)}</text>`;
      }

      // X-axis labels: for hourly show all hours, for daily show at intervals
      let showXLabel;
      if (isHourly) {
        showXLabel = trend.length <= 12 || i % 2 === 0 || i === trend.length - 1;
      } else {
        showXLabel = i === 0 || i === trend.length - 1 || (trend.length > 7 && i % 7 === 0);
      }
      if (showXLabel) {
        // For hourly: label is already "7 AM" etc. For daily: extract MM-DD from date
        const xLabel = isHourly ? d.label : d.label.substring(5);
        svgContent += `<text x="${x}" y="${H - 4}" text-anchor="middle" class="trend-label">${xLabel}</text>`;
      }
    });

    svg.innerHTML = svgContent;
  }

  /**
   * Render data table
   */
  function renderDataTable() {
    let data = filterData(state.allCachedData);

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
    let data = filterData(state.allCachedData);

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
    a.download = `performance_${state.warehouseId}_${state.globalPeriod}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();

    URL.revokeObjectURL(url);
    showToast('CSV exported', 'success');
  }

  /**
   * Handle full backup (all cached data + intraday snapshots)
   */
  async function handleBackup() {
    const statusEl = el.backupStatus;
    if (statusEl) {
      statusEl.textContent = 'Preparing backup...';
      statusEl.className = 'backup-status';
    }

    try {
      if (!state.fclmTabId) {
        const tabs = await browser.tabs.query({ url: '*://fclm-portal.amazon.com/*' });
        if (tabs.length > 0) state.fclmTabId = tabs[0].id;
      }

      if (!state.fclmTabId) {
        // Fallback: export directly from storage (dashboard has access)
        const all = await browser.storage.local.get(null);
        const exportData = {
          version: 1,
          exportedAt: new Date().toISOString(),
          keys: {}
        };
        Object.entries(all).forEach(([key, value]) => {
          if (key.startsWith('cache_') || key.startsWith('meta_') || key.startsWith('intraday_')) {
            exportData.keys[key] = value;
          }
        });
        downloadBackup(exportData);
        return;
      }

      const response = await browser.tabs.sendMessage(state.fclmTabId, { action: 'exportBackup' });
      if (response?.success && response.data) {
        downloadBackup(response.data);
      } else {
        throw new Error(response?.error || 'Export failed');
      }
    } catch (err) {
      console.error('[Dashboard] Backup error:', err);
      if (statusEl) {
        statusEl.textContent = `Backup failed: ${err.message}`;
        statusEl.className = 'backup-status error';
      }
      showToast('Backup failed', 'error');
    }
  }

  /**
   * Download backup data as a JSON file
   */
  function downloadBackup(data) {
    const keyCount = Object.keys(data.keys).length;
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `aa-performance-backup_${state.warehouseId}_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    if (el.backupStatus) {
      el.backupStatus.textContent = `Backup saved (${keyCount} data entries)`;
      el.backupStatus.className = 'backup-status success';
    }
    showToast(`Backup exported (${keyCount} entries)`, 'success');
  }

  /**
   * Handle restore from a backup JSON file
   */
  async function handleRestore(e) {
    const file = e.target.files[0];
    if (!file) return;

    const statusEl = el.backupStatus;
    if (statusEl) {
      statusEl.textContent = 'Reading backup file...';
      statusEl.className = 'backup-status';
    }

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data || !data.keys || data.version !== 1) {
        throw new Error('Invalid backup file format');
      }

      const keyCount = Object.keys(data.keys).length;
      if (statusEl) {
        statusEl.textContent = `Importing ${keyCount} entries...`;
      }

      // Try via FCLM tab first, fallback to direct storage
      let result;
      if (state.fclmTabId) {
        try {
          const response = await browser.tabs.sendMessage(state.fclmTabId, {
            action: 'importBackup',
            data: data
          });
          if (response?.success) {
            result = response;
          } else {
            throw new Error(response?.error || 'Import failed');
          }
        } catch (err) {
          // Fallback: import directly into storage
          result = await importDirectly(data);
        }
      } else {
        result = await importDirectly(data);
      }

      if (statusEl) {
        statusEl.textContent = `Restored ${result.imported} entries (${result.skipped} skipped)`;
        statusEl.className = 'backup-status success';
      }
      showToast(`Restored ${result.imported} entries`, 'success');

      // Reload data to reflect imported records
      await loadFromFCLM();
    } catch (err) {
      console.error('[Dashboard] Restore error:', err);
      if (statusEl) {
        statusEl.textContent = `Restore failed: ${err.message}`;
        statusEl.className = 'backup-status error';
      }
      showToast('Restore failed: ' + err.message, 'error');
    }

    // Reset file input so the same file can be selected again
    e.target.value = '';
  }

  /**
   * Import backup data directly into browser.storage.local
   * (fallback when FCLM tab is not available)
   */
  async function importDirectly(exportData) {
    const existing = await browser.storage.local.get(null);
    const toStore = {};
    let imported = 0;
    let skipped = 0;

    Object.entries(exportData.keys).forEach(([key, value]) => {
      if (!key.startsWith('cache_') && !key.startsWith('meta_') && !key.startsWith('intraday_')) {
        skipped++;
        return;
      }

      if (existing[key] && existing[key].fetchedAt && value.fetchedAt) {
        if (new Date(existing[key].fetchedAt) >= new Date(value.fetchedAt)) {
          skipped++;
          return;
        }
      }

      if (key.startsWith('intraday_') && existing[key]) {
        const merged = { ...existing[key] };
        Object.entries(value).forEach(([hour, snap]) => {
          if (!merged[hour]) {
            merged[hour] = snap;
          }
        });
        toStore[key] = merged;
        imported++;
        return;
      }

      toStore[key] = value;
      imported++;
    });

    if (Object.keys(toStore).length > 0) {
      state._suppressStorageListener = true;
      await browser.storage.local.set(toStore);
      state._suppressStorageListener = false;
    }

    return { imported, skipped };
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
