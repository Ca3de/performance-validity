/**
 * AA Performance Validity - Dashboard Script
 */

(function() {
  'use strict';

  // State
  const state = {
    warehouseId: 'UNKNOWN',
    employees: [],
    allCachedData: [],        // ALL data from cache (unfiltered)
    performanceData: [],       // Filtered data for display
    period: 'lastMonth',       // Default to last month (cached data)
    dateRange: {
      startDate: null,
      endDate: null
    },
    paths: [],
    activePath: 'all',
    searchQuery: '',
    sortBy: 'employee',
    fclmTabId: null,
    cacheStatus: {
      initialized: false,
      months: [],
      totalRecords: 0
    },
    // AA Lookup state
    selectedAA: null,
    selectedLookupPath: 'all',
    // Search suggestions
    searchSuggestions: [],
    showSuggestions: false
  };

  // Path configuration with colors and JPH goals (matching fclm.js PATHS)
  const PATH_CONFIG = {
    // Main paths (parent categories)
    'pick': { name: 'Pick', color: '#4CAF50', goal: 30 },
    'pack': { name: 'Pack', color: '#2196F3', goal: 35 },
    'stow': { name: 'Stow', color: '#9C27B0', goal: 45 },
    // Support paths
    'support_c': { name: 'C-Returns Support', color: '#607D8B', goal: null },
    'support_v': { name: 'V-Returns Support', color: '#795548', goal: null }
  };

  // DOM Elements
  const elements = {
    warehouseBadge: document.getElementById('warehouseBadge'),
    periodSelect: document.getElementById('periodSelect'),
    customDateRange: document.getElementById('customDateRange'),
    startDate: document.getElementById('startDate'),
    endDate: document.getElementById('endDate'),
    applyDateRange: document.getElementById('applyDateRange'),
    refreshBtn: document.getElementById('refreshBtn'),
    employeeSearch: document.getElementById('employeeSearch'),
    pathFilters: document.getElementById('pathFilters'),
    summaryCards: document.getElementById('summaryCards'),
    totalEmployees: document.getElementById('totalEmployees'),
    meetingGoal: document.getElementById('meetingGoal'),
    belowGoal: document.getElementById('belowGoal'),
    totalPaths: document.getElementById('totalPaths'),
    employeeInput: document.getElementById('employeeInput'),
    addEmployeesBtn: document.getElementById('addEmployeesBtn'),
    performanceBody: document.getElementById('performanceBody'),
    exportCsvBtn: document.getElementById('exportCsvBtn'),
    sortSelect: document.getElementById('sortSelect'),
    pathCards: document.getElementById('pathCards'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    toastContainer: document.getElementById('toastContainer'),
    // AA Lookup elements
    aaLookupInput: document.getElementById('aaLookupInput'),
    clearLookupBtn: document.getElementById('clearLookupBtn'),
    lookupPathSelect: document.getElementById('lookupPathSelect'),
    lookupBtn: document.getElementById('lookupBtn'),
    aaDetailPanel: document.getElementById('aaDetailPanel'),
    closeDetailBtn: document.getElementById('closeDetailBtn'),
    aaDetailName: document.getElementById('aaDetailName'),
    aaDetailId: document.getElementById('aaDetailId'),
    aaDetailPath: document.getElementById('aaDetailPath'),
    // Game-style elements
    overallRating: document.getElementById('overallRating'),
    tierBadge: document.getElementById('tierBadge'),
    tierName: document.getElementById('tierName'),
    // Stats
    statJPH: document.getElementById('statJPH'),
    statJobs: document.getElementById('statJobs'),
    statHours: document.getElementById('statHours'),
    statEfficiency: document.getElementById('statEfficiency'),
    statBarJPH: document.getElementById('statBarJPH'),
    statBarJobs: document.getElementById('statBarJobs'),
    statBarHours: document.getElementById('statBarHours'),
    statBarEfficiency: document.getElementById('statBarEfficiency'),
    // VS Comparison
    vsPathName: document.getElementById('vsPathName'),
    vsYourJPH: document.getElementById('vsYourJPH'),
    vsAvgJPH: document.getElementById('vsAvgJPH'),
    vsResult: document.getElementById('vsResult'),
    vsDiff: document.getElementById('vsDiff'),
    vsText: document.getElementById('vsText'),
    // Ranking
    rankNumber: document.getElementById('rankNumber'),
    rankTotal: document.getElementById('rankTotal'),
    rankDescription: document.getElementById('rankDescription'),
    rankPercentile: document.getElementById('rankPercentile'),
    // Sub-paths
    subpathToggle: document.getElementById('subpathToggle'),
    subpathDetails: document.getElementById('subpathDetails'),
    subpathList: document.getElementById('subpathList'),
    subpathCount: document.getElementById('subpathCount'),
    // Path history
    pathHistory: document.getElementById('pathHistory'),
    pathHistoryTable: document.getElementById('pathHistoryTable')
  };

  /**
   * Initialize dashboard
   */
  async function init() {
    console.log('[Dashboard] Initializing...');

    // Set default date range (past 30 days)
    setDefaultDateRange();

    // Create path filter pills
    createPathFilters();

    // Load data passed from FCLM
    await loadInitialData();

    // Attach event listeners
    attachEventListeners();

    console.log('[Dashboard] Initialized');
  }

  /**
   * Set default date range and period
   */
  function setDefaultDateRange() {
    const today = new Date();
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    // Default custom dates (in case user switches to custom)
    state.dateRange.startDate = formatDate(monthAgo);
    state.dateRange.endDate = formatDate(today);

    elements.startDate.value = state.dateRange.startDate;
    elements.endDate.value = state.dateRange.endDate;

    // Default period is "lastMonth" (most complete cached data)
    state.period = 'lastMonth';
    elements.periodSelect.value = 'lastMonth';
    elements.customDateRange.style.display = 'none';
  }

  function formatDate(date) {
    return date.toISOString().split('T')[0];
  }

  /**
   * Create path filter pills
   */
  function createPathFilters() {
    const container = elements.pathFilters;
    container.innerHTML = '';

    // Add "All" filter
    const allPill = document.createElement('button');
    allPill.className = 'filter-pill active';
    allPill.dataset.path = 'all';
    allPill.textContent = 'All Paths';
    allPill.addEventListener('click', () => setActivePath('all'));
    container.appendChild(allPill);

    // Add path-specific filters
    for (const [pathId, config] of Object.entries(PATH_CONFIG)) {
      const pill = document.createElement('button');
      pill.className = 'filter-pill';
      pill.dataset.path = pathId;
      pill.textContent = config.name;
      pill.style.setProperty('--path-color', config.color);
      pill.addEventListener('click', () => setActivePath(pathId));
      container.appendChild(pill);
    }
  }

  /**
   * Set active path filter
   */
  function setActivePath(pathId) {
    state.activePath = pathId;

    // Update UI
    document.querySelectorAll('.filter-pill').forEach(pill => {
      pill.classList.toggle('active', pill.dataset.path === pathId);
    });

    renderPerformanceTable();
  }

  /**
   * Load initial data - first from storage, then request ALL cached data
   */
  async function loadInitialData() {
    try {
      // First check if we have data passed from FCLM button click
      const storage = await browser.storage.local.get('dashboardData');
      const passedData = storage.dashboardData;

      if (passedData) {
        console.log('[Dashboard] Loaded passed data:', passedData);
        state.warehouseId = passedData.warehouseId || 'UNKNOWN';
        elements.warehouseBadge.textContent = state.warehouseId;
        browser.storage.local.remove('dashboardData');
      }

      // Now load ALL cached data from content script
      await loadAllCachedData();

    } catch (error) {
      console.error('[Dashboard] Error loading initial data:', error);
    }
  }

  /**
   * Load ALL cached data from content script
   */
  async function loadAllCachedData() {
    showLoading(true, 'Loading cached data...');

    try {
      // Find the FCLM tab
      const tabs = await browser.tabs.query({ url: '*://fclm-portal.amazon.com/*' });

      if (tabs.length === 0) {
        showToast('FCLM portal not open. Please open FCLM in another tab.', 'error');
        showLoading(false);
        return;
      }

      const fclmTab = tabs[0];
      state.fclmTabId = fclmTab.id;

      // First check cache status
      console.log('[Dashboard] Checking cache status...');
      const statusResponse = await browser.tabs.sendMessage(fclmTab.id, { action: 'getCacheStatus' });
      console.log('[Dashboard] Cache status:', statusResponse);

      if (!statusResponse?.initialized) {
        showToast('Cache is still initializing. Please wait a moment and try again.', 'warning');
        showLoading(false);
        // Retry after 3 seconds
        setTimeout(() => loadAllCachedData(), 3000);
        return;
      }

      console.log('[Dashboard] Requesting all cached data...');

      // Request all cached data
      const response = await browser.tabs.sendMessage(fclmTab.id, { action: 'getAllCachedData' });

      console.log('[Dashboard] getAllCachedData response:', {
        success: response?.success,
        totalRecords: response?.totalRecords,
        cachedMonths: response?.cachedMonths,
        employeeCount: response?.employees?.length
      });

      if (response && response.success && response.totalRecords > 0) {
        state.warehouseId = response.warehouseId || state.warehouseId;
        state.employees = response.employees || [];
        state.allCachedData = response.performanceData || [];
        state.cacheStatus = {
          initialized: true,
          months: response.cachedMonths || [],
          totalRecords: response.totalRecords || 0
        };

        elements.warehouseBadge.textContent = state.warehouseId;

        console.log('[Dashboard] Cached months available:', state.cacheStatus.months);

        // Apply default filter (last month)
        applyDateFilter();

        showToast(`Loaded ${response.totalRecords} records from months: ${response.cachedMonths?.join(', ') || 'none'}`, 'success');
      } else {
        console.log('[Dashboard] No cached data, falling back to FCLM fetch');
        // Fall back to fetching from FCLM
        await fetchDataFromFCLM();
      }
    } catch (error) {
      console.error('[Dashboard] Error loading cached data:', error);
      showToast('Error loading data: ' + error.message, 'error');
      // Fall back to FCLM fetch
      await fetchDataFromFCLM();
    } finally {
      showLoading(false);
    }
  }

  /**
   * Apply date filter to cached data (client-side filtering)
   * Filters by month and includes current day data where appropriate
   */
  function applyDateFilter() {
    const period = state.period;
    const now = new Date();

    // Determine which months to include based on period
    const getMonthKey = (date) => {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    };

    let monthsToInclude = new Set();
    let includeCurrentDay = false;

    switch (period) {
      case 'today':
        // ONLY current day data - cached month data is aggregated totals, not daily
        includeCurrentDay = true;
        // Don't add any months - we only want isCurrentDay records for today
        break;

      case 'week':
      case 'lastWeek':
        // Week-based filters should be fetched from FCLM directly
        // This is a fallback - show current day data only
        console.log('[Dashboard] Week filter should use FCLM fetch, falling back to current day');
        includeCurrentDay = true;
        break;

      case 'month':
        // This month + current day
        includeCurrentDay = true;
        monthsToInclude.add(getMonthKey(now));
        break;

      case 'lastMonth':
        // Last month only
        const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        monthsToInclude.add(getMonthKey(lastMonthDate));
        break;

      case 'custom':
        // Include all months in the custom range
        const startDate = new Date(state.dateRange.startDate);
        const endDate = new Date(state.dateRange.endDate);
        let current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        while (current <= endDate) {
          monthsToInclude.add(getMonthKey(current));
          current.setMonth(current.getMonth() + 1);
        }
        // If end date is today or future, include current day
        if (endDate >= new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
          includeCurrentDay = true;
        }
        break;

      default:
        // Show all data
        state.allCachedData.forEach(record => {
          if (record.month) monthsToInclude.add(record.month);
        });
        includeCurrentDay = true;
    }

    console.log(`[Dashboard] Filtering for period '${period}':`, {
      monthsToInclude: Array.from(monthsToInclude),
      includeCurrentDay
    });

    // Filter cached data
    const filteredData = state.allCachedData.filter(record => {
      // Current day records
      if (record.isCurrentDay) {
        return includeCurrentDay;
      }
      // Historical records - filter by month
      if (record.month) {
        return monthsToInclude.has(record.month);
      }
      return false;
    });

    console.log(`[Dashboard] Filtered to ${filteredData.length} records from ${state.allCachedData.length} total`);

    // Process the filtered data
    if (filteredData.length > 0) {
      processRealPerformanceData(filteredData);
    } else {
      state.performanceData = [];
      renderAll();
      if (state.allCachedData.length === 0) {
        showToast('No cached data available. Wait for cache to load or click Refresh.', 'warning');
      } else {
        showToast(`No data found for ${period}. Available months: ${state.cacheStatus.months.join(', ')}`, 'warning');
      }
    }
  }

  /**
   * Process REAL performance data from FCLM function rollup
   * Data already contains hours and JPH from the rollup
   */
  function processRealPerformanceData(rawData) {
    state.performanceData = [];

    rawData.forEach(record => {
      // Get path config for goal and color
      const pathConfig = PATH_CONFIG[record.pathId] || {
        name: record.pathName || record.pathId,
        color: record.pathColor || '#666',
        goal: null
      };

      const hours = record.hours || 0;
      const jph = record.jph || 0;  // JPH comes directly from function rollup
      const jobs = record.jobs || 0;
      const units = record.units || 0;
      const uph = record.uph || 0;
      const goal = pathConfig.goal;

      // Calculate % to goal if we have a goal
      const percentToGoal = goal && jph > 0 ? Math.round((jph / goal) * 100) : null;

      state.performanceData.push({
        employeeId: record.employeeId,
        employeeName: record.employeeName || record.employeeId,
        pathId: record.pathId,
        // Prioritize record.pathName (sub-function) over pathConfig.name (parent path)
        pathName: record.pathName || pathConfig.name || record.pathId,
        parentPath: record.parentPath || pathConfig.name || record.pathId,
        pathColor: pathConfig.color || record.pathColor || '#666',
        category: record.category || 'Other',
        hours: hours,
        jobs: jobs,
        jph: jph,
        units: units,
        uph: uph,
        goal: goal,
        percentToGoal: percentToGoal,
        status: percentToGoal ? (percentToGoal >= 100 ? 'good' : percentToGoal >= 85 ? 'warning' : 'poor') : 'neutral'
      });
    });

    console.log('[Dashboard] Processed', state.performanceData.length, 'performance records');
    if (state.performanceData.length > 0) {
      console.log('[Dashboard] Sample records:', state.performanceData.slice(0, 3));
      console.log('[Dashboard] Unique employee IDs:', [...new Set(state.performanceData.map(r => r.employeeId))].slice(0, 10));
    }
    renderAll();
  }

  /**
   * Attach event listeners
   */
  function attachEventListeners() {
    elements.periodSelect.addEventListener('change', handlePeriodChange);
    elements.applyDateRange.addEventListener('click', handleApplyDateRange);
    elements.refreshBtn.addEventListener('click', handleRefresh);
    elements.employeeSearch.addEventListener('input', handleSearch);
    elements.addEmployeesBtn.addEventListener('click', handleAddEmployees);
    elements.exportCsvBtn.addEventListener('click', handleExportCsv);
    elements.sortSelect.addEventListener('change', handleSortChange);

    // AA Lookup event listeners
    elements.lookupBtn.addEventListener('click', handleAALookup);
    elements.aaLookupInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleAALookup();
    });
    elements.clearLookupBtn.addEventListener('click', () => {
      elements.aaLookupInput.value = '';
      elements.aaLookupInput.focus();
    });
    elements.lookupPathSelect.addEventListener('change', (e) => {
      state.selectedLookupPath = e.target.value;
      // If AA is already selected, refresh the detail view
      if (state.selectedAA) {
        displayAADetails(state.selectedAA, state.selectedLookupPath);
      }
    });
    elements.closeDetailBtn.addEventListener('click', closeAADetailPanel);

    // Click outside to close suggestions
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-box')) {
        hideSearchSuggestions();
      }
    });

    // Focus on search shows suggestions if there's a query
    elements.employeeSearch.addEventListener('focus', () => {
      if (elements.employeeSearch.value.length >= 2) {
        const suggestions = generateSearchSuggestions(elements.employeeSearch.value);
        showSearchSuggestions(suggestions);
      }
    });
  }

  /**
   * Handle period selector change
   */
  function handlePeriodChange(e) {
    const period = e.target.value;
    state.period = period;

    // Show/hide custom date range inputs
    if (period === 'custom') {
      elements.customDateRange.style.display = 'flex';
    } else {
      elements.customDateRange.style.display = 'none';

      // Week-based filters need fresh FCLM data (cached monthly data can't be split by week)
      // Month-based filters can use cached data
      if (period === 'week' || period === 'lastWeek') {
        showToast('Fetching weekly data from FCLM...', 'info');
        fetchDataFromFCLM();
      } else {
        applyDateFilter();
      }
    }
  }

  /**
   * Handle date range apply
   */
  async function handleApplyDateRange() {
    const period = state.period;

    // Update date range from inputs for custom period
    if (period === 'custom') {
      state.dateRange.startDate = elements.startDate.value;
      state.dateRange.endDate = elements.endDate.value;

      if (!state.dateRange.startDate || !state.dateRange.endDate) {
        showToast('Please select both start and end dates', 'warning');
        return;
      }
    }

    // Periods that need fresh FCLM fetch (can't use cached monthly data)
    const needsFreshFetch = ['today', 'week', 'lastWeek', 'custom'];

    if (needsFreshFetch.includes(period)) {
      await fetchDataFromFCLM();
    } else {
      // Month-based periods can use cached data
      applyDateFilter();
    }
  }

  /**
   * Handle refresh button - always fetch fresh data
   */
  async function handleRefresh() {
    // Refresh all cached data
    await loadAllCachedData();
  }

  /**
   * Find FCLM tab and send message to fetch data
   */
  async function fetchDataFromFCLM() {
    showLoading(true);

    try {
      // Find the FCLM tab
      const tabs = await browser.tabs.query({ url: '*://fclm-portal.amazon.com/*' });

      if (tabs.length === 0) {
        showToast('FCLM portal not open. Please open FCLM in another tab.', 'error');
        showLoading(false);
        return;
      }

      const fclmTab = tabs[0];
      state.fclmTabId = fclmTab.id;

      // Build the message
      const message = {
        action: 'fetchPerformanceData',
        period: state.period
      };

      // Add custom dates if custom period
      if (state.period === 'custom') {
        message.customStart = state.dateRange.startDate;
        message.customEnd = state.dateRange.endDate;
      }

      console.log('[Dashboard] Sending fetch request to FCLM:', message);

      // Send message to content script
      const response = await browser.tabs.sendMessage(fclmTab.id, message);

      if (response && response.success) {
        console.log('[Dashboard] Received performance data:', response);

        // Update state with new data
        state.warehouseId = response.warehouseId;
        state.employees = response.employees || [];

        if (response.dateRange) {
          state.dateRange = response.dateRange;
        }

        // Process the performance data
        if (response.performanceData && response.performanceData.length > 0) {
          processRealPerformanceData(response.performanceData);
          showToast(`Loaded ${response.performanceData.length} records for ${response.employees.length} employees`, 'success');
        } else {
          state.performanceData = [];
          renderAll();
          showToast('No performance data found for this period', 'warning');
        }

        // Update warehouse badge
        elements.warehouseBadge.textContent = state.warehouseId;
      } else {
        throw new Error(response?.error || 'Failed to fetch data');
      }
    } catch (error) {
      console.error('[Dashboard] Error fetching data:', error);
      showToast('Error fetching data: ' + error.message, 'error');
    } finally {
      showLoading(false);
    }
  }

  /**
   * Handle search input with autocomplete suggestions
   */
  function handleSearch(e) {
    const query = e.target.value.trim();
    state.searchQuery = query.toLowerCase();

    // Generate and show suggestions
    if (query.length >= 2) {
      const suggestions = generateSearchSuggestions(query);
      showSearchSuggestions(suggestions);
    } else {
      hideSearchSuggestions();
    }

    renderPerformanceTable();
  }

  /**
   * Generate search suggestions from all cached data
   */
  function generateSearchSuggestions(query) {
    const lowerQuery = query.toLowerCase();
    const seen = new Map(); // Track unique employees by ID

    // Search through all cached data
    state.allCachedData.forEach(record => {
      const id = record.employeeId;
      const name = record.employeeName || '';

      // Match on Badge ID, Name, or partial match
      const matches =
        id.toLowerCase().includes(lowerQuery) ||
        name.toLowerCase().includes(lowerQuery);

      if (matches && !seen.has(id)) {
        seen.set(id, {
          id,
          name,
          paths: new Set([record.pathName])
        });
      } else if (matches && seen.has(id)) {
        // Add additional paths
        seen.get(id).paths.add(record.pathName);
      }
    });

    // Convert to array and sort by relevance (exact ID match first)
    const suggestions = Array.from(seen.values())
      .map(emp => ({
        ...emp,
        paths: Array.from(emp.paths).slice(0, 3).join(', ')
      }))
      .sort((a, b) => {
        // Exact ID match first
        if (a.id === query) return -1;
        if (b.id === query) return 1;
        // Then ID starts with query
        if (a.id.startsWith(query) && !b.id.startsWith(query)) return -1;
        if (b.id.startsWith(query) && !a.id.startsWith(query)) return 1;
        // Then alphabetical
        return a.id.localeCompare(b.id);
      })
      .slice(0, 10); // Limit to 10 suggestions

    return suggestions;
  }

  /**
   * Show search suggestions dropdown
   */
  function showSearchSuggestions(suggestions) {
    let dropdown = document.getElementById('searchSuggestions');

    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.id = 'searchSuggestions';
      dropdown.className = 'search-suggestions';
      elements.employeeSearch.parentNode.appendChild(dropdown);
    }

    if (suggestions.length === 0) {
      dropdown.innerHTML = '<div class="suggestion-empty">No matches found</div>';
    } else {
      dropdown.innerHTML = suggestions.map(s => `
        <div class="suggestion-item" data-id="${s.id}">
          <div class="suggestion-main">
            <span class="suggestion-id">${s.id}</span>
            <span class="suggestion-name">${s.name || 'Unknown'}</span>
          </div>
          <div class="suggestion-paths">${s.paths}</div>
        </div>
      `).join('');

      // Add click handlers
      dropdown.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
          const id = item.dataset.id;
          elements.employeeSearch.value = id;
          state.searchQuery = id.toLowerCase();
          hideSearchSuggestions();
          renderPerformanceTable();
        });
      });
    }

    dropdown.style.display = 'block';
    state.showSuggestions = true;
  }

  /**
   * Hide search suggestions dropdown
   */
  function hideSearchSuggestions() {
    const dropdown = document.getElementById('searchSuggestions');
    if (dropdown) {
      dropdown.style.display = 'none';
    }
    state.showSuggestions = false;
  }

  /**
   * Handle add employees
   * NOTE: Employee list is populated from FCLM function rollup data.
   * This function is kept for future use to manually add employees to filter/track.
   */
  function handleAddEmployees() {
    const input = elements.employeeInput.value.trim();
    if (!input) return;

    // Parse input (comma or newline separated)
    const ids = input.split(/[,\n]/)
      .map(id => id.trim())
      .filter(id => id.length > 0);

    // Add new employees
    const existingIds = new Set(state.employees.map(e => e.id));
    let addedCount = 0;

    ids.forEach(id => {
      if (!existingIds.has(id)) {
        state.employees.push({ id, name: id });
        existingIds.add(id);
        addedCount++;
      }
    });

    if (addedCount > 0) {
      showToast(`Added ${addedCount} employee(s). Click "Load Data" to fetch performance.`, 'success');
      elements.employeeInput.value = '';
    } else {
      showToast('All employees already added', 'warning');
    }
  }

  /**
   * Handle sort change
   */
  function handleSortChange(e) {
    state.sortBy = e.target.value;
    renderPerformanceTable();
  }

  /**
   * Handle AA Lookup - finds AA by badge ID, employee ID, or name
   */
  function handleAALookup() {
    const input = elements.aaLookupInput.value.trim();
    if (!input) {
      showToast('Please enter a badge ID, employee ID, or name', 'warning');
      return;
    }

    // Check if data is loaded
    if (state.performanceData.length === 0) {
      showToast('No data loaded. Click "Load Data" first.', 'warning');
      return;
    }

    const searchTerm = input.toLowerCase();
    console.log('[Dashboard] Searching for:', searchTerm, 'in', state.performanceData.length, 'records');

    // Search in loaded performance data - convert IDs to strings for comparison
    const matches = state.performanceData.filter(record => {
      const empId = String(record.employeeId || '').toLowerCase();
      const empName = String(record.employeeName || '').toLowerCase();
      return empId.includes(searchTerm) || empName.includes(searchTerm);
    });

    console.log('[Dashboard] Found matches:', matches.length);

    if (matches.length === 0) {
      // Show what IDs are available for debugging
      const sampleIds = state.performanceData.slice(0, 5).map(r => r.employeeId);
      console.log('[Dashboard] Sample employee IDs in data:', sampleIds);
      showToast(`No AA found matching "${input}". ${state.performanceData.length} records loaded.`, 'error');
      return;
    }

    // Get unique employee ID (may have multiple path records)
    const employeeId = matches[0].employeeId;
    const employeeName = matches[0].employeeName;

    // Store selected AA
    state.selectedAA = {
      id: employeeId,
      name: employeeName,
      records: state.performanceData.filter(r => String(r.employeeId) === String(employeeId))
    };

    // Display details
    displayAADetails(state.selectedAA, state.selectedLookupPath);
    showToast(`Found ${state.selectedAA.records.length} path record(s) for ${employeeName || employeeId}`, 'success');
  }

  /**
   * Calculate performance tier based on JPH percentile
   */
  function calculateTier(percentile) {
    if (percentile >= 95) return { name: 'ELITE', icon: '👑', color: '#ffd700' };
    if (percentile >= 85) return { name: 'STAR', icon: '⭐', color: '#ff9800' };
    if (percentile >= 70) return { name: 'PRO', icon: '🔥', color: '#4caf50' };
    if (percentile >= 50) return { name: 'SOLID', icon: '💪', color: '#2196f3' };
    if (percentile >= 30) return { name: 'DEVELOPING', icon: '📈', color: '#9c27b0' };
    return { name: 'ROOKIE', icon: '🌱', color: '#607d8b' };
  }

  /**
   * Calculate overall rating (0-99) based on performance metrics
   */
  function calculateOverallRating(jph, avgJph, percentile) {
    // Base rating from percentile (40-99 range)
    let rating = 40 + (percentile * 0.59);

    // Bonus for being above average
    if (jph > avgJph && avgJph > 0) {
      const bonus = Math.min(10, ((jph - avgJph) / avgJph) * 20);
      rating += bonus;
    }

    return Math.min(99, Math.max(1, Math.round(rating)));
  }

  /**
   * Display AA details in the detail panel - Game Style
   */
  function displayAADetails(aa, selectedPath) {
    const panel = elements.aaDetailPanel;

    // Show panel
    panel.style.display = 'block';

    // Set AA info
    elements.aaDetailName.textContent = aa.name || aa.id;
    elements.aaDetailId.textContent = `Badge: ${aa.id}`;

    // Filter records by selected path
    let records = aa.records;
    if (selectedPath !== 'all') {
      records = records.filter(r => r.pathId === selectedPath);
    }

    // Get path name - use actual sub-function names if available
    let pathName = 'All Paths';
    if (selectedPath !== 'all') {
      // Get unique sub-function names for this path
      const subFunctionNames = [...new Set(records.map(r => r.pathName).filter(n => n))];
      if (subFunctionNames.length === 1) {
        // Single sub-function - show its name
        pathName = subFunctionNames[0];
      } else if (subFunctionNames.length > 1) {
        // Multiple sub-functions - show parent path with count
        pathName = `${PATH_CONFIG[selectedPath]?.name || selectedPath} (${subFunctionNames.length} sub-functions)`;
      } else {
        // Fallback to parent path name
        pathName = PATH_CONFIG[selectedPath]?.name || selectedPath;
      }
    }
    elements.aaDetailPath.textContent = pathName;

    // Calculate metrics
    if (records.length === 0) {
      // No data for selected path - show empty state
      if (elements.overallRating) {
        elements.overallRating.querySelector('.rating-value').textContent = '--';
      }
      updateComparisonBars(null, selectedPath);
      return;
    }

    const totalHours = records.reduce((sum, r) => sum + (r.hours || 0), 0);
    const totalJobs = records.reduce((sum, r) => sum + (r.jobs || 0), 0);
    const aaJPH = totalHours > 0 ? totalJobs / totalHours : 0;

    // Update game-style stats
    if (elements.statJPH) elements.statJPH.textContent = aaJPH.toFixed(1);
    if (elements.statJobs) elements.statJobs.textContent = totalJobs.toLocaleString();
    if (elements.statHours) elements.statHours.textContent = totalHours.toFixed(1);

    // Update comparison and get path stats
    const pathStats = updateComparisonBars(aa, selectedPath);

    // Calculate efficiency (AA JPH vs path average)
    const efficiency = pathStats && pathStats.avgJPH > 0
      ? Math.round((aaJPH / pathStats.avgJPH) * 100)
      : 100;
    if (elements.statEfficiency) elements.statEfficiency.textContent = efficiency + '%';

    // Calculate percentile and rating
    const percentile = pathStats ? pathStats.percentile : 50;
    const tier = calculateTier(percentile);
    const overallRating = calculateOverallRating(aaJPH, pathStats?.avgJPH || aaJPH, percentile);

    // Update overall rating circle
    if (elements.overallRating) {
      elements.overallRating.querySelector('.rating-value').textContent = overallRating;
    }

    // Update tier badge
    if (elements.tierBadge) {
      elements.tierBadge.querySelector('.tier-icon').textContent = tier.icon;
      elements.tierBadge.querySelector('.tier-name').textContent = tier.name;
      elements.tierBadge.style.background = `linear-gradient(90deg, ${tier.color}33 0%, ${tier.color}11 100%)`;
      elements.tierBadge.querySelector('.tier-name').style.color = tier.color;
    }

    // Update stat bars (normalized to 100)
    const maxJPH = pathStats ? Math.max(aaJPH, pathStats.maxJPH, 100) : 100;
    const maxJobs = pathStats ? pathStats.maxJobs : totalJobs;
    const maxHours = pathStats ? pathStats.maxHours : totalHours;

    if (elements.statBarJPH) elements.statBarJPH.style.width = `${(aaJPH / maxJPH) * 100}%`;
    if (elements.statBarJobs) elements.statBarJobs.style.width = `${(totalJobs / Math.max(maxJobs, 1)) * 100}%`;
    if (elements.statBarHours) elements.statBarHours.style.width = `${(totalHours / Math.max(maxHours, 1)) * 100}%`;
    if (elements.statBarEfficiency) elements.statBarEfficiency.style.width = `${Math.min(efficiency, 150) / 1.5}%`;

    // Update VS comparison section
    if (elements.vsPathName) elements.vsPathName.textContent = pathName;
    if (elements.vsYourJPH) elements.vsYourJPH.textContent = aaJPH.toFixed(1);
    if (elements.vsAvgJPH) elements.vsAvgJPH.textContent = pathStats ? pathStats.avgJPH.toFixed(1) : '--';

    // Update VS result
    if (pathStats && elements.vsDiff) {
      const diff = aaJPH - pathStats.avgJPH;
      elements.vsDiff.textContent = (diff >= 0 ? '+' : '') + diff.toFixed(1);
      elements.vsDiff.className = 'vs-diff ' + (diff >= 0 ? 'positive' : 'negative');
      elements.vsText.textContent = diff >= 0 ? 'above average' : 'below average';
    }

    // Update percentile display
    if (elements.rankPercentile) {
      const percValue = elements.rankPercentile.querySelector('.percentile-value');
      if (percValue) percValue.textContent = `Top ${Math.round(100 - percentile)}%`;
    }

    // Setup sub-path breakdown
    setupSubpathBreakdown(aa, selectedPath, pathStats);

    // Show path history if viewing all paths
    if (selectedPath === 'all' && aa.records.length > 1) {
      elements.pathHistory.style.display = 'block';
      renderPathHistory(aa.records);
    } else {
      elements.pathHistory.style.display = 'none';
    }

    // Scroll to panel
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /**
   * Update comparison bars showing AA vs path average
   * Returns stats for use in game-style display
   */
  function updateComparisonBars(aa, selectedPath) {
    // Get all AAs in the selected path for comparison
    let pathRecords;
    if (selectedPath === 'all') {
      pathRecords = state.performanceData;
    } else {
      pathRecords = state.performanceData.filter(r => r.pathId === selectedPath);
    }

    if (pathRecords.length === 0 || !aa) {
      if (elements.rankNumber) elements.rankNumber.textContent = '--';
      if (elements.rankTotal) elements.rankTotal.textContent = 'of --';
      return null;
    }

    // Calculate path averages using total jobs / total hours
    const uniqueEmployees = new Map();
    let pathTotalJobs = 0;
    let pathTotalHours = 0;
    let maxEmpJobs = 0;
    let maxEmpHours = 0;

    pathRecords.forEach(r => {
      if (!uniqueEmployees.has(r.employeeId)) {
        uniqueEmployees.set(r.employeeId, { jobsSum: 0, hoursSum: 0 });
      }
      const emp = uniqueEmployees.get(r.employeeId);
      if (r.jobs > 0 && r.hours > 0 && r.jobs < 100000) {
        emp.jobsSum += r.jobs;
        emp.hoursSum += r.hours;
        pathTotalJobs += r.jobs;
        pathTotalHours += r.hours;
      }
    });

    // Calculate max values for scaling
    uniqueEmployees.forEach(emp => {
      if (emp.jobsSum > maxEmpJobs) maxEmpJobs = emp.jobsSum;
      if (emp.hoursSum > maxEmpHours) maxEmpHours = emp.hoursSum;
    });

    // Get AA's metrics for selected path
    let aaRecords = aa.records;
    if (selectedPath !== 'all') {
      aaRecords = aaRecords.filter(r => r.pathId === selectedPath);
    }

    const aaJobs = aaRecords.reduce((sum, r) => sum + (r.jobs || 0), 0);
    const aaHours = aaRecords.reduce((sum, r) => sum + (r.hours || 0), 0);
    const aaJPH = aaHours > 0 ? aaJobs / aaHours : 0;

    // Build allJPHs array for ranking
    const allJPHs = [];
    uniqueEmployees.forEach((emp, empId) => {
      if (emp.hoursSum > 0) {
        allJPHs.push({ id: empId, jph: emp.jobsSum / emp.hoursSum });
      }
    });

    // Calculate path average JPH
    const avgJPH = pathTotalHours > 0 ? pathTotalJobs / pathTotalHours : 0;
    const avgHours = uniqueEmployees.size > 0 ? pathTotalHours / uniqueEmployees.size : 0;

    // Get the path name for display
    const pathName = selectedPath === 'all' ? 'all paths' : (PATH_CONFIG[selectedPath]?.name || selectedPath);

    // Calculate ranking by JPH
    allJPHs.sort((a, b) => b.jph - a.jph);
    const rank = allJPHs.findIndex(e => e.id === aa.id) + 1;
    const percentile = rank > 0 ? ((allJPHs.length - rank) / allJPHs.length) * 100 : 0;

    // Find max JPH for scaling
    const maxJPH = allJPHs.length > 0 ? allJPHs[0].jph : aaJPH;

    // Update ranking display
    if (elements.rankNumber) elements.rankNumber.textContent = rank > 0 ? rank : '--';
    if (elements.rankTotal) elements.rankTotal.textContent = allJPHs.length;
    if (elements.rankDescription) elements.rankDescription.textContent = `in ${pathName} by JPH`;

    // Return stats for game-style display
    return {
      avgJPH,
      avgHours,
      maxJPH,
      maxJobs: maxEmpJobs,
      maxHours: maxEmpHours,
      rank,
      total: allJPHs.length,
      percentile,
      pathName,
      allJPHs
    };
  }

  /**
   * Setup sub-path breakdown section
   */
  function setupSubpathBreakdown(aa, selectedPath, pathStats) {
    if (!elements.subpathToggle || !elements.subpathList) return;

    // Get unique sub-paths the AA has worked in
    const subPaths = new Map();
    aa.records.forEach(r => {
      const key = r.pathName || r.pathId;
      if (!subPaths.has(key)) {
        subPaths.set(key, {
          name: r.pathName || r.pathId,
          pathId: r.pathId,
          color: r.pathColor || '#4facfe',
          jobs: 0,
          hours: 0
        });
      }
      const sp = subPaths.get(key);
      sp.jobs += r.jobs || 0;
      sp.hours += r.hours || 0;
    });

    // Update count
    if (elements.subpathCount) {
      elements.subpathCount.textContent = `${subPaths.size} ${subPaths.size === 1 ? 'path' : 'paths'}`;
    }

    // Build sub-path list HTML
    let html = '';
    subPaths.forEach((sp, name) => {
      const jph = sp.hours > 0 ? sp.jobs / sp.hours : 0;

      // Get rank in this specific sub-path
      const subPathRecords = state.performanceData.filter(r => (r.pathName || r.pathId) === name);
      const subPathEmployees = new Map();
      subPathRecords.forEach(r => {
        if (!subPathEmployees.has(r.employeeId)) {
          subPathEmployees.set(r.employeeId, { jobs: 0, hours: 0 });
        }
        const emp = subPathEmployees.get(r.employeeId);
        emp.jobs += r.jobs || 0;
        emp.hours += r.hours || 0;
      });

      const subPathJPHs = [];
      subPathEmployees.forEach((emp, id) => {
        if (emp.hours > 0) {
          subPathJPHs.push({ id, jph: emp.jobs / emp.hours });
        }
      });
      subPathJPHs.sort((a, b) => b.jph - a.jph);
      const subRank = subPathJPHs.findIndex(e => e.id === aa.id) + 1;

      // Calculate sub-path average
      let subAvgJPH = 0;
      if (subPathJPHs.length > 0) {
        subAvgJPH = subPathJPHs.reduce((sum, e) => sum + e.jph, 0) / subPathJPHs.length;
      }

      html += `
        <div class="subpath-item" style="border-left-color: ${sp.color}">
          <span class="subpath-name">${name}</span>
          <div class="subpath-stats">
            <div class="subpath-stat">
              <span class="subpath-stat-value">${jph.toFixed(1)}</span>
              <span class="subpath-stat-label">JPH</span>
            </div>
            <div class="subpath-stat">
              <span class="subpath-stat-value">${sp.hours.toFixed(1)}h</span>
              <span class="subpath-stat-label">Hours</span>
            </div>
            <div class="subpath-stat">
              <span class="subpath-stat-value">${subAvgJPH.toFixed(1)}</span>
              <span class="subpath-stat-label">Avg</span>
            </div>
          </div>
          ${subRank > 0 ? `<span class="subpath-rank">#${subRank} of ${subPathJPHs.length}</span>` : ''}
        </div>
      `;
    });

    elements.subpathList.innerHTML = html;

    // Toggle functionality
    elements.subpathToggle.onclick = () => {
      const isExpanded = elements.subpathDetails.style.display !== 'none';
      elements.subpathDetails.style.display = isExpanded ? 'none' : 'block';
      elements.subpathToggle.classList.toggle('expanded', !isExpanded);
    };
  }

  /**
   * Render path history table for AA
   */
  function renderPathHistory(records) {
    // Group by path
    const pathGroups = {};
    records.forEach(r => {
      if (!pathGroups[r.pathId]) {
        pathGroups[r.pathId] = {
          pathId: r.pathId,
          pathName: r.pathName,
          pathColor: r.pathColor,
          records: []
        };
      }
      pathGroups[r.pathId].records.push(r);
    });

    // Render
    elements.pathHistoryTable.innerHTML = Object.values(pathGroups).map(group => {
      const totalHours = group.records.reduce((sum, r) => sum + (r.hours || 0), 0);
      const totalJobs = group.records.reduce((sum, r) => sum + (r.jobs || 0), 0);
      const avgJPH = group.records.filter(r => r.jph > 0).length > 0
        ? group.records.filter(r => r.jph > 0).reduce((sum, r) => sum + r.jph, 0) / group.records.filter(r => r.jph > 0).length
        : 0;

      return `
        <div class="path-history-row">
          <span class="path-name" style="color: ${group.pathColor}">${group.pathName}</span>
          <div class="path-stats">
            <div class="stat">
              <span class="stat-value">${group.records.length}</span>
              <span class="stat-label">Sessions</span>
            </div>
            <div class="stat">
              <span class="stat-value">${totalHours.toFixed(1)}h</span>
              <span class="stat-label">Hours</span>
            </div>
            <div class="stat">
              <span class="stat-value">${totalJobs.toLocaleString()}</span>
              <span class="stat-label">Jobs</span>
            </div>
            <div class="stat">
              <span class="stat-value">${avgJPH.toFixed(1)}</span>
              <span class="stat-label">Avg JPH</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Close AA detail panel
   */
  function closeAADetailPanel() {
    elements.aaDetailPanel.style.display = 'none';
    state.selectedAA = null;
  }

  /**
   * Handle CSV export
   */
  function handleExportCsv() {
    if (state.performanceData.length === 0) {
      showToast('No data to export', 'warning');
      return;
    }

    const headers = ['Employee ID', 'Employee Name', 'Path', 'Hours', 'Units', 'Rate (UPH)', 'Goal', '% to Goal', 'Status'];
    const rows = state.performanceData.map(row => [
      row.employeeId,
      row.employeeName,
      row.pathName,
      row.hours,
      row.units,
      row.rate,
      row.goal,
      row.percentToGoal + '%',
      row.status
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `performance_${state.warehouseId}_${state.dateRange.startDate}_${state.dateRange.endDate}.csv`;
    a.click();

    URL.revokeObjectURL(url);
    showToast('CSV exported', 'success');
  }

  /**
   * Render all components
   */
  function renderAll() {
    renderSummary();
    renderPerformanceTable();
    renderPathCards();
  }

  /**
   * Render summary cards
   */
  function renderSummary() {
    const uniqueEmployees = new Set(state.performanceData.map(d => d.employeeId));
    const meetingGoal = state.performanceData.filter(d => d.status === 'good').length;
    const belowGoal = state.performanceData.filter(d => d.status === 'poor').length;
    const activePaths = new Set(state.performanceData.map(d => d.pathId)).size;

    elements.totalEmployees.textContent = uniqueEmployees.size;
    elements.meetingGoal.textContent = meetingGoal;
    elements.belowGoal.textContent = belowGoal;
    elements.totalPaths.textContent = activePaths;
  }

  /**
   * Render performance table
   */
  /**
   * Sanitize employee name - remove dropdown/menu content if present
   */
  function sanitizeEmployeeName(name, employeeId) {
    if (!name || name === employeeId) return null;

    // If name is too long, it probably contains dropdown content
    if (name.length > 50) return null;

    // If name contains typical dropdown keywords, skip it
    const dropdownKeywords = ['Default Menu', 'Home Area', 'Settings', '(None)', 'C-Returns', 'V-Returns'];
    if (dropdownKeywords.some(keyword => name.includes(keyword))) {
      return null;
    }

    return name;
  }

  /**
   * Render performance table
   */
  function renderPerformanceTable() {
    let data = [...state.performanceData];

    // Filter by path
    if (state.activePath !== 'all') {
      data = data.filter(d => d.pathId === state.activePath);
    }

    // Filter by search
    if (state.searchQuery) {
      data = data.filter(d =>
        d.employeeId.toLowerCase().includes(state.searchQuery) ||
        d.employeeName.toLowerCase().includes(state.searchQuery)
      );
    }

    // Sort
    switch (state.sortBy) {
      case 'employee':
        data.sort((a, b) => a.employeeId.localeCompare(b.employeeId));
        break;
      case 'path':
        data.sort((a, b) => a.pathName.localeCompare(b.pathName));
        break;
      case 'rate':
        data.sort((a, b) => (b.jph || 0) - (a.jph || 0));
        break;
      case 'hours':
        data.sort((a, b) => b.hours - a.hours);
        break;
    }

    // Render
    if (data.length === 0) {
      elements.performanceBody.innerHTML = `
        <tr class="empty-state">
          <td colspan="9">
            <div class="empty-message">
              <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor" opacity="0.3">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
              </svg>
              <p>${state.searchQuery ? 'No matching results' : 'No performance data loaded'}</p>
              <p class="hint">${state.searchQuery ? 'Try a different search term' : 'Add employees above or click "AA Performance" on FCLM to load data'}</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    elements.performanceBody.innerHTML = data.map(row => {
      // Sanitize employee name to avoid displaying dropdown content
      const cleanName = sanitizeEmployeeName(row.employeeName, row.employeeId);
      const hasGoal = row.goal && row.percentToGoal !== null;

      return `
        <tr>
          <td>
            <strong>${row.employeeId}</strong>
            ${cleanName ? `<br><small style="color: var(--text-secondary)">${cleanName}</small>` : ''}
          </td>
          <td>
            <span style="color: ${row.pathColor}; font-weight: 500;">${row.pathName}</span>
          </td>
          <td>${row.hours}h</td>
          <td>${row.jobs ? row.jobs.toLocaleString() : '-'}</td>
          <td><strong>${row.jph || '-'}</strong></td>
          <td>${row.goal || 'N/A'}</td>
          <td>
            ${hasGoal ? `
              <div style="display: flex; align-items: center; gap: 8px;">
                <div class="progress-bar">
                  <div class="progress-fill ${row.status}" style="width: ${Math.min(row.percentToGoal, 100)}%"></div>
                </div>
                <span>${row.percentToGoal}%</span>
              </div>
            ` : '<span style="color: var(--text-secondary)">-</span>'}
          </td>
          <td>
            ${hasGoal ? `
              <span class="status-badge ${row.status}">
                ${row.status === 'good' ? 'Meeting' : row.status === 'warning' ? 'Near' : 'Below'}
              </span>
            ` : '<span class="status-badge neutral">N/A</span>'}
          </td>
          <td>
            <button class="action-btn view-details-btn" title="View details" data-employee-id="${row.employeeId}" data-path-id="${row.pathId}">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
              </svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Add event listeners for view details buttons
    elements.performanceBody.querySelectorAll('.view-details-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const employeeId = btn.dataset.employeeId;
        const pathId = btn.dataset.pathId;
        if (window.viewDetails) {
          window.viewDetails(employeeId, pathId);
        }
      });
    });
  }

  /**
   * Render path summary cards
   */
  function renderPathCards() {
    const pathSummary = {};

    state.performanceData.forEach(row => {
      if (!pathSummary[row.pathId]) {
        pathSummary[row.pathId] = {
          name: row.pathName,
          color: row.pathColor,
          goal: row.goal,
          employees: new Set(),
          totalHours: 0,
          totalJobs: 0,
          jphValues: []
        };
      }

      const summary = pathSummary[row.pathId];
      summary.employees.add(row.employeeId);
      summary.totalHours += row.hours || 0;
      summary.totalJobs += row.jobs || 0;
      if (row.jph) summary.jphValues.push(row.jph);
    });

    if (Object.keys(pathSummary).length === 0) {
      elements.pathCards.innerHTML = '<p style="color: var(--text-secondary)">No path data available</p>';
      return;
    }

    elements.pathCards.innerHTML = Object.entries(pathSummary).map(([pathId, summary]) => {
      const avgJph = summary.jphValues.length > 0
        ? Math.round(summary.jphValues.reduce((a, b) => a + b, 0) / summary.jphValues.length * 10) / 10
        : 0;

      return `
        <div class="path-card" style="border-left-color: ${summary.color}">
          <div class="path-card-header">
            <span class="path-name" style="color: ${summary.color}">${summary.name}</span>
            <span class="path-count">${summary.employees.size} AA(s)</span>
          </div>
          <div class="path-stats">
            <div class="path-stat">
              <div class="path-stat-value">${Math.round(summary.totalHours * 10) / 10}h</div>
              <div class="path-stat-label">Total Hours</div>
            </div>
            <div class="path-stat">
              <div class="path-stat-value">${summary.totalJobs.toLocaleString()}</div>
              <div class="path-stat-label">Total Jobs</div>
            </div>
            <div class="path-stat">
              <div class="path-stat-value">${avgJph}</div>
              <div class="path-stat-label">Avg JPH</div>
            </div>
            <div class="path-stat">
              <div class="path-stat-value">${summary.goal || 'N/A'}</div>
              <div class="path-stat-label">Goal</div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Show/hide loading overlay
   */
  function showLoading(show) {
    elements.loadingOverlay.classList.toggle('visible', show);
  }

  /**
   * Show toast notification
   */
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  // Global function for view details action
  window.viewDetails = function(employeeId, pathId) {
    showToast(`Viewing details for ${employeeId} on ${PATH_CONFIG[pathId]?.name || pathId}`, 'info');
    // In a real implementation, this would open a detailed view or modal
  };

  // Initialize on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
