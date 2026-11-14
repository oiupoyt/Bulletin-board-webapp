#!/usr/bin/env bash
# Check Noticeboard status and RAM usage
cd "$(dirname "$0")"

PID_FILE="./noticeboard.pid"

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        RSS_KB=$(ps -o rss= -p "$PID" 2>/dev/null || echo 0)
        RSS_MB=$(( RSS_KB / 1024 ))
        echo "● Noticeboard is RUNNING (PID: $PID)"
        echo "  Memory footprint: ~${RSS_MB} MB RSS"
        echo "  Health URL: http://localhost:4000/health"
        if command -v curl >/dev/null 2>&1; then
            echo -n "  Health ping: "
            curl -s http://localhost:4000/health || echo "Failed to reach /health"
            echo ""
        fi
        exit 0
    fi
fi

echo "○ Noticeboard is NOT running."
exit 1
