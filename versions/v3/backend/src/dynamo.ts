/**
 * DynamoDB client factory.
 *
 * In ECS the client uses the region from config and the credentials of the
 * TASK ROLE (never baked-in keys — see Stage 8's IAM section). The optional
 * endpoint override exists purely so integration tests can point the same
 * code at DynamoDB Local on your laptop.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export interface DynamoClientOptions {
  readonly region: string;
  readonly endpointUrl?: string;
}

export function createDocumentClient({ region, endpointUrl }: DynamoClientOptions): DynamoDBDocumentClient {
  const client = new DynamoDBClient({
    region,
    ...(endpointUrl ? { endpoint: endpointUrl } : {}),
  });
  // The DocumentClient marshals/unmarshalls JS objects <-> DynamoDB attribute
  // values, so the store works with plain Tasks instead of { S: "..." } blobs.
  return DynamoDBDocumentClient.from(client);
}