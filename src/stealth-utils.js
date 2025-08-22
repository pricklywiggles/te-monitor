import { STEALTH_HEADERS } from './config.js';

/**
 * Apply modern stealth techniques to avoid detection
 * @param {Page} page - Puppeteer page instance
 */
export const applyStealthTechniques = async (page) => {
  // Override navigator.webdriver and other detection vectors
  await page.evaluateOnNewDocument(() => {
    // Remove webdriver property
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined
    });

    // Mock plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () =>
        [1, 2, 3, 4, 5].map((_, i) => ({
          name: `Plugin ${i}`,
          description: `Description ${i}`,
          filename: `plugin${i}.dll`,
          length: 1
        }))
    });

    // Mock languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en']
    });

    // Mock permissions
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) =>
      parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : originalQuery(parameters);

    // Mock chrome runtime
    window.chrome = {
      runtime: {}
    };

    // Mock screen dimensions to avoid headless detection
    Object.defineProperty(screen, 'height', { get: () => 1080 });
    Object.defineProperty(screen, 'width', { get: () => 1920 });
  });

  // Set realistic headers
  await page.setExtraHTTPHeaders(STEALTH_HEADERS);
};

/**
 * Wait for lazy-loaded content by scrolling through the page
 * @param {Page} page - Puppeteer page instance
 */
export const waitForLazyContent = async (page) => {
  try {
    // Scroll to trigger lazy loading
    await page.evaluate(() => {
      return new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            window.scrollTo(0, 0); // Scroll back to top
            resolve();
          }
        }, 100);

        // Timeout after 5 seconds
        setTimeout(() => {
          clearInterval(timer);
          resolve();
        }, 5000);
      });
    });

    // Wait for network to stabilize after scrolling
    await page
      .waitForFunction(() => document.readyState === 'complete', {
        timeout: 5000
      })
      .catch(() => {});
  } catch (error) {
    // Non-critical error, continue
    console.log('Lazy content loading skipped');
  }
};

/**
 * Add a random delay to appear more human-like
 * @param {number} ms - Base delay in milliseconds
 * @param {number} variance - Random variance (0-1)
 */
export const humanDelay = async (ms, variance = 0.5) => {
  const delay = ms + Math.random() * ms * variance;
  return new Promise((resolve) => setTimeout(resolve, delay));
};
