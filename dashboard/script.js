document.addEventListener('DOMContentLoaded', function() {
    const socket = io();
    const devicesList = document.getElementById('devices-list');
    const deviceSelect = document.getElementById('device-select');
    const playSongBtn = document.getElementById('play-song-btn');
    const keepAwakeToggle = document.getElementById('keep-awake-toggle');
    const keepAwakeStatus = document.getElementById('keep-awake-status');
    const musicPathInput = document.getElementById('music-path');
    const passwordInput = document.getElementById('password-input');
    const connectBtn = document.getElementById('connect-btn');
    
    let devices = [];
    let selectedDeviceId = '';
    let authToken = '';
    let isConnected = false;
    
    // تحديث قائمة الأجهزة
    function updateDevicesList(devicesData) {
        devices = devicesData;
        devicesList.innerHTML = '';
        deviceSelect.innerHTML = '<option value="">-- اختر جهازًا --</option>';
        
        devices.forEach(device => {
            // إضافة البطاقة إلى القائمة
            const deviceCard = document.createElement('div');
            deviceCard.className = 'device-card';
            
            const statusClass = device.status === 'online' ? 'status-online' : 'status-offline';
            const statusText = device.status === 'online' ? 'متصل' : 'غير متصل';
            
            const lastSeen = new Date(device.lastSeen).toLocaleString('ar-SA');
            
            deviceCard.innerHTML = `
                <div class="device-name">${device.name}</div>
                <div class="device-id">${device.id}</div>
                <div class="device-ip">IP: ${device.ip}</div>
                <div class="device-status ${statusClass}">${statusText}</div>
                <div class="last-seen">آخر ظهور: ${lastSeen}</div>
            `;
            
            devicesList.appendChild(deviceCard);
            
            // إضافة إلى القائمة المنسدلة
            const option = document.createElement('option');
            option.value = device.id;
            option.textContent = `${device.name} (${device.id})`;
            deviceSelect.appendChild(option);
        });
    }
    
    // الاتصال بالخادم
    function connectToServer() {
        authToken = passwordInput.value;
        if (!authToken) {
            alert('يرجى إدخال كلمة المرور');
            return;
        }
        
        // إعادة الاتصال بالسوكيت مع كلمة المرور
        socket.disconnect();
        socket.io.opts.extraHeaders = {
            Authorization: `Bearer ${authToken}`
        };
        socket.connect();
        
        // جلب قائمة الأجهزة
        fetchDevices();
        isConnected = true;
        connectBtn.textContent = 'إعادة الاتصال';
    }
    
    // جلب قائمة الأجهزة من الخادم
    function fetchDevices() {
        fetch('/api/devices', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Authentication failed');
            }
            return response.json();
        })
        .then(devicesData => {
            updateDevicesList(devicesData);
        })
        .catch(error => {
            console.error('Error fetching devices:', error);
            alert('فشل المصادقة. يرجى التحقق من كلمة المرور');
        });
    }
    
    // إرسال أمر إلى الجهاز
    function sendCommand(deviceId, command, data = {}) {
        fetch(`/api/command/${deviceId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ command, data })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Authentication failed');
            }
            return response.json();
        })
        .then(result => {
            if (result.success) {
                console.log('Command sent successfully');
            } else {
                console.error('Failed to send command:', result.message);
                alert('فشل إرسال الأمر: ' + result.message);
            }
        })
        .catch(error => {
            console.error('Error sending command:', error);
            alert('حدث خطأ أثناء إرسال الأمر. يرجى التحقق من الاتصال');
        });
    }
    
    // استمع لتحديثات الأجهزة من الخادم
    socket.on('devices_update', function(devicesData) {
        if (isConnected) {
            updateDevicesList(devicesData);
        }
    });
    
    // عند النقر على زر الاتصال
    connectBtn.addEventListener('click', connectToServer);
    
    // عند تغيير الجهاز المحدد
    deviceSelect.addEventListener('change', function() {
        selectedDeviceId = this.value;
        if (selectedDeviceId) {
            keepAwakeToggle.checked = false;
            keepAwakeStatus.textContent = 'معطل';
        }
    });
    
    // عند النقر على زر تشغيل الأغنية
    playSongBtn.addEventListener('click', function() {
        if (!selectedDeviceId) {
            alert('يرجى اختيار جهاز أولاً');
            return;
        }
        
        const filePath = musicPathInput.value;
        if (!filePath) {
            alert('يرجى إدخال مسار الملف الصوتي');
            return;
        }
        
        sendCommand(selectedDeviceId, 'play_song', { file_path: filePath });
    });
    
    // عند تغيير حالة منع السكون
    keepAwakeToggle.addEventListener('change', function() {
        if (!selectedDeviceId) {
            alert('يرجى اختيار جهاز أولاً');
            this.checked = !this.checked; // التراجع عن التغيير
            return;
        }
        
        const enable = this.checked;
        sendCommand(selectedDeviceId, 'keep_awake', { enable });
        
        keepAwakeStatus.textContent = enable ? 'مفعل' : 'معطل';
    });
});