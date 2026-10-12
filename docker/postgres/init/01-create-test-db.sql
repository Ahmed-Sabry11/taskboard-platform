-- Runs once, when the database volume is first created.
-- The integration tests use this database so they never touch development data.
CREATE DATABASE taskboard_test;
