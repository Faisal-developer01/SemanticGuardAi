#!/usr/bin/env python
"""Setup PostgreSQL database for SemanticGuard AI"""
import psycopg2
from psycopg2 import sql

try:
    # Connect to default postgres database
    conn = psycopg2.connect(
        host='localhost',
        port=5432,
        user='postgres',
        password='faisal',
        database='postgres'
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
