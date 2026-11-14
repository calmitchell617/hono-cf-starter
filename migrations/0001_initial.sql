CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  auth_version INTEGER NOT NULL DEFAULT 1 CHECK (auth_version > 0)
);

CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0)
);

CREATE INDEX posts_user_id_idx ON posts (user_id);

CREATE TABLE tokens (
  hash TEXT PRIMARY KEY NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  scope TEXT NOT NULL,
  auth_version INTEGER NOT NULL DEFAULT 1 CHECK (auth_version > 0)
);

CREATE INDEX tokens_expires_at_idx ON tokens (expires_at);
CREATE INDEX tokens_user_id_idx ON tokens (user_id);

CREATE TABLE roles (
  code TEXT PRIMARY KEY NOT NULL
);

CREATE TABLE permissions (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE
);

CREATE TABLE user_roles (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_code TEXT NOT NULL REFERENCES roles(code) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_code)
);

CREATE TABLE role_permissions (
  role_code TEXT NOT NULL REFERENCES roles(code) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_code, permission_id)
);

CREATE INDEX user_roles_role_code_idx ON user_roles (role_code);
CREATE INDEX role_permissions_permission_id_idx ON role_permissions (permission_id);

INSERT INTO roles (code) VALUES ('public'), ('admin');
INSERT INTO permissions (code) VALUES ('posts:list'), ('posts:view'), ('posts:create'), ('posts:edit'), ('users:promote');

INSERT INTO role_permissions (role_code, permission_id)
SELECT roles.code, permissions.id FROM roles CROSS JOIN permissions
WHERE roles.code = 'admin' OR permissions.code IN ('posts:list', 'posts:view', 'posts:create', 'posts:edit');
