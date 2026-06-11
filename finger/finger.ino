// finger.ino - VERSION 6.1 (Dengan Secret.h terpisah)
// Fitur: 
//   - Registrasi SISWA (fingerprint) via PCF pin 0
//   - Registrasi STAFF (fingerprint) via PCF pin 1
//   - Setting WiFi via BLE (scan -> pilih -> password)
//   - Delay Out PER SISWA
//   - Hapus Sidik Jari dari Web
//   - Auto Alpha (menandai siswa tidak absen)
//   - Antrian offline untuk data alpha
//   - Sync data staff dari Firebase (nama, jabatan, dll bisa diubah dari web)

#include <HardwareSerial.h>
#include <Adafruit_Fingerprint.h>
#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <SD.h>
#include <SPI.h>
#include <Wire.h>
#include <Adafruit_PCF8574.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <time.h> 
#include <RTClib.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include "secrets.h"

// ================= KONFIGURASI DEFAULT =================
#define DEFAULT_WIFI_SSID ""
#define DEFAULT_WIFI_PASSWORD ""

// ================= PIN CONFIGURATION =================
#define MUX_S0 26
#define MUX_S1 27
#define MUX_S2 14
#define MUX_S3 12

#define FP_RX 16
#define FP_TX 17

#define SD_CS   5
#define SD_MOSI 23
#define SD_MISO 19
#define SD_SCK  18

#define PCF_ADDR 0x20
#define ENROLL_STUDENT_BTN_PIN 0    // Tombol daftar SISWA
#define ENROLL_STAFF_BTN_PIN   1    // Tombol daftar STAFF

// ================= STRUKTUR DATA =================
struct UserData {
  int id;
  String nama;
  String kelas;
  String jurusan;
  int delayOut;
};

// Struktur data Staff (Guru/Karyawan)
struct StaffData {
  int id;                    // ID fingerprint untuk staff
  String staffId;            // ID Staff unik (format: STFxxxx)
  String nama;
  String jabatan;            // guru, kepala_sekolah, wakil_kepala, staff_tu
  String departemen;
  String email;
  String noHp;
};

// Struktur untuk antrian alpha (offline)
struct AlphaRecord {
  int studentId;
  char date[11];      // YYYY-MM-DD
  char status[10];    // "alpha", "sakit", "izin"
  bool synced;
};

// ================= VARIABEL GLOBAL =================
HardwareSerial mySerial(2);
Adafruit_Fingerprint finger(&mySerial);
Adafruit_PCF8574 pcf;
RTC_DS3231 rtc;

FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

const long gmtOffset_sec = 25200;
const int daylightOffset_sec = 0;

int globalDelayMinutes = 60;
int currentStudentID = 1;
int currentStaffID = 1000;      // ID fingerprint untuk staff (mulai 1000)
int lastStaffNumber = 1000;     // Nomor untuk ID Staff (STFxxxx)
bool deviceConnected = false;
bool isOnline = false;
bool isEnrolling = false;
bool syncInProgress = false;
bool isStaffEnroll = false;      // Flag untuk membedakan enroll siswa vs staff

// WiFi credentials
String wifiSSID = "";
String wifiPassword = "";

// WiFi config via BLE state machine
enum WiFiConfigState {
  WIFI_IDLE,
  WIFI_WAITING_SSID_SELECTION,
  WIFI_WAITING_PASSWORD
};
WiFiConfigState wifiConfigState = WIFI_IDLE;
String wifiScanResults[20];
int wifiScanCount = 0;
String pendingSelectedSSID = "";

// Preferences
Preferences preferences;

// BLE
BLEServer *pServer;
BLECharacteristic *pTxCharacteristic;
BLECharacteristic *pRxCharacteristic;

#define SERVICE_UUID           "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_RX "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_TX "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

// Queue
QueueHandle_t xQueueFingerprint;
QueueHandle_t xQueueAlphaSync;

// Cache data user (siswa)
#define MAX_USERS 500
UserData userCache[MAX_USERS];
int userCacheCount = 0;

// Cache data staff (guru/karyawan)
#define MAX_STAFF 100
StaffData staffCache[MAX_STAFF];
int staffCacheCount = 0;

// Firebase command tracking
unsigned long lastCommandCheck = 0;
const unsigned long COMMAND_CHECK_INTERVAL = 2000;

// Daily alpha check
String lastDailyCheckDate = "";
bool dailyCheckInProgress = false;

// Staff sync timer
unsigned long lastStaffSync = 0;
const unsigned long STAFF_SYNC_INTERVAL = 300000; // 5 menit

// ================= FUNGSI WAKTU =================
String getCurrentDateRTC() {
  DateTime now = rtc.now();
  char buffer[11];
  sprintf(buffer, "%04d-%02d-%02d", now.year(), now.month(), now.day());
  return String(buffer);
}

String getCurrentTimeRTC() {
  DateTime now = rtc.now();
  char buffer[9];
  sprintf(buffer, "%02d:%02d:%02d", now.hour(), now.minute(), now.second());
  return String(buffer);
}

int getCurrentMinutesRTC() {
  DateTime now = rtc.now();
  return (now.hour() * 60) + now.minute();
}

int stringToMinutes(String timeStr) {
  if (timeStr.length() < 5) return 0;
  int h = timeStr.substring(0, 2).toInt();
  int m = timeStr.substring(3, 5).toInt();
  return (h * 60) + m;
}

void initRTC() {
  if (!rtc.begin()) {
    Serial.println("❌ RTC tidak ditemukan!");
    while (1);
  }
  if (rtc.lostPower()) {
    rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
  }
  Serial.println("✅ RTC Siap");
}

void syncRTCwithNTP() {
  if (!isOnline) return;
  configTime(gmtOffset_sec, daylightOffset_sec, "pool.ntp.org", "time.nist.gov");
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 5000)) {
    Serial.println("❌ Gagal sync NTP");
    return;
  }
  rtc.adjust(DateTime(timeinfo.tm_year + 1900, timeinfo.tm_mon + 1, timeinfo.tm_mday,
                      timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec));
  Serial.println("✅ RTC sync dengan NTP");
}

// ================= WIFI CONFIGURATION VIA BLE =================
void saveWiFiCredentials(String ssid, String password) {
  preferences.begin("wifi", false);
  preferences.putString("ssid", ssid);
  preferences.putString("password", password);
  preferences.end();
  Serial.println("✅ WiFi credentials saved to NVS");
}

void loadWiFiCredentials() {
  preferences.begin("wifi", true);
  wifiSSID = preferences.getString("ssid", "");
  wifiPassword = preferences.getString("password", "");
  preferences.end();
  
  if (wifiSSID.length() > 0) {
    Serial.printf("📡 Loaded WiFi credentials: SSID=%s\n", wifiSSID.c_str());
  } else {
    Serial.println("⚠️ No WiFi credentials found, waiting for BLE config");
  }
}

void clearWiFiCredentials() {
  preferences.begin("wifi", false);
  preferences.clear();
  preferences.end();
  wifiSSID = "";
  wifiPassword = "";
  Serial.println("🗑️ WiFi credentials cleared");
}

void connectToWiFi() {
  if (wifiSSID.length() == 0) {
    Serial.println("⚠️ No WiFi credentials, skipping connection");
    return;
  }
  
  Serial.printf("📡 Connecting to WiFi: %s\n", wifiSSID.c_str());
  sendBLEMessage("🔄 Connecting to " + wifiSSID + "...");
  WiFi.begin(wifiSSID.c_str(), wifiPassword.c_str());
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi terhubung");
    Serial.print("📡 IP Address: ");
    Serial.println(WiFi.localIP());
    isOnline = true;
    syncRTCwithNTP();
    initFirebase();
    syncOfflineData();
    checkFirebaseSettings();
    syncAllUsersFromFirebase();
    syncAllStaffFromFirebase();
    
    Firebase.RTDB.deleteNode(&fbdo, "/commands/esp32/delete_fingerprint");
    Firebase.RTDB.deleteNode(&fbdo, "/commands/esp32/delete_fingerprint_response");
    
    syncPendingAlpha();
    
    sendBLEMessage("✅ WiFi Connected to: " + wifiSSID);
    sendBLEMessage("IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n❌ WiFi Gagal!");
    isOnline = false;
    sendBLEMessage("❌ WiFi Failed! Check password");
  }
}

