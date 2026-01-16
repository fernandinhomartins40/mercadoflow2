export interface AgentConfig {
  api_url: string;
  api_token: string;
  api_token_encrypted?: string;
  market_id: string;
  hmac_secret?: string;
  watch_paths: string[];
  poll_interval_seconds: number;
  retry_interval_minutes: number;
  healthcheck_enabled: boolean;
  healthcheck_port: number;
}
