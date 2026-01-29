/**
 * AA Performance Validity - Popup Script
 */

(function() {
  'use strict';

  // DOM Elements
  const elements = {
    fclmStatus: document.getElementById('fclmStatus'),
    openDashboardBtn: document.getElementById('openDashboardBtn'),
    checkCurrentPageBtn: document.getElementById('checkCurrentPageBtn'),
    autoRefresh: document.getElementById('autoRefresh'),
    dateRangeDays: document.getElementById('dateRangeDays'),
    cacheCount: document.getElementById('cacheCount'),
    clearCacheBtn: document.getElementById('clearCacheBtn')
  };

  /**
   * Initialize popup
   */
  async function init() {
    console.log('[Popup] Initializing...');

    // Load saved settings
    await loadSettings();

    // Check connection status
    await checkStatus();

    // Attach event listeners
    attachEventListeners();

    console.log('[Popup] Initialized');
  }

  /**
   * Load saved settings from storage
   */
  async function loadSettings() {
    try {
      const storage = await browser.storage.local.get('settings');
      const settings = storage.settings || {};

      if (typeof settings.autoRefresh !== 'undefined') {
        elements.autoRefresh.checked = settings.autoRefresh;
      }

      if (settings.defaultDateRange) {
        elements.dateRangeDays.value = settings.defaultDateRange;
      }
    } catch (error) {
      console.error('[Popup] Error loading settings:', error);
    }
  }

  /**
   * Save settings to storage
   */
  async function saveSettings() {
    try {
      const settings = {
        autoRefresh: elements.autoRefresh.checked,
        defaultDateRange: parseInt(elements.dateRangeDays.value, 10)
      };

      await browser.storage.local.set({ settings });
      console.log('[Popup] Settings saved');
    } catch (error) {
      console.error('[Popup] Error saving settings:', error);
    }
  }

  /**
   * Check connection status for FCLM
   */
  async function checkStatus() {
    const statusDot = elements.fclmStatus.querySelector('.status-dot');
    const statusValue = elements.fclmStatus.querySelector('.status-value');

    try {
      // Query for FCLM tabs
      const tabs = await browser.tabs.query({
        url: [
          '*://fclm-portal.amazon.com/*',
          '*://fclm-iad-portal.amazon.com/*',
          '*://fclm*.amazon.com/*',
          '*://fcmenu-iad-regionalized.corp.amazon.com/*'
        ]
      });

      if (tabs.length > 0) {
        statusDot.classList.add('connected');
        statusDot.classList.remove('disconnected');
        statusValue.textContent = 'Connected';
      } else {
        statusDot.classList.remove('connected');
        statusDot.classList.add('disconnected');
        statusValue.textContent = 'Not detected';
      }
    } catch (error) {
      statusDot.classList.remove('connected');
      statusDot.classList.add('disconnected');
      statusValue.textContent = 'Error';
      console.error('[Popup] Error checking status:', error);
    }

    // Update cache count
    await updateCacheCount();
  }

  /**
   * Update cache count display
   */
  async function updateCacheCount() {
    try {
      const response = await browser.runtime.sendMessage({ action: 'getCacheStatus' });
      if (response.success) {
        elements.cacheCount.textContent = response.cacheSize;
      }
    } catch (error) {
      console.error('[Popup] Error getting cache status:', error);
      elements.cacheCount.textContent = '0';
    }
  }

  /**
   * Attach event listeners
   */
  function attachEventListeners() {
    // Open Dashboard button
    elements.openDashboardBtn.addEventListener('click', async () => {
      try {
        await browser.runtime.sendMessage({
          action: 'openDashboard',
          data: {
            dateRangeDays: parseInt(elements.dateRangeDays.value, 10)
          }
        });
        window.close();
      } catch (error) {
        console.error('[Popup] Error opening dashboard:', error);
      }
    });

    // Check Current Page button
    elements.checkCurrentPageBtn.addEventListener('click', async () => {
      try {
        // Get the current active tab
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        const currentTab = tabs[0];

        if (currentTab) {
          // Try to send message to content script
          try {
            await browser.tabs.sendMessage(currentTab.id, { action: 'triggerCheck' });
          } catch (e) {
            // Content script may not be loaded, that's okay
            console.log('[Popup] Could not reach content script:', e.message);
          }

          // Open dashboard with current page info
          await browser.runtime.sendMessage({
            action: 'openDashboard',
            data: {
              sourceUrl: currentTab.url,
              dateRangeDays: parseInt(elements.dateRangeDays.value, 10)
            }
          });
        }

        window.close();
      } catch (error) {
        console.error('[Popup] Error checking current page:', error);
      }
    });

    // Settings changes
    elements.autoRefresh.addEventListener('change', saveSettings);
    elements.dateRangeDays.addEventListener('change', saveSettings);

    // Clear cache button
    elements.clearCacheBtn.addEventListener('click', async () => {
      try {
        await browser.runtime.sendMessage({ action: 'clearCache' });
        elements.cacheCount.textContent = '0';
        console.log('[Popup] Cache cleared');
      } catch (error) {
        console.error('[Popup] Error clearing cache:', error);
      }
    });
  }

  // Initialize on load
  init();

})();