// ================= SD CARD =================
void initSD() {
  SPI.begin(SD_SCK, SD_MISO, SD_MOSI, SD_CS);
  if (!SD.begin(SD_CS)) {
    Serial.println("❌ SD Card gagal!");
  } else {
    Serial.println("✅ SD Card siap");
    loadSettings();
    loadUserCacheFromSD();
    loadStaffCacheFromSD();
  }
}

void loadSettings() {
  File file = SD.open("/settings.txt", FILE_READ);
  if (file) {
    while (file.available()) {
      String line = file.readStringUntil('\n');
      if (line.startsWith("delay=")) {
        globalDelayMinutes = line.substring(6).toInt();
        if (globalDelayMinutes < 1) globalDelayMinutes = 60;
      }
      if (line.startsWith("lastStudentID=")) {
        currentStudentID = line.substring(14).toInt();
      }
      if (line.startsWith("lastStaffID=")) {
        currentStaffID = line.substring(12).toInt();
      }
      if (line.startsWith("lastStaffNumber=")) {
        lastStaffNumber = line.substring(16).toInt();
      }
    }
    file.close();
    Serial.printf("📁 Global Delay: %d menit, Student ID: %d, Staff ID: %d, Staff Number: %d\n", 
                  globalDelayMinutes, currentStudentID, currentStaffID, lastStaffNumber);
  } else {
    saveSettings();
  }
}

void saveSettings() {
  File file = SD.open("/settings.txt", FILE_WRITE);
  if (file) {
    file.println("delay=" + String(globalDelayMinutes));
    file.println("lastStudentID=" + String(currentStudentID));
    file.println("lastStaffID=" + String(currentStaffID));
    file.println("lastStaffNumber=" + String(lastStaffNumber));
    file.close();
    Serial.println("✅ Settings tersimpan");
  }
}

bool isUserRegistered(int id) {
  File file = SD.open("/users.txt", FILE_READ);
  if (file) {
    while (file.available()) {
      if (file.readStringUntil('\n').startsWith(String(id) + ",")) {
        file.close();
        return true;
      }
    }
    file.close();
  }
  return false;
}

bool isStaffRegistered(int id) {
  File file = SD.open("/staff.txt", FILE_READ);
  if (file) {
    while (file.available()) {
      String line = file.readStringUntil('\n');
      int firstComma = line.indexOf(',');
      if (firstComma > 0 && line.substring(0, firstComma).toInt() == id) {
        file.close();
        return true;
      }
    }
    file.close();
  }
  return false;
}

// ================= FUNGSI USER CACHE (SISWA) =================
void loadUserCacheFromSD() {
  File file = SD.open("/users.txt", FILE_READ);
  if (!file) {
    Serial.println("⚠️ No users.txt found");
    userCacheCount = 0;
    return;
  }
  
  userCacheCount = 0;
  while (file.available() && userCacheCount < MAX_USERS) {
    String line = file.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) continue;
    
    int c1 = line.indexOf(',');
    int c2 = line.indexOf(',', c1 + 1);
    int c3 = line.indexOf(',', c2 + 1);
    int c4 = line.indexOf(',', c3 + 1);
    
    if (c1 > 0 && c2 > 0 && c3 > 0) {
      userCache[userCacheCount].id = line.substring(0, c1).toInt();
      userCache[userCacheCount].nama = line.substring(c1 + 1, c2);
      userCache[userCacheCount].kelas = line.substring(c2 + 1, c3);
      
      if (c4 > 0) {
        userCache[userCacheCount].jurusan = line.substring(c3 + 1, c4);
        userCache[userCacheCount].delayOut = line.substring(c4 + 1).toInt();
      } else {
        userCache[userCacheCount].jurusan = line.substring(c3 + 1);
        userCache[userCacheCount].jurusan.trim();
        userCache[userCacheCount].delayOut = globalDelayMinutes;
      }
      
      if (userCache[userCacheCount].delayOut <= 0) {
        userCache[userCacheCount].delayOut = globalDelayMinutes;
      }
      
      userCacheCount++;
    }
  }
  file.close();
  Serial.printf("📚 Loaded %d users (siswa) from SD cache\n", userCacheCount);
}

void saveUserToSD(int id, String nama, String kelas, String jurusan, int delayOut) {
  File file = SD.open("/users.txt", FILE_READ);
  bool exists = false;
  String existingContent = "";
  
  if (file) {
    while (file.available()) {
      String line = file.readStringUntil('\n');
      if (line.startsWith(String(id) + ",")) {
        exists = true;
        existingContent += String(id) + "," + nama + "," + kelas + "," + jurusan + "," + String(delayOut) + "\n";
      } else {
        existingContent += line + "\n";
      }
    }
    file.close();
  }
  
  if (!exists) {
    existingContent += String(id) + "," + nama + "," + kelas + "," + jurusan + "," + String(delayOut) + "\n";
  }
  
  File outFile = SD.open("/users.txt", FILE_WRITE);
  if (outFile) {
    outFile.print(existingContent);
    outFile.close();
    Serial.printf("✅ User %d (%s) delay=%d menit tersimpan di SD\n", id, nama.c_str(), delayOut);
  }
  
  bool found = false;
  for (int i = 0; i < userCacheCount; i++) {
    if (userCache[i].id == id) {
      userCache[i].nama = nama;
      userCache[i].kelas = kelas;
      userCache[i].jurusan = jurusan;
      userCache[i].delayOut = delayOut;
      found = true;
      break;
    }
  }
  if (!found && userCacheCount < MAX_USERS) {
    userCache[userCacheCount].id = id;
    userCache[userCacheCount].nama = nama;
    userCache[userCacheCount].kelas = kelas;
    userCache[userCacheCount].jurusan = jurusan;
    userCache[userCacheCount].delayOut = delayOut;
    userCacheCount++;
  }
}

void removeUserFromSD(int id) {
  File file = SD.open("/users.txt", FILE_READ);
  if (!file) {
    Serial.println("⚠️ users.txt tidak ditemukan");
    return;
  }
  
  String newContent = "";
  bool found = false;
  
  while (file.available()) {
    String line = file.readStringUntil('\n');
    if (line.startsWith(String(id) + ",")) {
      found = true;
      Serial.printf("🗑️ Menghapus baris user %d dari SD\n", id);
      continue;
    }
    newContent += line + "\n";
  }
  file.close();
  
  if (found) {
    File outFile = SD.open("/users.txt", FILE_WRITE);
    if (outFile) {
      outFile.print(newContent);
      outFile.close();
      Serial.printf("✅ User %d dihapus dari SD\n", id);
      
      for (int i = 0; i < userCacheCount; i++) {
        if (userCache[i].id == id) {
          for (int j = i; j < userCacheCount - 1; j++) {
            userCache[j] = userCache[j + 1];
          }
          userCacheCount--;
          break;
        }
      }
    }
  }
}

UserData getUserData(int id) {
  for (int i = 0; i < userCacheCount; i++) {
    if (userCache[i].id == id) {
      return userCache[i];
    }
  }
  
  UserData user;
  user.id = id;
  user.nama = "Unknown";
  user.kelas = "-";
  user.jurusan = "-";
  user.delayOut = globalDelayMinutes;
  
  File file = SD.open("/users.txt", FILE_READ);
  if (file) {
    while (file.available()) {
      String line = file.readStringUntil('\n');
      if (line.startsWith(String(id) + ",")) {
        int c1 = line.indexOf(',');
        int c2 = line.indexOf(',', c1 + 1);
        int c3 = line.indexOf(',', c2 + 1);
        int c4 = line.indexOf(',', c3 + 1);
        user.nama = line.substring(c1 + 1, c2);
        user.kelas = line.substring(c2 + 1, c3);
        if (c4 > 0) {
          user.jurusan = line.substring(c3 + 1, c4);
          user.delayOut = line.substring(c4 + 1).toInt();
        } else {
          user.jurusan = line.substring(c3 + 1);
          user.jurusan.trim();
          user.delayOut = globalDelayMinutes;
        }
        if (user.delayOut <= 0) user.delayOut = globalDelayMinutes;
        break;
      }
    }
    file.close();
  }
  return user;
}

