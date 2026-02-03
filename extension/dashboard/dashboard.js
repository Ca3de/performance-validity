/**
 * AA Performance Validity - Dashboard Script
 * Simplified two-tab interface: Scan AA and All Data
 */

(function() {
  'use strict';

  // State
  const state = {
    warehouseId: 'UNKNOWN',
    allCachedData: [],
    filteredData: [],
    currentTab: 'scan',
    // Scan tab state
    scanPeriod: 'month',
    scanPath: 'all',
    // Data tab state
    dataPeriod: 'today',
    searchQuery: '',
    fclmTabId: null
  };

  // Path configuration
  const PATH_CONFIG = {
    'pick': { name: 'Pick', color: '#4CAF50' },
    'pack': { name: 'Pack', color: '#2196F3' },
    'stow': { name: 'Stow', color: '#9C27B0' }
  };

  // DOM Elements
  const elements = {};

  /**
   * Initialize dashboard
   */
  async function init() {
    console.log('[Dashboard] Initializing...');

    // Cache DOM elements
    cacheElements();

    // Attach event listeners
    attachEventListeners();

    // Load data
    await loadInitialData();

    console.log('[Dashboard] Initialized');
  }

  /**
   * Cache DOM elements
   */
  function cacheElements() {
    elements.warehouseBadge = document.getElementById('warehouseBadge');
    elements.toastContainer = document.getElementById('toastContainer');

    // Tab elements
    elements.tabBtns = document.querySelectorAll('.tab-btn');
    elements.tabContents = document.querySelectorAll('.tab-content');

    // Scan tab elements
    elements.scanInput = document.getElementById('scanInput');
    elements.scanBtn = document.getElementById('scanBtn');
    elements.scanPeriod = document.getElementById('scanPeriod');
    elements.scanPath = document.getElementById('scanPath');
    elements.scanResult = document.getElementById('scanResult');
    elements.resultName = document.getElementById('resultName');
    elements.resultBadge = document.getElementById('resultBadge');
    elements.resultJPH = document.getElementById('resultJPH');
    elements.resultJobs = document.getElementById('resultJobs');
    elements.resultHours = document.getElementById('resultHours');
    elements.resultPaths = document.getElementById('resultPaths');
    elements.closeResult = document.getElementById('closeResult');

    // Data tab elements
    elements.periodBtns = document.querySelectorAll('.period-btn');
    elements.dataSearch = document.getElementById('dataSearch');
    elements.exportBtn = document.getElementById('exportBtn');
    elements.dataSummary = document.getElementById('dataSummary');
    elements.dataBody = document.getElementById('dataBody');
  }

  /**
   * Attach event listeners
   */
  function attachEventListeners() {
    // Tab navigation
    elements.tabBtns.forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Scan tab
    elements.scanBtn.addEventListener('click', handleScan);
    elements.scanInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleScan();
    });
    elements.scanPeriod.addEventListener('change', (e) => {
      state.scanPeriod = e.target.value;
    });
    elements.scanPath.addEventListener('change', (e) => {
      state.scanPath = e.target.value;
    });
    elements.closeResult.addEventListener('click', () => {
      elements.scanResult.style.display = 'none';
      elements.scanInput.value = '';
      elements.scanInput.focus();
    });

    // Data tab
    elements.periodBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        elements.periodBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.dataPeriod = btn.dataset.period;
        renderDataTable();
      });
    });
    elements.dataSearch.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.toLowerCase();
      renderDataTable();
    });
    elements.exportBtn.addEventListener('click', handleExport);
  }

  /**
   * Switch between tabs
   */
  function switchTab(tabId) {
    state.currentTab = tabId;

    elements.tabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    elements.tabContents.forEach(content => {
      content.classList.toggle('active', content.id === `tab-${tabId}`);
    });

    // Render data table when switching to data tab
    if (tabId === 'data') {
      renderDataTable();
    }
  }

  /**
   * Load initial data from cache
   */
  async function loadInitialData() {
    try {
      // Check for passed data from FCLM
      const storage = await browser.storage.local.get('dashboardData');
      const passedData = storage.dashboardData;

      if (passedData) {
        console.log('[Dashboard] Loaded passed data');
        state.warehouseId = passedData.warehouseId || 'UNKNOWN';
        elements.warehouseBadge.textContent = state.warehouseId;
        await browser.storage.local.remove('dashboardData');

        if (passedData.performanceData && passedData.performanceData.length > 0) {
          state.allCachedData = passedData.performanceData;
          showToast(`Loaded ${state.allCachedData.length} records`, 'success');
          return;
        }
      }

      // Load from FCLM tab cache
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

      // Check cache status
      const statusResponse = await browser.tabs.sendMessage(fclmTab.id, { action: 'getCacheStatus' });

      if (!statusResponse?.initialized) {
        showToast('Cache initializing...', 'info');
        setTimeout(() => loadFromFCLM(), 3000);
        return;
      }

      // Get all cached data
      const response = await browser.tabs.sendMessage(fclmTab.id, { action: 'getAllCachedData' });

      if (response?.success && response.totalRecords > 0) {
        state.warehouseId = response.warehouseId || state.warehouseId;
        state.allCachedData = response.performanceData || [];
        elements.warehouseBadge.textContent = state.warehouseId;
        showToast(`Loaded ${response.totalRecords} records`, 'success');
      } else {
        showToast('No cached data available', 'warning');
      }

    } catch (error) {
      console.error('[Dashboard] Error loading from FCLM:', error);
      showToast('Error loading from FCLM', 'error');
    }
  }

  /**
   * Handle scan/lookup
   */
  function handleScan() {
    const input = elements.scanInput.value.trim();

    if (!input) {
      showToast('Enter badge ID or login', 'warning');
      return;
    }

    if (state.allCachedData.length === 0) {
      showToast('No data loaded', 'warning');
      return;
    }

    const searchTerm = input.toLowerCase();

    // Find matching records
    let matches = state.allCachedData.filter(r => {
      const id = String(r.employeeId || '').toLowerCase();
      const name = String(r.employeeName || '').toLowerCase();
      return id.includes(searchTerm) || name.includes(searchTerm);
    });

    if (matches.length === 0) {
      showToast(`No AA found: "${input}"`, 'error');
      return;
    }

    // Filter by date range
    matches = filterByPeriod(matches, state.scanPeriod);

    // Filter by path
    if (state.scanPath !== 'all') {
      matches = matches.filter(r => {
        const pathId = (r.pathId || '').toLowerCase();
        return pathId.includes(state.scanPath);
      });
    }

    if (matches.length === 0) {
      showToast('No data for selected filters', 'warning');
      return;
    }

    // Display result
    displayScanResult(matches);
  }

  /**
   * Filter data by period
   */
  function filterByPeriod(data, period) {
    const now = new Date();
    const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    let startDate, endDate;

    switch (period) {
      case 'today':
        startDate = endDate = formatDate(now);
        break;

      case 'week': {
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        startDate = formatDate(weekStart);
        endDate = formatDate(now);
        break;
      }

      case 'lastWeek': {
        const lastWeekEnd = new Date(now);
        lastWeekEnd.setDate(lastWeekEnd.getDate() - lastWeekEnd.getDay() - 1);
        const lastWeekStart = new Date(lastWeekEnd);
        lastWeekStart.setDate(lastWeekStart.getDate() - 6);
        startDate = formatDate(lastWeekStart);
        endDate = formatDate(lastWeekEnd);
        break;
      }

      case 'month': {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        startDate = formatDate(monthStart);
        endDate = formatDate(now);
        break;
      }

      case 'lastMonth': {
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        startDate = formatDate(lastMonthStart);
        endDate = formatDate(lastMonthEnd);
        break;
      }

      default:
        return data;
    }

    return data.filter(r => {
      const date = r.date;
      if (!date) return false;
      return date >= startDate && date <= endDate;
    });
  }

  /**
   * Display scan result
   */
  function displayScanResult(records) {
    const first = records[0];
    const employeeId = first.employeeId;
    const employeeName = first.employeeName || employeeId;

    // Calculate totals
    const totalHours = records.reduce((sum, r) => sum + (r.hours || 0), 0);
    const totalJobs = records.reduce((sum, r) => sum + (r.jobs || 0), 0);
    const avgJPH = totalHours > 0 ? (totalJobs / totalHours).toFixed(1) : 0;

    // Update display
    elements.resultName.textContent = employeeName;
    elements.resultBadge.textContent = `Badge: ${employeeId}`;
    elements.resultJPH.textContent = avgJPH;
    elements.resultJobs.textContent = totalJobs.toLocaleString();
    elements.resultHours.textContent = totalHours.toFixed(1);

    // Group by path
    const pathGroups = {};
    records.forEach(r => {
      const pathId = r.pathId || 'other';
      if (!pathGroups[pathId]) {
        pathGroups[pathId] = {
          name: r.pathName || pathId,
          color: r.pathColor || '#666',
          hours: 0,
          jobs: 0
        };
      }
      pathGroups[pathId].hours += r.hours || 0;
      pathGroups[pathId].jobs += r.jobs || 0;
    });

    // Render path breakdown
    elements.resultPaths.innerHTML = Object.entries(pathGroups).map(([id, p]) => {
      const jph = p.hours > 0 ? (p.jobs / p.hours).toFixed(1) : 0;
      return `
        <div class="path-breakdown">
          <span class="path-name" style="color: ${p.color}">${p.name}</span>
          <span class="path-stats">${p.hours.toFixed(1)}h | ${p.jobs} jobs | ${jph} JPH</span>
        </div>
      `;
    }).join('');

    elements.scanResult.style.display = 'block';
    showToast(`Found ${records.length} records`, 'success');
  }

  /**
   * Render data table
   */
  function renderDataTable() {
    // Filter by period
    let data = filterByPeriod(state.allCachedData, state.dataPeriod);

    // Filter by search
    if (state.searchQuery) {
      data = data.filter(r => {
        const id = String(r.employeeId || '').toLowerCase();
        const name = String(r.employeeName || '').toLowerCase();
        return id.includes(state.searchQuery) || name.includes(state.searchQuery);
      });
    }

    // Sort by JPH descending
    data.sort((a, b) => (b.jph || 0) - (a.jph || 0));

    // Update summary
    elements.dataSummary.textContent = `${data.length} records`;

    // Render table
    if (data.length === 0) {
      elements.dataBody.innerHTML = `
        <tr class="empty-row">
          <td colspan="5">No data for selected period</td>
        </tr>
      `;
      return;
    }

    elements.dataBody.innerHTML = data.map(r => `
      <tr>
        <td>
          <strong>${r.employeeId}</strong>
          ${r.employeeName && r.employeeName !== r.employeeId ? `<br><small>${r.employeeName}</small>` : ''}
        </td>
        <td style="color: ${r.pathColor || '#666'}">${r.pathName || r.pathId || '-'}</td>
        <td>${(r.hours || 0).toFixed(1)}</td>
        <td>${(r.jobs || 0).toLocaleString()}</td>
        <td><strong>${r.jph || '-'}</strong></td>
      </tr>
    `).join('');
  }

  /**
   * Handle CSV export
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

    elements.toastContainer.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
