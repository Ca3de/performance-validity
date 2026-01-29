/**
 * AA Performance Validity - FCLM Content Script
 * Injects performance check button into FCLM portal
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
    pollInterval: 2000,
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
   * Extract warehouse ID from URL
   */
  function getWarehouseId() {
    const url = window.location.href;

    // Try various URL patterns
    const patterns = [
      /[?&]warehouseId=([A-Z0-9]+)/i,
      /\/fc\/([A-Z0-9]+)\//i,
      /warehouse[=\/]([A-Z0-9]+)/i,
      /site[=\/]([A-Z0-9]+)/i
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1].toUpperCase();
      }
    }

    // Try to find in page content
    const pageText = document.body?.innerText || '';
    const fcMatch = pageText.match(/\b([A-Z]{3}\d{1,2})\b/);
    if (fcMatch) {
      return fcMatch[1];
    }

    return 'UNKNOWN';
  }

  /**
   * Get date range for past month
   */
  function getDateRange() {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - CONFIG.dateRangeDays);

    return {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate)
    };
  }

  function formatDate(date) {
    return date.toISOString().split('T')[0];
  }

  /**
   * Create the floating action button
   */
  function createFloatingButton() {
    // Check if already exists
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

    // Collect any selected employees from the page
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
      // Fallback: open directly
      window.open(browser.runtime.getURL('dashboard/dashboard.html'), '_blank');
    });
  }

  /**
   * Try to extract selected employees from FCLM page
   */
  function getSelectedEmployees() {
    const employees = [];

    // Look for employee IDs in various formats on the page
    // This will be customized based on FCLM page structure

    // Try table rows with employee data
    const rows = document.querySelectorAll('tr[data-employee-id], tr[data-login]');
    rows.forEach(row => {
      const id = row.dataset.employeeId || row.dataset.login;
      const name = row.querySelector('.employee-name, .login-name')?.textContent;
      if (id) {
        employees.push({ id, name: name || id });
      }
    });

    // Try employee cards/badges
    const badges = document.querySelectorAll('[class*="employee"], [class*="associate"]');
    badges.forEach(badge => {
      const idMatch = badge.textContent.match(/\b([A-Z]{2,}[0-9]+)\b/i);
      if (idMatch) {
        employees.push({ id: idMatch[1], name: badge.textContent.trim() });
      }
    });

    // Look for login/badge IDs in input fields
    const inputs = document.querySelectorAll('input[name*="login"], input[name*="badge"], input[name*="employee"]');
    inputs.forEach(input => {
      if (input.value) {
        employees.push({ id: input.value, name: input.value });
      }
    });

    // Deduplicate
    const seen = new Set();
    return employees.filter(emp => {
      if (seen.has(emp.id)) return false;
      seen.add(emp.id);
      return true;
    });
  }

  /**
   * Add performance button to employee rows in tables
   */
  function enhanceEmployeeTables() {
    const tables = document.querySelectorAll('table');

    tables.forEach(table => {
      // Check if this table has employee data
      const headers = table.querySelectorAll('th');
      let hasEmployeeColumn = false;
      let employeeColumnIndex = -1;

      headers.forEach((header, index) => {
        const text = header.textContent.toLowerCase();
        if (text.includes('login') || text.includes('employee') || text.includes('associate') || text.includes('badge')) {
          hasEmployeeColumn = true;
          employeeColumnIndex = index;
        }
      });

      if (!hasEmployeeColumn) return;

      // Add header for our column if not exists
      const headerRow = table.querySelector('thead tr, tr:first-child');
      if (headerRow && !headerRow.querySelector('.perf-check-header')) {
        const th = document.createElement('th');
        th.className = 'perf-check-header';
        th.textContent = 'Perf Check';
        headerRow.appendChild(th);
      }

      // Add button to each data row
      const rows = table.querySelectorAll('tbody tr, tr:not(:first-child)');
      rows.forEach(row => {
        if (row.querySelector('.perf-check-cell')) return;

        const cells = row.querySelectorAll('td');
        if (cells.length === 0) return;

        // Get employee ID from the row
        const employeeCell = cells[employeeColumnIndex] || cells[0];
        const employeeId = extractEmployeeId(employeeCell);

        if (!employeeId) return;

        const td = document.createElement('td');
        td.className = 'perf-check-cell';

        const btn = document.createElement('button');
        btn.className = 'perf-check-btn';
        btn.innerHTML = `
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4zm2 2H5V5h14v14zm0-16H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
          </svg>
        `;
        btn.title = `Check performance for ${employeeId}`;
        btn.dataset.employeeId = employeeId;

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          openEmployeePerformance(employeeId);
        });

        td.appendChild(btn);
        row.appendChild(td);
      });
    });
  }

  /**
   * Extract employee ID from a cell
   */
  function extractEmployeeId(cell) {
    // Direct text content
    const text = cell.textContent.trim();

    // Try various patterns
    const patterns = [
      /^([a-z]{2,}[0-9]+)$/i,  // login format like "johnd123"
      /\b([a-z]{2,}[0-9]+)\b/i,
      /^(\d{8,})$/,  // badge number format
      /\b(\d{8,})\b/
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }

    // Check data attributes
    return cell.dataset.employeeId || cell.dataset.login || cell.dataset.badge || null;
  }

  /**
   * Open performance dashboard for specific employee
   */
  function openEmployeePerformance(employeeId) {
    log('Opening performance for employee:', employeeId);

    const dateRange = getDateRange();
    const warehouseId = CONFIG.warehouseId || getWarehouseId();

    browser.runtime.sendMessage({
      action: 'openDashboard',
      data: {
        warehouseId: warehouseId,
        employees: [{ id: employeeId, name: employeeId }],
        focusEmployee: employeeId,
        dateRange: dateRange,
        paths: PATHS,
        sourceUrl: window.location.href
      }
    });
  }

  /**
   * Fetch performance data for an employee
   */
  async function fetchEmployeePerformance(employeeId, path) {
    const dateRange = getDateRange();
    const warehouseId = CONFIG.warehouseId || getWarehouseId();

    try {
      const response = await browser.runtime.sendMessage({
        action: 'fetchPerformanceData',
        warehouseId: warehouseId,
        employeeId: employeeId,
        path: path,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
      });

      return response;
    } catch (error) {
      log('Error fetching performance:', error);
      return { success: false, error: error.message };
    }
  }

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

    // Enhance existing tables
    enhanceEmployeeTables();

    // Watch for DOM changes to enhance dynamically loaded content
    const observer = new MutationObserver((mutations) => {
      let shouldEnhance = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          shouldEnhance = true;
          break;
        }
      }
      if (shouldEnhance) {
        enhanceEmployeeTables();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

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
