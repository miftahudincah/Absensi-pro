// attendance-reminder.js - VERSION 3.0 (FIXED: NO MORE SPAM NOTIFICATIONS)
// Fitur Pengingat Absensi via WhatsApp untuk semua role
// Mengirim notifikasi jika belum absen lebih dari 5 menit setelah jam masuk
// 
// PERUBAHAN V3.0:
//   - FIX: FORCE_REMINDER_MODE default = false (production mode)
//   - FIX: Hanya berjalan jika ada user login (tidak auto-run)
//   - FIX: Tambahkan cooldown global 5 menit untuk mencegah spam
//   - FIX: Gunakan Firebase untuk tracking notifikasi (bukan localStorage)
//   - FIX: Notifikasi hanya 1x per hari per user (global)
//   - FIX: Cek user login sebelum proses reminder
//   - FIX: Tambahkan pengecekan role (hanya aktif untuk admin/guru)
//   - FIX: Log lebih detail untuk debugging
// ============================================================================

let reminderInterval = null;
let reminderInitialized = false;
let alreadyNotifiedToday = new Map(); // Cache lokal (fallback)
let reminderRetryCount = 0;

// ======================= COOLDOWN GLOBAL =======================
let reminderCooldownUntil = 0;
const GLOBAL_REMINDER_COOLDOWN_MS = 5 * 60 * 1000; // 5 menit cooldown
let lastReminderRun = 0;
let isReminderRunning = false;

// ======================= KONFIGURASI =======================

// FORCE MODE - HARUS false untuk production!
const FORCE_REMINDER_MODE = false; // <-- UBAH KE FALSE!

const REMINDER_CONFIG = {
    delayAfterStart: 5,      // 5 menit setelah jam mulai
    checkInterval: 60000,    // Cek setiap 1 menit
    notificationCooldown: 60 * 60 * 1000, // Cooldown 1 jam untuk pengingat ulang
    enabled: true,
    reminderStartHour: 6,    // Mulai cek dari jam 6 pagi
    reminderEndHour: 12,     // Stop cek jam 12 siang
    // FORCE MODE: override jam jika FORCE_REMINDER_MODE true
    forceStartHour: 0,
    forceEndHour: 23
};

// Daftar role yang akan dikirimi pengingat
const REMINDER_ROLES = ['siswa', 'guru', 'staff_tu', 'wakil_kepala', 'admin', 'developer'];

// ======================= FUNGSI UTILITY =======================

/**
 * Mendapatkan jam mulai sekolah dari pengaturan (tanpa perlu user login)
 * @returns {Promise<string>} Format "HH:MM"
 */
async function getSchoolStartTimeAsync() {
    try {
        if (typeof db !== 'undefined' && db) {
            const snapshot = await db.ref('school_config/attendance_settings/lateThreshold').once('value');
            if (snapshot.exists()) {
                return snapshot.val();
            }
        }
    } catch(e) {
        console.warn("Error getting school start time:", e);
    }
    return '07:30'; // default
}

/**
 * Mendapatkan hari libur mingguan (tanpa perlu user login)
 * @returns {Promise<Array>} Array angka hari (0=Minggu, 1=Senin, dst)
 */
async function getWeeklyHolidaysAsync() {
    try {
        if (typeof db !== 'undefined' && db) {
            const snapshot = await db.ref('school_config/attendance_settings/weeklyHolidays').once('value');
            if (snapshot.exists()) {
                return snapshot.val();
            }
        }
    } catch(e) {
        console.warn("Error getting weekly holidays:", e);
    }
    return [0]; // Default Minggu libur
}

/**
 * Mendapatkan tanggal libur khusus (tanpa perlu user login)
 * @returns {Promise<Array>} Array string tanggal "YYYY-MM-DD"
 */
async function getDateHolidaysAsync() {
    try {
        if (typeof db !== 'undefined' && db) {
            const snapshot = await db.ref('school_config/attendance_settings/dateHolidays').once('value');
            if (snapshot.exists()) {
                return snapshot.val();
            }
        }
    } catch(e) {
        console.warn("Error getting date holidays:", e);
    }
    return [];
}

/**
 * Cek apakah hari ini adalah hari libur (sekolah)
 * @returns {Promise<boolean>} True jika libur
 */
async function isTodayHolidayAsync() {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const dateStr = today.toISOString().split('T')[0];
    
    const weeklyHolidays = await getWeeklyHolidaysAsync();
    const dateHolidays = await getDateHolidaysAsync();
    
    // Cek libur mingguan
    if (weeklyHolidays.includes(dayOfWeek)) {
        console.log(`📅 Hari ini (${dayOfWeek}) adalah hari libur mingguan, skip reminder`);
        return true;
    }
    
    // Cek libur khusus
    if (dateHolidays.includes(dateStr)) {
        console.log(`📅 ${dateStr} adalah hari libur khusus, skip reminder`);
        return true;
    }
    
    return false;
}