// ================= FUNGSI STAFF CACHE =================
void loadStaffCacheFromSD() {
  File file = SD.open("/staff.txt", FILE_READ);
  if (!file) {
    Serial.println("⚠️ No staff.txt found");
    staffCacheCount = 0;
    return;
  }
  
  staffCacheCount = 0;
  while (file.available() && staffCacheCount < MAX_STAFF) {
    String line = file.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) continue;
    
    int c1 = line.indexOf(',');
    int c2 = line.indexOf(',', c1 + 1);
    int c3 = line.indexOf(',', c2 + 1);
    int c4 = line.indexOf(',', c3 + 1);
    int c5 = line.indexOf(',', c4 + 1);
    int c6 = line.indexOf(',', c5 + 1);
    
    if (c1 > 0 && c2 > 0) {
      staffCache[staffCacheCount].id = line.substring(0, c1).toInt();
      staffCache[staffCacheCount].staffId = line.substring(c1 + 1, c2);
      staffCache[staffCacheCount].nama = (c3 > 0) ? line.substring(c2 + 1, c3) : "";
      staffCache[staffCacheCount].jabatan = (c4 > 0) ? line.substring(c3 + 1, c4) : "guru";
      staffCache[staffCacheCount].departemen = (c5 > 0) ? line.substring(c4 + 1, c5) : "-";
      staffCache[staffCacheCount].email = (c6 > 0) ? line.substring(c5 + 1, c6) : "";
      staffCache[staffCacheCount].noHp = (c6 > 0) ? line.substring(c6 + 1) : "";
      staffCacheCount++;
    }
  }
  file.close();
  Serial.printf("📚 Loaded %d staff from SD cache\n", staffCacheCount);
}

void saveStaffToSD(int id, String staffId, String nama, String jabatan, String departemen, String email, String noHp) {
  File file = SD.open("/staff.txt", FILE_READ);
  bool exists = false;
  String existingContent = "";
  
  if (file) {
    while (file.available()) {
      String line = file.readStringUntil('\n');
      if (line.startsWith(String(id) + ",")) {
        exists = true;
        existingContent += String(id) + "," + staffId + "," + nama + "," + jabatan + "," + departemen + "," + email + "," + noHp + "\n";
      } else {
        existingContent += line + "\n";
      }
    }
    file.close();
  }
  
  if (!exists) {
    existingContent += String(id) + "," + staffId + "," + nama + "," + jabatan + "," + departemen + "," + email + "," + noHp + "\n";
  }
  
  File outFile = SD.open("/staff.txt", FILE_WRITE);
  if (outFile) {
    outFile.print(existingContent);
    outFile.close();
    Serial.printf("✅ Staff ID %d (%s) tersimpan di SD\n", id, nama.c_str());
  }
  
  bool found = false;
  for (int i = 0; i < staffCacheCount; i++) {
    if (staffCache[i].id == id) {
      staffCache[i].staffId = staffId;
      staffCache[i].nama = nama;
      staffCache[i].jabatan = jabatan;
      staffCache[i].departemen = departemen;
      staffCache[i].email = email;
      staffCache[i].noHp = noHp;
      found = true;
      break;
    }
  }
  if (!found && staffCacheCount < MAX_STAFF) {
    staffCache[staffCacheCount].id = id;
    staffCache[staffCacheCount].staffId = staffId;
    staffCache[staffCacheCount].nama = nama;
    staffCache[staffCacheCount].jabatan = jabatan;
    staffCache[staffCacheCount].departemen = departemen;
    staffCache[staffCacheCount].email = email;
    staffCache[staffCacheCount].noHp = noHp;
    staffCacheCount++;
  }
}

StaffData getStaffData(int id) {
  for (int i = 0; i < staffCacheCount; i++) {
    if (staffCache[i].id == id) {
      return staffCache[i];
    }
  }
  
  StaffData staff;
  staff.id = id;
  staff.staffId = "STF" + String(id);
  staff.nama = "Staff" + String(id);
  staff.jabatan = "guru";
  staff.departemen = "-";
  staff.email = "";
  staff.noHp = "";
  return staff;
}

// ================= HAPUS FINGERPRINT DARI SEMUA SENSOR =================
bool deleteFingerprintFromAllSensors(int id) {
  int successCount = 0;
  int failCount = 0;
  int notFoundCount = 0;
  
  sendBLEMessage("🗑️ Menghapus ID " + String(id) + " dari " + String(16) + " sensor...");
  Serial.printf("🗑️ Menghapus fingerprint ID %d dari semua sensor\n", id);
  
  for (int i = 1; i <= 16; i++) {
    selectSensor(i);
    delay(50);
    
    int loadResult = finger.loadModel(id);
    
    if (loadResult == FINGERPRINT_OK) {
      int deleteResult = finger.deleteModel(id);
      if (deleteResult == FINGERPRINT_OK) {
        successCount++;
        Serial.printf("  ✅ Sensor %d: ID %d terhapus\n", i, id);
      } else {
        failCount++;
        Serial.printf("  ❌ Sensor %d: Gagal hapus (code %d)\n", i, deleteResult);
      }
    } else {
      notFoundCount++;
      Serial.printf("  ℹ️ Sensor %d: ID %d tidak ditemukan\n", i, id);
    }
    
    delay(30);
  }
  
  selectSensor(1);
  
  String resultMsg = "Hapus ID " + String(id) + ": " + String(successCount) + " berhasil, " + 
                     String(failCount) + " gagal, " + String(notFoundCount) + " tidak ditemukan";
  sendBLEMessage(resultMsg);
  Serial.println("📱 " + resultMsg);
  
  removeUserFromSD(id);
  
  return (failCount == 0);
}

// ================= AUTO ALPHA DAN SINKRONISASI OFFLINE =================
void saveAlphaRecord(int studentId, String date, String status, bool isManual = false) {
  AlphaRecord rec;
  rec.studentId = studentId;
  strcpy(rec.date, date.c_str());
  strcpy(rec.status, status.c_str());
  rec.synced = false;

  if (isOnline && status == "alpha") {
    String path = "attendance_status/" + date + "/" + String(studentId) + "/status";
    if (Firebase.RTDB.get(&fbdo, path)) {
      if (fbdo.dataType() == "string") {
        String manualStatus = fbdo.stringData();
        if (manualStatus == "sakit" || manualStatus == "izin") {
          Serial.printf("ℹ️ ID %d tanggal %s sudah diatur manual: %s\n", studentId, date.c_str(), manualStatus.c_str());
          return;
        }
      }
    }
    FirebaseJson json;
    json.set("status", "alpha");
    json.set("auto", true);
    json.set("timestamp_ms", millis());
    if (Firebase.RTDB.set(&fbdo, "attendance_status/" + date + "/" + String(studentId), &json)) {
      Serial.printf("✅ Auto alpha ID %d tanggal %s\n", studentId, date.c_str());
      rec.synced = true;
    } else {
      Serial.printf("⚠️ Gagal kirim alpha ID %d, simpan ke antrian\n", studentId);
      xQueueSend(xQueueAlphaSync, &rec, 0);
    }
  } 
  else if (isOnline && (status == "sakit" || status == "izin")) {
    rec.synced = true;
  }
  else {
    xQueueSend(xQueueAlphaSync, &rec, 0);
  }
}

