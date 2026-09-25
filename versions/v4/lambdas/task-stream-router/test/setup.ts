// Runs before any test module is imported: give the router the queue URL its
// module-scope wiring requires (it fails fast without one, on purpose).
process.env.QUEUE_URL ??= 'https://sqs.us-east-1.amazonaws.com/123456789012/dev-task-notifications';