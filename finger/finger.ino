// finger.ino - VERSION 7.4 (ENROLL LANGSUNG TANPA INPUT DATA)
// ESP32 Absensi dengan:
// - 6 Sensor Fingerprint (MUX 3-bit)
// - TFT LCD 3.5" 480x320 (ILI9488) - TFT_eSPI
// - Keypad 4x4 via PCF8574
// - MULTI-FINGER PER USER (Max 4 sidik jari per user)
// - ENROLL LANGSUNG: Tempel jari tanpa input nama/kelas/jurusan
// - Data default: Nama="UserX", Kelas="-", Jurusan="-"
// - MAX USERS: 300 | MAX STAFF: 50

#include <HardwareSerial.h>
#include <Adafruit_Fingerprint.h>
#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <SD.h>
#include <SPI.h>
#include <Wire.h>
#include <Adafruit_PCF8574.h>
#include <TFT_eSPI.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <time.h>
#include <RTClib.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include "secrets.h"

// ================= KONFIGURASI =================
#define VERSION "7.4"
#define NUM_SENSORS 6
#define MAX_USERS 300
#define MAX_STAFF 50
#define MAX_FINGERS_PER_USER 4
#define MAX_MENU_ITEMS 10
#define MAX_NAME_LEN 25
#define MAX_CLASS_LEN 10
#define MAX_MAJOR_LEN 15
#define MAX_STAFFID_LEN 10
#define MAX_JABATAN_LEN 20
#define MAX_DEPT_LEN 15
#define MAX_EMAIL_LEN 30
#define MAX_PHONE_LEN 15
#define MAX_FINGER_NAME_LEN 15

// ================= PIN CONFIGURATION =================
#define MUX_S0 26
#define MUX_S1 27
#define MUX_S2 14
#define FP_RX 16
#define FP_TX 17
#define SD_CS   5
#define SD_MOSI 23
#define SD_MISO 19
#define SD_SCK  18
#define PCF_ADDR 0x20
#define I2C_SDA 21
#define I2C_SCL 22

// ================= TFT_eSPI =================
TFT_eSPI tft = TFT_eSPI();

// ================= STRUKTUR DATA =================
struct FingerData {
  int fingerId;
  bool registered;
  char fingerName[MAX_FINGER_NAME_LEN];
};

struct UserData {
  int id;
  char nama[MAX_NAME_LEN];
  char kelas[MAX_CLASS_LEN];
  char jurusan[MAX_MAJOR_LEN];
  int delayOut;
  FingerData fingers[MAX_FINGERS_PER_USER];
  int fingerCount;
};

struct StaffData {
  int id;
  char staffId[MAX_STAFFID_LEN];
  char nama[MAX_NAME_LEN];
  char jabatan[MAX_JABATAN_LEN];
  char departemen[MAX_DEPT_LEN];
  char email[MAX_EMAIL_LEN];
  char noHp[MAX_PHONE_LEN];
  FingerData fingers[MAX_FINGERS_PER_USER];
  int fingerCount;
};

struct AlphaRecord {
  int studentId;
  char date[11];
  char status[10];
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
Preferences preferences;

// ================= WIFI & BLE =================
String wifiSSID = "";
String wifiPassword = "";
bool isOnline = false;
bool deviceConnected = false;

BLEServer *pServer;
BLECharacteristic *pTxCharacteristic;
BLECharacteristic *pRxCharacteristic;

#define SERVICE_UUID           "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_RX "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_TX "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

// ================= STATE =================
int globalDelayMinutes = 60;
int currentStudentID = 1;
int currentStaffID = 1000;
int lastStaffNumber = 1000;
bool isEnrolling = false;
bool syncInProgress = false;
int currentFingerSlot = 0;

// ================= QUEUE =================
QueueHandle_t xQueueFingerprint;
QueueHandle_t xQueueAlphaSync;

// ================= CACHE =================
UserData userCache[MAX_USERS];
int userCacheCount = 0;
StaffData staffCache[MAX_STAFF];
int staffCacheCount = 0;

// ================= LCD MENU STATE =================
enum MenuState {
  MENU_MAIN,
  MENU_ATTENDANCE,
  MENU_ENROLL_STUDENT,
  MENU_ENROLL_STAFF,
  MENU_ADD_FINGER,
  MENU_DELETE_FINGER,
  MENU_LIST_FINGERS,
  MENU_SENSOR_STATUS,
  MENU_SETTINGS,
  MENU_WIFI_CONFIG,
  MENU_SYNC_DATA,
  MENU_ABOUT,
  MENU_INPUT_ID,
  MENU_INPUT_DELAY,
  MENU_CONFIRM_ENROLL,
  MENU_CONFIRM_DELETE,
  MENU_CONFIRM_DELETE_FINGER,
  MENU_ATTENDANCE_RESULT,
  MENU_LOADING
};

MenuState currentMenu = MENU_MAIN;
int menuSelection = 0;
int menuItemCount = 0;

String inputBuffer = "";
int inputCursor = 0;
bool isInputMode = false;

int enrollId = 0;
int enrollDelay = 60;
bool enrollIsStaff = false;
int enrollFingerSlot = 0;
String enrollFingerName = "";

// ================= KEYPAD =================
const char KEYPAD_KEYS[4][4] = {
  {'1', '2', '3', 'A'},
  {'4', '5', '6', 'B'},
  {'7', '8', '9', 'C'},
  {'*', '0', '#', 'D'}
};

uint8_t rowPins[4] = {0, 1, 2, 3};
uint8_t colPins[4] = {4, 5, 6, 7};

char lastKey = '\0';
unsigned long lastKeyTime = 0;
int debounceDelay = 50;
bool keyPressed = false;

// ================= MULTI-TAP KEYPAD =================
const char KEY_MAP[10][5] = {
  {' ', ' ', ' ', ' ', ' '},
  {'.', ',', '?', '!', '\0'},
  {'A', 'B', 'C', '2', '\0'},
  {'D', 'E', 'F', '3', '\0'},
  {'G', 'H', 'I', '4', '\0'},
  {'J', 'K', 'L', '5', '\0'},
  {'M', 'N', 'O', '6', '\0'},
  {'P', 'Q', 'R', 'S', '7'},
  {'T', 'U', 'V', '8', '\0'},
  {'W', 'X', 'Y', 'Z', '9'}
};

int multiTapPressCount = 0;
int multiTapLastDigit = -1;
unsigned long multiTapLastTime = 0;
const unsigned long MULTI_TAP_TIMEOUT = 800;

// ================= WAKTU =================
const long gmtOffset_sec = 25200;
const int daylightOffset_sec = 0;

String lastDailyCheckDate = "";
bool dailyCheckInProgress = false;

// ================= TIMER =================
unsigned long lastCommandCheck = 0;
const unsigned long COMMAND_CHECK_INTERVAL = 2000;
unsigned long lastStaffSync = 0;
const unsigned long STAFF_SYNC_INTERVAL = 300000;
unsigned long lastPing = 0;
unsigned long lastAlphaSync = 0;
unsigned long lastDailyCheck = 0;
unsigned long lastReconnect = 0;
int reconnectAttempts = 0;
const int MAX_RECONNECT_ATTEMPTS = 10;

// ================= SCREEN COLORS =================
#define COLOR_BG       TFT_BLACK
#define COLOR_TEXT     TFT_WHITE
#define COLOR_HEADER   TFT_GREEN
#define COLOR_SUCCESS  TFT_GREEN
#define COLOR_ERROR    TFT_RED
#define COLOR_WARNING  TFT_YELLOW
#define COLOR_HIGHLIGHT TFT_BLUE
#define COLOR_BORDER   TFT_DARKGREY
#define COLOR_SELECTED TFT_NAVY

// ================= PROTOTYPE FUNGSI =================
void drawHeader(const char* title);
void drawFooter(const char* text);
void drawMenu(const char* items[], int count, int selected);
void drawCenteredText(int y, const char* text, uint16_t color = TFT_WHITE, int size = 2);
void drawInput(const char* label, const char* value, bool isNameMode = false);
void drawAttendanceResult(const char* name, int id, const char* status, const char* time);
void updateProgress(int current, int total, const char* label);
void drawTextString(int x, int y, const String& text, uint16_t color = TFT_WHITE, int size = 2);

void showMainMenu();
void showEnrollStudent();
void showEnrollStaff();
void showAddFinger();
void showDeleteFinger();
void showListFingers();
void showSensorStatus();
void showSettings();
void showWiFiConfig();
void showSyncData();
void showAbout();
void showConfirmEnroll();
void showConfirmDelete(int id, const char* name);
void showConfirmDeleteFinger();

char getKey();
char waitForKey(unsigned long timeout = 0);
void clearKeyBuffer();

char processMultiTap(char key, String &buffer, bool isNameMode);
void resetMultiTap();
String readStringMultiTap(int maxLen, const char* prompt);
int readNumberMultiTap(int maxLen, const char* prompt);

void handleMenuNavigation(char key);
void handleInput(char key);
void processEnroll();
void processDelete();
void processAddFinger();
void processDeleteFinger();

bool findUserByFingerprint(int fingerprintId, int &userId, bool &isStaff);
void handleAttendance(int id);
int getNextAvailableFingerSlot(int userId, bool isStaff);
int getFingerId(int userId, bool isStaff, int slot);
void saveFingerToUser(int userId, bool isStaff, int slot, String fingerName);
void removeFingerFromUser(int userId, bool isStaff, int slot);

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
  Wire.begin(I2C_SDA, I2C_SCL);
  if (!rtc.begin()) {
    Serial.println("❌ RTC tidak ditemukan!");
    tft.fillScreen(COLOR_ERROR);
    drawCenteredText(60, "RTC ERROR!", COLOR_ERROR, 4);
    drawCenteredText(120, "Periksa koneksi", COLOR_TEXT, 2);
    while (1) delay(1000);
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

// ================= FINGERPRINT FUNGSI =================
void selectSensor(int id) {
  if (id < 1 || id > NUM_SENSORS) return;
  int val = id - 1;
  digitalWrite(MUX_S0, val & 0x01);
  digitalWrite(MUX_S1, val & 0x02);
  digitalWrite(MUX_S2, val & 0x04);
  delay(30);
}

bool initSensors() {
  Serial.println("🔍 Initializing Fingerprint Sensors...");
  bool allOk = true;
  
  for (int i = 1; i <= NUM_SENSORS; i++) {
    selectSensor(i);
    finger.begin(57600);
    delay(50);
    if (finger.verifyPassword()) {
      Serial.printf("  ✅ Sensor #%d OK\n", i);
    } else {
      Serial.printf("  ❌ Sensor #%d FAILED\n", i);
      allOk = false;
    }
  }
  selectSensor(1);
  return allOk;
}

int enrollFingerprint(int id) {
  int p = -1, attempts = 0;
  
  drawCenteredText(80, "Tempelkan jari...", COLOR_TEXT, 2);
  while (p != FINGERPRINT_OK && attempts < 30) {
    p = finger.getImage();
    if (p == FINGERPRINT_NOFINGER) {
      attempts++;
      delay(100);
    }
  }
  if (p != FINGERPRINT_OK) return p;
  
  drawCenteredText(80, "✅ Jari terdeteksi", COLOR_SUCCESS, 2);
  delay(500);
  p = finger.image2Tz(1);
  if (p != FINGERPRINT_OK) return p;
  
  drawCenteredText(120, "Lepaskan jari...", COLOR_WARNING, 2);
  delay(1500);
  while (finger.getImage() != FINGERPRINT_NOFINGER) delay(100);
  
  drawCenteredText(120, "Tempelkan lagi...", COLOR_TEXT, 2);
  p = -1;
  attempts = 0;
  while (p != FINGERPRINT_OK && attempts < 30) {
    p = finger.getImage();
    if (p == FINGERPRINT_NOFINGER) {
      attempts++;
      delay(100);
    }
  }
  if (p != FINGERPRINT_OK) return p;
  
  drawCenteredText(120, "✅ Jari terdeteksi", COLOR_SUCCESS, 2);
  delay(500);
  p = finger.image2Tz(2);
  if (p != FINGERPRINT_OK) return p;
  
  p = finger.createModel();
  if (p != FINGERPRINT_OK) return p;
  
  drawCenteredText(160, "Menyimpan ke sensor...", COLOR_TEXT, 2);
  bool allSuccess = true;
  for (int i = 1; i <= NUM_SENSORS; i++) {
    selectSensor(i);
    delay(30);
    finger.loadModel(id);
    int result = finger.storeModel(id);
    if (result != FINGERPRINT_OK) allSuccess = false;
    updateProgress(i, NUM_SENSORS, "Saving");
    delay(30);
  }
  
  selectSensor(1);
  return allSuccess ? FINGERPRINT_OK : FINGERPRINT_PACKETRECIEVEERR;
}

bool deleteFingerprintFromAllSensors(int id) {
  int successCount = 0, failCount = 0, notFoundCount = 0;
  
  Serial.printf("🗑️ Menghapus fingerprint ID %d dari %d sensor\n", id, NUM_SENSORS);
  
  for (int i = 1; i <= NUM_SENSORS; i++) {
    selectSensor(i);
    delay(30);
    int loadResult = finger.loadModel(id);
    if (loadResult == FINGERPRINT_OK) {
      int deleteResult = finger.deleteModel(id);
      if (deleteResult == FINGERPRINT_OK) successCount++;
      else failCount++;
    } else {
      notFoundCount++;
    }
    updateProgress(i, NUM_SENSORS, "Deleting");
    delay(30);
  }
  
  selectSensor(1);
  Serial.printf("✅ Hapus ID %d: %d berhasil, %d gagal, %d tidak ditemukan\n", 
                id, successCount, failCount, notFoundCount);
  return (failCount == 0);
}

// ================= MULTI-FINGER FUNGSI =================
bool findUserByFingerprint(int fingerprintId, int &userId, bool &isStaff) {
  for (int i = 0; i < userCacheCount; i++) {
    for (int f = 0; f < MAX_FINGERS_PER_USER; f++) {
      if (userCache[i].fingers[f].registered && userCache[i].fingers[f].fingerId == fingerprintId) {
        userId = userCache[i].id;
        isStaff = false;
        return true;
      }
    }
  }
  for (int i = 0; i < staffCacheCount; i++) {
    for (int f = 0; f < MAX_FINGERS_PER_USER; f++) {
      if (staffCache[i].fingers[f].registered && staffCache[i].fingers[f].fingerId == fingerprintId) {
        userId = staffCache[i].id;
        isStaff = true;
        return true;
      }
    }
  }
  return false;
}

int getNextAvailableFingerSlot(int userId, bool isStaff) {
  if (isStaff) {
    for (int i = 0; i < staffCacheCount; i++) {
      if (staffCache[i].id == userId) {
        for (int f = 0; f < MAX_FINGERS_PER_USER; f++) {
          if (!staffCache[i].fingers[f].registered) return f;
        }
        return -1;
      }
    }
  } else {
    for (int i = 0; i < userCacheCount; i++) {
      if (userCache[i].id == userId) {
        for (int f = 0; f < MAX_FINGERS_PER_USER; f++) {
          if (!userCache[i].fingers[f].registered) return f;
        }
        return -1;
      }
    }
  }
  return -1;
}

int getFingerId(int userId, bool isStaff, int slot) {
  if (isStaff) {
    for (int i = 0; i < staffCacheCount; i++) {
      if (staffCache[i].id == userId && slot >= 0 && slot < MAX_FINGERS_PER_USER) {
        return staffCache[i].fingers[slot].fingerId;
      }
    }
  } else {
    for (int i = 0; i < userCacheCount; i++) {
      if (userCache[i].id == userId && slot >= 0 && slot < MAX_FINGERS_PER_USER) {
        return userCache[i].fingers[slot].fingerId;
      }
    }
  }
  return -1;
}

void saveFingerToUser(int userId, bool isStaff, int slot, String fingerName) {
  int fingerId = userId * 10 + slot + 1;
  
  if (isStaff) {
    for (int i = 0; i < staffCacheCount; i++) {
      if (staffCache[i].id == userId) {
        staffCache[i].fingers[slot].fingerId = fingerId;
        staffCache[i].fingers[slot].registered = true;
        strncpy(staffCache[i].fingers[slot].fingerName, fingerName.c_str(), MAX_FINGER_NAME_LEN - 1);
        staffCache[i].fingers[slot].fingerName[MAX_FINGER_NAME_LEN - 1] = '\0';
        staffCache[i].fingerCount++;
        return;
      }
    }
  } else {
    for (int i = 0; i < userCacheCount; i++) {
      if (userCache[i].id == userId) {
        userCache[i].fingers[slot].fingerId = fingerId;
        userCache[i].fingers[slot].registered = true;
        strncpy(userCache[i].fingers[slot].fingerName, fingerName.c_str(), MAX_FINGER_NAME_LEN - 1);
        userCache[i].fingers[slot].fingerName[MAX_FINGER_NAME_LEN - 1] = '\0';
        userCache[i].fingerCount++;
        return;
      }
    }
  }
}

void removeFingerFromUser(int userId, bool isStaff, int slot) {
  int fingerId = getFingerId(userId, isStaff, slot);
  if (fingerId == -1) return;
  
  deleteFingerprintFromAllSensors(fingerId);
  
  if (isStaff) {
    for (int i = 0; i < staffCacheCount; i++) {
      if (staffCache[i].id == userId) {
        staffCache[i].fingers[slot].fingerId = 0;
        staffCache[i].fingers[slot].registered = false;
        staffCache[i].fingers[slot].fingerName[0] = '\0';
        staffCache[i].fingerCount--;
        break;
      }
    }
  } else {
    for (int i = 0; i < userCacheCount; i++) {
      if (userCache[i].id == userId) {
        userCache[i].fingers[slot].fingerId = 0;
        userCache[i].fingers[slot].registered = false;
        userCache[i].fingers[slot].fingerName[0] = '\0';
        userCache[i].fingerCount--;
        break;
      }
    }
  }
}

// ================= SD CARD FUNGSI =================
void initSD() {
  SPI.begin(SD_SCK, SD_MISO, SD_MOSI, SD_CS);
  if (!SD.begin(SD_CS)) {
    Serial.println("❌ SD Card gagal!");
    tft.fillScreen(COLOR_ERROR);
    drawCenteredText(60, "SD CARD ERROR!", COLOR_ERROR, 4);
    drawCenteredText(120, "Periksa koneksi SD", COLOR_TEXT, 2);
    while (1) delay(1000);
  }
  Serial.println("✅ SD Card siap");
  loadSettings();
  loadUserCacheFromSD();
  loadStaffCacheFromSD();
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
  }
}

// ================= LOAD USER CACHE =================
void loadUserCacheFromSD() {
  File file = SD.open("/users.txt", FILE_READ);
  if (!file) {
    userCacheCount = 0;
    return;
  }
  
  userCacheCount = 0;
  while (file.available() && userCacheCount < MAX_USERS) {
    String line = file.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) continue;
    
    int parts[14];
    int partIndex = 0;
    for (int i = 0; i < line.length() && partIndex < 14; i++) {
      if (line[i] == ',') {
        parts[partIndex++] = i;
      }
    }
    
    if (partIndex >= 5) {
      int id = line.substring(0, parts[0]).toInt();
      String nama = line.substring(parts[0] + 1, parts[1]);
      String kelas = line.substring(parts[1] + 1, parts[2]);
      String jurusan = line.substring(parts[2] + 1, parts[3]);
      int delayOut = line.substring(parts[3] + 1, parts[4]).toInt();
      int fingerCount = (partIndex > 5) ? line.substring(parts[4] + 1, parts[5]).toInt() : 0;
      
      userCache[userCacheCount].id = id;
      strncpy(userCache[userCacheCount].nama, nama.c_str(), MAX_NAME_LEN - 1);
      strncpy(userCache[userCacheCount].kelas, kelas.c_str(), MAX_CLASS_LEN - 1);
      strncpy(userCache[userCacheCount].jurusan, jurusan.c_str(), MAX_MAJOR_LEN - 1);
      userCache[userCacheCount].delayOut = delayOut;
      userCache[userCacheCount].fingerCount = fingerCount;
      
      for (int f = 0; f < MAX_FINGERS_PER_USER; f++) {
        int idx = 6 + f * 2;
        if (partIndex > idx) {
          int fingerId = line.substring(parts[idx] + 1, parts[idx + 1]).toInt();
          String fingerName = (partIndex > idx + 1) ? line.substring(parts[idx + 1] + 1, (idx + 2 < partIndex) ? parts[idx + 2] : line.length()) : "";
          if (fingerId > 0) {
            userCache[userCacheCount].fingers[f].fingerId = fingerId;
            userCache[userCacheCount].fingers[f].registered = true;
            strncpy(userCache[userCacheCount].fingers[f].fingerName, fingerName.c_str(), MAX_FINGER_NAME_LEN - 1);
          }
        }
      }
      userCacheCount++;
    }
  }
  file.close();
  Serial.printf("📚 Loaded %d users from SD\n", userCacheCount);
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
        existingContent += String(id) + "," + nama + "," + kelas + "," + jurusan + "," + String(delayOut) + ",";
        for (int i = 0; i < userCacheCount; i++) {
          if (userCache[i].id == id) {
            existingContent += String(userCache[i].fingerCount);
            for (int f = 0; f < MAX_FINGERS_PER_USER; f++) {
              existingContent += "," + String(userCache[i].fingers[f].fingerId) + "," + String(userCache[i].fingers[f].fingerName);
            }
            break;
          }
        }
        existingContent += "\n";
      } else {
        existingContent += line + "\n";
      }
    }
    file.close();
  }
  
  if (!exists) {
    existingContent += String(id) + "," + nama + "," + kelas + "," + jurusan + "," + String(delayOut) + ",0,,,,,,\n";
  }
  
  File outFile = SD.open("/users.txt", FILE_WRITE);
  if (outFile) {
    outFile.print(existingContent);
    outFile.close();
  }
  
  bool found = false;
  for (int i = 0; i < userCacheCount; i++) {
    if (userCache[i].id == id) {
      strncpy(userCache[i].nama, nama.c_str(), MAX_NAME_LEN - 1);
      strncpy(userCache[i].kelas, kelas.c_str(), MAX_CLASS_LEN - 1);
      strncpy(userCache[i].jurusan, jurusan.c_str(), MAX_MAJOR_LEN - 1);
      userCache[i].delayOut = delayOut;
      found = true;
      break;
    }
  }
  if (!found && userCacheCount < MAX_USERS) {
    userCache[userCacheCount].id = id;
    strncpy(userCache[userCacheCount].nama, nama.c_str(), MAX_NAME_LEN - 1);
    strncpy(userCache[userCacheCount].kelas, kelas.c_str(), MAX_CLASS_LEN - 1);
    strncpy(userCache[userCacheCount].jurusan, jurusan.c_str(), MAX_MAJOR_LEN - 1);
    userCache[userCacheCount].delayOut = delayOut;
    userCache[userCacheCount].fingerCount = 0;
    userCacheCount++;
  }
}

