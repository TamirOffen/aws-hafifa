/**
 * Process bootstrap: read config, wire dependencies, bind the port.
 *
 * This is the only file that touches the network directly. If configuration is
 * missing it exits(1) immediately — in ECS you will see exactly that in the
 * stopped-task reason (Stage 6 turns this into a debugging exercise).
 */
import { createApp } from './app';
import { ConfigError, readConfig } from './config';
import { createDocumentClient } from './dynamo';
import { createDynamoTaskStore } from './dynamo-store';
import { createLogger } from './logger';

function main(): void {
  const config = readConfig();
  const logger = createLogger(config.environment);
  // Credentials come from the TASK ROLE — permissions on that role decide
  // whether these SDK calls succeed (Stage 8 break-it: remove PutItem and
  // watch AccessDenied appear in the logs while users see 500s).
  const client = createDocumentClient({
    region: config.awsRegion,
    endpointUrl: config.dynamodbEndpointUrl,
  });
  const store = createDynamoTaskStore({ tableName: config.tableName, client });
  const app = createApp({ config, store, logger });

  const server = app.listen(config.port, () => {
    logger.info({ event: 'serverStarted', port: config.port }, 'API listening');
  });

  const shutdown = (signal: string): void => {
    server.close(() => {
      logger.info({ event: 'serverStopped', signal }, 'API stopped');
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

try {
  main();
} catch (err) {
  if (err instanceof ConfigError) {
    // Logger needs config to exist; fall back to a plain JSON line so the
    // failure is still machine-readable in container logs.
    console.error(JSON.stringify({ level: 'error', message: 'Configuration error', detail: err.message }));
  } else {
    console.error(err);
  }
  process.exit(1);
}