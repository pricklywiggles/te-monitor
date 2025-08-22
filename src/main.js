import fs from 'fs/promises';
import { WebPageMonitor } from './web-page-monitor.js';

/**
 * Main entry point for the monitoring application
 * Handles environment configuration and graceful shutdown
 */
export const main = async (getElementHash, handleAlert) => {
  const url = process.env.MONITOR_URL;
  const checkInterval =
    parseInt(process.env.MONITOR_INTERVAL) || 10 * 60 * 1000; // Default 10 minutes
  const debug = process.env.MONITOR_DEBUG === 'true';
  const webhookUrl = process.env.MONITOR_WEBHOOK || null;
  const clearState = process.env.MONITOR_CLEAR_STATE === 'true';
  const selector = process.env.MONITOR_SELECTOR || 'body';

  if (!process.env.MONITOR_URL) {
    console.log('⚠️  Required environment variable missing:');
    console.log('   MONITOR_URL - URL to monitor (required)');
    console.log('   MONITOR_INTERVAL - Check interval in ms (optional)');
    console.log('   MONITOR_DEBUG - Enable debug logging (optional)');
    console.log('   MONITOR_WEBHOOK - Webhook URL for alerts (optional)');
    console.log(
      '   MONITOR_CLEAR_STATE - Clear previous state before starting (optional)\n'
    );
    process.exit(1);
  }

  const monitor = new WebPageMonitor({
    url,
    checkInterval,
    headless: true,
    debug,
    maxRetries: 3,
    alertWebhook: webhookUrl,
    onAlert: handleAlert,
    getElementHash,
    selector
  });

  // Clear state if requested
  if (clearState) {
    try {
      await fs.unlink(monitor.config.stateFile);
      console.log('✅ Previous state cleared\n');
    } catch (error) {
      // File doesn't exist, that's fine
    }
  }

  /**
   * Handle graceful shutdown of the monitoring process
   */
  const shutdown = async () => {
    console.log('\n⏸️  Gracefully shutting down...');
    await monitor.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start monitoring
  await monitor.start();
};

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
