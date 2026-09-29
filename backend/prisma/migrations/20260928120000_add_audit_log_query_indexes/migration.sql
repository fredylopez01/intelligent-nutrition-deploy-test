CREATE INDEX "audit_log_entity_entity_id_idx" ON "audit_log"("entity", "entity_id");

CREATE INDEX "audit_log_action_created_at_idx" ON "audit_log"("action", "created_at");

CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");