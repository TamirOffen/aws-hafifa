/**
 * Shared test fixtures: provision a throwaway DynamoDB Local table per run and
 * probe whether DynamoDB Local is reachable at all (tests that need it skip
 * with a clear message when it is not — see scripts/dynamodb-local.sh).
 */
import { randomUUID } from 'node:crypto';
import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  ListTablesCommand,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  type DynamoDBDocumentClient as DocumentClient,
} from '@aws-sdk/lib-dynamodb';

export const LOCAL_ENDPOINT = 'http://127.0.0.1:8000';
export const LOCAL_REGION = 'us-east-1';

/**
 * The SDK insists on resolving *some* credentials even for a local endpoint,
 * and the chain (env vars, ~/.aws, instance metadata) can legitimately be empty
 * on a dev laptop. DynamoDB Local ignores the values but validates the FORMAT,
 * so we use AWS's canonical documentation example key. This is the standard
 * local-testing pattern.
 */
const LOCAL_CREDENTIALS = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
};

/** DocumentClient pointed at DynamoDB Local for tests. */
export function createLocalDocumentClient(): DynamoDBDocumentClient {
  const client = new DynamoDBClient({
    region: LOCAL_REGION,
    endpoint: LOCAL_ENDPOINT,
    credentials: LOCAL_CREDENTIALS,
  });
  return DynamoDBDocumentClient.from(client);
}

/** Resolves true when DynamoDB Local answers on the expected endpoint. */
export async function isDynamoLocalReachable(): Promise<boolean> {
  try {
    const client = new DynamoDBClient({
      region: LOCAL_REGION,
      endpoint: LOCAL_ENDPOINT,
      credentials: LOCAL_CREDENTIALS,
    });
    await client.send(new ListTablesCommand({}));
    return true;
  } catch {
    return false;
  }
}

/** Creates a uniquely-named table and returns its name; caller deletes it in afterAll. */
export async function createTestTable(client: DocumentClient): Promise<string> {
  const tableName = `aws-task-app-test-${randomUUID().slice(0, 8)}`;
  await client.send(
    new CreateTableCommand({
      TableName: tableName,
      KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
      AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
      BillingMode: 'PAY_PER_REQUEST',
    }),
  );
  return tableName;
}

export async function deleteTestTable(client: DocumentClient, tableName: string): Promise<void> {
  await client.send(new DeleteTableCommand({ TableName: tableName }));
}