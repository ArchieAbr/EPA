#!/usr/bin/env bash
# Reset the database to default seed data and start the Flask server.

set -e
cd "$(dirname "$0")/backend"

echo "Resetting database…"
python3 app.py --reset

echo ""
echo "Starting server on http://127.0.0.1:5000"
python3 app.py
