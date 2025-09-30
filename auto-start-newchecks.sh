#!/bin/bash
# NewChecks Auto-Start Script
# Place this in your startup applications

echo "🚀 Starting NewChecks Payroll System..."

# Navigate to app directory
cd /Users/carlosarroyo/newchecks

# Kill any existing servers
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:5004 | xargs kill -9 2>/dev/null || true

# Start backend
echo "Starting backend..."
cd newchecks-backend
source venv/bin/activate
python app.py &
BACKEND_PID=$!

# Start frontend
echo "Starting frontend..."
cd ../newchecks-frontend/build
python3 -c "
import http.server
import socketserver

class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

PORT = 3000
with socketserver.TCPServer(('0.0.0.0', PORT), CORSRequestHandler) as httpd:
    print(f'✅ NewChecks running at http://10.0.0.118:{PORT}')
    print('Backend PID: $BACKEND_PID')
    httpd.serve_forever()
" &

echo "✅ NewChecks started successfully!"
echo "Frontend: http://10.0.0.118:3000"
echo "Backend: http://10.0.0.118:5004"
echo ""
echo "To stop: pkill -f 'python.*http.server' && pkill -f 'python.*app.py'"
