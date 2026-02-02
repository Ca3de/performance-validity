/**
 * AA Performance Validity - Dashboard Script
 */

(function() {
  'use strict';

  // State
  const state = {
    warehouseId: 'UNKNOWN',
    employees: [],
    performanceData: [],
    period: 'today',
    dateRange: {
      startDate: null,
      endDate: null
    },
    paths: [],
    activePath: 'all',
    searchQuery: '',
    sortBy: 'employee',
    fclmTabId: null,
    // AA Lookup state
    selectedAA: null,
    selectedLookupPath: 'all'
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
    // Metrics
    metricJPH: document.getElementById('metricJPH'),
    metricAvgJPH: document.getElementById('metricAvgJPH'),
    metricHours: document.getElementById('metricHours'),
    metricAvgHours: document.getElementById('metricAvgHours'),
    metricSessions: document.getElementById('metricSessions'),
    metricJobs: document.getElementById('metricJobs'),
    // Comparison
    compBarAAJPH: document.getElementById('compBarAAJPH'),
    compBarAvgJPH: document.getElementById('compBarAvgJPH'),
    compValAAJPH: document.getElementById('compValAAJPH'),
    compValAvgJPH: document.getElementById('compValAvgJPH'),
    compBarAAHours: document.getElementById('compBarAAHours'),
    compBarAvgHours: document.getElementById('compBarAvgHours'),
    compValAAHours: document.getElementById('compValAAHours'),
    compValAvgHours: document.getElementById('compValAvgHours'),
    rankNumber: document.getElementById('rankNumber'),
    rankTotal: document.getElementById('rankTotal'),
    rankDescription: document.getElementById('rankDescription'),
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
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    // Default custom dates (in case user switches to custom)
    state.dateRange.startDate = formatDate(weekAgo);
    state.dateRange.endDate = formatDate(today);

    elements.startDate.value = state.dateRange.startDate;
    elements.endDate.value = state.dateRange.endDate;

    // Default period is "today" (current shift)
    state.period = 'today';
    elements.periodSelect.value = 'today';
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
   * Load initial data from storage (passed from FCLM)
   * Uses REAL performance data fetched from FCLM, not sample data
   */
  async function loadInitialData() {
    try {
      const storage = await browser.storage.local.get('dashboardData');
      const data = storage.dashboardData;

      if (data) {
        console.log('[Dashboard] Loaded initial data:', data);

        state.warehouseId = data.warehouseId || 'UNKNOWN';
        state.employees = data.employees || [];
        state.paths = data.paths || [];

        if (data.dateRange) {
          state.dateRange = data.dateRange;

          // Update period selector if period was saved
          if (data.dateRange.period) {
            state.period = data.dateRange.period;
            elements.periodSelect.value = data.dateRange.period;

            if (data.dateRange.period === 'custom') {
              elements.customDateRange.style.display = 'flex';
              elements.startDate.value = data.dateRange.startDate;
              elements.endDate.value = data.dateRange.endDate;
            }
          }
        }

        // Update UI
        elements.warehouseBadge.textContent = state.warehouseId;

        // Use REAL performance data from FCLM (not sample data!)
        if (data.performanceData && data.performanceData.length > 0) {
          console.log('[Dashboard] Using REAL performance data:', data.performanceData.length, 'records');
          processRealPerformanceData(data.performanceData);
        } else if (state.employees.length > 0) {
          // No pre-fetched data - show empty state
          console.log('[Dashboard] No performance data available');
          state.performanceData = [];
          renderAll();
        }

        // Clear the stored data
        browser.storage.local.remove('dashboardData');
      }
    } catch (error) {
      console.error('[Dashboard] Error loading initial data:', error);
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
        pathName: pathConfig.name || record.pathName || record.pathId,
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

    await fetchDataFromFCLM();
  }

  /**
   * Handle refresh button
   */
  async function handleRefresh() {
    await fetchDataFromFCLM();
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
   * Handle search input
   */
  function handleSearch(e) {
    state.searchQuery = e.target.value.toLowerCase();
    renderPerformanceTable();
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
   * Display AA details in the detail panel
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

    // Update path display
    if (selectedPath === 'all') {
      elements.aaDetailPath.textContent = `All Paths (${aa.records.length} total)`;
    } else {
      const pathConfig = PATH_CONFIG[selectedPath];
      elements.aaDetailPath.textContent = pathConfig ? pathConfig.name : selectedPath;
      elements.aaDetailPath.style.color = pathConfig ? pathConfig.color : 'inherit';
    }

    // Calculate metrics
    if (records.length === 0) {
      // No data for selected path
      elements.metricJPH.textContent = '--';
      elements.metricAvgJPH.textContent = '--';
      elements.metricHours.textContent = '--';
      elements.metricAvgHours.textContent = '--';
      elements.metricSessions.textContent = '0';
      elements.metricJobs.textContent = '--';
      updateComparisonBars(null, selectedPath);
      return;
    }

    const totalHours = records.reduce((sum, r) => sum + (r.hours || 0), 0);
    const totalJobs = records.reduce((sum, r) => sum + (r.jobs || 0), 0);
    // Calculate true average JPH as total jobs / total hours (not average of per-path JPH values)
    const avgJPH = totalHours > 0 ? totalJobs / totalHours : 0;
    const currentJPH = records.length > 0 ? records[0].jph : 0;
    const avgHoursPerSession = totalHours / records.length;

    // Update metrics display
    elements.metricJPH.textContent = currentJPH.toFixed(1);
    elements.metricAvgJPH.textContent = avgJPH.toFixed(1);
    elements.metricHours.textContent = totalHours.toFixed(1) + 'h';
    elements.metricAvgHours.textContent = avgHoursPerSession.toFixed(1) + 'h';
    elements.metricSessions.textContent = records.length;
    elements.metricJobs.textContent = totalJobs.toLocaleString();

    // Update comparison bars
    updateComparisonBars(aa, selectedPath);

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
      elements.compBarAAJPH.style.width = '0%';
      elements.compBarAvgJPH.style.width = '0%';
      elements.compValAAJPH.textContent = '--';
      elements.compValAvgJPH.textContent = '--';
      elements.compBarAAHours.style.width = '0%';
      elements.compBarAvgHours.style.width = '0%';
      elements.compValAAHours.textContent = '--';
      elements.compValAvgHours.textContent = '--';
      elements.rankNumber.textContent = '#--';
      elements.rankTotal.textContent = 'of --';
      return;
    }

    // Calculate path averages using total jobs / total hours (more accurate than averaging JPH values)
    const uniqueEmployees = new Map();
    let pathTotalJobs = 0;
    let pathTotalHours = 0;

    pathRecords.forEach(r => {
      if (!uniqueEmployees.has(r.employeeId)) {
        uniqueEmployees.set(r.employeeId, { jobsSum: 0, hoursSum: 0 });
      }
      const emp = uniqueEmployees.get(r.employeeId);
      // Count all records with valid jobs and hours data
      // Sanity check: skip records where jobs seems unreasonably high (likely parsing error)
      if (r.jobs > 0 && r.hours > 0 && r.jobs < 100000) {
        emp.jobsSum += r.jobs;
        emp.hoursSum += r.hours;
        pathTotalJobs += r.jobs;
        pathTotalHours += r.hours;
      } else if (r.jobs >= 100000) {
        console.warn('[Dashboard] Skipping record with suspicious jobs count:', r);
      }
    });

    // Get AA's metrics for selected path
    let aaRecords = aa.records;
    if (selectedPath !== 'all') {
      aaRecords = aaRecords.filter(r => r.pathId === selectedPath);
    }

    const aaJobs = aaRecords.reduce((sum, r) => sum + (r.jobs || 0), 0);
    const aaHours = aaRecords.reduce((sum, r) => sum + (r.hours || 0), 0);
    const aaJPH = aaHours > 0 ? aaJobs / aaHours : 0;

    // Build allJPHs array for ranking - calculate each employee's JPH from their totals
    const allJPHs = [];
    uniqueEmployees.forEach((emp, empId) => {
      if (emp.hoursSum > 0) {
        allJPHs.push({ id: empId, jph: emp.jobsSum / emp.hoursSum });
      }
    });

    // Calculate path average JPH as total jobs / total hours
    const avgJPH = pathTotalHours > 0 ? pathTotalJobs / pathTotalHours : 0;
    const avgHours = uniqueEmployees.size > 0 ? pathTotalHours / uniqueEmployees.size : 0;

    // Get the path name for display
    const pathName = selectedPath === 'all' ? 'all paths' : (PATH_CONFIG[selectedPath]?.name || selectedPath);

    // Calculate max for scaling bars
    const maxJPH = Math.max(aaJPH, avgJPH, 1);
    const maxHours = Math.max(aaHours, avgHours, 1);

    // Update JPH bars
    elements.compBarAAJPH.style.width = `${(aaJPH / maxJPH) * 100}%`;
    elements.compBarAvgJPH.style.width = `${(avgJPH / maxJPH) * 100}%`;
    elements.compValAAJPH.textContent = aaJPH.toFixed(1);
    elements.compValAvgJPH.textContent = avgJPH.toFixed(1) + ' avg';

    // Update Hours bars
    elements.compBarAAHours.style.width = `${(aaHours / maxHours) * 100}%`;
    elements.compBarAvgHours.style.width = `${(avgHours / maxHours) * 100}%`;
    elements.compValAAHours.textContent = aaHours.toFixed(1) + 'h';
    elements.compValAvgHours.textContent = avgHours.toFixed(1) + 'h avg';

    // Calculate ranking by JPH
    allJPHs.sort((a, b) => b.jph - a.jph);
    const rank = allJPHs.findIndex(e => e.id === aa.id) + 1;
    elements.rankNumber.textContent = rank > 0 ? `#${rank}` : '#--';
    elements.rankTotal.textContent = `of ${allJPHs.length}`;
    elements.rankDescription.textContent = `in ${pathName} by JPH`;
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
            <button class="action-btn" title="View details" onclick="viewDetails('${row.employeeId}', '${row.pathId}')">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
              </svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');
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
