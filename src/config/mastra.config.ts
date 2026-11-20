/**
 * Resolves the Mastra AI Agent Engine base URL from backend environment variables.
 * Keeps the engine endpoint centralized on the backend and never exposed to the frontend.
 */
export function getMastraBaseUrl(): string {
  return (
    process.env.MASTRA_API_URL ||
    process.env.MASTRA_BASE_URL ||
    process.env.MASTRA_ENDPOINT ||
    'http://127.0.0.1:4111'
  ).replace(/\/+$/, '');
}
