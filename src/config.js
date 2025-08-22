/**
 * Configuration constants and defaults for the monitoring system
 */

/**
 * Default configuration values for the monitoring system
 * @type {Object}
 * @property {number} checkInterval - Default check interval in milliseconds (30 minutes)
 * @property {number} maxRetries - Maximum number of retry attempts
 * @property {number} retryDelay - Delay between retries in milliseconds
 * @property {boolean} headless - Whether to run browser in headless mode
 * @property {number} timeout - Timeout for browser operations in milliseconds
 * @property {boolean} debug - Whether to enable debug logging
 * @property {string} browser - Default browser to use
 */
export const DEFAULT_CONFIG = {
  checkInterval: 30 * 60 * 1000, // 30 minutes
  maxRetries: 3,
  retryDelay: 3000,
  headless: true,
  timeout: 30000,
  debug: false,
  browser: 'chrome'
};

/**
 * Browser configuration for Puppeteer
 * @type {Object}
 * @property {string[]} args - Browser launch arguments
 * @property {Object} defaultViewport - Default viewport settings
 * @property {boolean} ignoreHTTPSErrors - Whether to ignore HTTPS errors
 * @property {string} userAgent - Default user agent string
 */
export const BROWSER_CONFIG = {
  // Modern args for stability and stealth
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-gpu',
    '--window-size=1920,1080',
    '--start-maximized',
    // Network optimization
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    // Certificate and security
    '--ignore-certificate-errors',
    '--ignore-certificate-errors-spki-list'
  ],

  // Set viewport
  defaultViewport: {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1
  },

  // Ignore HTTPS errors
  ignoreHTTPSErrors: true,

  // Default user agent
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
};

/**
 * HTTP headers for stealth browsing to avoid detection
 * @type {Object}
 */
export const STEALTH_HEADERS = {
  'Accept-Language': 'en-US,en;q=0.9',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'Sec-Ch-Ua': '"Chromium";v="127", "Not=A?Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1'
};
