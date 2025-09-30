#!/bin/bash

# NewChecks - NETGEAR Server Deployment Script
# This script prepares and deploys the application to your NETGEAR server

echo "🚀 NewChecks - NETGEAR Server Deployment"
echo "========================================"

# Configuration
SERVER_IP="192.168.0.239"
SERVER_USER="admin"
SERVER_PATH="/volume1/docker/newchecks"
LOCAL_PATH="/Users/carlosarroyo/newchecks"

echo "📋 Configuration:"
echo "   Server IP: $SERVER_IP"
echo "   Server User: $SERVER_USER"
echo "   Server Path: $SERVER_PATH"
echo "   Local Path: $LOCAL_PATH"
echo ""

# Step 1: Prepare frontend build
echo "🏗️  Step 1: Building frontend..."
cd newchecks-frontend
npm install --legacy-peer-deps
npm run build
cd ..

# Step 2: Create deployment package
echo "📦 Step 2: Creating deployment package..."
mkdir -p deploy-package
cp -r newchecks-frontend deploy-package/
cp -r newchecks-backend deploy-package/
cp docker-compose-server.yml deploy-package/docker-compose.yml
cp Dockerfile deploy-package/
cp server-deployment-guide.md deploy-package/

# Step 3: Create server-specific startup script
echo "🔧 Step 3: Creating server startup scripts..."
cat > deploy-package/start-server.sh << 'EOF'
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
EOF

chmod +x deploy-package/start-server.sh

# Step 4: Create requirements file for backend
echo "📋 Step 4: Creating requirements.txt..."
cd newchecks-backend
if [ ! -f requirements.txt ]; then
    echo "Creating requirements.txt..."
    cat > requirements.txt << 'EOF'
Flask==3.1.1
Flask-CORS==6.0.1
Flask-SQLAlchemy==3.1.1
Flask-Migrate==4.1.0
firebase-admin==7.0.0
PyPDF2==3.0.1
reportlab==4.4.2
num2words==0.5.14
Pillow==11.3.0
EOF
fi
cd ..

echo "✅ Deployment package ready!"
echo ""
echo "📁 Package contents:"
ls -la deploy-package/
echo ""

# Step 5: Instructions for manual transfer
echo "🚀 Next Steps:"
echo "=============="
echo ""
echo "1. 📤 Transfer files to server:"
echo "   scp -r deploy-package/ $SERVER_USER@$SERVER_IP:$SERVER_PATH"
echo ""
echo "2. 🔐 SSH into server:"
echo "   ssh $SERVER_USER@$SERVER_IP"
echo ""
echo "3. 🏗️  Setup on server:"
echo "   cd $SERVER_PATH"
echo "   chmod +x start-server.sh"
echo ""
echo "4. 🐳 If using Docker:"
echo "   docker-compose up -d"
echo ""
echo "5. 🔧 If using manual setup:"
echo "   ./start-server.sh"
echo ""
echo "6. 🌐 Access your app:"
echo "   http://$SERVER_IP:3000"
echo ""
echo "📚 For detailed instructions, see: server-deployment-guide.md"
echo ""

# Optional: Attempt automatic transfer (if SSH keys are set up)
read -p "🤖 Attempt automatic transfer to server? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 Transferring to server..."
    scp -r deploy-package/ $SERVER_USER@$SERVER_IP:$SERVER_PATH
    if [ $? -eq 0 ]; then
        echo "✅ Transfer successful!"
        echo "🔐 SSH into server to complete setup:"
        echo "   ssh $SERVER_USER@$SERVER_IP"
    else
        echo "❌ Transfer failed. Please transfer manually."
    fi
fi

echo ""
echo "🎉 Deployment preparation complete!"
echo "📖 Check server-deployment-guide.md for detailed instructions" 