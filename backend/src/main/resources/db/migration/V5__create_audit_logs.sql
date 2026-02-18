-- Create audit_logs table for comprehensive action tracking
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    action VARCHAR(50) NOT NULL,
    actor_type VARCHAR(20) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    agent_key_id UUID REFERENCES agent_api_keys(id) ON DELETE SET NULL,
    market_id UUID REFERENCES markets(id) ON DELETE SET NULL,
    ip_address VARCHAR(45),
    user_agent VARCHAR(500),
    details TEXT,
    success BOOLEAN,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_market ON audit_logs(market_id);
CREATE INDEX idx_audit_timestamp ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_agent ON audit_logs(agent_key_id);
CREATE INDEX idx_audit_action ON audit_logs(action);

-- Comments for documentation
COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail for all system actions';
COMMENT ON COLUMN audit_logs.entity_type IS 'Type of entity (INVOICE, PRODUCT, MARKET, AGENT_KEY, etc.)';
COMMENT ON COLUMN audit_logs.action IS 'Action performed (CREATE, UPDATE, DELETE, AUTHENTICATE, INGEST, etc.)';
COMMENT ON COLUMN audit_logs.actor_type IS 'Type of actor (USER, AGENT, SYSTEM)';
COMMENT ON COLUMN audit_logs.details IS 'JSON with additional context about the action';
