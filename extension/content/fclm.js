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
  // These are the PARENT process IDs that return all sub-functions
  const PROCESS_IDS = {
    // Parent processes - these are the correct IDs to query
    PICK: '1003034',           // V-Returns Pick (contains all pick sub-functions)
    PACK: '1003056',           // V-Returns Pack (contains all pack sub-functions)
    STOW: '1003055',           // C-Returns Stow (contains all stow sub-functions)
    SUPPORT_C: '1003058',      // C-Returns Support
    SUPPORT_V: '1003059'       // V-Returns Support
  };

  // Path configuration - query by PARENT process, data includes sub-functions
  const PATHS = [
    { id: 'pick', name: 'Pick', processId: PROCESS_IDS.PICK, category: 'Pick', color: '#4CAF50', enabled: true },
    { id: 'pack', name: 'Pack', processId: PROCESS_IDS.PACK, category: 'Pack', color: '#2196F3', enabled: true },
    { id: 'stow', name: 'Stow', processId: PROCESS_IDS.STOW, category: 'Stow', color: '#9C27B0', enabled: true },
    // Support paths - disabled by default
    { id: 'support_c', name: 'C-Returns Support', processId: PROCESS_IDS.SUPPORT_C, category: 'Support', color: '#607D8B', enabled: false },
    { id: 'support_v', name: 'V-Returns Support', processId: PROCESS_IDS.SUPPORT_V, category: 'Support', color: '#795548', enabled: false }
  ];

  // Get only enabled paths for querying
  const ENABLED_PATHS = PATHS.filter(p => p.enabled);

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

    return { startDate, endDate, startHour, endHour, spanType: 'Intraday' };
  }

  /**
   * Get date range for different periods
   * @param {string} period - 'today', 'week', 'lastWeek', 'month', 'lastMonth', or 'custom'
   * @param {Date} customStart - Custom start date (for 'custom' period)
   * @param {Date} customEnd - Custom end date (for 'custom' period)
   */
  function getDateRangeForPeriod(period, customStart = null, customEnd = null) {
    const now = new Date();
    let startDate, endDate, spanType;

    switch (period) {
      case 'today':
        // Current shift
        return getShiftDateRange();

      case 'week':
        // This week (Sunday to today)
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - startDate.getDay()); // Go to Sunday
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        spanType = 'Week';
        break;

      case 'lastWeek':
        // Last week (Sunday to Saturday)
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - startDate.getDay() - 7); // Go to last Sunday
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 6); // Saturday
        spanType = 'Week';
        break;

      case 'month':
        // This month
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now);
        spanType = 'Week';
        break;

      case 'lastMonth':
        // Last month
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of previous month
        spanType = 'Week';
        break;

      case 'custom':
        startDate = customStart || new Date();
        endDate = customEnd || new Date();
        // Use Week span for ranges > 1 day
        const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
        spanType = daysDiff > 1 ? 'Week' : 'Intraday';
        break;

      default:
        return getShiftDateRange();
    }

    return {
      startDate,
      endDate,
      startHour: 0,
      endHour: 23,
      spanType,
      period
    };
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
   * Supports both Intraday (single day/shift) and Week (multi-day) span types
   */
  async function fetchFunctionRollup(processId, customRange = null) {
    const warehouseId = CONFIG.warehouseId || getWarehouseId();
    const range = customRange || getShiftDateRange();
    const spanType = range.spanType || 'Intraday';

    const url = new URL('https://fclm-portal.amazon.com/reports/functionRollup');
    url.searchParams.set('reportFormat', 'HTML');
    url.searchParams.set('warehouseId', warehouseId);
    url.searchParams.set('processId', processId);

    if (spanType === 'Week') {
      // Week span - for multi-day queries
      url.searchParams.set('spanType', 'Week');
      url.searchParams.set('startDateWeek', formatDateForURL(range.startDate));
      url.searchParams.set('endDateWeek', formatDateForURL(range.endDate));
    } else {
      // Intraday span - for single day/shift queries
      url.searchParams.set('spanType', 'Intraday');
      url.searchParams.set('maxIntradayDays', '1');
      url.searchParams.set('startDateIntraday', formatDateForURL(range.startDate));
      url.searchParams.set('startHourIntraday', String(range.startHour || 0));
      url.searchParams.set('startMinuteIntraday', '0');
      url.searchParams.set('endDateIntraday', formatDateForURL(range.endDate));
      url.searchParams.set('endHourIntraday', String(range.endHour || 23));
      url.searchParams.set('endMinuteIntraday', '0');
    }

    log(`Fetching function rollup (${spanType}):`, url.toString());

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
    const seenKeys = new Set(); // Track by badgeId + subFunction to allow same AA in different sub-functions

    // Store debug info about the HTML structure
    const debugInfo = {
      processId,
      htmlLength: html.length,
      tableCount: 0,
      headings: [],
      subFunctionMatches: [],
      tableStructures: []
    };

    // Find all tables with employee data
    const tables = doc.querySelectorAll('table');
    debugInfo.tableCount = tables.length;
    log(`Found ${tables.length} tables in function rollup response`);

    // Debug: Log all potential section headings in the document
    const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, b, strong, .title, .header, .function-name');
    const headingTexts = Array.from(headings).map(h => h.textContent.trim().substring(0, 80)).filter(t => t.length > 0 && t.length < 80);
    debugInfo.headings = headingTexts.slice(0, 20);
    log('Document headings:', headingTexts.slice(0, 15).join(' | '));

    // Debug: Look for any text containing sub-function keywords
    const bodyText = doc.body?.innerHTML || '';
    const subFuncMatches = bodyText.match(/(Multis|Singles|LTL|Liquidation|WHD|Hazmat|PacknHold|Packing|FRACS|Stow C|EndofLine)[^<]*/gi);
    if (subFuncMatches) {
      debugInfo.subFunctionMatches = subFuncMatches.slice(0, 15);
      log('Sub-function matches in HTML:', subFuncMatches.slice(0, 10).join(' | '));
    } else {
      log('No sub-function keyword matches found in HTML');
    }

    // Debug: Store a sample of the HTML structure
    const htmlSample = html.substring(0, 5000);
    debugInfo.htmlSample = htmlSample;

    // Store debug info to local storage for inspection
    browser.storage.local.get('fclmDebug').then(result => {
      const fclmDebug = result.fclmDebug || {};
      fclmDebug[processId] = debugInfo;
      browser.storage.local.set({ fclmDebug });
    });

    tables.forEach((table, tableIndex) => {
      const rows = table.querySelectorAll('tr');
      let totalColumnIndex = -1;
      let idColumnIndex = 1;  // Default: ID is usually second column
      let nameColumnIndex = 2; // Default: Name is usually third column
      let jobsColumnIndex = -1;
      let jphColumnIndex = -1;
      let unitColumnIndex = -1;
      let uphColumnIndex = -1;

      // Try to find the sub-function name for this table
      let subFunctionName = '';

      // Known sub-function patterns to look for
      const knownPatterns = [
        // Pick patterns
        /FRACS\s+(?:Multis|Singles|LTL)\s+Pick/i,
        /Liquidations?\s+Pick/i,
        /WHD\s+(?:Pick|Grading|SpecialtyGrading)/i,
        /(?:Multis|Singles)\s*\[\d+\]/i,
        /Remove\s+Hazmat/i,
        // Pack patterns
        /Pack(?:ing|nHold|Singles|FracsLTL)/i,
        /V-Returns\s+Pack/i,
        /Pack\s+Singles/i,
        /Pack\s+FracsLTL/i,
        // Stow patterns - multiple variations (exact match first)
        /Stow C Returns/i,
        /Stow\s+C\s+Returns/i,
        /Stow\s+C[\s-]*Returns/i,
        /C[\s-]*Returns\s+Stow/i,
        /C-Returns\s+Stow/i,
        /Stow\s*\[\d+\]/i,
        // Support patterns
        /C-Returns[_\s]+EndofLine/i,
        /V-Returns\s+Support/i,
        /C-Returns\s+Support/i
      ];

      // Helper to extract function name from text using patterns
      const extractFunctionName = (text) => {
        if (!text) return '';
        for (const pattern of knownPatterns) {
          const match = text.match(pattern);
          if (match) {
            return match[0].trim();
          }
        }
        return '';
      };

      // Method 1: Look for anchor tags near or in this table that have function names
      // FCLM often uses anchor links with function names
      const anchors = table.querySelectorAll('a');
      for (const anchor of anchors) {
        const text = anchor.textContent.trim();
        const href = anchor.getAttribute('href') || '';
        const extracted = extractFunctionName(text) || extractFunctionName(href);
        if (extracted) {
          subFunctionName = extracted;
          break;
        }
      }

      // Method 2: Check for caption element
      if (!subFunctionName) {
        const caption = table.querySelector('caption');
        if (caption) {
          const extracted = extractFunctionName(caption.textContent);
          if (extracted) {
            subFunctionName = extracted;
          }
        }
      }

      // Method 3: Look at preceding siblings - specifically look for anchors or short text with patterns
      if (!subFunctionName) {
        let prevElement = table.previousElementSibling;
        for (let i = 0; i < 5 && prevElement; i++) {
          // Check anchors in preceding element
          const prevAnchors = prevElement.querySelectorAll('a');
          for (const anchor of prevAnchors) {
            const extracted = extractFunctionName(anchor.textContent);
            if (extracted) {
              subFunctionName = extracted;
              break;
            }
          }
          if (subFunctionName) break;

          // Check the element's own text (only if short)
          const text = prevElement.textContent.trim();
          if (text.length < 100) {
            const extracted = extractFunctionName(text);
            if (extracted) {
              subFunctionName = extracted;
              break;
            }
          }
          prevElement = prevElement.previousElementSibling;
        }
      }

      // Method 4: Look in the first row of the table for function name (title row)
      if (!subFunctionName) {
        const firstRow = rows[0];
        if (firstRow) {
          const cells = firstRow.querySelectorAll('th, td');
          if (cells.length === 1) {
            const text = cells[0].textContent.trim();
            const extracted = extractFunctionName(text);
            if (extracted) {
              subFunctionName = extracted;
            }
          }
        }
      }

      // Method 5: Search parent containers for function name anchors
      if (!subFunctionName) {
        let parent = table.parentElement;
        for (let i = 0; i < 3 && parent; i++) {
          const parentAnchors = parent.querySelectorAll(':scope > a, :scope > * > a');
          for (const anchor of parentAnchors) {
            const extracted = extractFunctionName(anchor.textContent);
            if (extracted) {
              subFunctionName = extracted;
              break;
            }
          }
          if (subFunctionName) break;
          parent = parent.parentElement;
        }
      }

      // Method 6: Look at the HTML just before this table for function name pattern
      if (!subFunctionName) {
        const tableHtml = table.outerHTML;
        const bodyHtml = doc.body.innerHTML;
        const tablePos = bodyHtml.indexOf(tableHtml);
        if (tablePos > 0) {
          // Get the 500 characters before this table
          const beforeTable = bodyHtml.substring(Math.max(0, tablePos - 500), tablePos);
          // Look for function patterns in reverse (closest to table first)
          for (const pattern of knownPatterns) {
            const matches = beforeTable.match(new RegExp(pattern.source, 'gi'));
            if (matches && matches.length > 0) {
              // Take the last match (closest to the table)
              subFunctionName = matches[matches.length - 1].trim();
              break;
            }
          }
        }
      }

      // Log detailed context for debugging
      const prevSibText = table.previousElementSibling?.textContent?.substring(0, 100) || '(none)';
      const parentId = table.parentElement?.getAttribute('id') || '(no id)';
      const parentClass = table.parentElement?.getAttribute('class') || '(no class)';
      log(`Table ${tableIndex} sub-function: "${subFunctionName}" | prev: "${prevSibText}" | parent: id=${parentId} class=${parentClass}`);

      // Helper function to strip sort indicators from header text
      const cleanHeaderText = (text) => {
        // Remove sort indicators (≠, ↑, ↓, ▲, ▼) and trim
        return (text || '').replace(/[≠↑↓▲▼]/g, '').trim().toLowerCase();
      };

      // Find the MAIN header row - the one that starts with "Type"
      // This is the row that defines the actual column structure
      let mainHeaderRow = null;
      let subHeaderRow = null;

      for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
        const row = rows[rowIdx];
        const thCells = row.querySelectorAll('th');
        const tdCells = row.querySelectorAll('td');

        // Check th cells first
        if (thCells.length > 0) {
          const firstText = cleanHeaderText(thCells[0]?.textContent);
          if (firstText === 'type') {
            mainHeaderRow = { cells: thCells, rowIdx };
            // Check if next row has sub-headers
            if (rowIdx + 1 < rows.length) {
              const nextRow = rows[rowIdx + 1];
              const nextTh = nextRow.querySelectorAll('th');
              if (nextTh.length > 0) {
                subHeaderRow = { cells: nextTh, rowIdx: rowIdx + 1 };
              }
            }
            break;
          }
        }

        // Check td cells
        if (tdCells.length > 0) {
          const firstText = cleanHeaderText(tdCells[0]?.textContent);
          if (firstText === 'type') {
            mainHeaderRow = { cells: tdCells, rowIdx };
            break;
          }
        }
      }

      if (!mainHeaderRow) {
        log(`Table ${tableIndex}: No main header row found (no 'Type' column)`);
        return; // Skip this table
      }

      // Parse main header row - build column position map accounting for colspan
      const { cells: headerCells } = mainHeaderRow;
      const headerTexts = Array.from(headerCells).map(c => c.textContent.trim());
      log(`Table ${tableIndex} main header:`, headerTexts.join(' | '));

      // Build a map of actual column index to header text, accounting for colspan
      const columnMap = [];
      let actualColIndex = 0;
      for (let i = 0; i < headerCells.length; i++) {
        const cell = headerCells[i];
        const headerText = cleanHeaderText(cell?.textContent);
        const colspan = parseInt(cell?.getAttribute('colspan')) || 1;

        // For cells with colspan, we need to check the sub-header row for actual column names
        if (colspan > 1 && subHeaderRow) {
          // This cell spans multiple columns - sub-headers define the actual columns
          columnMap.push({ header: headerText, startCol: actualColIndex, colspan, isGroup: true });
        } else {
          columnMap.push({ header: headerText, startCol: actualColIndex, colspan: 1, isGroup: false });
        }
        actualColIndex += colspan;
      }

      log(`Table ${tableIndex} column map:`, JSON.stringify(columnMap));

      // Track function/process column index for per-row sub-function
      let functionColumnIndex = -1;

      // Now find the column indices from the column map
      for (const col of columnMap) {
        const h = col.header;
        const idx = col.startCol;

        if (h === 'type') continue; // Skip type column
        if (h === 'id' || h.includes('badge')) idColumnIndex = idx;
        if (h === 'name') nameColumnIndex = idx;
        if (h === 'total') totalColumnIndex = idx;
        if (h === 'jobs' || h === 'job') jobsColumnIndex = idx;
        if (h === 'jph' || h.includes('jobs/hr')) jphColumnIndex = idx;
        if (h === 'units' || h === 'unit') unitColumnIndex = idx;
        if (h === 'uph' || h.includes('units/hr')) uphColumnIndex = idx;
        // Check for function/process column (sub-function per row)
        if (h === 'function' || h === 'process' || h.includes('sub-function') || h.includes('subfunction')) {
          functionColumnIndex = idx;
          log(`  Found Function column at index ${idx}`);
        }

        // Handle "Paid Hours" group - Total is usually the last sub-column
        if (col.isGroup && h.includes('paid hours')) {
          // Total hours is typically at startCol + colspan - 1
          totalColumnIndex = idx + col.colspan - 1;
          log(`  Paid Hours group at col ${idx}, Total at col ${totalColumnIndex}`);
        }
      }

      // If we have a sub-header row, parse ALL sub-headers to find Jobs/JPH
      if (subHeaderRow && (jobsColumnIndex === -1 || jphColumnIndex === -1)) {
        const { cells: subCells } = subHeaderRow;
        const subHeaders = Array.from(subCells).map(c => c.textContent.trim());
        log(`  Sub-header row: ${subHeaders.join(' | ')}`);

        // Determine which group the sub-headers belong to by checking content
        // Jobs/JPH/EACH are under ItemPicked, not Paid Hours
        const firstSubText = cleanHeaderText(subCells[0]?.textContent);
        let startOffset = 0;

        // If sub-header starts with jobs/jph/each, it's for ItemPicked group
        if (firstSubText === 'jobs' || firstSubText === 'jph' || firstSubText.startsWith('each')) {
          // Find the ItemPicked group
          for (const col of columnMap) {
            if (col.isGroup && (col.header.includes('item') || col.header.includes('picked'))) {
              startOffset = col.startCol;
              break;
            }
          }
        } else {
          // Otherwise start from the first grouped column (Paid Hours)
          for (const col of columnMap) {
            if (col.isGroup) {
              startOffset = col.startCol;
              break;
            }
          }
        }
        log(`  Sub-header starts at column offset: ${startOffset} (first sub: "${firstSubText}")`);

        // Iterate through all sub-header cells and track actual column position
        let subColIndex = startOffset;
        for (let s = 0; s < subCells.length; s++) {
          const subText = cleanHeaderText(subCells[s]?.textContent);
          const subColspan = parseInt(subCells[s]?.getAttribute('colspan')) || 1;

          log(`    Sub[${s}] col=${subColIndex}: "${subText}"`);

          if ((subText === 'jobs' || subText === 'job') && jobsColumnIndex === -1) {
            jobsColumnIndex = subColIndex;
            log(`    -> Found Jobs at col ${subColIndex}`);
          }
          if ((subText === 'jph' || subText.includes('jobs/hr') || subText.includes('jobs per')) && jphColumnIndex === -1) {
            jphColumnIndex = subColIndex;
            log(`    -> Found JPH at col ${subColIndex}`);
          }
          if (subText === 'total' && totalColumnIndex === -1) {
            totalColumnIndex = subColIndex;
          }

          subColIndex += subColspan;
        }
      }

      log(`Table ${tableIndex} final indices - ID: ${idColumnIndex}, Name: ${nameColumnIndex}, Total: ${totalColumnIndex}, Jobs: ${jobsColumnIndex}, JPH: ${jphColumnIndex}`)

      // Second pass: parse data rows
      let rowCount = 0;
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length < 5) continue;

        // Skip header rows and total rows
        const firstCellText = cells[0]?.textContent?.trim() || '';
        if (firstCellText === 'Type' || firstCellText === 'Total' || firstCellText === '') continue;

        // IMPORTANT: Only process AMZN rows (like scan-check does)
        if (firstCellText !== 'AMZN') continue;

        // Log first data row for debugging - show ALL cells with indices
        if (rowCount === 0) {
          log(`First AMZN row has ${cells.length} cells:`);
          Array.from(cells).forEach((c, idx) => {
            const val = c.textContent.trim().substring(0, 25);
            log(`  [${idx}] = "${val}"`);
          });
        }
        rowCount++;

        // Get badge ID from ID column - may be inside a link!
        const idCell = cells[idColumnIndex];
        const idLink = idCell?.querySelector('a');
        const badgeId = idLink ? idLink.textContent.trim() : idCell?.textContent?.trim();

        // Validate badge ID - must be numeric
        if (!badgeId || !/^\d+$/.test(badgeId)) continue;

        // Check if there's a per-row function column
        let rowSubFunction = subFunctionName;
        if (functionColumnIndex >= 0 && functionColumnIndex < cells.length) {
          const funcCell = cells[functionColumnIndex];
          const funcText = funcCell?.textContent?.trim();
          if (funcText && funcText.length < 100) {
            rowSubFunction = funcText;
            if (rowCount <= 2) {
              log(`  Row ${rowCount}: Function column value = "${funcText}"`);
            }
          }
        }

        // Create unique key for dedup - allows same AA in different sub-functions
        const dedupKey = `${badgeId}_${rowSubFunction}`;
        if (seenKeys.has(dedupKey)) continue;
        seenKeys.add(dedupKey);

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
        const jobsRaw = jobsColumnIndex >= 0 && jobsColumnIndex < cells.length
          ? cells[jobsColumnIndex]?.textContent?.trim() : '';
        const jphRaw = jphColumnIndex >= 0 && jphColumnIndex < cells.length
          ? cells[jphColumnIndex]?.textContent?.trim() : '';
        const jobs = parseFloat(jobsRaw) || 0;
        const jph = parseFloat(jphRaw) || 0;

        // Get Units and UPH
        const unitsRaw = unitColumnIndex >= 0 && unitColumnIndex < cells.length
          ? cells[unitColumnIndex]?.textContent?.trim() : '';
        const uphRaw = uphColumnIndex >= 0 && uphColumnIndex < cells.length
          ? cells[uphColumnIndex]?.textContent?.trim() : '';
        const units = parseFloat(unitsRaw) || 0;
        const uph = parseFloat(uphRaw) || 0;

        // Debug logging for first few rows
        if (rowCount <= 3) {
          log(`  Row ${rowCount}: Jobs col=${jobsColumnIndex} raw="${jobsRaw}" parsed=${jobs}, JPH col=${jphColumnIndex} raw="${jphRaw}" parsed=${jph}`);
        }

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
          processId,
          subFunction: rowSubFunction || 'Unknown'
        });

        // Log first employee for debugging
        if (employees.length === 1) {
          log(`First employee parsed:`, employees[0]);
        }
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

    for (const path of ENABLED_PATHS) {
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
   * Handle floating button click - fetches function rollup data for all paths
   * @param {string} period - Date period: 'today', 'week', 'lastWeek', 'month', 'lastMonth', 'custom'
   * @param {string} customStart - Custom start date (YYYY-MM-DD format)
   * @param {string} customEnd - Custom end date (YYYY-MM-DD format)
   */
  async function handleFabClick(period = 'today', customStart = null, customEnd = null) {
    log(`FAB clicked, fetching data for period: ${period}...`);

    const warehouseId = CONFIG.warehouseId || getWarehouseId();

    // Get date range for the selected period
    let dateRange;
    if (period === 'custom' && customStart && customEnd) {
      dateRange = getDateRangeForPeriod('custom', new Date(customStart), new Date(customEnd));
    } else {
      dateRange = getDateRangeForPeriod(period);
    }

    log(`Date range: ${formatDateForURL(dateRange.startDate)} to ${formatDateForURL(dateRange.endDate)} (${dateRange.spanType})`);

    // Show loading state
    const fab = document.getElementById('perf-validity-fab');
    if (fab) {
      fab.classList.add('loading');
      fab.querySelector('.perf-fab-text').textContent = 'Loading...';
    }

    try {
      // Fetch function rollup for each path - this gives us hours and JPH directly
      const performanceData = [];
      const allEmployees = new Map(); // Track unique employees

      log(`=== FETCHING ${ENABLED_PATHS.length} ENABLED PATHS ===`);
      log('Enabled paths:', ENABLED_PATHS.map(p => `${p.name} (${p.processId})`));

      for (const path of ENABLED_PATHS) {
        log(`\n--- Fetching: ${path.name} ---`);
        log(`  Process ID: ${path.processId}`);
        log(`  Category: ${path.category}`);

        try {
          const rollupData = await fetchFunctionRollup(path.processId, dateRange);

          if (rollupData.success && rollupData.employees && rollupData.employees.length > 0) {
            rollupData.employees.forEach(emp => {
              // Track unique employees
              if (!allEmployees.has(emp.badgeId)) {
                allEmployees.set(emp.badgeId, { id: emp.badgeId, name: emp.name });
              }

              // Add performance record with hours and JPH from rollup
              // Use subFunction name if available, otherwise use parent path name
              const subFunctionName = emp.subFunction && emp.subFunction !== 'Unknown' ? emp.subFunction : path.name;
              performanceData.push({
                employeeId: emp.badgeId,
                employeeName: emp.name,
                pathId: path.id,
                pathName: subFunctionName,
                pathColor: path.color,
                category: path.category,
                parentPath: path.name,
                hours: emp.totalHours,
                jobs: emp.jobs,
                jph: emp.jph,
                units: emp.units,
                uph: emp.uph
              });
            });

            log(`  ✓ Found ${rollupData.employees.length} employees`);
          } else {
            log(`  ✗ No employees found (success: ${rollupData.success}, error: ${rollupData.error || 'none'})`);
          }
        } catch (err) {
          log(`  ✗ Error: ${err.message}`);
        }
      }

      log(`Collected ${performanceData.length} performance records for ${allEmployees.size} unique employees`);

      // Store data for dashboard
      const dashboardData = {
        warehouseId,
        employees: Array.from(allEmployees.values()),
        performanceData: performanceData,
        dateRange: {
          period,
          startDate: formatDateForURL(dateRange.startDate),
          endDate: formatDateForURL(dateRange.endDate),
          spanType: dateRange.spanType
        },
        paths: PATHS,
        processIds: PROCESS_IDS,
        sourceUrl: window.location.href,
        fetchedAt: new Date().toISOString()
      };

      await browser.storage.local.set({ dashboardData });

      // Open dashboard
      browser.runtime.sendMessage({
        action: 'openDashboard',
        data: { warehouseId }
      });

      return dashboardData;

    } catch (error) {
      log('Error fetching data:', error);
      throw error;
    } finally {
      // Reset FAB state
      if (fab) {
        fab.classList.remove('loading');
        fab.querySelector('.perf-fab-text').textContent = 'AA Performance';
      }
    }
  }

  /**
   * Fetch performance data for a specific date range (called from dashboard)
   */
  async function fetchPerformanceDataForRange(period, customStart = null, customEnd = null) {
    log(`Fetching performance data for period: ${period}`);

    const warehouseId = CONFIG.warehouseId || getWarehouseId();

    // Get date range for the selected period
    let dateRange;
    if (period === 'custom' && customStart && customEnd) {
      dateRange = getDateRangeForPeriod('custom', new Date(customStart), new Date(customEnd));
    } else {
      dateRange = getDateRangeForPeriod(period);
    }

    const performanceData = [];
    const allEmployees = new Map();

    for (const path of ENABLED_PATHS) {
      try {
        const rollupData = await fetchFunctionRollup(path.processId, dateRange);

        if (rollupData.success && rollupData.employees) {
          rollupData.employees.forEach(emp => {
            if (!allEmployees.has(emp.badgeId)) {
              allEmployees.set(emp.badgeId, { id: emp.badgeId, name: emp.name });
            }

            // Use subFunction name if available, otherwise use parent path name
            const subFunctionName = emp.subFunction && emp.subFunction !== 'Unknown' ? emp.subFunction : path.name;
            performanceData.push({
              employeeId: emp.badgeId,
              employeeName: emp.name,
              pathId: path.id,
              pathName: subFunctionName,
              pathColor: path.color,
              category: path.category,
              parentPath: path.name,
              hours: emp.totalHours,
              jobs: emp.jobs,
              jph: emp.jph,
              units: emp.units,
              uph: emp.uph
            });
          });
        }
      } catch (err) {
        log(`Error fetching ${path.name}:`, err);
      }
    }

    return {
      success: true,
      warehouseId,
      employees: Array.from(allEmployees.values()),
      performanceData,
      dateRange: {
        period,
        startDate: formatDateForURL(dateRange.startDate),
        endDate: formatDateForURL(dateRange.endDate),
        spanType: dateRange.spanType
      },
      fetchedAt: new Date().toISOString()
    };
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
        fetchFunctionRollup(message.processId, message.customRange)
          .then(sendResponse);
        return true;

      case 'fetchAllPathData':
        fetchAllPathData().then(sendResponse);
        return true;

      case 'fetchPerformanceData':
        // Fetch performance data for a specific date range
        fetchPerformanceDataForRange(message.period, message.customStart, message.customEnd)
          .then(sendResponse)
          .catch(err => sendResponse({ success: false, error: err.message }));
        return true;

      case 'getConfig':
        sendResponse({
          warehouseId: CONFIG.warehouseId || getWarehouseId(),
          paths: PATHS,
          processIds: PROCESS_IDS,
          timeDetailMap: TIME_DETAIL_MAP,
          availablePeriods: ['today', 'week', 'lastWeek', 'month', 'lastMonth', 'custom']
        });
        return true;

      case 'triggerCheck':
        handleFabClick(message.period || 'today', message.customStart, message.customEnd);
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