void removeUserFromSD(int id) {
  File file = SD.open("/users.txt", FILE_READ);
  if (!file) return;
  
  String newContent = "";
  bool found = false;
  
  while (file.available()) {
    String line = file.readStringUntil('\n');
    if (line.startsWith(String(id) + ",")) {
      found = true;
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
    }
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

UserData getUserData(int id) {
  for (int i = 0; i < userCacheCount; i++) {
    if (userCache[i].id == id) {
      return userCache[i];
    }
  }
  UserData user;
  user.id = id;
  strcpy(user.nama, "Unknown");
  strcpy(user.kelas, "-");
  strcpy(user.jurusan, "-");
  user.delayOut = globalDelayMinutes;
  user.fingerCount = 0;
  return user;
}

// ================= LOAD STAFF CACHE =================
void loadStaffCacheFromSD() {
  File file = SD.open("/staff.txt", FILE_READ);
  if (!file) {
    staffCacheCount = 0;
    return;
  }
  
  staffCacheCount = 0;
  while (file.available() && staffCacheCount < MAX_STAFF) {
    String line = file.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) continue;
    
    int parts[20];
    int partIndex = 0;
    for (int i = 0; i < line.length() && partIndex < 20; i++) {
      if (line[i] == ',') {
        parts[partIndex++] = i;
      }
    }
    
    if (partIndex >= 7) {
      int id = line.substring(0, parts[0]).toInt();
      String staffId = line.substring(parts[0] + 1, parts[1]);
      String nama = line.substring(parts[1] + 1, parts[2]);
      String jabatan = line.substring(parts[2] + 1, parts[3]);
      String departemen = line.substring(parts[3] + 1, parts[4]);
      String email = line.substring(parts[4] + 1, parts[5]);
      String noHp = line.substring(parts[5] + 1, parts[6]);
      int fingerCount = (partIndex > 7) ? line.substring(parts[6] + 1, parts[7]).toInt() : 0;
      
      staffCache[staffCacheCount].id = id;
      strncpy(staffCache[staffCacheCount].staffId, staffId.c_str(), MAX_STAFFID_LEN - 1);
      strncpy(staffCache[staffCacheCount].nama, nama.c_str(), MAX_NAME_LEN - 1);
      strncpy(staffCache[staffCacheCount].jabatan, jabatan.c_str(), MAX_JABATAN_LEN - 1);
      strncpy(staffCache[staffCacheCount].departemen, departemen.c_str(), MAX_DEPT_LEN - 1);
      strncpy(staffCache[staffCacheCount].email, email.c_str(), MAX_EMAIL_LEN - 1);
      strncpy(staffCache[staffCacheCount].noHp, noHp.c_str(), MAX_PHONE_LEN - 1);
      staffCache[staffCacheCount].fingerCount = fingerCount;
      
      for (int f = 0; f < MAX_FINGERS_PER_USER; f++) {
        int idx = 8 + f * 2;
        if (partIndex > idx) {
          int fingerId = line.substring(parts[idx] + 1, parts[idx + 1]).toInt();
          String fingerName = (partIndex > idx + 1) ? line.substring(parts[idx + 1] + 1, (idx + 2 < partIndex) ? parts[idx + 2] : line.length()) : "";
          if (fingerId > 0) {
            staffCache[staffCacheCount].fingers[f].fingerId = fingerId;
            staffCache[staffCacheCount].fingers[f].registered = true;
            strncpy(staffCache[staffCacheCount].fingers[f].fingerName, fingerName.c_str(), MAX_FINGER_NAME_LEN - 1);
          }
        }
      }
      staffCacheCount++;
    }
  }
  file.close();
  Serial.printf("📚 Loaded %d staff from SD\n", staffCacheCount);
}

void saveStaffToSD(int id, String staffId, String nama, String jabatan, 
                   String departemen, String email, String noHp) {
  File file = SD.open("/staff.txt", FILE_READ);
  bool exists = false;
  String existingContent = "";
  
  if (file) {
    while (file.available()) {
      String line = file.readStringUntil('\n');
      if (line.startsWith(String(id) + ",")) {
        exists = true;
        existingContent += String(id) + "," + staffId + "," + nama + "," + 
                          jabatan + "," + departemen + "," + email + "," + noHp + ",";
        for (int i = 0; i < staffCacheCount; i++) {
          if (staffCache[i].id == id) {
            existingContent += String(staffCache[i].fingerCount);
            for (int f = 0; f < MAX_FINGERS_PER_USER; f++) {
              existingContent += "," + String(staffCache[i].fingers[f].fingerId) + "," + String(staffCache[i].fingers[f].fingerName);
            }
            break;
          }
        }
        existingContent += "\n";
      } else {
        existingContent += line + "\n";
      }
    }
    file.close();
  }
  
  if (!exists) {
    existingContent += String(id) + "," + staffId + "," + nama + "," + 
                      jabatan + "," + departemen + "," + email + "," + noHp + ",0,,,,,,\n";
  }
  
  File outFile = SD.open("/staff.txt", FILE_WRITE);
  if (outFile) {
    outFile.print(existingContent);
    outFile.close();
  }
  
  bool found = false;
  for (int i = 0; i < staffCacheCount; i++) {
    if (staffCache[i].id == id) {
      strncpy(staffCache[i].staffId, staffId.c_str(), MAX_STAFFID_LEN - 1);
      strncpy(staffCache[i].nama, nama.c_str(), MAX_NAME_LEN - 1);
      strncpy(staffCache[i].jabatan, jabatan.c_str(), MAX_JABATAN_LEN - 1);
      strncpy(staffCache[i].departemen, departemen.c_str(), MAX_DEPT_LEN - 1);
      strncpy(staffCache[i].email, email.c_str(), MAX_EMAIL_LEN - 1);
      strncpy(staffCache[i].noHp, noHp.c_str(), MAX_PHONE_LEN - 1);
      found = true;
      break;
    }
  }
  if (!found && staffCacheCount < MAX_STAFF) {
    staffCache[staffCacheCount].id = id;
    strncpy(staffCache[staffCacheCount].staffId, staffId.c_str(), MAX_STAFFID_LEN - 1);
    strncpy(staffCache[staffCacheCount].nama, nama.c_str(), MAX_NAME_LEN - 1);
    strncpy(staffCache[staffCacheCount].jabatan, jabatan.c_str(), MAX_JABATAN_LEN - 1);
    strncpy(staffCache[staffCacheCount].departemen, departemen.c_str(), MAX_DEPT_LEN - 1);
    strncpy(staffCache[staffCacheCount].email, email.c_str(), MAX_EMAIL_LEN - 1);
    strncpy(staffCache[staffCacheCount].noHp, noHp.c_str(), MAX_PHONE_LEN - 1);
    staffCache[staffCacheCount].fingerCount = 0;
    staffCacheCount++;
  }
}

void removeStaffFromSD(int id) {
  File file = SD.open("/staff.txt", FILE_READ);
  if (!file) return;
  
  String newContent = "";
  bool found = false;
  
  while (file.available()) {
    String line = file.readStringUntil('\n');
    if (line.startsWith(String(id) + ",")) {
      found = true;
      continue;
    }
    newContent += line + "\n";
  }
  file.close();
  
  if (found) {
    File outFile = SD.open("/staff.txt", FILE_WRITE);
    if (outFile) {
      outFile.print(newContent);
      outFile.close();
    }
    for (int i = 0; i < staffCacheCount; i++) {
      if (staffCache[i].id == id) {
        for (int j = i; j < staffCacheCount - 1; j++) {
          staffCache[j] = staffCache[j + 1];
        }
        staffCacheCount--;
        break;
      }
    }
  }
}

bool isUserRegistered(int id) {
  for (int i = 0; i < userCacheCount; i++) {
    if (userCache[i].id == id) return true;
  }
  return false;
}

bool isStaffRegistered(int id) {
  for (int i = 0; i < staffCacheCount; i++) {
    if (staffCache[i].id == id) return true;
  }
  return false;
}

// ================= ATTENDANCE FUNGSI =================
void logAttendanceToSD(int id, String status) {
  File file = SD.open("/attendance.txt", FILE_APPEND);
  if (file) {
    file.println(String(id) + "," + getCurrentDateRTC() + "," + 
                 getCurrentTimeRTC() + "," + status);
    file.close();
  }
}

void sendToFirebase(int id, String status, String time, String date, 
                    String nama, String kelas, String jurusan) {
  if (!isOnline || !Firebase.ready()) return;
  
  String path = "absensi/" + date + "/" + String(id);
  
  if (status == "IN") {
    FirebaseJson json;
    json.set("nama", nama);
    json.set("kelas", kelas);
    json.set("jurusan", jurusan);
    json.set("in", time);
    Firebase.RTDB.set(&fbdo, path, &json);
  } else if (status == "OUT") {
    Firebase.RTDB.set(&fbdo, path + "/out", time);
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
    json.set("timeIn", time);
    json.set("status", "hadir");
    Firebase.RTDB.set(&fbdo, path, &json);
  } else if (status == "OUT") {
    Firebase.RTDB.set(&fbdo, path + "/timeOut", time);
    Firebase.RTDB.set(&fbdo, path + "/status", "pulang");
  }
}

void handleAttendance(int id) {
  String date = getCurrentDateRTC();
  String time = getCurrentTimeRTC();
  bool isStaff = (id >= 1000);
  
  if (isStaff) {
    StaffData staff = getStaffData(id);
    String lastStatus = "NONE", inTime = "";
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
      logAttendanceToSD(id, "IN");
      sendStaffToFirebase(id, "IN", time, date, staff);
      drawAttendanceResult(staff.nama, id, "STAFF IN", time.c_str());
      Serial.printf("✅ STAFF MASUK: %s (%d) jam %s\n", staff.nama, id, time.c_str());
    } else if (lastStatus == "IN") {
      logAttendanceToSD(id, "OUT");
      sendStaffToFirebase(id, "OUT", time, date, staff);
      drawAttendanceResult(staff.nama, id, "STAFF OUT", time.c_str());
      Serial.printf("✅ STAFF PULANG: %s (%d) jam %s\n", staff.nama, id, time.c_str());
    } else {
      drawAttendanceResult(staff.nama, id, "ALREADY", time.c_str());
    }
  } else {
    UserData user = getUserData(id);
    int requiredDelay = (user.delayOut > 0) ? user.delayOut : globalDelayMinutes;
    String lastStatus = "NONE", inTime = "";
    
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
      logAttendanceToSD(id, "IN");
      sendToFirebase(id, "IN", time, date, user.nama, user.kelas, user.jurusan);
      drawAttendanceResult(user.nama, id, "IN", time.c_str());
      Serial.printf("✅ MASUK: %s (%d) jam %s\n", user.nama, id, time.c_str());
    } else if (lastStatus == "IN") {
      int timeDiff = getCurrentMinutesRTC() - stringToMinutes(inTime);
      if (timeDiff < requiredDelay) {
        int wait = requiredDelay - timeDiff;
        char msg[50];
        sprintf(msg, "Tunggu %d menit", wait);
        drawAttendanceResult(user.nama, id, msg, time.c_str());
        Serial.printf("⚠️ PULANG DITOLAK: %s, perlu %d menit\n", user.nama, requiredDelay);
        return;
      }
      logAttendanceToSD(id, "OUT");
      sendToFirebase(id, "OUT", time, date, user.nama, user.kelas, user.jurusan);
      drawAttendanceResult(user.nama, id, "OUT", time.c_str());
      Serial.printf("✅ PULANG: %s (%d) jam %s\n", user.nama, id, time.c_str());
    } else {
      drawAttendanceResult(user.nama, id, "ALREADY", time.c_str());
    }
  }
}

