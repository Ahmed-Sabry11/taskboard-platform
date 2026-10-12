import os

# Set before the application is imported. The URL points at a closed port on
# purpose: no test may reach the development database through DATABASE_URL.
# Integration tests use TEST_DATABASE_URL and inject their own sessions.
os.environ["DATABASE_URL"] = "postgresql+psycopg://unused:unused@127.0.0.1:1/unused"
os.environ["APP_ENV"] = "test"