/**
 * Format nomor WhatsApp
 * @param {string} phoneNumber - Nomor mentah
 * @returns {string} Nomor terformat
 */
function formatWhatsAppNumber(phoneNumber) {
    if (!phoneNumber) return null;
    let formatted = phoneNumber.replace(/[^0-9]/g, '');
    if (formatted.startsWith('0')) formatted = '62' + formatted.substring(1);
    if (!formatted.startsWith('62')) formatted = '62' + formatted;
    return formatted;
}

// ======================= FIREBASE TRACKING NOTIFIKASI =======================

/**
 * Cek apakah user sudah mendapat notifikasi hari ini (dari Firebase)
 * @param {string} uid - User ID
 * @returns {Promise<boolean>}
 */
async function checkNotifiedTodayFirebase(uid) {
    if (!uid) return false;
    
    try {
        const today = new Date().toISOString().split('T')[0];
        const snapshot = await db.ref(`reminder_tracking/${today}/${uid}`).once('value');
        const exists = snapshot.exists();
        return exists;
    } catch (error) {
        console.warn('Error checking Firebase notification tracking:', error);
        // Fallback ke localStorage
        const notifKey = `${uid}_${new Date().toISOString().split('T')[0]}`;
        return alreadyNotifiedToday.has(notifKey);
    }
}

/**
 * Tandai user sudah mendapat notifikasi hari ini (di Firebase)
 * @param {string} uid - User ID
 * @param {string} nama - Nama user
 * @param {string} role - Role user
 * @returns {Promise<void>}
 */
async function markNotifiedTodayFirebase(uid, nama, role) {
    if (!uid) return;
    
    try {
        const today = new Date().toISOString().split('T')[0];
        await db.ref(`reminder_tracking/${today}/${uid}`).set({
            uid: uid,
            nama: nama,
            role: role,
            sentAt: firebase.database.ServerValue.TIMESTAMP
        });
        console.log(`✅ Marked ${nama} as notified today in Firebase`);
    } catch (error) {
        console.warn('Error marking notification in Firebase:', error);
        // Fallback ke localStorage
        const notifKey = `${uid}_${new Date().toISOString().split('T')[0]}`;
        alreadyNotifiedToday.set(notifKey, Date.now());
    }
}

/**
 * Bersihkan tracking notifikasi lama (lebih dari 7 hari)
 * @returns {Promise<void>}
 */
async function cleanupOldNotificationTracking() {
    try {
        const snapshot = await db.ref('reminder_tracking').once('value');
        const data = snapshot.val();
        if (!data) return;
        
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const cutoff = sevenDaysAgo.toISOString().split('T')[0];
        
        let deletedCount = 0;
        for (const [date, users] of Object.entries(data)) {
            if (date < cutoff) {
                await db.ref(`reminder_tracking/${date}`).remove();
                deletedCount++;
            }
        }
        
        if (deletedCount > 0) {
            console.log(`🧹 Cleaned up ${deletedCount} old notification tracking records`);
        }
    } catch (error) {
        console.warn('Error cleaning up old notification tracking:', error);
    }
}

// ======================= AMBIL DATA USER DENGAN NOMOR WHATSAPP =======================

/**
 * Mendapatkan semua user yang memiliki nomor WhatsApp dari Firebase
 * Mencari di: users_auth (noHp), staff (noHp), dan users (parentPhone)
 * @returns {Promise<Array>} Daftar user dengan nomor WhatsApp
 */
