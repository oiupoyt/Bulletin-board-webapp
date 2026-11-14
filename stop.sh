#!/usr/bin/env bash
# Stop Noticeboard server
cd "$(dirname "$0")"

PID_FILE="./noticeboard.pid"

if [ ! -f "$PID_FILE" ]; then
    # Try finding node server.js inside this directory
    PID=$(pgrep -f "node.*server.js" | head -n 1)
    if [ -z "$PID" ]; then
        echo "Noticeboard is not running."
        exit 0
    fi
else
    PID=$(cat "$PID_FILE")
fi

if kill -0 "$PID" 2>/dev/null; then
    echo "Stopping Noticeboard (PID: $PID)..."
    kill "$PID"
    sleep 1
    if kill -0 "$PID" 2>/dev/null; then
        kill -9 "$PID"
    fi
    echo "✓ Noticeboard stopped."
else
    echo "Noticeboard process $PID was not running."
fi

rm -f "$PID_FILE"
