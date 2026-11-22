import socketio
import time
import subprocess
import os
import sys
import ctypes
import threading
import configparser
from datetime import datetime

# تحميل الإعدادات من ملف التكوين
config = configparser.ConfigParser()
config.read('config.ini')

# إعدادات الخادم
SERVER_URL = config.get('settings', 'server_url', fallback='http://localhost:3000')
DEVICE_ID = config.get('settings', 'device_id', fallback='PC-001')
DEVICE_NAME = config.get('settings', 'device_name', fallback='My Office PC')
PASSWORD = config.get('settings', 'password', fallback='CHANGE_ME')
MUSIC_PATH = config.get('settings', 'music_path', fallback='C:/Music/example.mp3')

# تهيئة عميل Socket.IO
sio = socketio.Client()

# متغير للتحكم في منع السكون
keep_awake = False
awake_thread = None

# وظيفة لمنع السكون (لنظام Windows)
def prevent_sleep():
    while keep_awake:
        # منع السكون باستخدام Windows API
        ctypes.windll.kernel32.SetThreadExecutionState(0x80000002)
        time.sleep(60)  # تحديث كل دقيقة

# تشغيل ملف صوتي
def play_song(file_path):
    try:
        if os.name == 'nt':  # نظام Windows
            if os.path.exists(file_path):
                os.startfile(file_path)
                return True
            else:
                # البحث عن ملفات صوتية في المجلد
                music_dir = os.path.dirname(file_path)
                if os.path.exists(music_dir):
                    for file in os.listdir(music_dir):
                        if file.endswith(('.mp3', '.wav', '.m4a')):
                            os.startfile(os.path.join(music_dir, file))
                            return True
                return False
        else:  # أنظمة أخرى (Linux/Mac)
            subprocess.call(('xdg-open', file_path))
            return True
    except Exception as e:
        print(f"Error playing song: {e}")
        return False

# إرسال نبضات القلب بشكل دوري
def send_heartbeat():
    while True:
        try:
            if sio.connected:
                sio.emit('heartbeat', DEVICE_ID)
                print(f"Heartbeat sent at {datetime.now()}")
            time.sleep(20)  # إرسال كل 20 ثانية
        except Exception as e:
            print(f"Heartbeat error: {e}")
            time.sleep(5)

# معالجة الأحداث من الخادم
@sio.event
def connect():
    print('Connected to server')
    # تسجيل الجهاز عند الاتصال
    sio.emit('register', {
        'deviceId': DEVICE_ID,
        'deviceName': DEVICE_NAME,
        'password': PASSWORD
    })

@sio.event
def disconnect():
    print('Disconnected from server')

@sio.on('auth_error')
def handle_auth_error(data):
    print(f"Authentication error: {data.get('message')}")
    # إعادة المحاولة بعد فترة
    time.sleep(10)
    sio.connect(SERVER_URL)

@sio.on('command')
def handle_command(data):
    global keep_awake, awake_thread
    
    command = data.get('command')
    command_data = data.get('data', {})
    
    print(f"Received command: {command}")
    
    if command == 'play_song':
        file_path = command_data.get('file_path', MUSIC_PATH)
        success = play_song(file_path)
        if success:
            print("Song played successfully")
        else:
            print("Failed to play song")
    
    elif command == 'keep_awake':
        enable = command_data.get('enable', False)
        keep_awake = enable
        
        if keep_awake and (awake_thread is None or not awake_thread.is_alive()):
            awake_thread = threading.Thread(target=prevent_sleep)
            awake_thread.daemon = True
            awake_thread.start()
            print("Keep awake enabled")
        elif not keep_awake and awake_thread is not None:
            print("Keep awake disabled")
    
    else:
        print(f"Unknown command: {command}")

# إعداد التشغيل التلقائي (لنظام Windows)
def setup_autostart():
    if os.name != 'nt':
        return False
    
    try:
        # الحصول على مسار الملف الحالي
        if getattr(sys, 'frozen', False):
            # إذا كان الملف مجمعًا كـ EXE
            exe_path = sys.executable
        else:
            # إذا كان ملف Python
            exe_path = os.path.abspath(sys.argv[0])
        
        # إضافة إلى بدء التشغيل التلقائي عبر التسجيل
        import winreg
        
        key = winreg.HKEY_CURRENT_USER
        key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
        
        with winreg.OpenKey(key, key_path, 0, winreg.KEY_SET_VALUE) as registry_key:
            winreg.SetValueEx(registry_key, "RemoteControlClient", 0, winreg.REG_SZ, exe_path)
        
        print("Added to startup successfully")
        return True
    except Exception as e:
        print(f"Failed to add to startup: {e}")
        return False

# الدالة الرئيسية
def main():
    # محاولة الاتصال بالخادم
    max_retries = 10
    retry_count = 0
    
    while retry_count < max_retries:
        try:
            print(f"Attempting to connect to server: {SERVER_URL}")
            sio.connect(SERVER_URL)
            break
        except Exception as e:
            print(f"Failed to connect to server: {e}")
            retry_count += 1
            if retry_count >= max_retries:
                print("Max retries reached. Exiting.")
                return
            time.sleep(5)
    
    # بدء إرسال نبضات القلب
    heartbeat_thread = threading.Thread(target=send_heartbeat)
    heartbeat_thread.daemon = True
    heartbeat_thread.start()
    
    # إعداد التشغيل التلقائي
    setup_autostart()
    
    # الانتظار إلى الأبد
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("Client stopped by user")

if __name__ == '__main__':
    # إخفاء النافذة إذا كان النظام ويندوز
    if os.name == 'nt':
        import ctypes
        whnd = ctypes.windll.kernel32.GetConsoleWindow()
        if whnd != 0:
            ctypes.windll.user32.ShowWindow(whnd, 0)
    
    main()