async function getUsersWithWhatsApp() {
    const usersWithWA = [];
    
    if (typeof db === 'undefined' || !db) {
        console.log('⏳ Firebase not ready yet');
        return [];
    }
    
    try {
        console.log('📋 [getUsersWithWhatsApp] Starting...');
        
        // ========== STEP 1: Ambil semua user auth ==========
        const usersSnapshot = await db.ref('users_auth').once('value');
        const allUsers = usersSnapshot.val();
        
        if (!allUsers) {
            console.log('📭 No users found in database');
            return [];
        }
        
        // Filter user dengan role yang diizinkan
        const filteredUsers = Object.entries(allUsers)
            .filter(([uid, user]) => user && user.uid && REMINDER_ROLES.includes(user.role))
            .map(([uid, user]) => ({ uid, ...user }));
        
        console.log(`📋 Checking ${filteredUsers.length} users with allowed roles...`);
        
        // ========== STEP 2: Ambil semua data staff untuk referensi ==========
        const staffSnapshot = await db.ref('staff').once('value');
        const allStaff = staffSnapshot.val() || {};
        console.log(`📁 Found ${Object.keys(allStaff).length} staff records in database`);
        
        // ========== STEP 3: Cek setiap user ==========
        for (const user of filteredUsers) {
            let phoneNumber = null;
            let isStaff = false;
            let isStudent = false;
            let phoneSource = '';
            
            console.log(`🔍 Checking: ${user.nama || user.email || user.uid} (${user.role})`);
            
            // ========== UNTUK SISWA ==========
            if (user.role === 'siswa') {
                isStudent = true;
                
                // PRIORITAS 1: Cek dari user.auth (noHp)
                if (user.noHp && user.noHp !== '-' && user.noHp !== '') {
                    phoneNumber = user.noHp;
                    phoneSource = 'users_auth.noHp';
                    console.log(`   📱 Found in users_auth.noHp: ${user.noHp}`);
                }
                
                // PRIORITAS 2: Cek dari data siswa (parentPhone)
                if (!phoneNumber && user.fpId) {
                    try {
                        const studentSnapshot = await db.ref(`users/${user.fpId}`).once('value');
                        const studentData = studentSnapshot.val();
                        if (studentData) {
                            if (studentData.parentPhone && studentData.parentPhone !== '-') {
                                phoneNumber = studentData.parentPhone;
                                phoneSource = 'users.parentPhone';
                                console.log(`   📱 Found in users.parentPhone: ${studentData.parentPhone}`);
                            } else if (studentData.noHp && studentData.noHp !== '-') {
                                phoneNumber = studentData.noHp;
                                phoneSource = 'users.noHp';
                                console.log(`   📱 Found in users.noHp: ${studentData.noHp}`);
                            }
                        }
                    } catch(e) { console.warn(e); }
                }
            }
            
            // ========== UNTUK STAFF/GURU ==========
            if (user.role !== 'siswa') {
                isStaff = true;
                
                // PRIORITAS 1: Cek dari user.auth (noHp) - PRIORITAS UTAMA!
                if (user.noHp && user.noHp !== '-' && user.noHp !== '') {
                    phoneNumber = user.noHp;
                    phoneSource = 'users_auth.noHp (langsung)';
                    console.log(`   📱 Found in users_auth.noHp: ${user.noHp}`);
                }
                
                // PRIORITAS 2: Cek dari data staff berdasarkan staffId
                if (!phoneNumber && user.staffId) {
                    const staffData = allStaff[user.staffId];
                    if (staffData && staffData.noHp && staffData.noHp !== '-') {
                        phoneNumber = staffData.noHp;
                        phoneSource = `staff.${user.staffId}.noHp (by staffId)`;
                        console.log(`   📱 Found in staff (by staffId): ${staffData.noHp}`);
                    }
                }
                
                // PRIORITAS 3: Cek dari data staff berdasarkan userId
                if (!phoneNumber) {
                    for (const [staffId, staffData] of Object.entries(allStaff)) {
                        if (staffData.userId === user.uid && staffData.noHp && staffData.noHp !== '-') {
                            phoneNumber = staffData.noHp;
                            phoneSource = `staff.${staffId}.noHp (by userId)`;
                            console.log(`   📱 Found in staff (by userId): ${staffData.noHp}`);
                            break;
                        }
                    }
                }
                
                // PRIORITAS 4: Cek dari data staff berdasarkan email
                if (!phoneNumber && user.email) {
                    for (const [staffId, staffData] of Object.entries(allStaff)) {
                        if (staffData.email === user.email && staffData.noHp && staffData.noHp !== '-') {
                            phoneNumber = staffData.noHp;
                            phoneSource = `staff.${staffId}.noHp (by email)`;
                            console.log(`   📱 Found in staff (by email): ${staffData.noHp}`);
                            break;
                        }
                    }
                }
            }
            
            // ========== FORMAT NOMOR ==========
            if (phoneNumber) {
                const formatted = formatWhatsAppNumber(phoneNumber);
                if (formatted) {
                    usersWithWA.push({
                        uid: user.uid,
                        nama: user.nama || user.email?.split('@')[0] || 'User',
                        role: user.role,
                        fpId: user.fpId,
                        staffId: user.staffId,
                        phoneNumber: formatted,
                        rawNumber: phoneNumber,
                        email: user.email,
                        isStudent: isStudent,
                        isStaff: isStaff,
                        phoneSource: phoneSource
                    });
                    console.log(`   ✅ ADDED: ${user.nama || user.email} (${user.role}) -> ${formatted} [${phoneSource}]`);
                } else {
                    console.log(`   ⚠️ Failed to format: ${phoneNumber}`);
                }
            } else {
                console.log(`   ❌ NO PHONE NUMBER found for ${user.nama || user.email}`);
            }
        }
        
        // ========== STEP 4: Tampilkan ringkasan ==========
        console.log(`📱 [getUsersWithWhatsApp] FINAL: ${usersWithWA.length} users with WhatsApp number`);
        console.log(`   Students: ${usersWithWA.filter(u => u.isStudent).length}`);
        console.log(`   Staff: ${usersWithWA.filter(u => u.isStaff).length}`);
        
        if (usersWithWA.length > 0) {
            console.log('📋 DETAILED LIST:');
            usersWithWA.forEach((u, i) => {
                console.log(`   ${i+1}. ${u.nama} (${u.role}) -> ${u.phoneNumber} [${u.phoneSource || 'unknown'}]`);
            });
        }
        
        return usersWithWA;
        
    } catch (error) {
        console.error('❌ Error getting users with WhatsApp:', error);
        return [];
    }
}