void syncPendingAlpha() {
  if (!isOnline) return;
  
  AlphaRecord rec;
  while (xQueueReceive(xQueueAlphaSync, &rec, 0) == pdTRUE) {
    if (rec.synced) continue;
    
    String date = String(rec.date);
    int studentId = rec.studentId;
    
    String absenPath = "absensi/" + date + "/" + String(studentId) + "/in";
    if (Firebase.RTDB.get(&fbdo, absenPath) && fbdo.dataType() == "string" && fbdo.stringData().length() > 0) {
      Serial.printf("ℹ️ ID %d tanggal %s sudah absen saat sync, skip alpha\n", studentId, date.c_str());
      continue;
    }
    
    String statusPath = "attendance_status/" + date + "/" + String(studentId) + "/status";
    bool manualExists = false;
    String manualStatus = "";
    if (Firebase.RTDB.get(&fbdo, statusPath) && fbdo.dataType() == "string") {
      manualStatus = fbdo.stringData();
      if (manualStatus == "sakit" || manualStatus == "izin") {
        manualExists = true;
      }
    }
    
    if (manualExists) {
      Serial.printf("ℹ️ ID %d tanggal %s sudah manual: %s\n", studentId, date.c_str(), manualStatus.c_str());
      continue;
    }
    
    FirebaseJson json;
    json.set("status", "alpha");
    json.set("auto", true);
    json.set("timestamp_ms", millis());
    if (Firebase.RTDB.set(&fbdo, "attendance_status/" + date + "/" + String(studentId), &json)) {
      Serial.printf("✅ Sync alpha ID %d tanggal %s\n", studentId, date.c_str());
    } else {
      xQueueSend(xQueueAlphaSync, &rec, 0);
      break;
    }
  }
}

bool isStudentAbsentOnDate(int studentId, String date) {
  File file = SD.open("/attendance.txt", FILE_READ);
  if (file) {
    while (file.available()) {
      String line = file.readStringUntil('\n');
      if (line.indexOf(String(studentId) + "," + date) != -1) {
        file.close();
        return true;
      }
    }
    file.close();
  }
  
  if (isOnline) {
    String path = "absensi/" + date + "/" + String(studentId) + "/in";
    if (Firebase.RTDB.get(&fbdo, path)) {
      if (fbdo.dataType() == "string" && fbdo.stringData().length() > 0) {
        return true;
      }
    }
  }
  return false;
}

void performDailyAbsenceCheck() {
  DateTime now = rtc.now();
  String today = getCurrentDateRTC();
  
  if (lastDailyCheckDate == today) return;
  
  int currentMinutes = now.hour() * 60 + now.minute();
  if (currentMinutes < 5 || currentMinutes > 23*60) {
    return;
  }
  
  if (dailyCheckInProgress) return;
  dailyCheckInProgress = true;
  
  Serial.printf("📊 Memulai pengecekan absensi harian untuk tanggal %s\n", today.c_str());
  
  loadUserCacheFromSD();
  
  int alphaCount = 0;
  int skipCount = 0;
  
  for (int i = 0; i < userCacheCount; i++) {
    int id = userCache[i].id;
    
    if (isStudentAbsentOnDate(id, today)) {
      skipCount++;
      continue;
    }
    
    String status = "alpha";
    bool manualFound = false;
    
    if (isOnline) {
      String statusPath = "attendance_status/" + today + "/" + String(id) + "/status";
      if (Firebase.RTDB.get(&fbdo, statusPath)) {
        if (fbdo.dataType() == "string") {
          String manualStatus = fbdo.stringData();
          if (manualStatus == "sakit" || manualStatus == "izin") {
            status = manualStatus;
            manualFound = true;
          }
        }
      }
    }
    
    if (manualFound) {
      Serial.printf("ℹ️ ID %d tanggal %s sudah diatur manual: %s\n", id, today.c_str(), status.c_str());
    } else {
      saveAlphaRecord(id, today, status, manualFound);
      alphaCount++;
    }
    
    delay(50);
  }
  
  preferences.begin("alpha", false);
  preferences.putString("lastCheck", today);
  preferences.end();
  lastDailyCheckDate = today;
  
  dailyCheckInProgress = false;
  Serial.printf("✅ Pengecekan selesai: %d siswa sudah absen, %d alpha dicatat\n", skipCount, alphaCount);
}

// ================= FIREBASE COMMAND HANDLER =================
void checkFirebaseCommands() {
  if (!isOnline || !Firebase.ready() || isEnrolling) return;
  
  if (Firebase.RTDB.get(&fbdo, "/commands/esp32/delete_fingerprint")) {
    FirebaseJson &json = fbdo.jsonObject();
    FirebaseJsonData jsonData;
    
    int studentId = 0;
    String studentName = "";
    String status = "";
    double timestamp = 0;
    
    if (json.get(jsonData, "studentId")) studentId = jsonData.intValue;
    if (json.get(jsonData, "studentName")) studentName = jsonData.stringValue;
    if (json.get(jsonData, "status")) status = jsonData.stringValue;
    if (json.get(jsonData, "timestamp")) timestamp = jsonData.to<double>();
    
    unsigned long now = millis();
    unsigned long commandTime = (unsigned long)(timestamp / 1000);
    unsigned long timeDiff = (now / 1000) - commandTime;
    
    if (studentId > 0 && status == "pending" && timeDiff < 60) {
      Serial.printf("📡 Menerima command hapus ID %d (%s)\n", studentId, studentName.c_str());
      sendBLEMessage("📡 Menerima perintah hapus ID " + String(studentId));
      
      bool success = deleteFingerprintFromAllSensors(studentId);
      
      FirebaseJson responseJson;
      responseJson.set("studentId", studentId);
      responseJson.set("studentName", studentName);
      responseJson.set("status", success ? "completed" : "failed");
      responseJson.set("timestamp_ms", millis());
      if (!success) {
        responseJson.set("error", "Gagal hapus di beberapa sensor");
      }
      
      if (Firebase.RTDB.set(&fbdo, "/commands/esp32/delete_fingerprint_response", &responseJson)) {
        Serial.println("✅ Response terkirim ke Firebase");
        sendBLEMessage(success ? "✅ Hapus ID " + String(studentId) + " selesai" : "❌ Gagal hapus ID " + String(studentId));
      } else {
        Serial.println("❌ Gagal kirim response");
      }
      
      Firebase.RTDB.deleteNode(&fbdo, "/commands/esp32/delete_fingerprint");
    }
  }
}

// ================= FIREBASE SYNC =================
void initFirebase() {
  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;
  Firebase.reconnectWiFi(true);
  fbdo.setResponseSize(4096);
  Firebase.begin(&config, &auth);
  Serial.println("✅ Firebase terinisialisasi");
}

void syncAllUsersFromFirebase() {
  if (!isOnline || !Firebase.ready() || syncInProgress) return;
  
  syncInProgress = true;
  Serial.println("🔄 Syncing all students from Firebase...");
  
  if (Firebase.RTDB.get(&fbdo, "/users")) {
    FirebaseJson &json = fbdo.jsonObject();
    FirebaseJsonData jsonData;
    String allUserData = "";
    int syncCount = 0;
    
    size_t len = json.iteratorBegin();
    for (size_t i = 0; i < len; i++) {
      int type;
      String key, value;
      json.iteratorGet(i, type, key, value);
      
      int id = key.toInt();
      String nama = "", kelas = "", jurusan = "";
      int delayOut = globalDelayMinutes;
      
      FirebaseJson userJson;
      userJson.setJsonData(value);
      
      if (userJson.get(jsonData, "nama")) nama = jsonData.stringValue;
      if (userJson.get(jsonData, "kelas")) kelas = jsonData.stringValue;
      if (userJson.get(jsonData, "jurusan")) jurusan = jsonData.stringValue;
      if (userJson.get(jsonData, "delayOut")) delayOut = jsonData.intValue;
      
      if (delayOut <= 0) delayOut = globalDelayMinutes;
      if (nama.length() == 0) nama = "User" + String(id);
      if (kelas.length() == 0) kelas = "-";
      if (jurusan.length() == 0) jurusan = "-";
      
      allUserData += String(id) + "," + nama + "," + kelas + "," + jurusan + "," + String(delayOut) + "\n";
      syncCount++;
    }
    json.iteratorEnd();
    
    if (syncCount > 0) {
      File file = SD.open("/users.txt", FILE_WRITE);
      if (file) {
        file.print(allUserData);
        file.close();
        Serial.printf("✅ Synced %d students to SD\n", syncCount);
        loadUserCacheFromSD();
      }
    }
  } else {
    Serial.println("❌ Failed to get /users from Firebase");
  }
  
  syncInProgress = false;
}

