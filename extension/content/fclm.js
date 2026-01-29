/**
 * AA Performance Validity - FCLM Content Script
 * Injects performance check button and fetches data from FCLM portal
 */

(function() {
  'use strict';

  const DEBUG = true;

  function log(...args) {
    if (DEBUG) {
      console.log(`[Performance Validity ${new Date().toLocaleTimeString()}]`, ...args);
    }
  }

  // Configuration
  const CONFIG = {
    warehouseId: null,
    dateRangeDays: 30
  };

  // Process IDs for FCLM function rollup reports
  const PROCESS_IDS = {
    // Parent processes (for processPathRollup)
    PICK: '1003034',           // V-Returns Pick
    PACK: '1003056',           // V-Returns Pack
    STOW: '1003055',           // C-Returns Stow
    SUPPORT_C: '1003058',      // C-Returns Support
    SUPPORT_V: '1003059',      // V-Returns Support

    // Pick sub-functions
    PICK_LTL: '4300016820',           // FRACS LTL Pick
    PICK_MULTIS: '4300016819',        // FRACS Multis Pick
    PICK_SINGLES: '4300016818',       // FRACS Singles Pick
    PICK_LIQUIDATIONS: '4300016833',  // Liquidations Pick
    PICK_WHD: '4300034941',           // WHD Pick to Sp00

    // Pack sub-functions
    PACK_FRACS_LTL: '4300016814',     // Pack FracsLTL
    PACK_SINGLES: '4300006717',       // Pack Singles
    PACKING: '4300000130',            // Packing
    PACK_ILS: '1626474008030',        // V-Returns PacknHold (ILS)

    // Stow sub-functions
    STOW_C_RETURNS: '4300006823'      // Stow C Returns
  };

  // Path configuration with process IDs and display info
  const PATHS = [
    // Pick paths
    { id: 'pick_multis', name: 'FRACS Multis Pick', processId: PROCESS_IDS.PICK_MULTIS, category: 'Pick', color: '#4CAF50' },
    { id: 'pick_singles', name: 'FRACS Singles Pick', processId: PROCESS_IDS.PICK_SINGLES, category: 'Pick', color: '#8BC34A' },
    { id: 'pick_ltl', name: 'FRACS LTL Pick', processId: PROCESS_IDS.PICK_LTL, category: 'Pick', color: '#CDDC39' },
    { id: 'pick_liquidations', name: 'Liquidations Pick', processId: PROCESS_IDS.PICK_LIQUIDATIONS, category: 'Pick', color: '#FFC107' },
    { id: 'pick_whd', name: 'WHD Pick to Sp00', processId: PROCESS_IDS.PICK_WHD, category: 'Pick', color: '#FF9800' },

    // Pack paths
    { id: 'pack_ils', name: 'V-Returns PacknHold (ILS)', processId: PROCESS_IDS.PACK_ILS, category: 'Pack', color: '#2196F3' },
    { id: 'packing', name: 'Packing', processId: PROCESS_IDS.PACKING, category: 'Pack', color: '#03A9F4' },
    { id: 'pack_singles', name: 'Pack Singles', processId: PROCESS_IDS.PACK_SINGLES, category: 'Pack', color: '#00BCD4' },
    { id: 'pack_fracs_ltl', name: 'Pack FracsLTL', processId: PROCESS_IDS.PACK_FRACS_LTL, category: 'Pack', color: '#009688' },

    // Stow paths
    { id: 'stow_c_returns', name: 'Stow C Returns', processId: PROCESS_IDS.STOW_C_RETURNS, category: 'Stow', color: '#9C27B0' },

    // Support paths
    { id: 'support_c', name: 'C-Returns Support', processId: PROCESS_IDS.SUPPORT_C, category: 'Support', color: '#607D8B' },
    { id: 'support_v', name: 'V-Returns Support', processId: PROCESS_IDS.SUPPORT_V, category: 'Support', color: '#795548' }
  ];

  // Map time detail titles to path IDs
  const TIME_DETAIL_MAP = {
    'V-Returns Pick♦FRACS Multis Pick': 'pick_multis',
    'V-Returns Pick♦FRACS Singles Pick': 'pick_singles',
    'V-Returns Pick♦FRACS LTL Pick': 'pick_ltl',
    'V-Returns Pick♦Liquidations Pick': 'pick_liquidations',
    'V-Returns Pick♦WHD Pick to Sp00': 'pick_whd',
    'V-Returns Pack♦V-Returns PacknHold': 'pack_ils',
    'V-Returns Pack♦Packing': 'packing',
    'V-Returns Pack♦Pack Singles': 'pack_singles',
    'V-Returns Pack♦Pack FracsLTL': 'pack_fracs_ltl',
    'C-Returns Stow♦Stow C Returns': 'stow_c_returns',
    'C-Returns Support♦C-Returns_EndofLine': 'support_c',
    'V-Returns Support♦V-Returns Support': 'support_v'
  };

  /**
   * Extract warehouse ID from URL or page
   */
  function getWarehouseId() {
    const url = window.location.href;

    // Try URL parameter
    const urlMatch = url.match(/[?&]warehouseId=([A-Z0-9]+)/i);
    if (urlMatch) {
      return urlMatch[1].toUpperCase();
    }

    // Try to find in page selectors
    const warehouseSelect = document.querySelector('select[name="warehouseId"], #warehouseId');
    if (warehouseSelect && warehouseSelect.value) {
      return warehouseSelect.value.toUpperCase();
    }

    // Try to find in page text
    const pageText = document.body?.innerText || '';
    const fcMatch = pageText.match(/\b([A-Z]{3}\d{1,2})\b/);
    if (fcMatch) {
      return fcMatch[1];
    }

    return 'UNKNOWN';
  }

  /**
   * Format date for FCLM URL (YYYY/MM/DD)
   */
  function formatDateForURL(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  }

  /**
   * Format date for ISO (YYYY-MM-DDTHH:MM:SS.000)
   */
  function formatDateISO(date, hour = 0, minute = 0) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const h = String(hour).padStart(2, '0');
    const m = String(minute).padStart(2, '0');
    return `${year}-${month}-${day}T${h}:${m}:00.000`;
  }

  /**
   * Get shift date range (typically 18:00 - 06:00 for night shift)
   */
  function getShiftDateRange() {
    const now = new Date();
    const hour = now.getHours();

    let startDate, endDate, startHour, endHour;

    if (hour >= 18) {
      // After 6 PM - shift started today, ends tomorrow
      startDate = new Date(now);
      endDate = new Date(now);
      endDate.setDate(endDate.getDate() + 1);
      startHour = 18;
      endHour = 6;
    } else if (hour < 6) {
      // Before 6 AM - shift started yesterday
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 1);
      endDate = new Date(now);
      startHour = 18;
      endHour = 6;
    } else {
      // Day shift (6 AM - 6 PM) - use previous night
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 1);
      endDate = new Date(now);
      startHour = 18;
      endHour = 6;
    }

    return { startDate, endDate, startHour, endHour };
  }

  /**
   * Fetch employee time details from FCLM
   */
  async function fetchEmployeeTimeDetails(employeeId, spanType = 'Intraday', customRange = null) {
    const warehouseId = CONFIG.warehouseId || getWarehouseId();
    const shift = customRange || getShiftDateRange();

    const url = new URL('https://fclm-portal.amazon.com/employee/timeDetails');
    url.searchParams.set('employeeId', employeeId);
    url.searchParams.set('warehouseId', warehouseId);
    url.searchParams.set('startDateDay', formatDateForURL(shift.startDate));
    url.searchParams.set('maxIntradayDays', '1');
    url.searchParams.set('spanType', spanType);
    url.searchParams.set('startDateIntraday', formatDateForURL(shift.startDate));
    url.searchParams.set('startHourIntraday', String(shift.startHour));
    url.searchParams.set('startMinuteIntraday', '0');
    url.searchParams.set('endDateIntraday', formatDateForURL(shift.endDate));
    url.searchParams.set('endHourIntraday', String(shift.endHour));
    url.searchParams.set('endMinuteIntraday', '0');

    log('Fetching time details:', url.toString());

    try {
      const response = await fetch(url.toString(), { credentials: 'include' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const html = await response.text();
      return parseTimeDetailsHTML(html);
    } catch (error) {
      log('Error fetching time details:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Parse time details HTML - extracts work sessions by path
   */
  function parseTimeDetailsHTML(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const sessions = [];
    const pathSummary = {};

    // Find all table rows
    const rows = doc.querySelectorAll('table tr');

    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 4) return;

      const title = cells[0]?.textContent?.trim() || '';
      const start = cells[1]?.textContent?.trim() || '';
      const end = cells[2]?.textContent?.trim() || '';
      const duration = cells[3]?.textContent?.trim() || '';

      // Skip clock entries
      if (title.includes('Clock') || title.includes('Paid') || title.includes('UnPaid')) {
        return;
      }

      // Parse duration (MM:SS format)
      let durationMinutes = 0;
      const durationMatch = duration.match(/(\d+):(\d+)/);
      if (durationMatch) {
        durationMinutes = parseInt(durationMatch[1]) + parseInt(durationMatch[2]) / 60;
      }

      // Map title to path
      const pathId = TIME_DETAIL_MAP[title] || findPathFromTitle(title);

      if (title && durationMinutes > 0) {
        sessions.push({
          title,
          pathId,
          start,
          end,
          duration,
          durationMinutes
        });

        // Aggregate by path
        if (pathId) {
          if (!pathSummary[pathId]) {
            pathSummary[pathId] = { totalMinutes: 0, sessions: 0 };
          }
          pathSummary[pathId].totalMinutes += durationMinutes;
          pathSummary[pathId].sessions += 1;
        }
      }
    });

    log(`Parsed ${sessions.length} sessions across ${Object.keys(pathSummary).length} paths`);
    return { success: true, sessions, pathSummary };
  }

  /**
   * Try to find path from title using partial matching
   */
  function findPathFromTitle(title) {
    const lowerTitle = title.toLowerCase();

    if (lowerTitle.includes('multis pick')) return 'pick_multis';
    if (lowerTitle.includes('singles pick')) return 'pick_singles';
    if (lowerTitle.includes('ltl pick')) return 'pick_ltl';
    if (lowerTitle.includes('liquidation')) return 'pick_liquidations';
    if (lowerTitle.includes('whd pick')) return 'pick_whd';
    if (lowerTitle.includes('packnhold') || lowerTitle.includes('ils')) return 'pack_ils';
    if (lowerTitle.includes('packing')) return 'packing';
    if (lowerTitle.includes('pack singles')) return 'pack_singles';
    if (lowerTitle.includes('pack fracs')) return 'pack_fracs_ltl';
    if (lowerTitle.includes('stow')) return 'stow_c_returns';
    if (lowerTitle.includes('c-returns support') || lowerTitle.includes('endofline')) return 'support_c';
    if (lowerTitle.includes('v-returns support')) return 'support_v';

    return null;
  }

  /**
   * Fetch function rollup report for a specific process
   * URL format: /reports/functionRollup?reportFormat=HTML&warehouseId=IND8&processId=1003034
   *   &startDateWeek=2026/01/25&maxIntradayDays=1&spanType=Intraday
   *   &startDateIntraday=2026/01/28&startHourIntraday=18&startMinuteIntraday=0
   *   &endDateIntraday=2026/01/29&endHourIntraday=6&endMinuteIntraday=0
   */
  async function fetchFunctionRollup(processId, spanType = 'Intraday', customRange = null) {
    const warehouseId = CONFIG.warehouseId || getWarehouseId();
    const shift = customRange || getShiftDateRange();

    // Calculate week start date (Sunday of the week)
    const weekStart = new Date(shift.startDate);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    const url = new URL('https://fclm-portal.amazon.com/reports/functionRollup');
    url.searchParams.set('reportFormat', 'HTML');
    url.searchParams.set('warehouseId', warehouseId);
    url.searchParams.set('processId', processId);
    url.searchParams.set('startDateWeek', formatDateForURL(weekStart));
    url.searchParams.set('maxIntradayDays', '1');
    url.searchParams.set('spanType', spanType);
    url.searchParams.set('startDateIntraday', formatDateForURL(shift.startDate));
    url.searchParams.set('startHourIntraday', String(shift.startHour));
    url.searchParams.set('startMinuteIntraday', '0');
    url.searchParams.set('endDateIntraday', formatDateForURL(shift.endDate));
    url.searchParams.set('endHourIntraday', String(shift.endHour));
    url.searchParams.set('endMinuteIntraday', '0');

    log('Fetching function rollup:', url.toString());

    try {
      const response = await fetch(url.toString(), { credentials: 'include' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const html = await response.text();
      return parseFunctionRollupHTML(html, processId);
    } catch (error) {
      log('Error fetching function rollup:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Parse function rollup HTML to extract employee performance data
   */
  function parseFunctionRollupHTML(html, processId) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const employees = [];
    const functions = [];

    // Find all tables with employee data
    const tables = doc.querySelectorAll('table');

    tables.forEach(table => {
      // Check if this is an employee data table
      const headerRow = table.querySelector('tr');
      if (!headerRow) return;

      const headers = Array.from(headerRow.querySelectorAll('th, td')).map(h => h.textContent.trim().toLowerCase());

      // Look for tables with ID/Name columns
      const idIndex = headers.findIndex(h => h === 'id');
      const nameIndex = headers.findIndex(h => h === 'name');
      const managerIndex = headers.findIndex(h => h === 'manager');
      const totalHoursIndex = headers.findIndex(h => h.includes('total') && headers.indexOf(h) < 10);
      const jobsIndex = headers.findIndex(h => h === 'jobs');
      const jphIndex = headers.findIndex(h => h === 'jph');

      // Find EACH-Total columns
      const unitTotalIndex = headers.findIndex((h, i) => h === 'unit' && headers[i - 1]?.includes('total'));
      const uphTotalIndex = headers.findIndex((h, i) => h === 'uph' && headers[i - 1] === 'unit');

      if (idIndex === -1 && nameIndex === -1) return;

      // Parse data rows
      const rows = table.querySelectorAll('tr');
      rows.forEach((row, rowIndex) => {
        if (rowIndex === 0) return; // Skip header

        const cells = row.querySelectorAll('td');
        if (cells.length < 5) return;

        const cellTexts = Array.from(cells).map(c => c.textContent.trim());

        // Skip total/summary rows
        if (cellTexts[0]?.toLowerCase() === 'total' || cellTexts[1]?.toLowerCase() === 'total') return;

        // Extract employee data
        const type = cellTexts[0] || '';
        const id = cellTexts[idIndex] || cellTexts[1] || '';
        const name = cellTexts[nameIndex] || cellTexts[2] || '';
        const manager = managerIndex >= 0 ? cellTexts[managerIndex] : '';

        // Find total hours (usually after manager column)
        let totalHours = 0;
        for (let i = 4; i < Math.min(10, cellTexts.length); i++) {
          const val = parseFloat(cellTexts[i]);
          if (!isNaN(val) && val > 0 && val < 24) {
            totalHours = val;
            break;
          }
        }

        // Find Jobs, JPH, Units, UPH from later columns
        let jobs = 0, jph = 0, units = 0, uph = 0;
        for (let i = 5; i < cellTexts.length; i++) {
          const val = parseFloat(cellTexts[i]);
          if (isNaN(val)) continue;

          // Try to identify columns by position or value range
          if (val > 50 && val < 5000 && jobs === 0) jobs = val;
          else if (val > 20 && val < 300 && jph === 0) jph = val;
          else if (val > 10 && val < 10000 && units === 0) units = val;
          else if (val > 20 && val < 500 && uph === 0) uph = val;
        }

        // Only add if we have valid employee ID
        if (id && id.match(/^\d{6,}$/)) {
          employees.push({
            type,
            id,
            name,
            manager,
            totalHours,
            jobs,
            jph,
            units,
            uph,
            processId
          });
        }
      });
    });

    log(`Parsed ${employees.length} employees from function rollup`);
    return { success: true, employees, processId };
  }

  /**
   * Fetch all path data for the current shift
   */
  async function fetchAllPathData() {
    const results = {};

    for (const path of PATHS) {
      try {
        const data = await fetchFunctionRollup(path.processId);
        results[path.id] = {
          ...data,
          pathInfo: path
        };
      } catch (error) {
        log(`Error fetching ${path.name}:`, error);
        results[path.id] = { success: false, error: error.message, pathInfo: path };
      }
    }

    return results;
  }

  /**
   * Create the floating action button
   */
  function createFloatingButton() {
    if (document.getElementById('perf-validity-fab')) {
      return;
    }

    const fab = document.createElement('div');
    fab.id = 'perf-validity-fab';
    fab.innerHTML = `
      <div class="perf-fab-icon">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
        </svg>
      </div>
      <span class="perf-fab-text">AA Performance</span>
    `;
    fab.title = 'Open AA Performance Validity Dashboard';

    fab.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleFabClick();
    });

    document.body.appendChild(fab);
    log('Floating action button created');
  }

  /**
   * Create the status indicator
   */
  function createStatusIndicator() {
    if (document.getElementById('perf-validity-status')) {
      return;
    }

    const status = document.createElement('div');
    status.id = 'perf-validity-status';
    status.innerHTML = `
      <span class="status-dot"></span>
      <span class="status-text">Performance Ready</span>
    `;

    document.body.appendChild(status);
    log('Status indicator created');
  }

  /**
   * Handle floating button click - opens dashboard
   */
  function handleFabClick() {
    log('FAB clicked, opening dashboard');

    const warehouseId = CONFIG.warehouseId || getWarehouseId();
    const shift = getShiftDateRange();
    const selectedEmployees = getSelectedEmployees();

    browser.runtime.sendMessage({
      action: 'openDashboard',
      data: {
        warehouseId,
        employees: selectedEmployees,
        shift,
        paths: PATHS,
        processIds: PROCESS_IDS,
        sourceUrl: window.location.href
      }
    }).then(response => {
      log('Dashboard opened');
    }).catch(err => {
      log('Error opening dashboard:', err);
    });
  }

  /**
   * Extract employees from FCLM page
   */
  function getSelectedEmployees() {
    const employees = [];
    const seen = new Set();

    // Look for employee IDs in tables
    document.querySelectorAll('table tr').forEach(row => {
      const text = row.textContent;

      // Match badge IDs (8-9 digit numbers)
      const badgeMatches = text.match(/\b(\d{8,9})\b/g);
      if (badgeMatches) {
        badgeMatches.forEach(badge => {
          if (!seen.has(badge)) {
            seen.add(badge);
            // Try to get name from adjacent cell
            const cells = row.querySelectorAll('td');
            let name = badge;
            cells.forEach(cell => {
              if (cell.textContent.includes(badge)) {
                const nextCell = cell.nextElementSibling;
                if (nextCell) name = nextCell.textContent.trim() || badge;
              }
            });
            employees.push({ id: badge, name });
          }
        });
      }
    });

    log(`Found ${employees.length} employees on page`);
    return employees.slice(0, 100);
  }

  /**
   * Listen for messages from background script or popup
   */
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    log('Received message:', message.action);

    switch (message.action) {
      case 'fetchEmployeeTimeDetails':
        fetchEmployeeTimeDetails(message.employeeId, message.spanType, message.customRange)
          .then(sendResponse);
        return true;

      case 'fetchFunctionRollup':
        fetchFunctionRollup(message.processId, message.spanType, message.customRange)
          .then(sendResponse);
        return true;

      case 'fetchAllPathData':
        fetchAllPathData().then(sendResponse);
        return true;

      case 'getConfig':
        sendResponse({
          warehouseId: CONFIG.warehouseId || getWarehouseId(),
          paths: PATHS,
          processIds: PROCESS_IDS,
          timeDetailMap: TIME_DETAIL_MAP
        });
        return true;

      case 'triggerCheck':
        handleFabClick();
        sendResponse({ success: true });
        return true;

      default:
        sendResponse({ success: false, error: 'Unknown action' });
        return true;
    }
  });

  /**
   * Initialize the content script
   */
  function init() {
    log('Initializing FCLM content script');

    CONFIG.warehouseId = getWarehouseId();
    log('Warehouse ID:', CONFIG.warehouseId);

    createFloatingButton();
    createStatusIndicator();

    browser.runtime.sendMessage({ action: 'contentScriptReady' });

    log('FCLM content script initialized');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