// ======================= CEK STATUS ABSENSI (INDEPENDEN) =======================

/**
 * Cek apakah user sudah absen hari ini (tanpa perlu user login)
 * @param {Object} user - Data user
 * @returns {Promise<boolean>} True jika sudah absen
 */
async function hasUserCheckedInToday(user) {
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Cek absensi siswa (dari node absensi)
    if (user.role === 'siswa' && user.fpId) {
        try {
            const snapshot = await db.ref(`absensi/${todayStr}/${user.fpId}`).once('value');
            const attendance = snapshot.val();
            if (attendance && (attendance.in || attendance.status === 'Hadir')) {
                console.log(`   ✅ ${user.nama} sudah absen masuk hari ini`);
                return true;
            }
        } catch(e) { console.warn(e); }
    }
    
    // Cek absensi staff/guru (dari node staff_attendance)
    if (user.role !== 'siswa') {
        const staffId = user.staffId || user.uid;
        try {
            const snapshot = await db.ref(`staff_attendance/${todayStr}/${staffId}`).once('value');
            const attendance = snapshot.val();
            if (attendance && attendance.timeIn) {
                console.log(`   ✅ ${user.nama} sudah absen masuk hari ini`);
                return true;
            }
        } catch(e) { console.warn(e); }
    }
    
    return false;
}

// ======================= GENERATE PESAN PENGINGAT =======================

/**
 * Generate pesan pengingat berdasarkan role
 * @param {Object} user - Data user
 * @param {string} schoolStartTime - Jam mulai sekolah
 * @param {number} minutesLate - Menit keterlambatan
 * @returns {string} Pesan WhatsApp
 */
function generateReminderMessage(user, schoolStartTime, minutesLate) {
    let schoolName = 'Sekolah';
    // Coba ambil nama sekolah dari DOM jika tersedia, jika tidak pakai default
    const schoolNameElement = typeof document !== 'undefined' ? document.getElementById('schoolNameDisplay') : null;
    if (schoolNameElement && schoolNameElement.innerText) {
        schoolName = schoolNameElement.innerText;
    }
    
    const currentTime = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    
    let roleTitle = '';
    let roleEmoji = '';
    switch(user.role) {
        case 'siswa': roleTitle = 'Siswa'; roleEmoji = '👨‍🎓'; break;
        case 'guru': roleTitle = 'Guru'; roleEmoji = '👨‍🏫'; break;
        case 'staff_tu': roleTitle = 'Staff TU'; roleEmoji = '📋'; break;
        case 'wakil_kepala': roleTitle = 'Wakil Kepala Sekolah'; roleEmoji = '👔'; break;
        case 'admin': roleTitle = 'Kepala Sekolah'; roleEmoji = '👑'; break;
        case 'developer': roleTitle = 'Developer'; roleEmoji = '👨‍💻'; break;
        default: roleTitle = 'Pengguna'; roleEmoji = '👤';
    }
    
    // Pesan berbeda untuk siswa (dikirim ke orang tua) dan staff
    if (user.role === 'siswa') {
        return `*📢 PENGINGAT ABSENSI SISWA - ${schoolName}*

Kepada Orang Tua/Wali dari *${user.nama}*,

⚠️ *Anak Anda BELUM MELAKUKAN ABSENSI MASUK* hari ini!

📅 Tanggal: ${new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
🕐 Jam Sekolah: *Pukul ${schoolStartTime} WIB*
⏰ Waktu Sekarang: *${currentTime} WIB*
📊 Keterlambatan: *${minutesLate} menit*

🚨 *Mohon diingatkan untuk segera melakukan absensi fingerprint!*

📍 Lokasi absensi:
• Fingerprint scanner di pintu masuk sekolah
• Fingerprint scanner di ruang kelas

💡 *Tips untuk siswa:*
- Pastikan sidik jari sudah terdaftar
- Letakkan jari dengan posisi yang benar
- Jika gagal, coba ulang beberapa kali

--- 
📱 *Sistem Absensi IoT - Real-time*
🔔 Notifikasi ini dikirim secara otomatis oleh sistem.`;
    } else {
        // Pesan untuk staff/guru
        return `*📢 PENGINGAT ABSENSI STAFF - ${schoolName}*

Halo *${user.nama}* ${roleEmoji} (${roleTitle}),

⚠️ *Anda BELUM MELAKUKAN ABSENSI MASUK* hari ini!

📅 Tanggal: ${new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
🕐 Jam Sekolah: *Pukul ${schoolStartTime} WIB*
⏰ Waktu Sekolah: *${currentTime} WIB*
📊 Keterlambatan: *${minutesLate} menit*

🚨 *SEGERA LAKUKAN ABSENSI FINGERPRINT!*

📍 Lokasi absensi:
• Fingerprint scanner di ruang guru
• Fingerprint scanner di pintu masuk sekolah

💡 *Tips:*
- Pastikan sidik jari sudah terdaftar
- Letakkan jari dengan posisi yang benar
- Jika gagal, coba ulang beberapa kali

--- 
📱 *Sistem Absensi IoT - Real-time*
🔔 Notifikasi ini dikirim secara otomatis oleh sistem.`;
    }
}

