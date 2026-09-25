#!/usr/bin/env bash
#
# DynamoDB Local helper for the v3/v4 backend integration tests.
#
#   ./scripts/dynamodb-local.sh start   # run DynamoDB Local on http://localhost:8000
#   ./scripts/dynamodb-local.sh stop
#   ./scripts/dynamodb-local.sh status
#
# The integration tests automatically skip (with a warning) when this is not
# running, so `npm test` stays green on machines without Docker.

set -euo pipefail

CONTAINER_NAME="aws-task-app-dynamodb-local"
PORT="${DYNAMODB_LOCAL_PORT:-8000}"

case "${1:-}" in
  start)
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
      echo "DynamoDB Local already running on http://localhost:${PORT}"
      exit 0
    fi
    docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
    # -inMemory: no host volume needed; tests create and delete their own tables.
    docker run -d --rm --name "${CONTAINER_NAME}" \
      -p "${PORT}:8000" \
      amazon/dynamodb-local:latest \
      -jar DynamoDBLocal.jar -inMemory >/dev/null
    echo "DynamoDB Local starting on http://localhost:${PORT} (container: ${CONTAINER_NAME})"
    ;;
  stop)
    docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
    echo "DynamoDB Local stopped"
    ;;
  status)
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
      echo "running (http://localhost:${PORT})"
    else
      echo "not running"
      exit 1
    fi
    ;;
  *)
    echo "Usage: $0 {start|stop|status}" >&2
    exit 2
    ;;
esac