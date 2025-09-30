#!/bin/bash
echo "🔒 Starting HTTPS server for NewChecks..."

# Kill existing servers
pkill -f "python.*http.server" 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Create self-signed certificate
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=10.0.0.118"

# Start HTTPS server
cd newchecks-frontend/build
python3 -c "
import http.server
import ssl
import socketserver

class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

PORT = 3000
Handler = CORSRequestHandler

with socketserver.TCPServer(('0.0.0.0', PORT), Handler) as httpd:
    httpd.socket = ssl.wrap_socket(httpd.socket, 
                                  keyfile='../../key.pem', 
                                  certfile='../../cert.pem', 
                                  server_side=True)
    print(f'🚀 HTTPS Server running at https://10.0.0.118:{PORT}')
    print('⚠️  Accept the security warning in browsers')
    httpd.serve_forever()
"