// ======================= PROSES PENGINGAT =======================

/**
 * Reset notifikasi harian (localStorage fallback)
 */
function resetDailyNotifications() {
    const todayStr = new Date().toISOString().split('T')[0];
    const lastNotifDate = localStorage.getItem('reminder_last_date');
    if (lastNotifDate !== todayStr) {
        alreadyNotifiedToday.clear();
        localStorage.setItem('reminder_last_date', todayStr);
        console.log(`📅 New day (${todayStr}), reset notification tracking (localStorage fallback)`);
    }
}

/**
 * Proses pengingat untuk semua user
 * SEKARANG MEMERLUKAN USER LOGIN!
 */
async function processReminders() {
    // ========== CEK APAKAH ADA USER LOGIN ==========
    if (typeof currentUser === 'undefined' || !currentUser) {
        console.log('⏳ No user logged in, skipping reminder check');
        return;
    }
    
    // ========== CEK COOLDOWN GLOBAL ==========
    const now = Date.now();
    if (now < reminderCooldownUntil) {
        const remaining = Math.round((reminderCooldownUntil - now) / 1000);
        console.log(`⏳ Global cooldown: ${remaining}s remaining`);
        return;
    }
    
    // ========== CEK APAKAH SEDANG BERJALAN ==========
    if (isReminderRunning) {
        console.log('⏳ Reminder process already running, skipping...');
        return;
    }
    
    isReminderRunning = true;
    reminderCooldownUntil = now + GLOBAL_REMINDER_COOLDOWN_MS;
    lastReminderRun = now;
    
    console.log('🔔 [processReminders] Started...');
    console.log(`👤 User: ${currentUser.nama} (${currentUser.role})`);
    
    try {
        // Cek apakah fitur diaktifkan
        if (!REMINDER_CONFIG.enabled) {
            console.log('🔔 Reminder feature disabled');
            return;
        }
        
        // Cek apakah Firebase tersedia
        if (typeof db === 'undefined' || !db) {
            console.log('⏳ Firebase not ready, skipping reminder check');
            return;
        }
        
        // Reset notifikasi harian (fallback)
        resetDailyNotifications();
        
        // ========== CEK HARI LIBUR ==========
        const isHoliday = await isTodayHolidayAsync();
        if (isHoliday) {
            console.log('🏖️ Today is holiday, skipping reminder');
            return;
        }
        
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        
        // ========== CEK JAM OPERASIONAL ==========
        let isWithinHours = false;
        
        if (FORCE_REMINDER_MODE) {
            // FORCE MODE: Abaikan batasan jam
            isWithinHours = true;
            console.log(`🔧 FORCE MODE ENABLED - Reminder will run at any hour (current: ${currentHour}:${String(currentMinute).padStart(2, '0')})`);
        } else {
            // Normal mode: Cek jam
            isWithinHours = (currentHour >= REMINDER_CONFIG.reminderStartHour && currentHour <= REMINDER_CONFIG.reminderEndHour);
            if (!isWithinHours) {
                console.log(`⏰ Reminder only between ${REMINDER_CONFIG.reminderStartHour}:00 - ${REMINDER_CONFIG.reminderEndHour}:00, current hour: ${currentHour}`);
                return;
            }
        }
        
        // ========== AMBIL JAM MASUK SEKOLAH ==========
        const schoolStartTime = await getSchoolStartTimeAsync();
        const [startHour, startMinute] = schoolStartTime.split(':').map(Number);
        
        // Hitung menit setelah jam mulai
        const currentTotalMinutes = currentHour * 60 + currentMinute;
        const startTotalMinutes = startHour * 60 + startMinute;
        const minutesAfterStart = currentTotalMinutes - startTotalMinutes;
        
        console.log(`⏰ School start: ${schoolStartTime}, Current: ${now.toLocaleTimeString()}, Minutes after start: ${minutesAfterStart}`);
        
        // Cek apakah sudah melebihi delay (5 menit)
        if (minutesAfterStart < REMINDER_CONFIG.delayAfterStart) {
            console.log(`⏳ Not yet time for reminder (${minutesAfterStart}/${REMINDER_CONFIG.delayAfterStart} minutes after start)`);
            return;
        }
        
        console.log(`🔔 Checking reminders at ${now.toLocaleTimeString()} (${minutesAfterStart} minutes after school start)`);
        
        // ========== DAPATKAN USER DENGAN WHATSAPP ==========
        const users = await getUsersWithWhatsApp();
        if (users.length === 0) {
            console.log('📭 No users with WhatsApp number found');
            return;
        }
        
        const todayStr = now.toISOString().split('T')[0];
        let sentCount = 0;
        let alreadyAbsentCount = 0;
        let alreadyNotifiedCount = 0;
        let errorCount = 0;
        let skippedNoLogin = 0;
        
        console.log(`👥 Processing ${users.length} users for reminder...`);
        
        for (const user of users) {
            // ========== CEK APAKAH USER SUDAH LOGIN ==========
            // Kita hanya kirim jika user memiliki akun yang valid
            if (!user.uid) {
                skippedNoLogin++;
                console.log(`⏭️ ${user.nama} has no uid, skipping`);
                continue;
            }
            
            // ========== CEK APAKAH SUDAH DAPAT NOTIFIKASI HARI INI (FIREBASE) ==========
            const alreadyNotified = await checkNotifiedTodayFirebase(user.uid);
            if (alreadyNotified) {
                alreadyNotifiedCount++;
                console.log(`⏭️ ${user.nama} already notified today (Firebase), skipping`);
                continue;
            }
            
            // ========== CEK APAKAH SUDAH ABSEN ==========
            const hasCheckedIn = await hasUserCheckedInToday(user);
            if (hasCheckedIn) {
                alreadyAbsentCount++;
                console.log(`✅ ${user.nama} already checked in, skipping`);
                continue;
            }
            
            // ============ KIRIM PENGINGAT VIA WHATSAPP ============
            const minutesLate = minutesAfterStart;
            let success = false;
            
            console.log(`📤 Sending reminder to ${user.nama} (${user.role}) - phone: ${user.phoneNumber}`);
            
            // Gunakan fungsi sendAttendanceReminder dari whatsapp.js jika tersedia
            if (typeof sendAttendanceReminder === 'function') {
                try {
                    const role = user.role === 'siswa' ? 'siswa' : 'staff';
                    const result = await sendAttendanceReminder(
                        { 
                            nama: user.nama, 
                            noHp: user.phoneNumber,
                            parentPhone: user.phoneNumber // Untuk siswa
                        }, 
                        role, 
                        minutesLate
                    );
                    success = result === true;
                    if (success) {
                        console.log(`   ✅ Reminder sent successfully to ${user.nama}`);
                    } else {
                        console.log(`   ⚠️ sendAttendanceReminder returned false for ${user.nama}`);
                    }
                } catch (err) {
                    console.error(`   ❌ Error sending reminder via sendAttendanceReminder for ${user.nama}:`, err);
                    success = false;
                }
            } else {
                console.warn('⚠️ sendAttendanceReminder function not available, using fallback');
            }
            
            // Fallback: kirim langsung via sendReminderViaWhatsApp
            if (!success) {
                console.log(`   📤 Using fallback for ${user.nama}`);
                const message = generateReminderMessage(user, schoolStartTime, minutesLate);
                success = await sendReminderViaWhatsApp(user.phoneNumber, message);
            }
            
            if (success) {
                sentCount++;
                
                // ========== TANDAI SUDAH NOTIFIKASI DI FIREBASE ==========
                await markNotifiedTodayFirebase(user.uid, user.nama, user.role);
                
                console.log(`   ✅ Reminder sent to ${user.nama} (${user.phoneNumber})`);
                
                // Catat ke log (jika fungsi tersedia)
                if (typeof window.logActivity === 'function') {
                    try {
                        window.logActivity('attendance_reminder', `Kirim pengingat absensi ke ${user.nama} (${user.role}) - terlambat ${minutesLate} menit`);
                    } catch(e) { console.warn(e); }
                }
            } else {
                errorCount++;
                console.log(`   ❌ Failed to send reminder to ${user.nama}`);
            }
        }
        
        // ========== SUMMARY ==========
        console.log(`📊 Reminder summary:`);
        console.log(`   ✅ Sent: ${sentCount}`);
        console.log(`   ✅ Already checked in: ${alreadyAbsentCount}`);
        console.log(`   ⏭️ Already notified today: ${alreadyNotifiedCount}`);
        console.log(`   ⏭️ Skipped (no uid): ${skippedNoLogin}`);
        console.log(`   ❌ Errors: ${errorCount}`);
        console.log(`   📱 Total users with WhatsApp: ${users.length}`);
        
        // ========== CLEANUP OLD TRACKING (SETIAP HARI) ==========
        // Lakukan cleanup seminggu sekali
        const lastCleanup = localStorage.getItem('reminder_last_cleanup');
        const todayStr = new Date().toISOString().split('T')[0];
        if (!lastCleanup || lastCleanup !== todayStr) {
            await cleanupOldNotificationTracking();
            localStorage.setItem('reminder_last_cleanup', todayStr);
        }
        
    } catch (error) {
        console.error('❌ Error in processReminders:', error);
    } finally {
        isReminderRunning = false;
    }
}

