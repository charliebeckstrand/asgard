CREATE TABLE configs (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    namespace   VARCHAR(255) NOT NULL,
    key         VARCHAR(255) NOT NULL,
    value       TEXT         NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE(namespace, key)
);

CREATE INDEX ix_configs_namespace ON configs (namespace);