void syncAllStaffFromFirebase() {
  if (!isOnline || !Firebase.ready()) return;
  
  Serial.println("🔄 Syncing all staff from Firebase...");
  
  if (Firebase.RTDB.get(&fbdo, "/staff")) {
    FirebaseJson &json = fbdo.jsonObject();
    FirebaseJsonData jsonData;
    String allStaffData = "";
    int syncCount = 0;
    
    size_t len = json.iteratorBegin();
    for (size_t i = 0; i < len; i++) {
      int type;
      String key, value;
      json.iteratorGet(i, type, key, value);
      
      String staffId = key;
      String nama = "", jabatan = "", departemen = "", email = "", noHp = "";
      
      FirebaseJson staffJson;
      staffJson.setJsonData(value);
      
      if (staffJson.get(jsonData, "nama")) nama = jsonData.stringValue;
      if (staffJson.get(jsonData, "jabatan")) jabatan = jsonData.stringValue;
      if (staffJson.get(jsonData, "departemen")) departemen = jsonData.stringValue;
      if (staffJson.get(jsonData, "email")) email = jsonData.stringValue;
      if (staffJson.get(jsonData, "noHp")) noHp = jsonData.stringValue;
      
      if (nama.length() == 0) nama = "Staff";
      if (jabatan.length() == 0) jabatan = "guru";
      if (departemen.length() == 0) departemen = "-";
      
      bool found = false;
      for (int s = 0; s < staffCacheCount; s++) {
        if (staffCache[s].staffId == staffId) {
          staffCache[s].nama = nama;
          staffCache[s].jabatan = jabatan;
          staffCache[s].departemen = departemen;
          staffCache[s].email = email;
          staffCache[s].noHp = noHp;
          allStaffData += String(staffCache[s].id) + "," + staffId + "," + nama + "," + jabatan + "," + departemen + "," + email + "," + noHp + "\n";
          found = true;
          syncCount++;
          break;
        }
      }
      
      if (!found) {
        int newFpId = currentStaffID++;
        saveSettings();
        allStaffData += String(newFpId) + "," + staffId + "," + nama + "," + jabatan + "," + departemen + "," + email + "," + noHp + "\n";
        syncCount++;
        
        Serial.printf("📝 Staff baru dari Firebase: %s -> FP ID: %d\n", nama.c_str(), newFpId);
      }
    }
    json.iteratorEnd();
    
    if (syncCount > 0) {
      File file = SD.open("/staff.txt", FILE_WRITE);
      if (file) {
        file.print(allStaffData);
        file.close();
        Serial.printf("✅ Synced %d staff to SD\n", syncCount);
        loadStaffCacheFromSD();
      }
    }
  } else {
    Serial.println("❌ Failed to get /staff from Firebase");
  }
}

void checkFirebaseSettings() {
  if (Firebase.ready() && isOnline) {
    if (Firebase.RTDB.get(&fbdo, "/settings/delayOut")) {
      int fbDelay = fbdo.to<int>();
      if (fbDelay > 0 && fbDelay != globalDelayMinutes) {
        globalDelayMinutes = fbDelay;
        saveSettings();
        sendBLEMessage("Global Delay: " + String(globalDelayMinutes) + " menit");
        Serial.printf("✅ Global delay update dari Firebase: %d\n", globalDelayMinutes);
      }
    }
  }
}

void syncOfflineData() {
  if (!Firebase.ready()) return;
  
  File logFile = SD.open("/attendance.txt", FILE_READ);
  if (!logFile) return;

  String unsynced = "";
  int synced = 0;

  while (logFile.available()) {
    String line = logFile.readStringUntil('\n');
    if (line.length() < 10) continue;

    int c1 = line.indexOf(',');
    int c2 = line.indexOf(',', c1 + 1);
    int c3 = line.indexOf(',', c2 + 1);
    int c4 = line.lastIndexOf(',');

    int id = line.substring(0, c1).toInt();
    String date = line.substring(c1 + 1, c2);
    String time = line.substring(c2 + 1, c3);
    String status = line.substring(c4 + 1);
    
    bool isStaff = (id >= 1000);
    
    if (isStaff) {
      StaffData staff = getStaffData(id);
      String path = "staff_attendance/" + date + "/" + staff.staffId;
      
      if (status == "IN") {
        FirebaseJson json;
        json.set("staffId", staff.staffId);
        json.set("nama", staff.nama);
        json.set("jabatan", staff.jabatan);
        json.set("timeIn", time);
        json.set("status", "hadir");
        if (Firebase.RTDB.set(&fbdo, path, &json)) synced++;
        else unsynced += line + "\n";
      } else if (status == "OUT") {
        if (Firebase.RTDB.set(&fbdo, path + "/timeOut", time)) {
          Firebase.RTDB.set(&fbdo, path + "/status", "pulang");
          synced++;
        } else unsynced += line + "\n";
      }
    } else {
      UserData user = getUserData(id);
      String path = "absensi/" + date + "/" + String(id);
      
      if (status == "IN") {
        FirebaseJson json;
        json.set("nama", user.nama);
        json.set("kelas", user.kelas);
        json.set("jurusan", user.jurusan);
        json.set("in", time);
        if (Firebase.RTDB.set(&fbdo, path, &json)) synced++;
        else unsynced += line + "\n";
      } else if (status == "OUT") {
        if (Firebase.RTDB.set(&fbdo, path + "/out", time)) synced++;
        else unsynced += line + "\n";
      }
    }
  }
  logFile.close();

  if (synced > 0) {
    SD.remove("/attendance.txt");
    if (unsynced.length() > 0) {
      File newLog = SD.open("/attendance.txt", FILE_WRITE);
      newLog.print(unsynced);
      newLog.close();
    }
    Serial.printf("✅ Sync offline: %d data\n", synced);
  }
  
  syncPendingAlpha();
}

// ================= MUX & FINGERPRINT =================
void selectSensor(int id) {
  int val = id - 1;
  digitalWrite(MUX_S0, val & 0x01);
  digitalWrite(MUX_S1, val & 0x02);
  digitalWrite(MUX_S2, val & 0x04);
  digitalWrite(MUX_S3, val & 0x08);
  delay(50);
}

void logAttendanceToSD(int id, String status, bool isStaff = false) {
  File file = SD.open("/attendance.txt", FILE_APPEND);
  if (file) {
    file.println(String(id) + "," + getCurrentDateRTC() + "," + getCurrentTimeRTC() + "," + status);
    file.close();
  }
}

void sendToFirebase(int id, String status, String time, String date, String nama, String kelas, String jurusan) {
  if (!isOnline || !Firebase.ready()) return;
  
  String path = "absensi/" + date + "/" + String(id);
  
  if (status == "IN") {
    FirebaseJson json;
    json.set("nama", nama);
    json.set("kelas", kelas);
    json.set("jurusan", jurusan);
    json.set("in", time);
    Firebase.RTDB.set(&fbdo, path, &json);
    Serial.printf("📤 Firebase IN: %s\n", nama.c_str());
  } else if (status == "OUT") {
    Firebase.RTDB.set(&fbdo, path + "/out", time);
    Serial.printf("📤 Firebase OUT: %s\n", nama.c_str());
  }
}

void sendStaffToFirebase(int id, String status, String time, String date, StaffData staff) {
  if (!isOnline || !Firebase.ready()) return;
  
  String path = "staff_attendance/" + date + "/" + staff.staffId;
  
  if (status == "IN") {
    FirebaseJson json;
    json.set("staffId", staff.staffId);
    json.set("nama", staff.nama);
    json.set("jabatan", staff.jabatan);
    json.set("departemen", staff.departemen);
    json.set("timeIn", time);
    json.set("status", "hadir");
    Firebase.RTDB.set(&fbdo, path, &json);
    Serial.printf("📤 Firebase STAFF IN: %s (%s)\n", staff.nama.c_str(), staff.staffId.c_str());
  } else if (status == "OUT") {
    Firebase.RTDB.set(&fbdo, path + "/timeOut", time);
    Firebase.RTDB.set(&fbdo, path + "/status", "pulang");
    Serial.printf("📤 Firebase STAFF OUT: %s\n", staff.nama.c_str());
  }
}

