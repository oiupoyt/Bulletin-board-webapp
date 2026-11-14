#!/usr/bin/env bash
# Start Noticeboard server in background
cd "$(dirname "$0")"

PID_FILE="./noticeboard.pid"
LOG_FILE="./noticeboard.log"

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        echo "Noticeboard is already running (PID: $PID)"
        exit 0
    else
        rm -f "$PID_FILE"
    fi
fi

echo "Starting College Noticeboard on low-memory runtime..."
nohup node server.js </dev/null >> "$LOG_FILE" 2>&1 &
NEW_PID=$!
echo $NEW_PID > "$PID_FILE"
disown $NEW_PID 2>/dev/null || true

sleep 1

if kill -0 "$NEW_PID" 2>/dev/null; then
    echo "✓ Noticeboard successfully started (PID: $NEW_PID)"
    echo "• Access Web Portal: http://localhost:4000"
    echo "• Logs: $LOG_FILE"
else
    echo "❌ Failed to start Noticeboard. Check $LOG_FILE for details."
    rm -f "$PID_FILE"
    exit 1
fi