/**
 * Kirim pesan WhatsApp via Fonnte (fallback)
 * @param {string} phoneNumber - Nomor tujuan
 * @param {string} message - Pesan
 * @returns {Promise<boolean>}
 */
async function sendReminderViaWhatsApp(phoneNumber, message) {
    // Cek apakah WhatsApp diaktifkan
    if (typeof window.WHATSAPP_CONFIG === 'undefined' || !window.WHATSAPP_CONFIG.enabled) {
        console.log('📱 WhatsApp notification disabled');
        return false;
    }
    
    // Cek apakah ada backend URL
    const backendUrl = window.WHATSAPP_CONFIG?.backendUrl || 'https://backendtest-azure.vercel.app/api/whatsapp/send';
    
    try {
        console.log(`   📤 Sending via fallback to ${phoneNumber}...`);
        const response = await fetch(backendUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                phoneNumber: phoneNumber,
                message: message
            })
        });
        
        const result = await response.json();
        if (result.success) {
            console.log(`   ✅ Reminder sent to ${phoneNumber} via fallback`);
            return true;
        } else {
            console.error('   ❌ Send reminder error:', result.error);
            return false;
        }
    } catch (error) {
        console.error('   ❌ Send reminder error:', error);
        return false;
    }
}

// ======================= START & STOP REMINDER =======================