// ================= HANDLE ATTENDANCE =================
void handleAttendance(int id) {
  String date = getCurrentDateRTC();
  String time = getCurrentTimeRTC();
  
  bool isStaff = (id >= 1000);
  
  if (isStaff) {
    StaffData staff = getStaffData(id);
    
    String lastStatus = "NONE";
    String inTime = "";

    File file = SD.open("/attendance.txt", FILE_READ);
    if (file) {
      while (file.available()) {
        String line = file.readStringUntil('\n');
        if (line.indexOf(String(id) + "," + date) != -1) {
          int c4 = line.lastIndexOf(',');
          lastStatus = line.substring(c4 + 1);
          if (lastStatus == "IN") {
            int c1 = line.indexOf(',');
            int c2 = line.indexOf(',', c1 + 1);
            int c3 = line.indexOf(',', c2 + 1);
            inTime = line.substring(c2 + 1, c3);
          }
        }
      }
      file.close();
    }

    if (lastStatus == "NONE") {
      logAttendanceToSD(id, "IN", true);
      sendStaffToFirebase(id, "IN", time, date, staff);
      sendBLEMessage("✅ STAFF " + staff.nama + " - MASUK " + time);
      Serial.printf("✅ STAFF MASUK: %s (%d) jam %s\n", staff.nama.c_str(), id, time.c_str());
      
    } else if (lastStatus == "IN") {
      logAttendanceToSD(id, "OUT", true);
      sendStaffToFirebase(id, "OUT", time, date, staff);
      sendBLEMessage("✅ STAFF " + staff.nama + " - PULANG " + time);
      Serial.printf("✅ STAFF PULANG: %s (%d) jam %s\n", staff.nama.c_str(), id, time.c_str());
      
    } else {
      sendBLEMessage("⚠️ STAFF " + staff.nama + " sudah absen hari ini");
    }
    
  } else {
    UserData user = getUserData(id);
    int requiredDelay = (user.delayOut > 0) ? user.delayOut : globalDelayMinutes;
    
    String lastStatus = "NONE";
    String inTime = "";

    File file = SD.open("/attendance.txt", FILE_READ);
    if (file) {
      while (file.available()) {
        String line = file.readStringUntil('\n');
        if (line.indexOf(String(id) + "," + date) != -1) {
          int c4 = line.lastIndexOf(',');
          lastStatus = line.substring(c4 + 1);
          if (lastStatus == "IN") {
            int c1 = line.indexOf(',');
            int c2 = line.indexOf(',', c1 + 1);
            int c3 = line.indexOf(',', c2 + 1);
            inTime = line.substring(c2 + 1, c3);
          }
        }
      }
      file.close();
    }

    if (lastStatus == "NONE") {
      logAttendanceToSD(id, "IN", false);
      sendToFirebase(id, "IN", time, date, user.nama, user.kelas, user.jurusan);
      sendBLEMessage("✅ " + user.nama + " - MASUK " + time);
      Serial.printf("✅ MASUK: %s (%d) jam %s, delay_required=%d menit\n", 
                    user.nama.c_str(), id, time.c_str(), requiredDelay);
      
    } else if (lastStatus == "IN") {
      int timeDiff = getCurrentMinutesRTC() - stringToMinutes(inTime);
      if (timeDiff < requiredDelay) {
        int wait = requiredDelay - timeDiff;
        sendBLEMessage("⏰ " + user.nama + " tunggu " + String(wait) + " menit (min " + String(requiredDelay) + " menit)");
        Serial.printf("⚠️ PULANG DITOLAK: %s, sudah %d menit, perlu %d menit\n", 
                      user.nama.c_str(), timeDiff, requiredDelay);
        return;
      }
      logAttendanceToSD(id, "OUT", false);
      sendToFirebase(id, "OUT", time, date, user.nama, user.kelas, user.jurusan);
      sendBLEMessage("✅ " + user.nama + " - PULANG " + time);
      Serial.printf("✅ PULANG: %s (%d) jam %s\n", user.nama.c_str(), id, time.c_str());
      
    } else {
      sendBLEMessage("⚠️ " + user.nama + " sudah absen hari ini");
    }
  }
}

// ================= ENROLL FINGERPRINT =================
int enrollFingerprint(int id) {
  selectSensor(1);
  sendBLEMessage("📌 Tempelkan jari...");
  
  int p = -1;
  while (p != FINGERPRINT_OK) {
    p = finger.getImage();
    delay(100);
  }
  p = finger.image2Tz(1);
  if (p != FINGERPRINT_OK) return p;

  sendBLEMessage("📌 Lepaskan jari...");
  delay(2000);
  while (finger.getImage() != FINGERPRINT_NOFINGER) delay(100);

  sendBLEMessage("📌 Tempelkan lagi...");
  p = -1;
  while (p != FINGERPRINT_OK) {
    p = finger.getImage();
    delay(100);
  }
  p = finger.image2Tz(2);
  if (p != FINGERPRINT_OK) return p;

  p = finger.createModel();
  if (p != FINGERPRINT_OK) return p;

  p = finger.storeModel(id);
  if (p != FINGERPRINT_OK) return p;

  sendBLEMessage("🔄 Sinkronisasi ke 16 sensor...");
  for (int i = 1; i <= 16; i++) {
    selectSensor(i);
    delay(30);
    finger.loadModel(id);
    finger.storeModel(id);
    delay(30);
  }
  selectSensor(1);
  
  return FINGERPRINT_OK;
}

// ================= ENROLL STAFF =================
void enrollStaff() {
  while (isStaffRegistered(currentStaffID)) {
    currentStaffID++;
    saveSettings();
  }
  
  int fpId = currentStaffID;
  String defaultStaffId = "STF" + String(lastStaffNumber + 1);
  String defaultNama = "Staff" + String(fpId);
  String defaultJabatan = "guru";
  String defaultDepartemen = "-";
  String defaultEmail = defaultStaffId + "@sekolah.sch.id";
  String defaultNoHp = "-";
  
  sendBLEMessage("📝 Pendaftaran STAFF - FP ID: " + String(fpId));
  sendBLEMessage("🆔 Staff ID: " + defaultStaffId);
  sendBLEMessage("👤 Nama: " + defaultNama);
  
  int result = enrollFingerprint(fpId);
  
  if (result == FINGERPRINT_OK) {
    saveStaffToSD(fpId, defaultStaffId, defaultNama, defaultJabatan, defaultDepartemen, defaultEmail, defaultNoHp);
    lastStaffNumber++;
    
    if (isOnline && Firebase.ready()) {
      FirebaseJson json;
      json.set("id", defaultStaffId);
      json.set("nama", defaultNama);
      json.set("jabatan", defaultJabatan);
      json.set("departemen", defaultDepartemen);
      json.set("email", defaultEmail);
      json.set("noHp", defaultNoHp);
      json.set("fingerprintId", fpId);
      Firebase.RTDB.set(&fbdo, "staff/" + defaultStaffId, &json);
      
      generateStaffRegistrationCode(defaultStaffId, defaultEmail, defaultNama);
    }
    
    sendBLEMessage("✅ STAFF berhasil didaftarkan!");
    sendBLEMessage("📱 ID Staff: " + defaultStaffId);
    sendBLEMessage("🔑 Email: " + defaultEmail);
    
    currentStaffID++;
    saveSettings();
  } else {
    sendBLEMessage("❌ Gagal enroll staff, coba lagi");
    Serial.printf("❌ Staff enroll gagal, code: %d\n", result);
  }
}

void generateStaffRegistrationCode(String staffId, String email, String nama) {
  if (!isOnline || !Firebase.ready()) {
    sendBLEMessage("⚠️ Tidak bisa generate kode (offline)");
    return;
  }
  
  String timestamp = String(millis());
  String randomStr = String(random(1000, 9999));
  String code = "REG-" + timestamp.substring(timestamp.length() - 4) + randomStr;
  
  FirebaseJson json;
  json.set("used", false);
  json.set("createdAt", millis());
  json.set("type", "staff");
  json.set("createdBy", "ESP32");
  json.set("createdRole", "system");
  json.set("linkedId", staffId);
  json.set("linkedEmail", email);
  json.set("linkedName", nama);
  json.set("targetRole", "guru");
  json.set("requireId", true);
  
  if (Firebase.RTDB.set(&fbdo, "codes/" + code, &json)) {
    sendBLEMessage("🔑 Kode Registrasi Staff: " + code);
  } else {
    sendBLEMessage("❌ Gagal generate kode registrasi");
  }
}

