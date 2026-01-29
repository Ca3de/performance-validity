# AA Performance Validity

A Firefox extension that checks AA (Associate) performance metrics across various paths within the past month. The extension integrates with FCLM (FC Labor Management) portal and provides a comprehensive dashboard to view performance data.

## Features

- **FCLM Integration**: Automatically injects a floating button on FCLM pages for quick access
- **Performance Dashboard**: Opens in a new tab showing comprehensive performance metrics
- **Multi-Path Tracking**: Supports tracking across various paths:
  - Pick Multis
  - Pick Liquidation
  - Pick Singles
  - Stow
  - Pack Singles
  - Pack Multis
  - Count
  - Receive
  - Problem Solve
  - Water Spider
- **Date Range Selection**: Filter performance data by custom date ranges (default: past 30 days)
- **Employee Search**: Search and filter employees by ID or name
- **Export to CSV**: Export performance data for further analysis
- **Auto-Refresh**: Optionally auto-refresh data at configurable intervals
- **Caching**: 30-minute cache to reduce redundant API requests

## Installation

### Firefox

1. Download the extension folder or clone this repository
2. Open Firefox and navigate to `about:debugging`
3. Click "This Firefox" in the left sidebar
4. Click "Load Temporary Add-on"
5. Navigate to the `extension` folder and select `manifest.json`

### Permanent Installation

1. Package the extension folder as a `.zip` file
2. Rename to `.xpi`
3. Sign the extension via [Firefox Add-on Developer Hub](https://addons.mozilla.org/developers/)
4. Install the signed `.xpi` file

## Usage

### From FCLM Portal

1. Navigate to any FCLM portal page
2. Look for the blue "AA Performance" floating button in the bottom-right corner
3. Click the button to open the Performance Dashboard in a new tab

### From Browser Toolbar

1. Click the extension icon in the Firefox toolbar
2. Use "Open Dashboard" to open the dashboard directly
3. Use "Check Current Page" to analyze the current FCLM page

### Dashboard Features

- **Summary Cards**: Quick overview of total AAs, meeting goal, below goal, and active paths
- **Employee Input**: Add employees manually by entering IDs (comma or newline separated)
- **Path Filters**: Filter the table by specific paths
- **Performance Table**: Detailed view with hours, units, rate, goal, and status
- **Path Summary**: Cards showing aggregate data for each path
- **Export**: Download data as CSV

## File Structure

```
extension/
├── manifest.json           # Extension manifest
├── background.js           # Background script for tab management
├── content/
│   ├── fclm.js            # Content script for FCLM injection
│   └── fclm.css           # Styles for injected elements
├── dashboard/
│   ├── dashboard.html     # Performance dashboard page
│   ├── dashboard.css      # Dashboard styles
│   └── dashboard.js       # Dashboard functionality
├── popup/
│   ├── popup.html         # Browser action popup
│   ├── popup.css          # Popup styles
│   └── popup.js           # Popup functionality
└── icons/
    ├── icon-16.svg
    ├── icon-32.svg
    ├── icon-48.svg
    └── icon-128.svg
```

## Permissions

The extension requires the following permissions:

- `activeTab`: Access to the currently active tab
- `storage`: Store settings and cached data
- `tabs`: Open new tabs for the dashboard
- Host permissions for FCLM and related Amazon portals

## Configuration

### Settings (via Popup)

- **Auto-refresh**: Enable/disable automatic data refresh
- **Date range**: Set default date range (7, 14, 30, or 60 days)

### Cache Management

- Cache expires after 30 minutes
- Clear cache manually via the popup

## Development

### Prerequisites

- Firefox 109.0 or higher
- Basic knowledge of WebExtensions API

### Loading for Development

1. Open `about:debugging` in Firefox
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select any file in the `extension` directory

### Making Changes

- Modify files in the `extension` directory
- Click "Reload" in `about:debugging` to apply changes
- Check the browser console for debug logs (prefixed with `[Performance Validity]`)

## Customization

### Adding New Paths

Edit the `PATH_CONFIG` object in:
- `extension/background.js`
- `extension/content/fclm.js`
- `extension/dashboard/dashboard.js`

Add entries like:
```javascript
'new_path': {
  name: 'New Path Name',
  processPath: 'ProcessPathIdentifier',
  color: '#HexColor',
  goal: 40  // UPH goal, or null if N/A
}
```

### Modifying FCLM Detection

Update the URL patterns in `manifest.json` under `content_scripts.matches` to target additional pages.

## Troubleshooting

### Extension not appearing on FCLM

- Verify the URL matches the patterns in `manifest.json`
- Check the browser console for errors
- Ensure the extension is enabled

### Dashboard not loading data

- Check if FCLM session is authenticated
- Verify network connectivity
- Clear cache and retry

### Performance data not accurate

- This extension uses sample/demo data by default
- Connect the actual FCLM API endpoints for real data

## License

MIT License - See LICENSE file for details

## Author

Ca3de

## Related Projects

- [scan-check](https://github.com/Ca3de/scan-check) - FC Labor Tracking Assistant
- [picking-console-size](https://github.com/Ca3de/picking-console-size) - Picking Console Size Calculator
