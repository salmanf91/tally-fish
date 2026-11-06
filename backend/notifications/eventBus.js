const EventEmitter = require('events');

/**
 * Global Application Event Bus
 * Used for decoupled asynchronous events such as push notifications and audit events.
 */
class AppEventBus extends EventEmitter {}

const eventBus = new AppEventBus();

// Increase max listeners if needed in busy production environments
eventBus.setMaxListeners(50);

module.exports = eventBus;

