/* eslint-disable camelcase */

/**
 * Migration: Automated Audit Log Triggers
 * Tracks actor, branch, previous values (old), and new values on entries & entry_rates
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE OR REPLACE FUNCTION trg_audit_entries_and_rates()
    RETURNS TRIGGER AS $$
    DECLARE
      v_actor_id UUID;
      v_branch_id UUID;
      v_action VARCHAR(100);
      v_entity_type VARCHAR(100);
      v_entity_id UUID;
      v_old_data JSONB;
      v_new_data JSONB;
    BEGIN
      IF (TG_OP = 'UPDATE') THEN
        IF (TG_TABLE_NAME = 'entries') THEN
          v_entity_type := 'entries';
          v_entity_id := NEW.id;
          v_branch_id := NEW.branch_id;
          BEGIN
            v_actor_id := NULLIF(current_setting('app.current_actor_id', true), '')::UUID;
          EXCEPTION WHEN OTHERS THEN
            v_actor_id := NULL;
          END;
          IF (v_actor_id IS NULL) THEN
            v_actor_id := COALESCE(NEW.updated_by, NEW.created_by);
          END IF;

          v_action := CASE
            WHEN OLD.status IS DISTINCT FROM NEW.status THEN 'ENTRY_STATUS_CHANGED'
            ELSE 'ENTRY_UPDATED'
          END;
          v_old_data := to_jsonb(OLD);
          v_new_data := to_jsonb(NEW);
        ELSIF (TG_TABLE_NAME = 'entry_rates') THEN
          v_entity_type := 'entry_rates';
          v_entity_id := NEW.id;
          SELECT branch_id INTO v_branch_id FROM entries WHERE id = NEW.entry_id;
          BEGIN
            v_actor_id := NULLIF(current_setting('app.current_actor_id', true), '')::UUID;
          EXCEPTION WHEN OTHERS THEN
            v_actor_id := NULL;
          END;
          IF (v_actor_id IS NULL) THEN
            v_actor_id := NEW.rated_by;
          END IF;

          v_action := 'RATE_UPDATED';
          v_old_data := to_jsonb(OLD);
          v_new_data := to_jsonb(NEW);
        END IF;

        INSERT INTO audit_logs (
          id,
          actor_id,
          branch_id,
          action,
          entity_type,
          entity_id,
          diffs,
          created_at
        ) VALUES (
          gen_random_uuid(),
          v_actor_id,
          v_branch_id,
          v_action,
          v_entity_type,
          v_entity_id,
          jsonb_build_object('old', v_old_data, 'new', v_new_data),
          CURRENT_TIMESTAMP
        );

      ELSIF (TG_OP = 'INSERT') THEN
        IF (TG_TABLE_NAME = 'entry_rates') THEN
          v_entity_type := 'entry_rates';
          v_entity_id := NEW.id;
          SELECT branch_id INTO v_branch_id FROM entries WHERE id = NEW.entry_id;
          BEGIN
            v_actor_id := NULLIF(current_setting('app.current_actor_id', true), '')::UUID;
          EXCEPTION WHEN OTHERS THEN
            v_actor_id := NULL;
          END;
          IF (v_actor_id IS NULL) THEN
            v_actor_id := NEW.rated_by;
          END IF;

          v_action := 'RATE_CREATED';
          v_new_data := to_jsonb(NEW);

          INSERT INTO audit_logs (
            id,
            actor_id,
            branch_id,
            action,
            entity_type,
            entity_id,
            diffs,
            created_at
          ) VALUES (
            gen_random_uuid(),
            v_actor_id,
            v_branch_id,
            v_action,
            v_entity_type,
            v_entity_id,
            jsonb_build_object('old', NULL, 'new', v_new_data),
            CURRENT_TIMESTAMP
          );
        END IF;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_entries_audit ON entries;
    CREATE TRIGGER trg_entries_audit
    AFTER UPDATE ON entries
    FOR EACH ROW EXECUTE FUNCTION trg_audit_entries_and_rates();

    DROP TRIGGER IF EXISTS trg_entry_rates_audit ON entry_rates;
    CREATE TRIGGER trg_entry_rates_audit
    AFTER INSERT OR UPDATE ON entry_rates
    FOR EACH ROW EXECUTE FUNCTION trg_audit_entries_and_rates();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS trg_entries_audit ON entries;
    DROP TRIGGER IF EXISTS trg_entry_rates_audit ON entry_rates;
    DROP FUNCTION IF EXISTS trg_audit_entries_and_rates CASCADE;
  `);
};