// ================= BLE COMMANDS =================
void sendBLEMessage(String msg) {
  if (deviceConnected && pTxCharacteristic) {
    pTxCharacteristic->setValue(msg.c_str());
    pTxCharacteristic->notify();
    Serial.println("📱 BLE: " + msg);
  }
}

class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) { 
    deviceConnected = true; 
    Serial.println("📱 BLE Client Connected");
    sendBLEMessage("ESP32 Absensi Ready");
    sendBLEMessage("Status: WiFi=" + String(isOnline ? "ONLINE" : "OFFLINE"));
    if (wifiSSID.length() > 0) {
      sendBLEMessage("WiFi SSID: " + wifiSSID);
    } else {
      sendBLEMessage("⚠️ No WiFi configured. Send HELP for menu");
    }
  }
  void onDisconnect(BLEServer* pServer) { 
    deviceConnected = false; 
    Serial.println("📱 BLE Client Disconnected");
    wifiConfigState = WIFI_IDLE;
  }
};

class MyCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* pCharacteristic) {
    String rxValue = pCharacteristic->getValue().c_str();
    if (rxValue.length() > 0) {
      Serial.println("📱 BLE RX: " + rxValue);
      rxValue.trim();
      
      if (wifiConfigState == WIFI_WAITING_SSID_SELECTION) {
        int selectedIndex = rxValue.toInt() - 1;
        if (selectedIndex >= 0 && selectedIndex < wifiScanCount) {
          pendingSelectedSSID = wifiScanResults[selectedIndex];
          sendBLEMessage("📶 Selected: " + pendingSelectedSSID);
          sendBLEMessage("🔐 Enter password for this WiFi:");
          wifiConfigState = WIFI_WAITING_PASSWORD;
        } else {
          sendBLEMessage("❌ Invalid number. Send SCAN_WIFI again.");
          wifiConfigState = WIFI_IDLE;
        }
        return;
      }
      
      if (wifiConfigState == WIFI_WAITING_PASSWORD) {
        String password = rxValue;
        if (password.length() > 0) {
          sendBLEMessage("📡 Saving WiFi: " + pendingSelectedSSID);
          saveWiFiCredentials(pendingSelectedSSID, password);
          wifiSSID = pendingSelectedSSID;
          wifiPassword = password;
          sendBLEMessage("🔄 Connecting to WiFi...");
          connectToWiFi();
        } else {
          sendBLEMessage("❌ Password cannot be empty. Send SCAN_WIFI to restart.");
        }
        wifiConfigState = WIFI_IDLE;
        return;
      }
      
      if (rxValue.equalsIgnoreCase("SCAN_WIFI")) {
        sendBLEMessage("📡 Scanning WiFi networks...");
        int n = WiFi.scanNetworks();
        if (n == 0) {
          sendBLEMessage("❌ No networks found");
        } else {
          wifiScanCount = 0;
          sendBLEMessage("📡 Found " + String(n) + " networks:");
          for (int i = 0; i < n && i < 20; i++) {
            String ssid = WiFi.SSID(i);
            if (ssid.length() > 0) {
              wifiScanResults[wifiScanCount++] = ssid;
              sendBLEMessage(String(i+1) + ". " + ssid + " (" + String(WiFi.RSSI(i)) + " dBm)");
            }
          }
          if (wifiScanCount > 0) {
            sendBLEMessage("Enter number to select WiFi:");
            wifiConfigState = WIFI_WAITING_SSID_SELECTION;
          } else {
            sendBLEMessage("❌ No valid SSID found");
          }
        }
        WiFi.scanDelete();
        return;
      }
      
      else if (rxValue.equalsIgnoreCase("GET_WIFI")) {
        if (wifiSSID.length() > 0) {
          sendBLEMessage("WiFi SSID: " + wifiSSID);
          sendBLEMessage("Status: " + String(isOnline ? "CONNECTED" : "DISCONNECTED"));
          if (isOnline) {
            sendBLEMessage("IP: " + WiFi.localIP().toString());
          }
        } else {
          sendBLEMessage("⚠️ No WiFi configured");
        }
        return;
      }
      
      else if (rxValue.equalsIgnoreCase("CLEAR_WIFI")) {
        clearWiFiCredentials();
        WiFi.disconnect(true);
        isOnline = false;
        sendBLEMessage("🗑️ WiFi credentials cleared");
        sendBLEMessage("📡 Use SCAN_WIFI to configure new WiFi");
        wifiConfigState = WIFI_IDLE;
        return;
      }
      
      else if (rxValue.equalsIgnoreCase("GET_STATUS")) {
        sendBLEMessage("STATUS|Delay:" + String(globalDelayMinutes) + 
                       "|Online:" + String(isOnline) + 
                       "|Students:" + String(userCacheCount) +
                       "|Staff:" + String(staffCacheCount) +
                       "|WiFi:" + (wifiSSID.length() > 0 ? wifiSSID : "NOT_SET"));
        if (isOnline) {
          sendBLEMessage("IP: " + WiFi.localIP().toString());
        }
        return;
      }
      
      else if (rxValue.startsWith("SET_DELAY:")) {
        int newDelay = rxValue.substring(10).toInt();
        if (newDelay > 0) {
          globalDelayMinutes = newDelay;
          saveSettings();
          sendBLEMessage("✅ Global Delay: " + String(globalDelayMinutes) + " menit");
        } else {
          sendBLEMessage("❌ Invalid delay value");
        }
        return;
      }
      
      else if (rxValue.equalsIgnoreCase("SYNC_USERS")) {
        if (isOnline) {
          syncAllUsersFromFirebase();
          sendBLEMessage("✅ Sync students completed");
        } else {
          sendBLEMessage("❌ Not connected to WiFi");
        }
        return;
      }
      
      else if (rxValue.equalsIgnoreCase("SYNC_STAFF")) {
        if (isOnline) {
          syncAllStaffFromFirebase();
          sendBLEMessage("✅ Sync staff completed");
        } else {
          sendBLEMessage("❌ Not connected to WiFi");
        }
        return;
      }
      
      else if (rxValue.startsWith("DELETE_FP:")) {
        int fid = rxValue.substring(10).toInt();
        if (fid > 0) {
          deleteFingerprintFromAllSensors(fid);
        } else {
          sendBLEMessage("❌ Invalid ID");
        }
        return;
      }
      
      else if (rxValue.equalsIgnoreCase("REBOOT")) {
        sendBLEMessage("🔄 Rebooting ESP32...");
        delay(100);
        ESP.restart();
        return;
      }
      
      else if (rxValue.equalsIgnoreCase("HELP")) {
        sendBLEMessage("=== ESP32 Commands ===");
        sendBLEMessage("SCAN_WIFI - Scan & config WiFi");
        sendBLEMessage("GET_WIFI - Show WiFi status");
        sendBLEMessage("CLEAR_WIFI - Clear WiFi config");
        sendBLEMessage("GET_STATUS - System status");
        sendBLEMessage("SET_DELAY:minutes - Set global delay");
        sendBLEMessage("SYNC_USERS - Sync students from Firebase");
        sendBLEMessage("SYNC_STAFF - Sync staff from Firebase");
        sendBLEMessage("DELETE_FP:id - Delete fingerprint");
        sendBLEMessage("REBOOT - Restart ESP32");
        sendBLEMessage("HELP - Show this menu");
        return;
      }
      
      else {
        sendBLEMessage("❌ Unknown command. Send HELP for list");
      }
    }
  }
};

void initBLE() {
  BLEDevice::init("ESP32_Absensi");
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  BLEService* pService = pServer->createService(SERVICE_UUID);
  pTxCharacteristic = pService->createCharacteristic(CHARACTERISTIC_UUID_TX, BLECharacteristic::PROPERTY_NOTIFY);
  pRxCharacteristic = pService->createCharacteristic(CHARACTERISTIC_UUID_RX, BLECharacteristic::PROPERTY_WRITE);
  pRxCharacteristic->setCallbacks(new MyCallbacks());
  pService->start();
  pServer->getAdvertising()->start();
  Serial.println("✅ BLE siap - Nama: ESP32_Absensi");
}