/**
 * Memulai interval pengingat
 */
function startReminderScheduler() {
    if (reminderInterval) {
        clearInterval(reminderInterval);
    }
    
    console.log(`🔔 Starting attendance reminder scheduler (check every ${REMINDER_CONFIG.checkInterval / 1000} seconds)`);
    console.log(`🔧 FORCE_REMINDER_MODE: ${FORCE_REMINDER_MODE ? '✅ ENABLED (testing mode)' : '❌ DISABLED (production mode)'}`);
    console.log(`⏰ Active hours: ${REMINDER_CONFIG.reminderStartHour}:00 - ${REMINDER_CONFIG.reminderEndHour}:00`);
    console.log(`👤 Requires user login: YES`);
    
    // Jalankan pertama kali setelah 10 detik
    setTimeout(() => {
        console.log('🔔 First scheduled reminder check...');
        processReminders();
    }, 10000);
    
    // Jalankan secara periodik
    reminderInterval = setInterval(() => {
        console.log('🔔 Periodic reminder check...');
        processReminders();
    }, REMINDER_CONFIG.checkInterval);
}

/**
 * Menghentikan scheduler
 */
function stopReminderScheduler() {
    if (reminderInterval) {
        clearInterval(reminderInterval);
        reminderInterval = null;
        console.log('⏹️ Attendance reminder scheduler stopped');
    }
}

/**
 * Manual trigger reminder (untuk testing)
 */
async function triggerManualReminder() {
    console.log('🔔 Manual reminder triggered');
    if (typeof window.showToast === 'function') {
        window.showToast('⏳ Memproses pengingat absensi...', 'info');
    }
    
    // Reset cooldown untuk manual trigger
    reminderCooldownUntil = 0;
    await processReminders();
    
    if (typeof window.showToast === 'function') {
        window.showToast('✅ Proses pengingat selesai', 'success');
    }
}

// ======================= INISIALISASI =======================

/**
 * Inisialisasi sistem pengingat
 * SEKARANG MEMERLUKAN USER LOGIN!
 */