// ================= AUTO ALPHA =================
void saveAlphaRecord(int studentId, String date, String status) {
  AlphaRecord rec;
  rec.studentId = studentId;
  strcpy(rec.date, date.c_str());
  strcpy(rec.status, status.c_str());
  rec.synced = false;
  
  if (isOnline && status == "alpha") {
    String path = "attendance_status/" + date + "/" + String(studentId) + "/status";
    FirebaseJson json;
    json.set("status", "alpha");
    json.set("auto", true);
    json.set("timestamp_ms", millis());
    if (Firebase.RTDB.set(&fbdo, path, &json)) {
      rec.synced = true;
    } else {
      xQueueSend(xQueueAlphaSync, &rec, 0);
    }
  } else {
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
    String statusPath = "attendance_status/" + date + "/" + String(studentId) + "/status";
    FirebaseJson json;
    json.set("status", "alpha");
    json.set("auto", true);
    json.set("timestamp_ms", millis());
    if (Firebase.RTDB.set(&fbdo, statusPath, &json)) {
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
  return false;
}

void performDailyAbsenceCheck() {
  DateTime now = rtc.now();
  String today = getCurrentDateRTC();
  if (lastDailyCheckDate == today) return;
  
  int currentMinutes = now.hour() * 60 + now.minute();
  if (currentMinutes < 5 || currentMinutes > 23*60) return;
  if (dailyCheckInProgress) return;
  dailyCheckInProgress = true;
  
  Serial.printf("📊 Pengecekan absensi harian untuk %s\n", today.c_str());
  loadUserCacheFromSD();
  
  int alphaCount = 0, skipCount = 0;
  for (int i = 0; i < userCacheCount; i++) {
    int id = userCache[i].id;
    if (isStudentAbsentOnDate(id, today)) {
      skipCount++;
      continue;
    }
    saveAlphaRecord(id, today, "alpha");
    alphaCount++;
    delay(50);
  }
  
  preferences.begin("alpha", false);
  preferences.putString("lastCheck", today);
  preferences.end();
  lastDailyCheckDate = today;
  dailyCheckInProgress = false;
  Serial.printf("✅ Selesai: %d siswa sudah absen, %d alpha dicatat\n", skipCount, alphaCount);
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
  Serial.println("🔄 Syncing students from Firebase...");
  
  if (Firebase.RTDB.get(&fbdo, "/users")) {
    FirebaseJson &json = fbdo.jsonObject();
    FirebaseJsonData jsonData;
    String allUserData = "";
    int syncCount = 0;
    size_t len = json.iteratorBegin();
    for (size_t i = 0; i < len; i++) {
      int type; String key, value;
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
      allUserData += String(id) + "," + nama + "," + kelas + "," + jurusan + "," + String(delayOut) + ",0,,,,,,\n";
      syncCount++;
    }
    json.iteratorEnd();
    if (syncCount > 0) {
      File file = SD.open("/users.txt", FILE_WRITE);
      if (file) {
        file.print(allUserData);
        file.close();
        Serial.printf("✅ Synced %d students\n", syncCount);
        loadUserCacheFromSD();
      }
    }
  }
  syncInProgress = false;
}

void syncAllStaffFromFirebase() {
  if (!isOnline || !Firebase.ready()) return;
  Serial.println("🔄 Syncing staff from Firebase...");
  
  if (Firebase.RTDB.get(&fbdo, "/staff")) {
    FirebaseJson &json = fbdo.jsonObject();
    FirebaseJsonData jsonData;
    String allStaffData = "";
    int syncCount = 0;
    size_t len = json.iteratorBegin();
    for (size_t i = 0; i < len; i++) {
      int type; String key, value;
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
        if (strcmp(staffCache[s].staffId, staffId.c_str()) == 0) {
          strncpy(staffCache[s].nama, nama.c_str(), MAX_NAME_LEN - 1);
          strncpy(staffCache[s].jabatan, jabatan.c_str(), MAX_JABATAN_LEN - 1);
          strncpy(staffCache[s].departemen, departemen.c_str(), MAX_DEPT_LEN - 1);
          strncpy(staffCache[s].email, email.c_str(), MAX_EMAIL_LEN - 1);
          strncpy(staffCache[s].noHp, noHp.c_str(), MAX_PHONE_LEN - 1);
          allStaffData += String(staffCache[s].id) + "," + staffId + "," + nama + "," + 
                         jabatan + "," + departemen + "," + email + "," + noHp + ",0,,,,,,\n";
          found = true;
          syncCount++;
          break;
        }
      }
      if (!found) {
        int newFpId = currentStaffID++;
        saveSettings();
        allStaffData += String(newFpId) + "," + staffId + "," + nama + "," + 
                       jabatan + "," + departemen + "," + email + "," + noHp + ",0,,,,,,\n";
        syncCount++;
        Serial.printf("📝 Staff baru: %s -> FP ID: %d\n", nama.c_str(), newFpId);
      }
    }
    json.iteratorEnd();
    if (syncCount > 0) {
      File file = SD.open("/staff.txt", FILE_WRITE);
      if (file) {
        file.print(allStaffData);
        file.close();
        Serial.printf("✅ Synced %d staff\n", syncCount);
        loadStaffCacheFromSD();
      }
    }
  }
}

void checkFirebaseSettings() {
  if (Firebase.ready() && isOnline) {
    if (Firebase.RTDB.get(&fbdo, "/settings/delayOut")) {
      int fbDelay = fbdo.to<int>();
      if (fbDelay > 0 && fbDelay != globalDelayMinutes) {
        globalDelayMinutes = fbDelay;
        saveSettings();
        Serial.printf("✅ Global delay update: %d\n", globalDelayMinutes);
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

// ================= WIFI & BLE =================
void saveWiFiCredentials(String ssid, String password) {
  preferences.begin("wifi", false);
  preferences.putString("ssid", ssid);
  preferences.putString("password", password);
  preferences.end();
}

void loadWiFiCredentials() {
  preferences.begin("wifi", true);
  wifiSSID = preferences.getString("ssid", "");
  wifiPassword = preferences.getString("password", "");
  preferences.end();
}

void clearWiFiCredentials() {
  preferences.begin("wifi", false);
  preferences.clear();
  preferences.end();
  wifiSSID = "";
  wifiPassword = "";
}

void connectToWiFi() {
  if (wifiSSID.length() == 0) {
    Serial.println("⚠️ No WiFi credentials");
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
    Serial.println("\n✅ WiFi Connected!");
    Serial.print("📡 IP: ");
    Serial.println(WiFi.localIP());
    isOnline = true;
    reconnectAttempts = 0;
    syncRTCwithNTP();
    initFirebase();
    syncOfflineData();
    checkFirebaseSettings();
    syncAllUsersFromFirebase();
    syncAllStaffFromFirebase();
    syncPendingAlpha();
    sendBLEMessage("✅ WiFi Connected");
  } else {
    Serial.println("\n❌ WiFi Failed!");
    isOnline = false;
    sendBLEMessage("❌ WiFi Failed");
  }
}

void sendBLEMessage(String msg) {
  if (deviceConnected && pTxCharacteristic) {
    pTxCharacteristic->setValue(msg.c_str());
    pTxCharacteristic->notify();
    Serial.println("📱 BLE: " + msg);
  }
}

// ================= BLE CALLBACKS =================
class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) {
    deviceConnected = true;
    Serial.println("📱 BLE Connected");
    sendBLEMessage("ESP32 Absensi v" VERSION);
  }
  void onDisconnect(BLEServer* pServer) {
    deviceConnected = false;
    Serial.println("📱 BLE Disconnected");
  }
};

class MyCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* pCharacteristic) {
    String rxValue = pCharacteristic->getValue().c_str();
    if (rxValue.length() > 0) {
      Serial.println("📱 BLE RX: " + rxValue);
      rxValue.trim();
      
      if (rxValue.equalsIgnoreCase("SCAN_WIFI")) {
        sendBLEMessage("📡 Scanning WiFi...");
        int n = WiFi.scanNetworks();
        if (n == 0) {
          sendBLEMessage("❌ No networks found");
        } else {
          sendBLEMessage("📡 Found " + String(n) + " networks:");
          for (int i = 0; i < n && i < 20; i++) {
            String ssid = WiFi.SSID(i);
            if (ssid.length() > 0) {
              sendBLEMessage(String(i+1) + ". " + ssid);
            }
          }
          sendBLEMessage("Send SSID and password: SSID|PASS");
        }
        WiFi.scanDelete();
        return;
      }
      
      if (rxValue.indexOf('|') > 0) {
        int sep = rxValue.indexOf('|');
        String ssid = rxValue.substring(0, sep);
        String pass = rxValue.substring(sep + 1);
        if (ssid.length() > 0) {
          saveWiFiCredentials(ssid, pass);
          wifiSSID = ssid;
          wifiPassword = pass;
          sendBLEMessage("✅ WiFi saved, connecting...");
          connectToWiFi();
        }
        return;
      }
      
      if (rxValue.equalsIgnoreCase("GET_STATUS")) {
        sendBLEMessage("STATUS|Delay:" + String(globalDelayMinutes) +
                       "|Online:" + String(isOnline) +
                       "|Students:" + String(userCacheCount) +
                       "|Staff:" + String(staffCacheCount) +
                       "|WiFi:" + (wifiSSID.length() > 0 ? wifiSSID : "NOT_SET"));
        return;
      }
      
      if (rxValue.startsWith("DELETE_FP:")) {
        int fid = rxValue.substring(10).toInt();
        if (fid > 0) {
          deleteFingerprintFromAllSensors(fid);
          sendBLEMessage("✅ Delete completed");
        }
        return;
      }
      
      if (rxValue.equalsIgnoreCase("HELP")) {
        sendBLEMessage("=== ESP32 Commands ===");
        sendBLEMessage("SCAN_WIFI - Scan networks");
        sendBLEMessage("SSID|PASS - Set WiFi");
        sendBLEMessage("GET_STATUS - System status");
        sendBLEMessage("DELETE_FP:id - Delete fingerprint");
        sendBLEMessage("REBOOT - Restart ESP32");
        return;
      }
      
      if (rxValue.equalsIgnoreCase("REBOOT")) {
        sendBLEMessage("🔄 Rebooting...");
        delay(100);
        ESP.restart();
        return;
      }
    }
  }
};

void initBLE() {
  BLEDevice::init("ESP32_Absensi");
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  BLEService* pService = pServer->createService(SERVICE_UUID);
  pTxCharacteristic = pService->createCharacteristic(CHARACTERISTIC_UUID_TX, 
                                                      BLECharacteristic::PROPERTY_NOTIFY);
  pRxCharacteristic = pService->createCharacteristic(CHARACTERISTIC_UUID_RX, 
                                                      BLECharacteristic::PROPERTY_WRITE);
  pRxCharacteristic->setCallbacks(new MyCallbacks());
  pService->start();
  pServer->getAdvertising()->start();
  Serial.println("✅ BLE Ready - ESP32_Absensi");
}

// ================= KEYPAD FUNGSI =================
bool initKeypad() {
  if (!pcf.begin(PCF_ADDR)) {
    Serial.println("❌ PCF8574 not found!");
    return false;
  }
  for (int i = 0; i < 4; i++) {
    pcf.pinMode(rowPins[i], OUTPUT);
    pcf.digitalWrite(rowPins[i], HIGH);
  }
  for (int i = 0; i < 4; i++) {
    pcf.pinMode(colPins[i], INPUT_PULLUP);
  }
  Serial.println("✅ Keypad initialized");
  return true;
}

void setRow(int row, bool active) {
  if (row < 0 || row >= 4) return;
  pcf.digitalWrite(rowPins[row], active ? LOW : HIGH);
}

bool readCol(int col) {
  if (col < 0 || col >= 4) return false;
  return pcf.digitalRead(colPins[col]) == LOW;
}

char getKey() {
  char key = '\0';
  for (int r = 0; r < 4; r++) {
    setRow(r, true);
    for (int c = 0; c < 4; c++) {
      if (readCol(c)) {
        key = KEYPAD_KEYS[r][c];
        break;
      }
    }
    setRow(r, false);
    if (key != '\0') break;
  }
  if (key != '\0') {
    if (key != lastKey || (millis() - lastKeyTime) > debounceDelay) {
      lastKey = key;
      lastKeyTime = millis();
      keyPressed = true;
      return key;
    }
  } else {
    keyPressed = false;
  }
  return '\0';
}

char waitForKey(unsigned long timeout) {
  unsigned long start = millis();
  char key = '\0';
  while (true) {
    key = getKey();
    if (key != '\0') return key;
    if (timeout > 0 && (millis() - start) > timeout) return '\0';
    delay(10);
  }
}

void clearKeyBuffer() {
  lastKey = '\0';
  keyPressed = false;
  while (getKey() != '\0') delay(10);
}

// ================= MULTI-TAP FUNGSI =================
char processMultiTap(char key, String &buffer, bool isNameMode) {
  unsigned long now = millis();
  if (!isNameMode) {
    if (key >= '0' && key <= '9') return key;
    if (key == '*') {
      if (buffer.length() > 0) {
        buffer.remove(buffer.length() - 1);
        drawInput("", buffer.c_str(), false);
      }
      return '\0';
    }
    return '\0';
  }
  
  if (key >= '0' && key <= '9') {
    int digit = key - '0';
    if ((now - multiTapLastTime) > MULTI_TAP_TIMEOUT) {
      multiTapPressCount = 0;
    }
    if (digit == multiTapLastDigit && (now - multiTapLastTime) < MULTI_TAP_TIMEOUT) {
      multiTapPressCount = (multiTapPressCount % 4) + 1;
    } else {
      multiTapPressCount = 1;
      multiTapLastDigit = digit;
    }
    multiTapLastTime = now;
    char result = KEY_MAP[digit][multiTapPressCount - 1];
    if (result != '\0') {
      if (buffer.length() > 0 && digit == multiTapLastDigit && multiTapPressCount > 1) {
        buffer.remove(buffer.length() - 1);
      }
      if (result != ' ' || (result == ' ' && buffer.length() > 0)) {
        buffer += result;
        drawInput("", buffer.c_str(), true);
        return result;
      }
    }
    return '\0';
  }
  
  if (key == '*') {
    if (buffer.length() > 0) {
      buffer.remove(buffer.length() - 1);
      drawInput("", buffer.c_str(), true);
    }
    resetMultiTap();
    return '\0';
  }
  if (key == '#' || key == 'D') {
    resetMultiTap();
    return '\0';
  }
  return '\0';
}

void resetMultiTap() {
  multiTapPressCount = 0;
  multiTapLastDigit = -1;
  multiTapLastTime = 0;
}

String readStringMultiTap(int maxLen, const char* prompt) {
  String result = "";
  char key;
  bool isNameMode = true;
  drawInput(prompt, result.c_str(), true);
  drawFooter("2=ABC 3=DEF 4=GHI 5=JKL 6=MNO 7=PQRS 8=TUV 9=WXYZ 0=Spasi *=Hapus #=OK");
  while (result.length() < maxLen) {
    key = waitForKey();
    if (key == '\0') continue;
    if (key == '#' || key == 'D') break;
    if (key == 'B' || key == 'C') return "";
    processMultiTap(key, result, isNameMode);
  }
  resetMultiTap();
  return result;
}

int readNumberMultiTap(int maxLen, const char* prompt) {
  String result = "";
  char key;
  bool isNameMode = false;
  drawInput(prompt, result.c_str(), false);
  drawFooter("0-9 Angka  *=Hapus  #=OK  C=Batal");
  while (result.length() < maxLen) {
    key = waitForKey();
    if (key == '\0') continue;
    if (key == '#' || key == 'D') break;
    if (key == 'B' || key == 'C') return -1;
    if (key == '*') {
      if (result.length() > 0) {
        result.remove(result.length() - 1);
        drawInput(prompt, result.c_str(), false);
      }
      continue;
    }
    if (key >= '0' && key <= '9') {
      result += key;
      drawInput(prompt, result.c_str(), false);
    }
  }
  if (result.length() == 0) return -1;
  return result.toInt();
}

// ================= LCD FUNGSI =================
void initLCD() {
  tft.init();
  tft.setRotation(1);
  tft.fillScreen(COLOR_BG);
  tft.setTextColor(COLOR_TEXT, COLOR_BG);
  tft.setTextSize(2);
  Serial.println("✅ LCD Initialized");
  
  tft.fillScreen(COLOR_BG);
  tft.setTextColor(COLOR_HEADER, COLOR_BG);
  tft.setTextSize(4);
  tft.setCursor(30, 60);
  tft.print("SISTEM");
  tft.setTextSize(3);
  tft.setCursor(30, 110);
  tft.print("ABSENSI");
  tft.setTextSize(2);
  tft.setCursor(30, 160);
  tft.print("IoT FINGERPRINT");
  tft.setTextColor(0x7BEF, COLOR_BG);
  tft.setTextSize(1);
  tft.setCursor(30, 210);
  tft.print("ESP32 + 6 Sensor");
  tft.setCursor(30, 230);
  tft.print("v" VERSION);
  tft.setCursor(30, 250);
  tft.print("Multi-Finger Support");
  delay(2500);
}

void drawHeader(const char* title) {
  tft.fillRect(0, 0, 480, 35, COLOR_HEADER);
  tft.setTextColor(TFT_BLACK, COLOR_HEADER);
  tft.setTextSize(2);
  tft.setCursor(15, 8);
  tft.print(title);
  tft.setTextSize(1);
  tft.setCursor(350, 10);
  tft.print(getCurrentTimeRTC());
  tft.setCursor(350, 23);
  tft.print(getCurrentDateRTC());
  tft.drawLine(0, 35, 480, 35, COLOR_BORDER);
}

void drawFooter(const char* text) {
  tft.fillRect(0, 300, 480, 20, COLOR_BG);
  tft.drawLine(0, 300, 480, 300, COLOR_BORDER);
  tft.setTextColor(0x7BEF, COLOR_BG);
  tft.setTextSize(1);
  tft.setCursor(10, 303);
  tft.print(text);
}

void drawCenteredText(int y, const char* text, uint16_t color, int size) {
  tft.setTextColor(color, COLOR_BG);
  tft.setTextSize(size);
  tft.setCursor((480 - (strlen(text) * size * 6)) / 2, y);
  tft.print(text);
}

void drawTextString(int x, int y, const String& text, uint16_t color, int size) {
  tft.setTextColor(color, COLOR_BG);
  tft.setTextSize(size);
  tft.setCursor(x, y);
  tft.print(text);
}

void drawMenu(const char* items[], int count, int selected) {
  tft.fillScreen(COLOR_BG);
  drawHeader("MENU");
  int y = 50, spacing = 35, maxY = 290;
  for (int i = 0; i < count && y < maxY; i++) {
    uint16_t bgColor = (i == selected) ? COLOR_SELECTED : 0x1082;
    uint16_t textColor = (i == selected) ? COLOR_TEXT : 0x7BEF;
    tft.fillRoundRect(20, y, 440, 28, 5, bgColor);
    tft.drawRoundRect(20, y, 440, 28, 5, COLOR_BORDER);
    tft.setTextColor(textColor, bgColor);
    tft.setTextSize(1);
    tft.setCursor(30, y + 6);
    tft.print(items[i]);
    y += spacing;
  }
  drawFooter("2/8=Nav  A=Select  B=Back  C=Exit  #=OK");
}

void drawInput(const char* label, const char* value, bool isNameMode) {
  tft.fillScreen(COLOR_BG);
  drawHeader("INPUT");
  if (strlen(label) > 0) {
    tft.setTextColor(COLOR_TEXT, COLOR_BG);
    tft.setTextSize(2);
    tft.setCursor(20, 60);
    tft.print(label);
    tft.print(":");
  }
  tft.fillRect(20, 100, 440, 50, 0x1082);
  tft.drawRect(20, 100, 440, 50, COLOR_BORDER);
  tft.setTextColor(COLOR_TEXT, 0x1082);
  tft.setTextSize(3);
  tft.setCursor(30, 112);
  tft.print(value);
  if (isNameMode) {
    drawFooter("2=ABC 3=DEF 4=GHI 5=JKL 6=MNO 7=PQRS 8=TUV 9=WXYZ 0=Spasi *=Hapus #=OK");
  } else {
    drawFooter("0-9 Angka  *=Hapus  #=OK  C=Batal");
  }
}

void drawAttendanceResult(const char* name, int id, const char* status, const char* time) {
  tft.fillScreen(COLOR_BG);
  drawHeader("ABSENSI");
  bool success = (strcmp(status, "IN") == 0 || strcmp(status, "OUT") == 0 ||
                  strcmp(status, "STAFF IN") == 0 || strcmp(status, "STAFF OUT") == 0);
  uint16_t color = success ? COLOR_SUCCESS : COLOR_ERROR;
  tft.setTextColor(color, COLOR_BG);
  tft.setTextSize(3);
  tft.setCursor(20, 60);
  tft.print(success ? "✅ " : "❌ ");
  tft.print(status);
  tft.setTextColor(COLOR_TEXT, COLOR_BG);
  tft.setTextSize(2);
  tft.setCursor(20, 110);
  tft.print("Nama: ");
  tft.print(name);
  tft.setCursor(20, 145);
  tft.print("ID: ");
  tft.print(id);
  tft.setCursor(20, 180);
  tft.print("Waktu: ");
  tft.print(time);
  if (!success) {
    tft.setTextColor(COLOR_WARNING, COLOR_BG);
    tft.setCursor(20, 220);
    tft.print("Tunggu 3 detik...");
  }
  drawFooter("Scan jari untuk absen");
  delay(success ? 1500 : 3000);
  if (!success) showMainMenu();
}

void updateProgress(int current, int total, const char* label) {
  tft.fillRect(20, 220, 440, 30, 0x1082);
  tft.drawRect(20, 220, 440, 30, COLOR_BORDER);
  int progress = (current * 436) / total;
  tft.fillRect(22, 222, progress, 26, COLOR_SUCCESS);
  tft.setTextColor(TFT_WHITE, 0x1082);
  tft.setTextSize(1);
  tft.setCursor(30, 245);
  tft.printf("%s: %d/%d", label, current, total);
}

void showLoading(const char* message) {
  tft.fillScreen(COLOR_BG);
  drawHeader("PROSES");
  drawCenteredText(100, message, COLOR_TEXT, 2);
  drawCenteredText(150, "Mohon tunggu...", 0x7BEF, 2);
}

// ================= MENU FUNGSI =================
void showMainMenu() {
  const char* items[] = {
    "📋 ABSENSI",
    "👨‍🎓 DAFTAR SISWA",
    "👥 DAFTAR STAFF",
    "➕ TAMBAH JARI",
    "🗑️ HAPUS JARI",
    "📋 LIST JARI",
    "📊 STATUS SENSOR",
    "⚙️ SETTINGS",
    "📡 SYNC DATA",
    "ℹ️ ABOUT"
  };
  menuItemCount = 10;
  currentMenu = MENU_MAIN;
  drawMenu(items, menuItemCount, menuSelection);
}

void showEnrollStudent() {
  const char* items[] = {
    "📝 ENROLL SISWA (LANGSUNG JARI)",
    "📋 LIST SISWA",
    "🗑️ HAPUS SISWA",
    "🔙 KEMBALI"
  };
  menuItemCount = 4;
  currentMenu = MENU_ENROLL_STUDENT;
  drawMenu(items, menuItemCount, menuSelection);
}

void showEnrollStaff() {
  const char* items[] = {
    "📝 ENROLL STAFF (LANGSUNG JARI)",
    "📋 LIST STAFF",
    "🗑️ HAPUS STAFF",
    "🔙 KEMBALI"
  };
  menuItemCount = 4;
  currentMenu = MENU_ENROLL_STAFF;
  drawMenu(items, menuItemCount, menuSelection);
}

void showAddFinger() {
  const char* items[] = {
    "➕ TAMBAH JARI SISWA",
    "➕ TAMBAH JARI STAFF",
    "🔙 KEMBALI"
  };
  menuItemCount = 3;
  currentMenu = MENU_ADD_FINGER;
  drawMenu(items, menuItemCount, menuSelection);
}

void showDeleteFinger() {
  const char* items[] = {
    "🗑️ HAPUS JARI SISWA",
    "🗑️ HAPUS JARI STAFF",
    "🔙 KEMBALI"
  };
  menuItemCount = 3;
  currentMenu = MENU_DELETE_FINGER;
  drawMenu(items, menuItemCount, menuSelection);
}

void showListFingers() {
  const char* items[] = {
    "📋 LIST JARI SISWA",
    "📋 LIST JARI STAFF",
    "🔙 KEMBALI"
  };
  menuItemCount = 3;
  currentMenu = MENU_LIST_FINGERS;
  drawMenu(items, menuItemCount, menuSelection);
}

void showSensorStatus() {
  tft.fillScreen(COLOR_BG);
  drawHeader("STATUS SENSOR");
  for (int i = 1; i <= NUM_SENSORS; i++) {
    int y = 50 + (i - 1) * 40;
    tft.setTextColor(COLOR_TEXT, COLOR_BG);
    tft.setTextSize(1);
    tft.setCursor(20, y + 5);
    tft.printf("Sensor #%d", i);
    selectSensor(i);
    finger.begin(57600);
    bool ok = finger.verifyPassword();
    selectSensor(1);
    tft.setCursor(200, y + 5);
    if (ok) {
      tft.setTextColor(COLOR_SUCCESS, COLOR_BG);
      tft.print("✅ ONLINE");
    } else {
      tft.setTextColor(COLOR_ERROR, COLOR_BG);
      tft.print("❌ OFFLINE");
    }
  }
  tft.setTextColor(COLOR_TEXT, COLOR_BG);
  tft.setTextSize(1);
  tft.setCursor(20, 280);
  tft.printf("Total Siswa: %d", userCacheCount);
  tft.setCursor(250, 280);
  tft.printf("Total Staff: %d", staffCacheCount);
  drawFooter("A=Refresh  B=Back");
}

void showSettings() {
  char delayStr[20];
  sprintf(delayStr, "⏰ Global Delay: %d m", globalDelayMinutes);
  const char* items[] = {
    "📶 WiFi Config",
    delayStr,
    "🔙 KEMBALI"
  };
  menuItemCount = 3;
  currentMenu = MENU_SETTINGS;
  drawMenu(items, menuItemCount, menuSelection);
}

void showWiFiConfig() {
  const char* items[] = {
    "📡 SCAN WIFI",
    "🔑 INPUT SSID",
    "🔐 INPUT PASSWORD",
    "🔙 KEMBALI"
  };
  menuItemCount = 4;
  currentMenu = MENU_WIFI_CONFIG;
  drawMenu(items, menuItemCount, menuSelection);
}

void showSyncData() {
  const char* items[] = {
    "📥 SYNC SISWA",
    "📥 SYNC STAFF",
    "📤 SYNC ABSENSI",
    "🔄 SYNC ALL",
    "🔙 KEMBALI"
  };
  menuItemCount = 5;
  currentMenu = MENU_SYNC_DATA;
  drawMenu(items, menuItemCount, menuSelection);
}

void showAbout() {
  tft.fillScreen(COLOR_BG);
  drawHeader("ABOUT");
  drawCenteredText(60, "ESP32 ABSENSI", COLOR_HEADER, 3);
  drawCenteredText(100, "v" VERSION, COLOR_TEXT, 2);
  drawCenteredText(140, "6 Sensor Fingerprint", COLOR_TEXT, 1);
  drawCenteredText(160, "TFT LCD 3.5\"", COLOR_TEXT, 1);
  drawCenteredText(180, "Keypad 4x4", COLOR_TEXT, 1);
  drawCenteredText(210, "Multi-Finger Support", COLOR_TEXT, 1);
  drawCenteredText(240, "Max 4 Fingers/User", COLOR_TEXT, 1);
  drawCenteredText(270, "By CV Haka Jaya", 0x7BEF, 1);
  drawFooter("B=Back");
}

void showConfirmEnroll() {
  tft.fillScreen(COLOR_BG);
  drawHeader("KONFIRMASI ENROLL");
  tft.setTextColor(COLOR_TEXT, COLOR_BG);
  tft.setTextSize(2);
  tft.setCursor(20, 60);
  tft.printf("ID: %d", enrollId);
  tft.setCursor(20, 95);
  tft.printf("Nama: User%d (Default)", enrollId);
  tft.setCursor(20, 130);
  tft.printf("Kelas: -");
  tft.setCursor(20, 165);
  tft.printf("Jurusan: -");
  tft.setCursor(20, 200);
  tft.printf("Delay: %d menit", globalDelayMinutes);
  tft.setTextColor(enrollIsStaff ? COLOR_WARNING : COLOR_HIGHLIGHT, COLOR_BG);
  tft.setCursor(20, 240);
  tft.printf("Tipe: %s", enrollIsStaff ? "STAFF" : "SISWA");
  drawFooter("A=Enroll  B=Back  C=Cancel");
}

void showConfirmDelete(int id, const char* name) {
  tft.fillScreen(COLOR_BG);
  drawHeader("KONFIRMASI HAPUS");
  tft.setTextColor(COLOR_ERROR, COLOR_BG);
  tft.setTextSize(2);
  tft.setCursor(20, 80);
  tft.print("⚠️ HAPUS DATA");
  tft.setTextColor(COLOR_TEXT, COLOR_BG);
  tft.setCursor(20, 130);
  tft.printf("ID: %d", id);
  tft.setCursor(20, 165);
  tft.printf("Nama: %s", name);
  tft.setTextColor(COLOR_WARNING, COLOR_BG);
  tft.setCursor(20, 210);
  tft.print("Yakin ingin menghapus?");
  drawFooter("A=Hapus  B=Batal");
}

void showConfirmDeleteFinger() {
  tft.fillScreen(COLOR_BG);
  drawHeader("KONFIRMASI HAPUS JARI");
  tft.setTextColor(COLOR_ERROR, COLOR_BG);
  tft.setTextSize(2);
  tft.setCursor(20, 80);
  tft.print("⚠️ HAPUS SIDIK JARI");
  tft.setTextColor(COLOR_TEXT, COLOR_BG);
  tft.setCursor(20, 130);
  tft.printf("User ID: %d", enrollId);
  tft.setCursor(20, 165);
  tft.printf("Slot: %d", enrollFingerSlot + 1);
  tft.setTextColor(COLOR_WARNING, COLOR_BG);
  tft.setCursor(20, 210);
  tft.print("Yakin ingin menghapus?");
  drawFooter("A=Hapus  B=Batal");
}

// ================= HANDLE MENU NAVIGASI =================
void handleMenuNavigation(char key) {
  switch (key) {
    case '2':
      menuSelection = (menuSelection + 1) % menuItemCount;
      break;
    case '8':
      menuSelection = (menuSelection - 1 + menuItemCount) % menuItemCount;
      break;
    case 'A':
    case 'D':
    case '#':
      handleMenuSelect();
      return;
    case 'B':
    case 'C':
      if (currentMenu != MENU_MAIN) {
        menuSelection = 0;
        showMainMenu();
      }
      return;
    default: return;
  }
  switch (currentMenu) {
    case MENU_MAIN: showMainMenu(); break;
    case MENU_ENROLL_STUDENT: showEnrollStudent(); break;
    case MENU_ENROLL_STAFF: showEnrollStaff(); break;
    case MENU_ADD_FINGER: showAddFinger(); break;
    case MENU_DELETE_FINGER: showDeleteFinger(); break;
    case MENU_LIST_FINGERS: showListFingers(); break;
    case MENU_SETTINGS: showSettings(); break;
    case MENU_WIFI_CONFIG: showWiFiConfig(); break;
    case MENU_SYNC_DATA: showSyncData(); break;
    default: showMainMenu(); break;
  }
}

void handleMenuSelect() {
  switch (currentMenu) {
    case MENU_MAIN:
      switch (menuSelection) {
        case 0:
          currentMenu = MENU_ATTENDANCE;
          drawCenteredText(100, "🔍 SCAN JARI", COLOR_TEXT, 4);
          drawCenteredText(150, "Untuk Absensi", COLOR_TEXT, 2);
          drawFooter("Tekan jari di sensor");
          break;
        case 1: menuSelection = 0; showEnrollStudent(); break;
        case 2: menuSelection = 0; showEnrollStaff(); break;
        case 3: menuSelection = 0; showAddFinger(); break;
        case 4: menuSelection = 0; showDeleteFinger(); break;
        case 5: menuSelection = 0; showListFingers(); break;
        case 6: menuSelection = 0; showSensorStatus(); break;
        case 7: menuSelection = 0; showSettings(); break;
        case 8: menuSelection = 0; showSyncData(); break;
        case 9: menuSelection = 0; showAbout(); break;
      }
      break;
      
    case MENU_ENROLL_STUDENT:
      switch (menuSelection) {
        case 0: enrollIsStaff = false; showInputID("Masukkan ID Siswa"); break;
        case 1: listStudents(); break;
        case 2: showInputID("Masukkan ID yang dihapus"); break;
        case 3: menuSelection = 0; showMainMenu(); break;
      }
      break;
      
    case MENU_ENROLL_STAFF:
      switch (menuSelection) {
        case 0: enrollIsStaff = true; showInputID("Masukkan ID Staff"); break;
        case 1: listStaff(); break;
        case 2: showInputID("Masukkan ID Staff dihapus"); break;
        case 3: menuSelection = 0; showMainMenu(); break;
      }
      break;
      
    case MENU_ADD_FINGER:
      switch (menuSelection) {
        case 0: enrollIsStaff = false; showInputID("Masukkan ID Siswa"); break;
        case 1: enrollIsStaff = true; showInputID("Masukkan ID Staff"); break;
        case 2: menuSelection = 0; showMainMenu(); break;
      }
      break;
      
    case MENU_DELETE_FINGER:
      switch (menuSelection) {
        case 0: enrollIsStaff = false; showInputID("Masukkan ID Siswa"); break;
        case 1: enrollIsStaff = true; showInputID("Masukkan ID Staff"); break;
        case 2: menuSelection = 0; showMainMenu(); break;
      }
      break;
      
    case MENU_LIST_FINGERS:
      switch (menuSelection) {
        case 0: listFingers(false); break;
        case 1: listFingers(true); break;
        case 2: menuSelection = 0; showMainMenu(); break;
      }
      break;
      
    case MENU_SETTINGS:
      switch (menuSelection) {
        case 0: menuSelection = 0; showWiFiConfig(); break;
        case 1: showInputDelay("Masukkan Delay (menit)"); break;
        case 2: menuSelection = 0; showMainMenu(); break;
      }
      break;
      
    case MENU_WIFI_CONFIG:
      switch (menuSelection) {
        case 0: {
          tft.fillScreen(COLOR_BG);
          drawHeader("SCAN WIFI");
          drawCenteredText(100, "📡 Scanning...", COLOR_TEXT, 2);
          int n = WiFi.scanNetworks();
          if (n == 0) {
            drawCenteredText(150, "❌ Tidak ada jaringan", COLOR_ERROR, 2);
          } else {
            int y = 50;
            for (int i = 0; i < min(n, 10); i++) {
              tft.setTextColor(COLOR_TEXT, COLOR_BG);
              tft.setTextSize(1);
              tft.setCursor(20, y);
              tft.printf("%d. %s", i+1, WiFi.SSID(i).c_str());
              y += 25;
            }
          }
          drawFooter("B=Back");
          break;
        }
        case 1: showInputSSID(); break;
        case 2: showInputPassword(); break;
        case 3: menuSelection = 0; showSettings(); break;
      }
      break;
      
    case MENU_SYNC_DATA:
      switch (menuSelection) {
        case 0: showLoading("Sync Siswa..."); syncAllUsersFromFirebase(); menuSelection = 0; showSyncData(); break;
        case 1: showLoading("Sync Staff..."); syncAllStaffFromFirebase(); menuSelection = 0; showSyncData(); break;
        case 2: showLoading("Sync Absensi..."); syncOfflineData(); menuSelection = 0; showSyncData(); break;
        case 3: showLoading("Sync All Data..."); syncAllUsersFromFirebase(); syncAllStaffFromFirebase(); syncOfflineData(); menuSelection = 0; showSyncData(); break;
        case 4: menuSelection = 0; showMainMenu(); break;
      }
      break;
  }
}

// ================= LIST FUNGSI =================
void listStudents() {
  tft.fillScreen(COLOR_BG);
  drawHeader("LIST SISWA");
  if (userCacheCount == 0) {
    drawCenteredText(100, "📭 Tidak ada siswa", COLOR_TEXT, 2);
  } else {
    int maxShow = min(userCacheCount, 8);
    for (int i = 0; i < maxShow; i++) {
      int y = 50 + i * 30;
      tft.setTextColor(COLOR_TEXT, COLOR_BG);
      tft.setTextSize(1);
      tft.setCursor(20, y + 5);
      tft.printf("%d. ID:%d %s (Jari:%d)", i+1, userCache[i].id, 
                 userCache[i].nama, userCache[i].fingerCount);
    }
  }
  drawFooter("B=Back");
}

void listStaff() {
  tft.fillScreen(COLOR_BG);
  drawHeader("LIST STAFF");
  if (staffCacheCount == 0) {
    drawCenteredText(100, "📭 Tidak ada staff", COLOR_TEXT, 2);
  } else {
    int maxShow = min(staffCacheCount, 8);
    for (int i = 0; i < maxShow; i++) {
      int y = 50 + i * 30;
      tft.setTextColor(COLOR_TEXT, COLOR_BG);
      tft.setTextSize(1);
      tft.setCursor(20, y + 5);
      tft.printf("%d. ID:%d %s (Jari:%d)", i+1, staffCache[i].id, 
                 staffCache[i].nama, staffCache[i].fingerCount);
    }
  }
  drawFooter("B=Back");
}

void listFingers(bool isStaff) {
  tft.fillScreen(COLOR_BG);
  drawHeader(isStaff ? "LIST JARI STAFF" : "LIST JARI SISWA");
  int count = isStaff ? staffCacheCount : userCacheCount;
  if (count == 0) {
    drawCenteredText(100, "📭 Tidak ada data", COLOR_TEXT, 2);
    drawFooter("B=Back");
    return;
  }
  int y = 50;
  for (int u = 0; u < min(count, 5); u++) {
    UserData* user = nullptr;
    StaffData* staff = nullptr;
    char* nama;
    int id, fingerCount;
    if (isStaff) {
      staff = &staffCache[u];
      nama = staff->nama;
      id = staff->id;
      fingerCount = staff->fingerCount;
    } else {
      user = &userCache[u];
      nama = user->nama;
      id = user->id;
      fingerCount = user->fingerCount;
    }
    tft.setTextColor(COLOR_TEXT, COLOR_BG);
    tft.setTextSize(1);
    tft.setCursor(20, y);
    tft.printf("ID:%d %s", id, nama);
    y += 20;
    for (int f = 0; f < MAX_FINGERS_PER_USER; f++) {
      bool registered = isStaff ? staff->fingers[f].registered : user->fingers[f].registered;
      if (registered) {
        char* fingerName = isStaff ? staff->fingers[f].fingerName : user->fingers[f].fingerName;
        int fingerId = isStaff ? staff->fingers[f].fingerId : user->fingers[f].fingerId;
        tft.setTextColor(COLOR_SUCCESS, COLOR_BG);
        tft.setCursor(30, y);
        tft.printf("  Slot%d: %s (ID:%d)", f+1, fingerName, fingerId);
        y += 18;
      }
    }
    y += 10;
  }
  drawFooter("B=Back");
}

// ================= HANDLE INPUT =================
void handleInput(char key) {
  if (!isInputMode) return;
  switch (key) {
    case '#': case 'D':
      isInputMode = false; processInput(); break;
    case 'C': case 'B':
      isInputMode = false; inputBuffer = ""; menuSelection = 0;
      if (enrollIsStaff) showEnrollStaff(); else showEnrollStudent(); break;
    case '*':
      if (inputBuffer.length() > 0) {
        inputBuffer.remove(inputBuffer.length() - 1);
        drawInput("", inputBuffer.c_str(), false);
      }
      break;
    default:
      if (key >= '0' && key <= '9') {
        inputBuffer += key;
        drawInput("", inputBuffer.c_str(), false);
      }
      break;
  }
}

void processInput() {
  if (inputBuffer.length() == 0) { isInputMode = false; return; }
  switch (currentMenu) {
    case MENU_INPUT_ID:
      enrollId = inputBuffer.toInt();
      if (enrollId > 0) {
        if (currentMenu == MENU_ADD_FINGER || currentMenu == MENU_DELETE_FINGER) {
          if (currentMenu == MENU_ADD_FINGER) processAddFinger();
          else processDeleteFinger();
        } else {
          // ENROLL LANGSUNG - TANPA INPUT NAMA/KELAS/JURUSAN
          showConfirmEnroll();
        }
      } else {
        isInputMode = false;
        if (enrollIsStaff) showEnrollStaff();
        else showEnrollStudent();
      }
      break;
      
    case MENU_INPUT_DELAY:
      enrollDelay = inputBuffer.toInt();
      if (enrollDelay <= 0) enrollDelay = 60;
      if (!enrollIsStaff) {
        globalDelayMinutes = enrollDelay;
        saveSettings();
        isInputMode = false;
        menuSelection = 0;
        showSettings();
      } else {
        globalDelayMinutes = enrollDelay;
        saveSettings();
        isInputMode = false;
        menuSelection = 0;
        showSettings();
      }
      break;
      
    case MENU_CONFIRM_ENROLL: processEnroll(); break;
    case MENU_CONFIRM_DELETE: processDelete(); break;
    case MENU_CONFIRM_DELETE_FINGER: processDeleteFinger(); break;
  }
}

// ================= ENROLL PROSES (LANGSUNG TANPA INPUT DATA) =================
void processEnroll() {
  showLoading("Memulai enroll...");
  
  // Cek apakah ID sudah ada
  if (enrollIsStaff) {
    for (int i = 0; i < staffCacheCount; i++) {
      if (staffCache[i].id == enrollId) {
        drawCenteredText(150, "❌ ID Sudah Ada!", COLOR_ERROR, 3);
        delay(1500);
        isInputMode = false;
        showEnrollStaff();
        return;
      }
    }
  } else {
    for (int i = 0; i < userCacheCount; i++) {
      if (userCache[i].id == enrollId) {
        drawCenteredText(150, "❌ ID Sudah Ada!", COLOR_ERROR, 3);
        delay(1500);
        isInputMode = false;
        showEnrollStudent();
        return;
      }
    }
  }
  
  // Fingerprint ID untuk user: userID * 10 + slot + 1 (slot 0 = jari pertama)
  int fingerId = enrollId * 10 + 1;
  
  // Default data
  char defaultNama[MAX_NAME_LEN];
  sprintf(defaultNama, "User%d", enrollId);
  
  int result = enrollFingerprint(fingerId);
  
  if (result == FINGERPRINT_OK) {
    if (enrollIsStaff) {
      char staffIdStr[20];
      sprintf(staffIdStr, "STF%d", ++lastStaffNumber);
      String email = String(defaultNama) + "@sekolah.sch.id";
      
      StaffData newStaff;
      newStaff.id = enrollId;
      strncpy(newStaff.staffId, staffIdStr, MAX_STAFFID_LEN - 1);
      strncpy(newStaff.nama, defaultNama, MAX_NAME_LEN - 1);
      strcpy(newStaff.jabatan, "guru");
      strcpy(newStaff.departemen, "-");
      strncpy(newStaff.email, email.c_str(), MAX_EMAIL_LEN - 1);
      strcpy(newStaff.noHp, "-");
      newStaff.fingerCount = 1;
      newStaff.fingers[0].fingerId = fingerId;
      newStaff.fingers[0].registered = true;
      strcpy(newStaff.fingers[0].fingerName, "Jari 1");
      
      if (staffCacheCount < MAX_STAFF) {
        staffCache[staffCacheCount++] = newStaff;
      }
      saveStaffToSD(enrollId, String(staffIdStr), String(defaultNama), "guru", "-", email, "-");
      
      tft.fillScreen(COLOR_BG);
      drawHeader("✅ BERHASIL");
      drawCenteredText(80, "✅ Staff Enroll!", COLOR_SUCCESS, 4);
      drawTextString(20, 140, "ID: " + String(enrollId), COLOR_TEXT, 2);
      drawTextString(20, 180, "Nama: " + String(defaultNama), COLOR_TEXT, 2);
      drawTextString(20, 220, "Finger ID: " + String(fingerId), COLOR_TEXT, 2);
      
    } else {
      UserData newUser;
      newUser.id = enrollId;
      strncpy(newUser.nama, defaultNama, MAX_NAME_LEN - 1);
      strcpy(newUser.kelas, "-");
      strcpy(newUser.jurusan, "-");
      newUser.delayOut = globalDelayMinutes;
      newUser.fingerCount = 1;
      newUser.fingers[0].fingerId = fingerId;
      newUser.fingers[0].registered = true;
      strcpy(newUser.fingers[0].fingerName, "Jari 1");
      
      if (userCacheCount < MAX_USERS) {
        userCache[userCacheCount++] = newUser;
      }
      saveUserToSD(enrollId, String(defaultNama), "-", "-", globalDelayMinutes);
      
      tft.fillScreen(COLOR_BG);
      drawHeader("✅ BERHASIL");
      drawCenteredText(80, "✅ Student Enroll!", COLOR_SUCCESS, 4);
      drawTextString(20, 140, "ID: " + String(enrollId), COLOR_TEXT, 2);
      drawTextString(20, 180, "Nama: " + String(defaultNama), COLOR_TEXT, 2);
      drawTextString(20, 220, "Finger ID: " + String(fingerId), COLOR_TEXT, 2);
    }
    
    delay(2000);
    isInputMode = false;
    menuSelection = 0;
    showMainMenu();
    
  } else {
    tft.fillScreen(COLOR_BG);
    drawHeader("❌ GAGAL");
    drawCenteredText(80, "❌ Enroll Gagal!", COLOR_ERROR, 4);
    drawTextString(20, 140, "Kode: " + String(result), COLOR_TEXT, 2);
    drawCenteredText(180, "Coba lagi", COLOR_WARNING, 2);
    delay(2000);
    isInputMode = false;
    if (enrollIsStaff) showEnrollStaff();
    else showEnrollStudent();
  }
}

// ================= ADD FINGER PROSES =================
void processAddFinger() {
  bool found = false;
  bool isStaff = enrollIsStaff;
  
  if (isStaff) {
    for (int i = 0; i < staffCacheCount; i++) {
      if (staffCache[i].id == enrollId) {
        found = true;
        if (staffCache[i].fingerCount >= MAX_FINGERS_PER_USER) {
          drawCenteredText(150, "❌ Jari Penuh!", COLOR_ERROR, 3);
          drawCenteredText(200, "Max 4 jari per user", COLOR_TEXT, 2);
          delay(1500);
          isInputMode = false;
          showAddFinger();
          return;
        }
        break;
      }
    }
  } else {
    for (int i = 0; i < userCacheCount; i++) {
      if (userCache[i].id == enrollId) {
        found = true;
        if (userCache[i].fingerCount >= MAX_FINGERS_PER_USER) {
          drawCenteredText(150, "❌ Jari Penuh!", COLOR_ERROR, 3);
          drawCenteredText(200, "Max 4 jari per user", COLOR_TEXT, 2);
          delay(1500);
          isInputMode = false;
          showAddFinger();
          return;
        }
        break;
      }
    }
  }
  
  if (!found) {
    drawCenteredText(150, "❌ ID Tidak Ditemukan!", COLOR_ERROR, 3);
    delay(1500);
    isInputMode = false;
    showAddFinger();
    return;
  }
  
  int slot = getNextAvailableFingerSlot(enrollId, isStaff);
  if (slot == -1) {
    drawCenteredText(150, "❌ Jari Penuh!", COLOR_ERROR, 3);
    delay(1500);
    isInputMode = false;
    showAddFinger();
    return;
  }
  
  // Input nama jari (opsional, bisa langsung enter)
  String fingerName = readStringMultiTap(15, "Nama Jari (optional)");
  if (fingerName.length() == 0) {
    fingerName = "Jari " + String(slot + 1);
  }
  
  int fingerId = enrollId * 10 + slot + 1;
  showLoading("Enroll jari...");
  int result = enrollFingerprint(fingerId);
  
  if (result == FINGERPRINT_OK) {
    saveFingerToUser(enrollId, isStaff, slot, fingerName);
    
    if (isStaff) {
      for (int i = 0; i < staffCacheCount; i++) {
        if (staffCache[i].id == enrollId) {
          saveStaffToSD(enrollId, staffCache[i].staffId, staffCache[i].nama,
                        staffCache[i].jabatan, staffCache[i].departemen,
                        staffCache[i].email, staffCache[i].noHp);
          break;
        }
      }
    } else {
      for (int i = 0; i < userCacheCount; i++) {
        if (userCache[i].id == enrollId) {
          saveUserToSD(enrollId, userCache[i].nama, userCache[i].kelas,
                       userCache[i].jurusan, userCache[i].delayOut);
          break;
        }
      }
    }
    
    tft.fillScreen(COLOR_BG);
    drawHeader("✅ BERHASIL");
    drawCenteredText(80, "✅ Jari Ditambahkan!", COLOR_SUCCESS, 4);
    drawTextString(20, 140, "User ID: " + String(enrollId), COLOR_TEXT, 2);
    drawTextString(20, 180, "Slot: " + String(slot + 1), COLOR_TEXT, 2);
    drawTextString(20, 220, "Finger ID: " + String(fingerId), COLOR_TEXT, 2);
    delay(2000);
    isInputMode = false;
    menuSelection = 0;
    showMainMenu();
    
  } else {
    tft.fillScreen(COLOR_BG);
    drawHeader("❌ GAGAL");
    drawCenteredText(80, "❌ Gagal Enroll!", COLOR_ERROR, 4);
    drawTextString(20, 140, "Kode: " + String(result), COLOR_TEXT, 2);
    drawCenteredText(180, "Coba lagi", COLOR_WARNING, 2);
    delay(2000);
    isInputMode = false;
    showAddFinger();
  }
}

// ================= DELETE FINGER PROSES =================
void processDeleteFinger() {
  bool found = false;
  bool isStaff = enrollIsStaff;
  
  if (isStaff) {
    for (int i = 0; i < staffCacheCount; i++) {
      if (staffCache[i].id == enrollId) {
        found = true;
        if (staffCache[i].fingerCount <= 1) {
          drawCenteredText(150, "❌ Minimal 1 Jari!", COLOR_ERROR, 3);
          drawCenteredText(200, "User harus punya 1 jari", COLOR_TEXT, 2);
          delay(1500);
          isInputMode = false;
          showDeleteFinger();
          return;
        }
        break;
      }
    }
  } else {
    for (int i = 0; i < userCacheCount; i++) {
      if (userCache[i].id == enrollId) {
        found = true;
        if (userCache[i].fingerCount <= 1) {
          drawCenteredText(150, "❌ Minimal 1 Jari!", COLOR_ERROR, 3);
          drawCenteredText(200, "User harus punya 1 jari", COLOR_TEXT, 2);
          delay(1500);
          isInputMode = false;
          showDeleteFinger();
          return;
        }
        break;
      }
    }
  }
  
  if (!found) {
    drawCenteredText(150, "❌ ID Tidak Ditemukan!", COLOR_ERROR, 3);
    delay(1500);
    isInputMode = false;
    showDeleteFinger();
    return;
  }
  
  tft.fillScreen(COLOR_BG);
  drawHeader("PILIH JARI DIHAPUS");
  int y = 60;
  for (int f = 0; f < MAX_FINGERS_PER_USER; f++) {
    bool registered = isStaff ? 
      staffCache[getStaffIndex(enrollId)].fingers[f].registered :
      userCache[getUserIndex(enrollId)].fingers[f].registered;
    if (registered) {
      char* fingerName = isStaff ?
        staffCache[getStaffIndex(enrollId)].fingers[f].fingerName :
        userCache[getUserIndex(enrollId)].fingers[f].fingerName;
      tft.setTextColor(COLOR_TEXT, COLOR_BG);
      tft.setTextSize(2);
      tft.setCursor(20, y);
      tft.printf("%d. %s", f+1, fingerName);
      y += 35;
    }
  }
  drawFooter("Pilih 1-4 untuk hapus, B=Back");
  
  char key = waitForKey(10000);
  if (key >= '1' && key <= '4') {
    int slot = key - '1';
    enrollFingerSlot = slot;
    showConfirmDeleteFinger();
  } else {
    isInputMode = false;
    showDeleteFinger();
  }
}

void processDeleteFingerConfirm() {
  int slot = enrollFingerSlot;
  bool isStaff = enrollIsStaff;
  
  int fingerId = getFingerId(enrollId, isStaff, slot);
  if (fingerId == -1) {
    drawCenteredText(150, "❌ Jari Tidak Ditemukan", COLOR_ERROR, 3);
    delay(1500);
    isInputMode = false;
    showDeleteFinger();
    return;
  }
  
  removeFingerFromUser(enrollId, isStaff, slot);
  
  if (isStaff) {
    for (int i = 0; i < staffCacheCount; i++) {
      if (staffCache[i].id == enrollId) {
        saveStaffToSD(enrollId, staffCache[i].staffId, staffCache[i].nama,
                      staffCache[i].jabatan, staffCache[i].departemen,
                      staffCache[i].email, staffCache[i].noHp);
        break;
      }
    }
  } else {
    for (int i = 0; i < userCacheCount; i++) {
      if (userCache[i].id == enrollId) {
        saveUserToSD(enrollId, userCache[i].nama, userCache[i].kelas,
                     userCache[i].jurusan, userCache[i].delayOut);
        break;
      }
    }
  }
  
  tft.fillScreen(COLOR_BG);
  drawHeader("✅ BERHASIL");
  drawCenteredText(80, "✅ Jari Dihapus!", COLOR_SUCCESS, 4);
  drawTextString(20, 140, "User ID: " + String(enrollId), COLOR_TEXT, 2);
  drawTextString(20, 180, "Slot: " + String(slot + 1), COLOR_TEXT, 2);
  delay(2000);
  isInputMode = false;
  menuSelection = 0;
  showMainMenu();
}

// ================= DELETE PROSES =================
void processDelete() {
  int id = inputBuffer.toInt();
  if (id <= 0) {
    isInputMode = false;
    if (enrollIsStaff) showEnrollStaff();
    else showEnrollStudent();
    return;
  }
  
  bool found = false;
  char name[MAX_NAME_LEN];
  name[0] = '\0';
  
  if (enrollIsStaff) {
    for (int i = 0; i < staffCacheCount; i++) {
      if (staffCache[i].id == id) {
        found = true;
        strncpy(name, staffCache[i].nama, MAX_NAME_LEN - 1);
        break;
      }
    }
  } else {
    for (int i = 0; i < userCacheCount; i++) {
      if (userCache[i].id == id) {
        found = true;
        strncpy(name, userCache[i].nama, MAX_NAME_LEN - 1);
        break;
      }
    }
  }
  
  if (!found) {
    drawCenteredText(150, "❌ ID Tidak Ditemukan", COLOR_ERROR, 2);
    delay(1500);
    isInputMode = false;
    if (enrollIsStaff) showEnrollStaff();
    else showEnrollStudent();
    return;
  }
  
  showConfirmDelete(id, name);
}

// ================= DELETE USER CONFIRM =================
void processDeleteUser() {
  int id = enrollId;
  bool isStaff = enrollIsStaff;
  
  // Hapus semua fingerprint dari sensor
  if (isStaff) {
    for (int i = 0; i < staffCacheCount; i++) {
      if (staffCache[i].id == id) {
        for (int f = 0; f < MAX_FINGERS_PER_USER; f++) {
          if (staffCache[i].fingers[f].registered) {
            deleteFingerprintFromAllSensors(staffCache[i].fingers[f].fingerId);
          }
        }
        break;
      }
    }
    removeStaffFromSD(id);
  } else {
    for (int i = 0; i < userCacheCount; i++) {
      if (userCache[i].id == id) {
        for (int f = 0; f < MAX_FINGERS_PER_USER; f++) {
          if (userCache[i].fingers[f].registered) {
            deleteFingerprintFromAllSensors(userCache[i].fingers[f].fingerId);
          }
        }
        break;
      }
    }
    removeUserFromSD(id);
  }
  
  tft.fillScreen(COLOR_BG);
  drawHeader("✅ BERHASIL");
  drawCenteredText(80, "✅ User Dihapus!", COLOR_SUCCESS, 4);
  drawTextString(20, 140, "ID: " + String(id), COLOR_TEXT, 2);
  delay(2000);
  isInputMode = false;
  menuSelection = 0;
  showMainMenu();
}

// ================= ATTENDANCE PROSES =================
void processAttendance() {
  int p = -1, attempts = 0;
  drawHeader("ABSENSI");
  drawCenteredText(60, "📌 Tempelkan jari", COLOR_TEXT, 2);
  
  while (p != FINGERPRINT_OK && attempts < 50) {
    p = finger.getImage();
    if (p == FINGERPRINT_NOFINGER) {
      attempts++;
      delay(50);
      if (attempts % 10 == 0) {
        drawCenteredText(100, ".", COLOR_TEXT, 3);
      }
    }
  }
  
  if (p != FINGERPRINT_OK) {
    drawCenteredText(150, "❌ Tidak Terdeteksi", COLOR_ERROR, 3);
    delay(1500);
    showMainMenu();
    return;
  }
  
  p = finger.image2Tz();
  if (p != FINGERPRINT_OK) {
    drawCenteredText(150, "❌ Gagal Proses", COLOR_ERROR, 3);
    delay(1500);
    showMainMenu();
    return;
  }
  
  p = finger.fingerSearch();
  if (p != FINGERPRINT_OK) {
    drawCenteredText(150, "❌ Jari Tidak Terdaftar", COLOR_ERROR, 3);
    delay(1500);
    showMainMenu();
    return;
  }
  
  int fingerId = finger.fingerID;
  int userId;
  bool isStaff;
  if (findUserByFingerprint(fingerId, userId, isStaff)) {
    handleAttendance(userId);
  } else {
    drawCenteredText(150, "❌ User Tidak Ditemukan", COLOR_ERROR, 3);
    delay(1500);
  }
  
  if (currentMenu == MENU_ATTENDANCE) {
    showMainMenu();
  }
}

// ================= HELPER FUNGSI =================
int getStaffIndex(int id) {
  for (int i = 0; i < staffCacheCount; i++) {
    if (staffCache[i].id == id) return i;
  }
  return -1;
}

int getUserIndex(int id) {
  for (int i = 0; i < userCacheCount; i++) {
    if (userCache[i].id == id) return i;
  }
  return -1;
}

StaffData getStaffData(int id) {
  for (int i = 0; i < staffCacheCount; i++) {
    if (staffCache[i].id == id) {
      return staffCache[i];
    }
  }
  StaffData staff;
  staff.id = id;
  strcpy(staff.staffId, "STF");
  strcpy(staff.nama, "Staff");
  strcpy(staff.jabatan, "guru");
  strcpy(staff.departemen, "-");
  strcpy(staff.email, "");
  strcpy(staff.noHp, "");
  staff.fingerCount = 0;
  return staff;
}

void showInputID(const char* prompt) {
  inputBuffer = "";
  inputCursor = 0;
  isInputMode = true;
  currentMenu = MENU_INPUT_ID;
  drawInput(prompt, inputBuffer.c_str(), false);
}

void showInputDelay(const char* prompt) {
  inputBuffer = "";
  inputCursor = 0;
  isInputMode = true;
  currentMenu = MENU_INPUT_DELAY;
  drawInput(prompt, inputBuffer.c_str(), false);
}

void showInputSSID() {
  showInputID("Masukkan SSID");
}

void showInputPassword() {
  showInputID("Masukkan Password");
}

// ================= FIREBASE COMMANDS =================
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
      Serial.printf("📡 Hapus ID %d (%s)\n", studentId, studentName.c_str());
      bool allSuccess = true;
      bool isStaff = false;
      for (int i = 0; i < userCacheCount; i++) {
        if (userCache[i].id == studentId) {
          isStaff = false;
          for (int f = 0; f < MAX_FINGERS_PER_USER; f++) {
            if (userCache[i].fingers[f].registered) {
              int fid = userCache[i].fingers[f].fingerId;
              if (!deleteFingerprintFromAllSensors(fid)) allSuccess = false;
            }
          }
          break;
        }
      }
      for (int i = 0; i < staffCacheCount; i++) {
        if (staffCache[i].id == studentId) {
          isStaff = true;
          for (int f = 0; f < MAX_FINGERS_PER_USER; f++) {
            if (staffCache[i].fingers[f].registered) {
              int fid = staffCache[i].fingers[f].fingerId;
              if (!deleteFingerprintFromAllSensors(fid)) allSuccess = false;
            }
          }
          break;
        }
      }
      
      FirebaseJson responseJson;
      responseJson.set("studentId", studentId);
      responseJson.set("studentName", studentName);
      responseJson.set("status", allSuccess ? "completed" : "failed");
      responseJson.set("timestamp_ms", millis());
      Firebase.RTDB.set(&fbdo, "/commands/esp32/delete_fingerprint_response", &responseJson);
      Firebase.RTDB.deleteNode(&fbdo, "/commands/esp32/delete_fingerprint");
      
      if (allSuccess) {
        if (isStaff) removeStaffFromSD(studentId);
        else removeUserFromSD(studentId);
        drawCenteredText(120, "✅ Hapus User Selesai", COLOR_SUCCESS, 2);
        delay(1000);
      }
    }
  }
}

