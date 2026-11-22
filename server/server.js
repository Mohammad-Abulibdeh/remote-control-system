const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// تحميل الإعدادات
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

const app = express();
const server = http.createServer(app);

// إعداد CORS للسماح بالاتصال من أي مصدر (يمكن تقييده لاحقًا)
app.use(cors());
app.use(express.json());

// منفذ الخادم
const PORT = config.port || 3000;

// إعداد Socket.IO مع CORS
const io = socketIo(server, {
  cors: {
    origin: config.allowed_origins || "*",
    methods: ["GET", "POST"]
  }
});

// تخزين حالة الأجهزة المتصلة
const devices = new Map();

// REST API للحصول على حالة الأجهزة
app.get('/api/devices', (req, res) => {
  // التحقق من كلمة المرور
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${config.password}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const devicesList = Array.from(devices.entries()).map(([id, device]) => ({
    id,
    name: device.name,
    status: device.status,
    lastSeen: device.lastSeen,
    ip: device.ip
  }));
  res.json(devicesList);
});

// REST API لإرسال الأوامر
app.post('/api/command/:deviceId', (req, res) => {
  // التحقق من كلمة المرور
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${config.password}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { deviceId } = req.params;
  const { command, data } = req.body;
  
  if (devices.has(deviceId)) {
    const deviceSocketId = devices.get(deviceId).socketId;
    io.to(deviceSocketId).emit('command', { command, data });
    res.json({ success: true, message: 'Command sent' });
  } else {
    res.status(404).json({ success: false, message: 'Device not found' });
  }
});

// إدارة اتصال السوكيت
io.on('connection', (socket) => {
  console.log('Client connected:', socket.handshake.address);

  // عندما يتصل جهاز جديد
  socket.on('register', (deviceData) => {
    const { deviceId, deviceName, password } = deviceData;
    
    // التحقق من كلمة المرور
    if (password !== config.password) {
      socket.emit('auth_error', { message: 'Invalid password' });
      socket.disconnect();
      return;
    }
    
    devices.set(deviceId, {
      socketId: socket.id,
      name: deviceName || `Device-${deviceId}`,
      status: 'online',
      lastSeen: new Date(),
      ip: socket.handshake.address
    });
    
    console.log(`Device registered: ${deviceId} from ${socket.handshake.address}`);
    io.emit('devices_update', Array.from(devices.entries()).map(([id, device]) => ({ 
      id, 
      name: device.name,
      status: device.status,
      lastSeen: device.lastSeen,
      ip: device.ip
    })));
  });

  // عند استلام نبضات القلب من الجهاز
  socket.on('heartbeat', (deviceId) => {
    if (devices.has(deviceId)) {
      const device = devices.get(deviceId);
      device.lastSeen = new Date();
      device.status = 'online';
      device.ip = socket.handshake.address; // تحديث العنوان
      devices.set(deviceId, device);
      
      // إرسال تحديث لجميع العملاء
      io.emit('devices_update', Array.from(devices.entries()).map(([id, device]) => ({ 
        id, 
        name: device.name,
        status: device.status,
        lastSeen: device.lastSeen,
        ip: device.ip
      })));
    }
  });

  // عند انقطاع الاتصال
  socket.on('disconnect', () => {
    // البحث عن الجهاز المنقطع وتحديث حالته
    for (let [deviceId, device] of devices.entries()) {
      if (device.socketId === socket.id) {
        device.status = 'offline';
        devices.set(deviceId, device);
        console.log(`Device disconnected: ${deviceId}`);
        
        // إرسال تحديث لجميع العملاء
        io.emit('devices_update', Array.from(devices.entries()).map(([id, device]) => ({ 
          id, 
          name: device.name,
          status: device.status,
          lastSeen: device.lastSeen,
          ip: device.ip
        })));
        break;
      }
    }
  });
});

// التحقق من الأجهزة المنقطعة كل 30 ثانية
setInterval(() => {
  const now = new Date();
  let updated = false;
  
  for (let [deviceId, device] of devices.entries()) {
    // إذا مر أكثر من 40 ثانية منذ آخر نبضة قلب
    if (device.status === 'online' && (now - device.lastSeen) > 40000) {
      device.status = 'offline';
      devices.set(deviceId, device);
      updated = true;
      console.log(`Device marked as offline: ${deviceId}`);
    }
  }
  
  if (updated) {
    io.emit('devices_update', Array.from(devices.entries()).map(([id, device]) => ({ 
      id, 
      name: device.name,
      status: device.status,
      lastSeen: device.lastSeen,
      ip: device.ip
    })));
  }
}, 30000);

// تشغيل الخادم
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT} and accessible from any network`);
  console.log(`Make sure to configure your firewall to allow connections on port ${PORT}`);
});