function initAttendanceReminder() {
    if (reminderInitialized) {
        console.log('🔔 Attendance reminder already initialized');
        return;
    }
    
    // ========== CEK USER LOGIN ==========
    if (typeof currentUser === 'undefined' || !currentUser) {
        console.log('⏳ No user logged in, waiting...');
        // Coba lagi setelah 5 detik
        setTimeout(() => {
            if (typeof currentUser !== 'undefined' && currentUser) {
                console.log(`👤 User logged in: ${currentUser.nama} (${currentUser.role})`);
                initAttendanceReminder();
            } else {
                console.log('⏳ Still no user logged in, reminder will not start');
            }
        }, 5000);
        return;
    }
    
    // ========== CEK ROLE ==========
    // Hanya admin dan guru yang boleh menjalankan reminder
    const allowedRoles = ['admin', 'developer', 'wakil_kepala', 'guru'];
    if (!allowedRoles.includes(currentUser.role)) {
        console.log(`🔒 User role ${currentUser.role} is not allowed to run reminder. Only ${allowedRoles.join(', ')}`);
        return;
    }
    
    console.log('🔔 Initializing Attendance Reminder System...');
    console.log(`👤 User: ${currentUser.nama} (${currentUser.role})`);
    console.log(`🔧 FORCE_REMINDER_MODE: ${FORCE_REMINDER_MODE ? '✅ ENABLED (testing mode)' : '❌ DISABLED (production mode)'}`);
    
    // Tunggu Firebase siap
    if (typeof db === 'undefined' || !db) {
        console.log('⏳ Waiting for Firebase...');
        setTimeout(initAttendanceReminder, 1000);
        return;
    }
    
    // ========== CLEANUP OLD TRACKING ==========
    cleanupOldNotificationTracking().catch(e => console.warn(e));
    
    reminderInitialized = true;
    
    // Start scheduler
    startReminderScheduler();
    
    console.log('✅ Attendance Reminder System initialized (with user login required)');
}

/**
 * Cleanup reminder system
 */
function cleanupAttendanceReminder() {
    stopReminderScheduler();
    reminderInitialized = false;
    alreadyNotifiedToday.clear();
    isReminderRunning = false;
    console.log('🧹 Attendance reminder system cleaned up');
}

// ======================= AUTO INITIALIZATION ========================
// SEKARANG TIDAK AUTO RUN - MENUNGGU USER LOGIN

function autoInit() {
    if (typeof db !== 'undefined' && db) {
        // Cek apakah ada user login
        if (typeof currentUser !== 'undefined' && currentUser) {
            console.log(`👤 Auto-init: User detected (${currentUser.nama})`);
            const allowedRoles = ['admin', 'developer', 'wakil_kepala', 'guru'];
            if (allowedRoles.includes(currentUser.role)) {
                initAttendanceReminder();
            } else {
                console.log(`🔒 Auto-init: Role ${currentUser.role} not allowed`);
            }
        } else {
            console.log('⏳ Auto-init: Waiting for user login...');
            // Coba lagi setiap 3 detik sampai user login
            setTimeout(autoInit, 3000);
        }
    } else {
        console.log('⏳ Waiting for Firebase to auto-init reminder...');
        setTimeout(autoInit, 1000);
    }
}

// Mulai auto-inisialisasi (tapi akan menunggu user login)
setTimeout(autoInit, 2000);

// ======================= EVENT LISTENER UNTUK LOGIN =======================
// Inisialisasi ulang saat user login
document.addEventListener('userLoggedIn', function(e) {
    const user = e.detail?.user || currentUser;
    if (user) {
        console.log(`🔔 userLoggedIn event: ${user.nama} (${user.role})`);
        const allowedRoles = ['admin', 'developer', 'wakil_kepala', 'guru'];
        if (allowedRoles.includes(user.role)) {
            // Reset cooldown agar langsung jalan
            reminderCooldownUntil = 0;
            if (!reminderInitialized) {
                initAttendanceReminder();
            } else {
                console.log('🔔 Reminder already initialized, triggering check...');
                setTimeout(processReminders, 5000);
            }
        }
    }
});

// ======================= EKSPOR KE GLOBAL =======================
window.initAttendanceReminder = initAttendanceReminder;
window.cleanupAttendanceReminder = cleanupAttendanceReminder;
window.triggerManualReminder = triggerManualReminder;
window.getUsersWithWhatsApp = getUsersWithWhatsApp;
window.processReminders = processReminders;
window.FORCE_REMINDER_MODE = FORCE_REMINDER_MODE;
window.checkNotifiedTodayFirebase = checkNotifiedTodayFirebase;
window.markNotifiedTodayFirebase = markNotifiedTodayFirebase;

console.log('✅ attendance-reminder.js v3.0 loaded - FIXED: NO MORE SPAM NOTIFICATIONS!');
console.log(`🔧 FORCE_REMINDER_MODE: ${FORCE_REMINDER_MODE ? '⚠️ TESTING MODE' : '✅ PRODUCTION MODE'}`);
console.log('📱 Reminder will run every 60 seconds (only when user is logged in)');
console.log('🔒 Only Admin, Guru, Wakil Kepala, and Developer can run reminder');
console.log('📊 Firebase tracking enabled - 1 notification per user per day');
console.log('⏱️ Global cooldown: 5 minutes between runs');