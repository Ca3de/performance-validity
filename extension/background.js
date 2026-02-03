/**
 * AA Performance Validity - Background Script
 * Handles tab management, message passing, and data fetching
 */

const DEBUG = true;

function log(...args) {
  if (DEBUG) {
    console.log(`[Performance Validity ${new Date().toLocaleTimeString()}]`, ...args);
  }
}

// Cache for performance data (30 minute TTL)
const performanceCache = new Map();
const CACHE_TTL = 30 * 60 * 1000;

// Performance paths configuration
const PERFORMANCE_PATHS = {
  'pick_multis': {
    name: 'Pick Multis',
    processPath: 'MultiSlamPicking',
    color: '#4CAF50'
  },
  'pick_liquidation': {
    name: 'Pick Liquidation',
    processPath: 'LiquidationPicking',
    color: '#2196F3'
  },
  'stow': {
    name: 'Stow',
    processPath: 'Stow',
    color: '#FF9800'
  },
  'pack_singles': {
    name: 'Pack Singles',
    processPath: 'PackSingles',
    color: '#9C27B0'
  },
  'pack_multis': {
    name: 'Pack Multis',
    processPath: 'PackMultis',
    color: '#E91E63'
  },
  'count': {
    name: 'Count',
    processPath: 'Count',
    color: '#00BCD4'
  },
  'pick_singles': {
    name: 'Pick Singles',
    processPath: 'SingleSlamPicking',
    color: '#8BC34A'
  },
  'receive': {
    name: 'Receive',
    processPath: 'Receive',
    color: '#FFC107'
  }
};

// Listen for messages from content scripts and popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log('Received message:', message.action);

  switch (message.action) {
    case 'openPopup':
      openPopup(message.data);
      return true;

    case 'openDashboard':
      openDashboard(message.data);
      return true;

    case 'fetchPerformanceData':
      handleFetchPerformance(message)
        .then(sendResponse)
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'getPathConfig':
      sendResponse({ success: true, paths: PERFORMANCE_PATHS });
      return true;

    case 'clearCache':
      performanceCache.clear();
      log('Cache cleared');
      sendResponse({ success: true });
      return true;

    case 'getCacheStatus':
      sendResponse({
        success: true,
        cacheSize: performanceCache.size,
        entries: Array.from(performanceCache.keys())
      });
      return true;

    case 'contentScriptReady':
      log('Content script ready on:', sender.tab?.url);
      sendResponse({ success: true });
      return true;

    default:
      log('Unknown action:', message.action);
      sendResponse({ success: false, error: 'Unknown action' });
      return true;
  }
});

/**
 * Opens the popup - tries browserAction.openPopup first, falls back to tab
 */
async function openPopup(data = {}) {
  // Store data for the popup to retrieve
  if (data && Object.keys(data).length > 0) {
    await browser.storage.local.set({ dashboardData: data });
  }

  try {
    // Try to open the popup directly (Firefox 57+)
    if (browser.browserAction && browser.browserAction.openPopup) {
      await browser.browserAction.openPopup();
      log('Popup opened via browserAction.openPopup');
      return;
    }
  } catch (err) {
    log('browserAction.openPopup failed:', err.message);
  }

  // Fallback: open popup.html as a new tab
  const popupUrl = browser.runtime.getURL('popup/popup.html');
  browser.tabs.create({
    url: popupUrl,
    active: true
  }).then(tab => {
    log('Popup opened in tab:', tab.id);
  }).catch(err => {
    log('Error opening popup:', err);
  });
}

/**
 * Opens the performance dashboard in a new tab
 */
function openDashboard(data = {}) {
  const dashboardUrl = browser.runtime.getURL('dashboard/dashboard.html');

  // Store data for the dashboard to retrieve
  if (data && Object.keys(data).length > 0) {
    browser.storage.local.set({ dashboardData: data });
  }

  browser.tabs.create({
    url: dashboardUrl,
    active: true
  }).then(tab => {
    log('Dashboard opened in tab:', tab.id);
  }).catch(err => {
    log('Error opening dashboard:', err);
  });
}

/**
 * Handles performance data fetch requests
 */
async function handleFetchPerformance(message) {
  const { warehouseId, employeeId, path, startDate, endDate } = message;

  const cacheKey = `${warehouseId}:${employeeId}:${path}:${startDate}:${endDate}`;

  // Check cache first
  const cached = performanceCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    log('Returning cached data for:', cacheKey);
    return { success: true, data: cached.data, fromCache: true };
  }

  try {
    // This will be populated by the content script with the actual fetch logic
    // The content script has access to the authenticated session
    const data = await fetchPerformanceFromFCLM(warehouseId, employeeId, path, startDate, endDate);

    // Cache the result
    performanceCache.set(cacheKey, {
      data: data,
      timestamp: Date.now()
    });

    return { success: true, data: data, fromCache: false };
  } catch (error) {
    log('Error fetching performance:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Placeholder for FCLM performance data fetch
 * Actual implementation will depend on FCLM API structure
 */
async function fetchPerformanceFromFCLM(warehouseId, employeeId, path, startDate, endDate) {
  // This function will be called from the content script context
  // where we have access to the authenticated session
  log(`Fetching performance for ${employeeId} on ${path} from ${startDate} to ${endDate}`);

  // Return placeholder - actual data will come from content script
  return {
    employeeId,
    path,
    metrics: [],
    dateRange: { startDate, endDate }
  };
}

/**
 * Get date range for the past month
 */
function getPastMonthDateRange() {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 1);

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0]
  };
}

// Extension installation/update handler
browser.runtime.onInstalled.addListener((details) => {
  log('Extension installed/updated:', details.reason);

  if (details.reason === 'install') {
    // Initialize default settings
    browser.storage.local.set({
      settings: {
        autoRefresh: true,
        refreshInterval: 15,
        defaultDateRange: 30,
        showNotifications: true
      }
    });
  }
});

log('Background script loaded');
