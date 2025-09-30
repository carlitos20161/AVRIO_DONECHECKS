#!/bin/bash
echo "🚀 Starting NewChecks on NETGEAR Server..."

# Start backend
cd /opt/newchecks/newchecks-backend
source venv/bin/activate
python app.py &

# Wait for backend to start
sleep 5

# Start frontend
cd /opt/newchecks/newchecks-frontend/build
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
    print(f'✅ NewChecks running on NETGEAR server!')
    print(f'🌐 Access at: http://192.168.0.239:{PORT}')
    print(f'🔧 Backend API: http://192.168.0.239:5004')
    httpd.serve_forever()
" &

echo "✅ NewChecks services started!"
echo "🌐 Frontend: http://192.168.0.239:3000"
echo "🔧 Backend: http://192.168.0.239:5004"
