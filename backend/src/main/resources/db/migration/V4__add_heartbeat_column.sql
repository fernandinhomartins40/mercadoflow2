-- Add last_heartbeat_at column to agent_api_keys table
ALTER TABLE agent_api_keys ADD COLUMN last_heartbeat_at TIMESTAMP;

-- Create index for efficient online status queries
CREATE INDEX idx_agent_api_key_heartbeat ON agent_api_keys(last_heartbeat_at) WHERE is_active = true;

-- Add comment for documentation
COMMENT ON COLUMN agent_api_keys.last_heartbeat_at IS 'Timestamp of the last heartbeat ping from the agent (updated every 2 minutes)';
