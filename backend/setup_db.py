#!/usr/bin/env python
"""Setup PostgreSQL database for SemanticGuard AI (local development helper)."""
import os

import psycopg2
from psycopg2 import sql

try:
    # Connect to the default postgres database. Credentials come from the
    # environment so no password is hardcoded in source control.
    conn = psycopg2.connect(
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port=int(os.getenv("POSTGRES_PORT", "5432")),
        user=os.getenv("POSTGRES_USER", "postgres"),
        password=os.getenv("POSTGRES_PASSWORD", "postgres"),
        database="postgres",
    )
    conn.autocommit = True
    cur = conn.cursor()
    
    # Check if database exists
    cur.execute("SELECT 1 FROM pg_database WHERE datname = 'semanticguard'")
    if cur.fetchone() is None:
        print('Creating database semanticguard...')
        cur.execute('CREATE DATABASE semanticguard')
        print('✓ Database created successfully!')
    else:
        print('✓ Database semanticguard already exists')
    
    cur.close()
    conn.close()
    print('✓ PostgreSQL setup complete')
except Exception as e:
    print(f'✗ Error: {e}')
    exit(1)
