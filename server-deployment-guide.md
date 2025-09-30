# NewChecks - NETGEAR Server Deployment Guide

## 🎯 Objective
Deploy NewChecks application to your NETGEAR server for permanent 24/7 hosting.

## 📋 Prerequisites Checklist
- [ ] NETGEAR server model and OS identified
- [ ] Network access to server (SSH/Web interface)
- [ ] Server IP address: `192.168.0.239` (or different?)
- [ ] Admin credentials for server
- [ ] Docker support (if available)

## 🚀 Deployment Methods

### Method 1: Docker Deployment (Recommended)
**Best for:** ReadyNAS with Docker support, Linux servers

```bash
# 1. Copy project files to server
scp -r newchecks/ admin@192.168.0.239:/volume1/docker/

# 2. SSH into server
ssh admin@192.168.0.239

# 3. Navigate to project
cd /volume1/docker/newchecks/

# 4. Start services
docker-compose up -d
```

### Method 2: Manual Installation
**Best for:** Linux servers without Docker

```bash
# 1. Install dependencies
sudo apt update
sudo apt install python3 python3-pip nodejs npm

# 2. Copy and setup backend
cd newchecks-backend/
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 3. Setup frontend
cd ../newchecks-frontend/
npm install
npm run build

# 4. Create systemd services for auto-start
```

### Method 3: ReadyNAS App Installation
**Best for:** ReadyNAS with app support

```bash
# Create custom ReadyNAS app package
# Upload through ReadyNAS admin interface
```

## 🌐 Network Configuration

### Update Backend URLs
Replace all `10.0.0.118` references with server IP:
- Frontend API calls → `http://192.168.0.239:5004`
- CORS settings → Allow `192.168.0.239`

### Firewall Rules
```bash
# Open required ports
sudo ufw allow 3000  # Frontend
sudo ufw allow 5004  # Backend
```

## 🔧 Server-Specific Files

### Auto-Start Script (`/etc/systemd/system/newchecks.service`)
```ini
[Unit]
Description=NewChecks Application
After=network.target

[Service]
Type=forking
User=admin
WorkingDirectory=/opt/newchecks
ExecStart=/opt/newchecks/start-newchecks.sh
Restart=always

[Install]
WantedBy=multi-user.target
```

### Startup Script (`start-newchecks.sh`)
```bash
#!/bin/bash
# Start backend
cd /opt/newchecks/newchecks-backend
source venv/bin/activate
python app.py &

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
    print(f'✅ NewChecks running on NETGEAR server at http://192.168.0.239:{PORT}')
    httpd.serve_forever()
" &
```

## 📱 Access After Deployment
- **Application URL:** `http://192.168.0.239:3000`
- **Admin Interface:** `http://192.168.0.239:8080` (if ReadyNAS)
- **SSH Access:** `ssh admin@192.168.0.239`

## 🔍 Next Steps
1. Identify your server type and OS
2. Choose deployment method
3. Update network configurations
4. Test deployment
5. Configure auto-start 