// ================= TASK CORE 0 =================
void TaskScanSensors(void* pvParameters) {
  for (;;) {
    if (isEnrolling) {
      vTaskDelay(100 / portTICK_PERIOD_MS);
      continue;
    }

    for (int i = 1; i <= 16; i++) {
      selectSensor(i);
      if (finger.getImage() == FINGERPRINT_OK) {
        if (finger.image2Tz() == FINGERPRINT_OK) {
          if (finger.fingerSearch() == FINGERPRINT_OK) {
            int id = finger.fingerID;
            xQueueSend(xQueueFingerprint, &id, 0);
            vTaskDelay(2000 / portTICK_PERIOD_MS);
            break;
          }
        }
      }
    }
    vTaskDelay(10 / portTICK_PERIOD_MS);
  }
}

// ================= SETUP =================
void setup() {
  Serial.begin(115200);
  Serial.println("\n🚀 ESP32 Fingerprint System Starting...");

  pinMode(MUX_S0, OUTPUT); pinMode(MUX_S1, OUTPUT);
  pinMode(MUX_S2, OUTPUT); pinMode(MUX_S3, OUTPUT);
  for (int i = 0; i < 16; i++) selectSensor(i + 1);

  mySerial.begin(57600, SERIAL_8N1, FP_RX, FP_TX);
  selectSensor(1);
  finger.begin(57600);
  
  Wire.begin();
  initRTC();
  
  initSD();
  
  if (!pcf.begin(PCF_ADDR)) {
    Serial.println("❌ PCF8574 error");
  }
  for (int i = 0; i < 8; i++) pcf.pinMode(i, INPUT_PULLUP);

  xQueueFingerprint = xQueueCreate(10, sizeof(int));
  xQueueAlphaSync = xQueueCreate(50, sizeof(AlphaRecord));

  xTaskCreatePinnedToCore(TaskScanSensors, "SensorTask", 10000, NULL, 1, NULL, 0);

  preferences.begin("alpha", true);
  lastDailyCheckDate = preferences.getString("lastCheck", "");
  preferences.end();

  loadWiFiCredentials();
  
  if (wifiSSID.length() > 0) {
    connectToWiFi();
  } else {
    Serial.println("⚠️ No WiFi credentials. Use BLE to configure:");
    Serial.println("   Send: SCAN_WIFI");
  }

  initBLE();
  
  Serial.println("==========================================");
  Serial.println("🚀 ESP32 SIAP!");
  Serial.println("   BLE Name: ESP32_Absensi");
  Serial.println("   - Pin 0: Tekan untuk daftar SISWA (fingerprint)");
  Serial.println("   - Pin 1: Tekan untuk daftar STAFF (fingerprint)");
  Serial.println("   Commands: HELP, SCAN_WIFI, GET_STATUS");
  Serial.println("==========================================");
  
  sendBLEMessage("ESP32 Absensi Ready");
  sendBLEMessage("📌 Pin 0: Daftar SISWA | Pin 1: Daftar STAFF");
  if (wifiSSID.length() == 0) {
    sendBLEMessage("⚠️ No WiFi configured!");
    sendBLEMessage("Send: SCAN_WIFI");
  }
}

// ================= LOOP =================
void loop() {
  int id;
  if (xQueueReceive(xQueueFingerprint, &id, pdMS_TO_TICKS(100)) == pdPASS) {
    handleAttendance(id);
  }

  if (wifiSSID.length() > 0) {
    if (WiFi.status() == WL_CONNECTED) {
      if (!isOnline) {
        isOnline = true;
        Serial.println("✅ WiFi reconnected!");
        syncRTCwithNTP();
        initFirebase();
        syncOfflineData();
        checkFirebaseSettings();
        syncAllUsersFromFirebase();
        syncAllStaffFromFirebase();
        sendBLEMessage("✅ WiFi Reconnected");
      }
      
      static unsigned long lastSettings = 0;
      if (millis() - lastSettings > 30000) {
        checkFirebaseSettings();
        lastSettings = millis();
      }
      
      static unsigned long lastUserSync = 0;
      if (millis() - lastUserSync > 300000) {
        syncAllUsersFromFirebase();
        lastUserSync = millis();
      }
      
      if (millis() - lastStaffSync > STAFF_SYNC_INTERVAL) {
        syncAllStaffFromFirebase();
        lastStaffSync = millis();
      }
      
      if (millis() - lastCommandCheck > COMMAND_CHECK_INTERVAL) {
        checkFirebaseCommands();
        lastCommandCheck = millis();
      }
      
      static unsigned long lastPing = 0;
      if (millis() - lastPing > 60000) {
        if (Firebase.ready()) {
          Firebase.RTDB.set(&fbdo, "/status/esp32/last_ping", getCurrentTimeRTC());
          Firebase.RTDB.set(&fbdo, "/status/esp32/ip", WiFi.localIP().toString());
        }
        lastPing = millis();
      }
      
      static unsigned long lastAlphaSync = 0;
      if (millis() - lastAlphaSync > 10000) {
        syncPendingAlpha();
        lastAlphaSync = millis();
      }
    } else {
      if (isOnline) {
        isOnline = false;
        Serial.println("⚠️ WiFi lost, attempting reconnect...");
        sendBLEMessage("⚠️ WiFi lost, reconnecting...");
      }
      static unsigned long lastReconnect = 0;
      if (millis() - lastReconnect > 30000) {
        WiFi.disconnect();
        WiFi.begin(wifiSSID.c_str(), wifiPassword.c_str());
        lastReconnect = millis();
        Serial.println("🔄 Reconnecting to WiFi...");
      }
    }
  }

  static unsigned long lastDailyCheck = 0;
  if (millis() - lastDailyCheck > 60000) {
    performDailyAbsenceCheck();
    lastDailyCheck = millis();
  }

  if (pcf.digitalRead(ENROLL_STUDENT_BTN_PIN) == LOW) {
    delay(500);
    
    if (isEnrolling) {
      sendBLEMessage("⚠️ Sedang proses enroll, tunggu...");
    } else {
      isEnrolling = true;
      isStaffEnroll = false;
      
      while (isUserRegistered(currentStudentID)) {
        currentStudentID++;
        saveSettings();
      }
      
      Serial.printf("📝 Enroll SISWA ID: %d\n", currentStudentID);
      sendBLEMessage("📝 Registrasi SISWA - FP ID: " + String(currentStudentID));
      
      String defaultNama = "Siswa" + String(currentStudentID);
      String defaultKelas = "X";
      String defaultJurusan = "RPL";
      int defaultDelay = globalDelayMinutes;
      
      int result = enrollFingerprint(currentStudentID);
      
      if (result == FINGERPRINT_OK) {
        saveUserToSD(currentStudentID, defaultNama, defaultKelas, defaultJurusan, defaultDelay);
        
        if (isOnline && Firebase.ready()) {
          FirebaseJson json;
          json.set("id", currentStudentID);
          json.set("nama", defaultNama);
          json.set("kelas", defaultKelas);
          json.set("jurusan", defaultJurusan);
          json.set("delayOut", defaultDelay);
          Firebase.RTDB.set(&fbdo, "users/" + String(currentStudentID), &json);
        }
        
        sendBLEMessage("✅ SISWA berhasil didaftarkan! ID: " + String(currentStudentID));
        Serial.printf("✅ Enroll sukses SISWA ID: %d\n", currentStudentID);
        currentStudentID++;
        saveSettings();
      } else {
        sendBLEMessage("❌ Gagal enroll, coba lagi");
        Serial.printf("❌ Enroll gagal, code: %d\n", result);
      }
      
      isEnrolling = false;
    }
    delay(500);
  }
  
  if (pcf.digitalRead(ENROLL_STAFF_BTN_PIN) == LOW) {
    delay(500);
    
    if (isEnrolling) {
      sendBLEMessage("⚠️ Sedang proses enroll, tunggu...");
    } else {
      isEnrolling = true;
      enrollStaff();
      isEnrolling = false;
    }
    delay(500);
  }

  delay(10);
}