/**
 * One integration's health, as shown on the status page and returned by /api/integrations.
 * "off" means not configured or not installed, which is a normal state, not a failure.
 */
export type IntegrationStatus = {
  id: string;
  name: string;
  state: "off" | "ok" | "error";
  detail: string;
};