// ================= TASK SENSOR SCAN =================
void TaskScanSensors(void* pvParameters) {
  for (;;) {
    if (isEnrolling) {
      vTaskDelay(100 / portTICK_PERIOD_MS);
      continue;
    }
    bool found = false;
    for (int i = 1; i <= NUM_SENSORS && !found; i++) {
      selectSensor(i);
      if (finger.getImage() == FINGERPRINT_OK) {
        if (finger.image2Tz() == FINGERPRINT_OK) {
          if (finger.fingerSearch() == FINGERPRINT_OK) {
            int fingerId = finger.fingerID;
            xQueueSend(xQueueFingerprint, &fingerId, 0);
            found = true;
            vTaskDelay(1500 / portTICK_PERIOD_MS);
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
  Serial.println("\n🚀 ESP32 Fingerprint System v" VERSION);
  Serial.println("📌 Multi-Finger Support (Max 4 fingers/user)");
  Serial.println("📌 ENROLL LANGSUNG - Tanpa input nama/kelas/jurusan");
  Serial.println("📌 Data default: Nama=UserX, Kelas=-, Jurusan=-");
  Serial.println("📊 Memory Optimized: MAX_USERS=300, MAX_STAFF=50");
  
  initLCD();
  drawHeader("BOOTING");
  drawCenteredText(80, "🚀 Starting...", COLOR_TEXT, 2);
  
  pinMode(MUX_S0, OUTPUT);
  pinMode(MUX_S1, OUTPUT);
  pinMode(MUX_S2, OUTPUT);
  for (int i = 1; i <= NUM_SENSORS; i++) {
    selectSensor(i);
  }
  
  mySerial.begin(57600, SERIAL_8N1, FP_RX, FP_TX);
  selectSensor(1);
  finger.begin(57600);
  
  Wire.begin(I2C_SDA, I2C_SCL);
  
  drawCenteredText(120, "⏰ RTC...", COLOR_TEXT, 2);
  initRTC();
  
  drawCenteredText(140, "💾 SD Card...", COLOR_TEXT, 2);
  initSD();
  
  drawCenteredText(160, "⌨️ Keypad...", COLOR_TEXT, 2);
  if (!initKeypad()) {
    drawCenteredText(200, "⚠️ Keypad Error!", COLOR_WARNING, 2);
    delay(1000);
  }
  
  drawCenteredText(180, "🔍 Sensors...", COLOR_TEXT, 2);
  initSensors();
  
  xQueueFingerprint = xQueueCreate(10, sizeof(int));
  xQueueAlphaSync = xQueueCreate(50, sizeof(AlphaRecord));
  
  xTaskCreatePinnedToCore(TaskScanSensors, "SensorTask", 10000, NULL, 1, NULL, 0);
  
  preferences.begin("alpha", true);
  lastDailyCheckDate = preferences.getString("lastCheck", "");
  preferences.end();
  
  drawCenteredText(220, "📡 WiFi...", COLOR_TEXT, 2);
  loadWiFiCredentials();
  if (wifiSSID.length() > 0) {
    connectToWiFi();
  }
  
  drawCenteredText(240, "📱 BLE...", COLOR_TEXT, 2);
  initBLE();
  
  delay(500);
  menuSelection = 0;
  showMainMenu();
  
  Serial.println("==========================================");
  Serial.println("🚀 ESP32 SIAP!");
  Serial.println("   LCD 3.5\" + Keypad 4x4");
  Serial.println("   " + String(NUM_SENSORS) + " Sensor Fingerprint");
  Serial.println("   Multi-Finger: 1-4 fingers/user");
  Serial.println("   ENROLL: Hanya perlu ID + tempel jari!");
  Serial.println("   MAX USERS: 300 | MAX STAFF: 50");
  Serial.println("   BLE Name: ESP32_Absensi");
  Serial.println("==========================================");
}

// ================= LOOP =================
void loop() {
  char key = getKey();
  if (key != '\0') {
    Serial.printf("🔑 Key: %c\n", key);
    if (isInputMode) {
      handleInput(key);
    } else {
      if (currentMenu == MENU_ATTENDANCE) {
        // Already in attendance mode
      } else if (currentMenu == MENU_SENSOR_STATUS && key == 'A') {
        showSensorStatus();
      } else if (currentMenu == MENU_ABOUT && key == 'B') {
        menuSelection = 0;
        showMainMenu();
      } else if (currentMenu == MENU_SENSOR_STATUS && key == 'B') {
        menuSelection = 0;
        showMainMenu();
      } else if (key == 'A' || key == 'B' || key == 'C' || key == '#' || key == '2' || key == '8') {
        handleMenuNavigation(key);
      }
    }
  }
  
  int fingerId;
  if (xQueueReceive(xQueueFingerprint, &fingerId, pdMS_TO_TICKS(100)) == pdPASS) {
    if (currentMenu == MENU_ATTENDANCE || currentMenu == MENU_MAIN) {
      int userId;
      bool isStaff;
      if (findUserByFingerprint(fingerId, userId, isStaff)) {
        handleAttendance(userId);
        showMainMenu();
      } else {
        drawCenteredText(150, "❌ Jari Tidak Terdaftar", COLOR_ERROR, 3);
        delay(1500);
        showMainMenu();
      }
    } else {
      tft.fillRect(0, 280, 480, 20, COLOR_BG);
      tft.setTextColor(COLOR_WARNING, COLOR_BG);
      tft.setTextSize(1);
      tft.setCursor(10, 283);
      tft.printf("⚠️ Finger ID %d - Tidak dalam mode absensi", fingerId);
      delay(1500);
      tft.fillRect(0, 280, 480, 20, COLOR_BG);
    }
  }
  
  if (wifiSSID.length() > 0) {
    if (WiFi.status() == WL_CONNECTED) {
      if (!isOnline) {
        isOnline = true;
        reconnectAttempts = 0;
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
      
      if (millis() - lastPing > 60000) {
        if (Firebase.ready()) {
          Firebase.RTDB.set(&fbdo, "/status/esp32/last_ping", getCurrentTimeRTC());
          Firebase.RTDB.set(&fbdo, "/status/esp32/ip", WiFi.localIP().toString());
        }
        lastPing = millis();
      }
      
      if (millis() - lastAlphaSync > 10000) {
        syncPendingAlpha();
        lastAlphaSync = millis();
      }
    } else {
      if (isOnline) {
        isOnline = false;
        Serial.println("⚠️ WiFi lost");
        sendBLEMessage("⚠️ WiFi lost");
      }
      if (millis() - lastReconnect > 30000) {
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          WiFi.disconnect();
          WiFi.begin(wifiSSID.c_str(), wifiPassword.c_str());
          lastReconnect = millis();
          reconnectAttempts++;
          Serial.println("🔄 Reconnecting...");
        } else {
          Serial.println("⚠️ Max reconnect attempts, restarting...");
          ESP.restart();
        }
      }
    }
  }
  
  if (millis() - lastDailyCheck > 60000) {
    performDailyAbsenceCheck();
    lastDailyCheck = millis();
  }
  
  static unsigned long lastTimeRefresh = 0;
  if (millis() - lastTimeRefresh > 10000) {
    if (currentMenu != MENU_ATTENDANCE) {
      drawHeader(getMenuTitle());
    }
    lastTimeRefresh = millis();
  }
  
  delay(10);
}

// ================= HELPER FUNGSI =================
const char* getMenuTitle() {
  switch (currentMenu) {
    case MENU_MAIN: return "MENU UTAMA";
    case MENU_ENROLL_STUDENT: return "DAFTAR SISWA";
    case MENU_ENROLL_STAFF: return "DAFTAR STAFF";
    case MENU_ADD_FINGER: return "TAMBAH JARI";
    case MENU_DELETE_FINGER: return "HAPUS JARI";
    case MENU_LIST_FINGERS: return "LIST JARI";
    case MENU_SENSOR_STATUS: return "STATUS SENSOR";
    case MENU_SETTINGS: return "PENGATURAN";
    case MENU_WIFI_CONFIG: return "WIFI CONFIG";
    case MENU_SYNC_DATA: return "SYNC DATA";
    case MENU_ABOUT: return "ABOUT";
    default: return "SISTEM";
  }
}