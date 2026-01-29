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
    url.searchParams.set('startDateDay', formatDateForURL(shift.endDate));
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
   * Based on scan-check implementation using gantt chart table
   */
  function parseTimeDetailsHTML(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const sessions = [];
    const pathSummary = {};

    // Look for the gantt chart table specifically (like scan-check does)
    const table = doc.querySelector('table.ganttChart[aria-label="Time Details"]') ||
                  doc.querySelector('table.ganttChart') ||
                  doc.querySelector('table');

    if (!table) {
      log('No time details table found');
      return { success: false, error: 'No time details table found', sessions: [], pathSummary: {} };
    }

    const rows = table.querySelectorAll('tr');

    rows.forEach(row => {
      // Skip aggregate rows (function-seg) and clock entries (clock-seg)
      // Only process job segment rows (job-seg) which contain actual work
      if (row.classList.contains('function-seg') || row.classList.contains('clock-seg')) {
        return;
      }

      // For job-seg rows or rows without specific class
      const cells = row.querySelectorAll('td');
      if (cells.length < 4) return;

      const title = cells[0]?.textContent?.trim() || '';
      const start = cells[1]?.textContent?.trim() || '';
      const end = cells[2]?.textContent?.trim() || '';
      const duration = cells[3]?.textContent?.trim() || '';

      // Skip clock entries by title as well
      if (title.includes('Clock') || title.includes('Paid') || title.includes('UnPaid')) {
        return;
      }

      // Parse duration (MM:SS format)
      let durationMinutes = 0;
      const durationMatch = duration.match(/(\d+):(\d+)/);
      if (durationMatch) {
        durationMinutes = parseInt(durationMatch[1]) + parseInt(durationMatch[2]) / 60;
      }

      // Map title to path using TIME_DETAIL_MAP first, then fuzzy match
      const pathId = TIME_DETAIL_MAP[title] || findPathFromTitle(title);

      if (title && durationMinutes > 0) {
        sessions.push({
          title,
          pathId,
          start,
          end,
          duration,
          durationMinutes,
          isJobSeg: row.classList.contains('job-seg')
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
   *   &maxIntradayDays=1&spanType=Intraday
   *   &startDateIntraday=2026/01/28&startHourIntraday=18&startMinuteIntraday=0
   *   &endDateIntraday=2026/01/29&endHourIntraday=6&endMinuteIntraday=0
   */
  async function fetchFunctionRollup(processId, spanType = 'Intraday', customRange = null) {
    const warehouseId = CONFIG.warehouseId || getWarehouseId();
    const shift = customRange || getShiftDateRange();

    const url = new URL('https://fclm-portal.amazon.com/reports/functionRollup');
    url.searchParams.set('reportFormat', 'HTML');
    url.searchParams.set('warehouseId', warehouseId);
    url.searchParams.set('processId', processId);
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
   * Get clean text from an element, excluding select/dropdown content
   */
  function getCleanCellText(element) {
    if (!element) return '';
    // Clone the element and remove select/option elements
    const clone = element.cloneNode(true);
    clone.querySelectorAll('select, option, .dropdown, .dropdown-menu').forEach(el => el.remove());
    const text = clone.textContent.trim();
    // If text is too long, it probably contains dropdown content - take first part only
    if (text.length > 100) {
      const firstLine = text.split('\n')[0].trim();
      return firstLine.length < 50 ? firstLine : text.substring(0, 50);
    }
    return text;
  }

  /**
   * Parse function rollup HTML to extract employee performance data
   * Based on scan-check implementation - properly handles badge ID vs employee ID
   */
  function parseFunctionRollupHTML(html, processId) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const employees = [];
    const seenBadgeIds = new Set();

    // Find all tables with employee data
    const tables = doc.querySelectorAll('table');

    tables.forEach(table => {
      const rows = table.querySelectorAll('tr');
      let totalColumnIndex = -1;
      let idColumnIndex = 1;  // Default: ID is usually second column
      let nameColumnIndex = 2; // Default: Name is usually third column
      let jobsColumnIndex = -1;
      let jphColumnIndex = -1;
      let unitColumnIndex = -1;
      let uphColumnIndex = -1;

      // First pass: find header row and column indices
      for (const row of rows) {
        const headerCells = row.querySelectorAll('th');
        if (headerCells.length > 0) {
          // This is a header row - find column indices
          for (let i = 0; i < headerCells.length; i++) {
            const headerText = headerCells[i]?.textContent?.trim()?.toLowerCase() || '';
            if (headerText === 'total') totalColumnIndex = i;
            if (headerText === 'id' || headerText === 'badge' || headerText === 'employee id') idColumnIndex = i;
            if (headerText === 'name' || headerText === 'employee name') nameColumnIndex = i;
            if (headerText === 'jobs') jobsColumnIndex = i;
            if (headerText === 'jph') jphColumnIndex = i;
            if (headerText === 'unit') unitColumnIndex = i;
            if (headerText === 'uph') uphColumnIndex = i;
          }
          break;
        }

        // Also check for header-style td cells (some tables use td for headers)
        const cells = row.querySelectorAll('td');
        if (cells.length > 0) {
          const firstCellText = cells[0]?.textContent?.trim() || '';
          if (firstCellText === 'Type') {
            for (let i = 0; i < cells.length; i++) {
              const cellText = cells[i]?.textContent?.trim()?.toLowerCase() || '';
              if (cellText === 'total') totalColumnIndex = i;
              if (cellText === 'id' || cellText === 'badge') idColumnIndex = i;
              if (cellText === 'name') nameColumnIndex = i;
              if (cellText === 'jobs') jobsColumnIndex = i;
              if (cellText === 'jph') jphColumnIndex = i;
              if (cellText === 'unit') unitColumnIndex = i;
              if (cellText === 'uph') uphColumnIndex = i;
            }
            break;
          }
        }
      }

      // Second pass: parse data rows
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length < 5) continue;

        // Skip header rows and total rows
        const firstCellText = cells[0]?.textContent?.trim() || '';
        if (firstCellText === 'Type' || firstCellText === 'Total' || firstCellText === '') continue;

        // IMPORTANT: Only process AMZN rows (like scan-check does)
        if (firstCellText !== 'AMZN') continue;

        // Get badge ID from ID column - may be inside a link!
        const idCell = cells[idColumnIndex];
        const idLink = idCell?.querySelector('a');
        const badgeId = idLink ? idLink.textContent.trim() : idCell?.textContent?.trim();

        // Validate badge ID - must be numeric
        if (!badgeId || !/^\d+$/.test(badgeId)) continue;

        // Skip if already seen (dedup by badge ID)
        if (seenBadgeIds.has(badgeId)) continue;
        seenBadgeIds.add(badgeId);

        // Get name from Name column - may also be inside a link
        const nameCell = cells[nameColumnIndex];
        const nameLink = nameCell?.querySelector('a');
        let name = nameLink ? nameLink.textContent.trim() : getCleanCellText(nameCell);

        // Sanitize name
        if (!name || name.length > 50 || name.includes('Default Menu') || name.includes('Home Area')) {
          name = badgeId;
        }

        // Get total hours - use found index or find last numeric cell
        let totalHours = 0;
        if (totalColumnIndex !== -1 && totalColumnIndex < cells.length) {
          const totalText = cells[totalColumnIndex]?.textContent?.trim() || '0';
          totalHours = parseFloat(totalText) || 0;
        } else {
          // Fallback: find the last cell that contains a valid number
          for (let i = cells.length - 1; i >= 3; i--) {
            const cellText = cells[i]?.textContent?.trim() || '';
            if (/^[\d.]+$/.test(cellText) && cellText !== '') {
              const parsed = parseFloat(cellText);
              if (!isNaN(parsed) && parsed > 0 && parsed < 100) {
                totalHours = parsed;
                break;
              }
            }
          }
        }

        // Get Jobs and JPH
        const jobs = jobsColumnIndex >= 0 ? (parseFloat(cells[jobsColumnIndex]?.textContent?.trim()) || 0) : 0;
        const jph = jphColumnIndex >= 0 ? (parseFloat(cells[jphColumnIndex]?.textContent?.trim()) || 0) : 0;

        // Get Units and UPH
        const units = unitColumnIndex >= 0 ? (parseFloat(cells[unitColumnIndex]?.textContent?.trim()) || 0) : 0;
        const uph = uphColumnIndex >= 0 ? (parseFloat(cells[uphColumnIndex]?.textContent?.trim()) || 0) : 0;

        employees.push({
          type: 'AMZN',
          id: badgeId,
          badgeId: badgeId,
          name,
          totalHours,
          jobs,
          jph,
          units,
          uph,
          processId
        });

        log(`Found AA: ${name} (${badgeId}) - ${totalHours}h`);
      }
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
   * Handle floating button click - fetches REAL data then opens dashboard
   */
  async function handleFabClick() {
    log('FAB clicked, fetching real data...');

    const warehouseId = CONFIG.warehouseId || getWarehouseId();
    const shift = getShiftDateRange();

    // Show loading state
    const fab = document.getElementById('perf-validity-fab');
    if (fab) {
      fab.classList.add('loading');
      fab.querySelector('.perf-fab-text').textContent = 'Loading...';
    }

    try {
      // Get employees from the current page
      const selectedEmployees = getSelectedEmployees();
      log(`Found ${selectedEmployees.length} employees on page`);

      // Fetch REAL time details for each employee
      const performanceData = [];

      for (const employee of selectedEmployees) {
        log(`Fetching time details for ${employee.name} (${employee.id})...`);

        try {
          const timeDetails = await fetchEmployeeTimeDetails(employee.id);

          if (timeDetails.success && timeDetails.sessions) {
            // Group sessions by path and calculate totals
            const pathData = {};

            timeDetails.sessions.forEach(session => {
              const pathId = session.pathId || 'unknown';
              if (!pathData[pathId]) {
                pathData[pathId] = {
                  pathId: pathId,
                  title: session.title,
                  totalMinutes: 0,
                  sessions: 0
                };
              }
              pathData[pathId].totalMinutes += session.durationMinutes || 0;
              pathData[pathId].sessions += 1;
            });

            // Add to performance data
            for (const [pathId, data] of Object.entries(pathData)) {
              const pathConfig = PATHS.find(p => p.id === pathId) || { name: data.title, color: '#666', goal: 30 };
              const hours = Math.round(data.totalMinutes / 60 * 10) / 10;

              performanceData.push({
                employeeId: employee.id,
                employeeName: employee.name,
                pathId: pathId,
                pathName: pathConfig.name || data.title,
                pathColor: pathConfig.color || '#666',
                hours: hours,
                totalMinutes: data.totalMinutes,
                sessions: data.sessions
              });
            }
          }
        } catch (err) {
          log(`Error fetching time details for ${employee.id}:`, err);
        }
      }

      log(`Collected ${performanceData.length} performance records`);

      // Store real data for dashboard
      await browser.storage.local.set({
        dashboardData: {
          warehouseId,
          employees: selectedEmployees,
          performanceData: performanceData,
          shift,
          paths: PATHS,
          processIds: PROCESS_IDS,
          sourceUrl: window.location.href,
          fetchedAt: new Date().toISOString()
        }
      });

      // Open dashboard
      browser.runtime.sendMessage({
        action: 'openDashboard',
        data: { warehouseId }
      });

    } catch (error) {
      log('Error fetching data:', error);
    } finally {
      // Reset FAB state
      if (fab) {
        fab.classList.remove('loading');
        fab.querySelector('.perf-fab-text').textContent = 'AA Performance';
      }
    }
  }

  /**
   * Extract employees from FCLM page
   * Tries multiple methods to find employees on various FCLM page types
   */
  function getSelectedEmployees() {
    const employees = [];
    const seen = new Set();

    // Method 1: Look for AMZN rows in tables (function rollup pages)
    document.querySelectorAll('table tr').forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 3) return;

      const firstCellText = cells[0]?.textContent?.trim() || '';

      // AMZN rows (function rollup)
      if (firstCellText === 'AMZN') {
        const idCell = cells[1];
        const idLink = idCell?.querySelector('a');
        const badgeId = idLink ? idLink.textContent.trim() : idCell?.textContent?.trim();

        if (badgeId && /^\d+$/.test(badgeId) && !seen.has(badgeId)) {
          seen.add(badgeId);
          const nameCell = cells[2];
          const nameLink = nameCell?.querySelector('a');
          let name = nameLink ? nameLink.textContent.trim() : nameCell?.textContent?.trim();
          if (!name || name.length > 50) name = badgeId;
          employees.push({ id: badgeId, badgeId, name });
        }
      }
    });

    // Method 2: Look for employee links (time details pages, search results)
    document.querySelectorAll('a[href*="employeeId="]').forEach(link => {
      const href = link.getAttribute('href') || '';
      const match = href.match(/employeeId=(\d+)/);
      if (match) {
        const badgeId = match[1];
        if (!seen.has(badgeId)) {
          seen.add(badgeId);
          const name = link.textContent.trim() || badgeId;
          employees.push({ id: badgeId, badgeId, name: name.length > 50 ? badgeId : name });
        }
      }
    });

    // Method 3: Look for badge IDs in table cells with links
    document.querySelectorAll('table td a').forEach(link => {
      const text = link.textContent.trim();
      if (/^\d{6,9}$/.test(text) && !seen.has(text)) {
        seen.add(text);
        // Try to get name from next cell
        const cell = link.closest('td');
        const nextCell = cell?.nextElementSibling;
        let name = nextCell?.textContent?.trim() || text;
        if (name.length > 50) name = text;
        employees.push({ id: text, badgeId: text, name });
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
