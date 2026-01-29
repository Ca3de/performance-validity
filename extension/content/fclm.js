/**
 * AA Performance Validity - FCLM Content Script
 * Injects performance check button and fetches data from FCLM portal
 * Based on scan-check API patterns
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

  // Performance paths to track
  const PATHS = [
    { id: 'pick_multis', name: 'Pick Multis', processPath: 'MultiSlamPicking' },
    { id: 'pick_liquidation', name: 'Pick Liquidation', processPath: 'LiquidationPicking' },
    { id: 'pick_singles', name: 'Pick Singles', processPath: 'SingleSlamPicking' },
    { id: 'stow', name: 'Stow', processPath: 'Stow' },
    { id: 'pack_singles', name: 'Pack Singles', processPath: 'PackSingles' },
    { id: 'pack_multis', name: 'Pack Multis', processPath: 'PackMultis' },
    { id: 'count', name: 'Count', processPath: 'Count' },
    { id: 'receive', name: 'Receive', processPath: 'Receive' },
    { id: 'problem_solve', name: 'Problem Solve', processPath: 'ProblemSolve' },
    { id: 'water_spider', name: 'Water Spider', processPath: 'WaterSpider' }
  ];

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
   * Get date range for the past N days
   */
  function getDateRange(days = CONFIG.dateRangeDays) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate)
    };
  }

  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Fetch employee time details from FCLM
   * URL pattern: https://fclm-portal.amazon.com/employee/timeDetails?employeeId=...
   */
  async function fetchEmployeeTimeDetails(employeeId, startDate, endDate) {
    const warehouseId = CONFIG.warehouseId || getWarehouseId();

    // Build the FCLM time details URL
    const url = new URL('https://fclm-portal.amazon.com/employee/timeDetails');
    url.searchParams.set('employeeId', employeeId);
    url.searchParams.set('warehouseId', warehouseId);
    url.searchParams.set('startDateDay', startDate);
    url.searchParams.set('maxIntradayDays', '1');
    url.searchParams.set('spanType', 'Intraday');
    url.searchParams.set('startDateIntraday', startDate);
    url.searchParams.set('startHourIntraday', '0');
    url.searchParams.set('startMinuteIntraday', '0');
    url.searchParams.set('endDateIntraday', endDate);
    url.searchParams.set('endHourIntraday', '23');
    url.searchParams.set('endMinuteIntraday', '59');

    log('Fetching time details:', url.toString());

    try {
      const response = await fetch(url.toString(), {
        credentials: 'include'
      });

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
   * Parse the time details HTML response
   * Extracts job segments from the Gantt chart table
   */
  function parseTimeDetailsHTML(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const sessions = [];

    // Find the Gantt chart table
    const table = doc.querySelector('table.ganttChart[aria-label="Time Details"]') ||
                  doc.querySelector('table.ganttChart') ||
                  doc.querySelector('table[class*="gantt"]');

    if (!table) {
      log('No Gantt chart table found');
      return { success: true, sessions: [] };
    }

    // Parse rows - look for job-seg rows (individual work sessions)
    const rows = table.querySelectorAll('tr.job-seg, tr[class*="job"]');

    rows.forEach(row => {
      try {
        const cells = row.querySelectorAll('td');
        if (cells.length < 4) return;

        // Extract title from link or cell
        const titleCell = row.querySelector('td a') || cells[1];
        const title = titleCell?.textContent?.trim() || '';

        // Look for time and duration values
        let startTime = '';
        let endTime = '';
        let duration = '';

        cells.forEach(cell => {
          const text = cell.textContent.trim();
          // Match time patterns like "14:30" or "2:30 PM"
          if (text.match(/^\d{1,2}:\d{2}(\s*(AM|PM))?$/i)) {
            if (!startTime) startTime = text;
            else if (!endTime) endTime = text;
          }
          // Match duration pattern like "45:30" (MM:SS)
          if (text.match(/^\d+:\d{2}$/) && !text.match(/^\d{1,2}:\d{2}$/)) {
            duration = text;
          }
        });

        // Parse duration to minutes
        let durationMinutes = 0;
        if (duration) {
          const [mins, secs] = duration.split(':').map(Number);
          durationMinutes = mins + (secs / 60);
        }

        if (title) {
          sessions.push({
            title: title,
            startTime: startTime,
            endTime: endTime,
            duration: duration,
            durationMinutes: durationMinutes
          });
        }
      } catch (e) {
        log('Error parsing row:', e);
      }
    });

    log(`Parsed ${sessions.length} sessions`);
    return { success: true, sessions: sessions };
  }

  /**
   * Fetch function rollup report for a specific process/path
   * URL pattern: https://fclm-portal.amazon.com/reports/functionRollup?...
   */
  async function fetchFunctionRollup(processId, startDate, endDate) {
    const warehouseId = CONFIG.warehouseId || getWarehouseId();

    const url = new URL('https://fclm-portal.amazon.com/reports/functionRollup');
    url.searchParams.set('reportFormat', 'HTML');
    url.searchParams.set('warehouseId', warehouseId);
    url.searchParams.set('processId', processId);
    url.searchParams.set('startDate', startDate);
    url.searchParams.set('endDate', endDate);

    log('Fetching function rollup:', url.toString());

    try {
      const response = await fetch(url.toString(), {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      return parseFunctionRollupHTML(html);
    } catch (error) {
      log('Error fetching function rollup:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Parse function rollup HTML to extract employee data
   */
  function parseFunctionRollupHTML(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const employees = [];

    // Find data table
    const table = doc.querySelector('table[class*="report"], table[class*="data"], table');
    if (!table) {
      return { success: true, employees: [] };
    }

    const rows = table.querySelectorAll('tbody tr, tr:not(:first-child)');

    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 3) return;

      const text = Array.from(cells).map(c => c.textContent.trim());

      // Look for badge ID pattern
      const badgeMatch = text.join(' ').match(/\b([A-Z]{2,}\d+|\d{8,})\b/i);
      // Look for hours pattern
      const hoursMatch = text.join(' ').match(/(\d+\.?\d*)\s*(hrs?|hours?)?/i);

      if (badgeMatch) {
        employees.push({
          badgeId: badgeMatch[1],
          name: text[1] || badgeMatch[1],
          hours: hoursMatch ? parseFloat(hoursMatch[1]) : 0
        });
      }
    });

    return { success: true, employees: employees };
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

    fab.addEventListener('click', handleFabClick);

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

    const dateRange = getDateRange();
    const warehouseId = CONFIG.warehouseId || getWarehouseId();

    // Collect any employees from the page
    const selectedEmployees = getSelectedEmployees();

    // Send message to background script to open dashboard
    browser.runtime.sendMessage({
      action: 'openDashboard',
      data: {
        warehouseId: warehouseId,
        employees: selectedEmployees,
        dateRange: dateRange,
        paths: PATHS,
        sourceUrl: window.location.href
      }
    }).then(response => {
      log('Dashboard opened');
    }).catch(err => {
      log('Error opening dashboard:', err);
      window.open(browser.runtime.getURL('dashboard/dashboard.html'), '_blank');
    });
  }

  /**
   * Extract employees from FCLM page
   */
  function getSelectedEmployees() {
    const employees = [];
    const seen = new Set();

    // Look for employee IDs in tables
    const tables = document.querySelectorAll('table');
    tables.forEach(table => {
      const rows = table.querySelectorAll('tr');
      rows.forEach(row => {
        const text = row.textContent;
        // Match login patterns (letters followed by numbers)
        const loginMatches = text.match(/\b([a-z]{2,}[0-9]+)\b/gi);
        if (loginMatches) {
          loginMatches.forEach(login => {
            const id = login.toLowerCase();
            if (!seen.has(id)) {
              seen.add(id);
              employees.push({ id: id, name: login });
            }
          });
        }
      });
    });

    // Look for badge IDs (8+ digit numbers)
    const badgeMatches = document.body.textContent.match(/\b(\d{8,})\b/g);
    if (badgeMatches) {
      badgeMatches.forEach(badge => {
        if (!seen.has(badge)) {
          seen.add(badge);
          employees.push({ id: badge, name: badge });
        }
      });
    }

    log(`Found ${employees.length} employees on page`);
    return employees.slice(0, 50);
  }

  /**
   * Listen for messages from background script or popup
   */
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    log('Received message:', message.action);

    switch (message.action) {
      case 'fetchEmployeeTimeDetails':
        fetchEmployeeTimeDetails(message.employeeId, message.startDate, message.endDate)
          .then(sendResponse);
        return true;

      case 'fetchFunctionRollup':
        fetchFunctionRollup(message.processId, message.startDate, message.endDate)
          .then(sendResponse);
        return true;

      case 'getConfig':
        sendResponse({
          warehouseId: CONFIG.warehouseId || getWarehouseId(),
          paths: PATHS
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

    // Get warehouse ID
    CONFIG.warehouseId = getWarehouseId();
    log('Warehouse ID:', CONFIG.warehouseId);

    // Create UI elements
    createFloatingButton();
    createStatusIndicator();

    // Notify background script
    browser.runtime.sendMessage({ action: 'contentScriptReady' });

    log('FCLM content script initialized');
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
