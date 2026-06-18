// attendance-reminder.js - VERSION 1.2 (DENGAN WHATSAPP UTILITY)
// Fitur Pengingat Absensi via WhatsApp untuk semua role
// Mengirim notifikasi jika belum absen lebih dari 5 menit setelah jam masuk
// PERUBAHAN V1.2: 
//   - Menggunakan fungsi sendAttendanceReminder dari whatsapp.js
//   - Pengingat untuk siswa dikirim ke orang tua
//   - Pengingat untuk staff dikirim ke staff yang bersangkutan
//   - Menggunakan WHATSAPP_CONFIG dari config.js
// ============================================================================

let reminderInterval = null;
let reminderInitialized = false;
let alreadyNotifiedToday = new Map(); // Menyimpan siapa yang sudah mendapat notifikasi hari ini
let reminderRetryCount = 0;

// Konfigurasi pengingat
const REMINDER_CONFIG = {
    delayAfterStart: 5,      // 5 menit setelah jam mulai
    checkInterval: 60000,    // Cek setiap 1 menit
    notificationCooldown: 60 * 60 * 1000, // Cooldown 1 jam untuk pengingat ulang
    enabled: true,
    reminderStartHour: 6,    // Mulai cek dari jam 6 pagi
    reminderEndHour: 12      // Stop cek jam 12 siang
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

// ======================= AMBIL DATA USER DENGAN NOMOR WHATSAPP (INDEPENDEN) =======================

/**
 * Mendapatkan semua user yang memiliki nomor WhatsApp dari Firebase (tanpa perlu user login)
 * @returns {Promise<Array>} Daftar user dengan nomor WhatsApp
 */
async function getUsersWithWhatsApp() {
    const usersWithWA = [];
    
    if (typeof db === 'undefined' || !db) {
        console.log('⏳ Firebase not ready yet');
        return [];
    }
    
    try {
        // Ambil semua user auth dari Firebase langsung
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
        
        console.log(`📋 Checking ${filteredUsers.length} users for reminder...`);
        
        for (const user of filteredUsers) {
            let phoneNumber = null;
            let isStaff = false;
            let isStudent = false;
            
            // ========== UNTUK SISWA: cek nomor orang tua ==========
            if (user.role === 'siswa') {
                isStudent = true;
                
                // Cek dari node users (data siswa) untuk parentPhone
                if (user.fpId) {
                    try {
                        const studentSnapshot = await db.ref(`users/${user.fpId}`).once('value');
                        const studentData = studentSnapshot.val();
                        if (studentData) {
                            // Prioritas: parentPhone > noHp
                            if (studentData.parentPhone && studentData.parentPhone !== '-') {
                                phoneNumber = studentData.parentPhone;
                            } else if (studentData.noHp && studentData.noHp !== '-') {
                                phoneNumber = studentData.noHp;
                            }
                        }
                    } catch(e) { console.warn(e); }
                }
                
                // Jika belum dapat, cek dari parent_contacts
                if (!phoneNumber && user.fpId) {
                    try {
                        const parentSnapshot = await db.ref(`parent_contacts/${user.fpId}`).once('value');
                        const parentData = parentSnapshot.val();
                        if (parentData && parentData.phoneNumber) {
                            phoneNumber = parentData.phoneNumber;
                        }
                    } catch(e) { console.warn(e); }
                }
            }
            
            // ========== UNTUK STAFF/GURU: cek nomor staff ==========
            if (user.role !== 'siswa') {
                isStaff = true;
                
                // Cek dari data staff
                if (user.staffId) {
                    try {
                        const staffSnapshot = await db.ref(`staff/${user.staffId}`).once('value');
                        const staffData = staffSnapshot.val();
                        if (staffData && staffData.noHp && staffData.noHp !== '-') {
                            phoneNumber = staffData.noHp;
                        }
                    } catch(e) { console.warn(e); }
                }
                
                // Jika belum dapat, cek dari user auth
                if (!phoneNumber && user.noHp && user.noHp !== '-') {
                    phoneNumber = user.noHp;
                }
                
                // Cek dari staff_contacts (legacy)
                if (!phoneNumber) {
                    try {
                        const staffContactSnapshot = await db.ref(`staff_contacts/${user.staffId || user.uid}`).once('value');
                        const contact = staffContactSnapshot.val();
                        if (contact && contact.phoneNumber) {
                            phoneNumber = contact.phoneNumber;
                        }
                    } catch(e) { console.warn(e); }
                }
            }
            
            // Format nomor
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
                        isStaff: isStaff
                    });
                }
            }
        }
        
        console.log(`📱 Found ${usersWithWA.length} users with WhatsApp number (${usersWithWA.filter(u => u.isStudent).length} students, ${usersWithWA.filter(u => u.isStaff).length} staff)`);
        return usersWithWA;
        
    } catch (error) {
        console.error('Error getting users with WhatsApp:', error);
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
                console.log(`✅ ${user.nama} (${user.role}) sudah absen masuk hari ini`);
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
                console.log(`✅ ${user.nama} (${user.role}) sudah absen masuk hari ini`);
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
⏰ Waktu Sekarang: *${currentTime} WIB*
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
 * Reset notifikasi harian
 */
function resetDailyNotifications() {
    const todayStr = new Date().toISOString().split('T')[0];
    const lastNotifDate = localStorage.getItem('reminder_last_date');
    if (lastNotifDate !== todayStr) {
        alreadyNotifiedToday.clear();
        localStorage.setItem('reminder_last_date', todayStr);
        console.log(`📅 New day (${todayStr}), reset notification tracking`);
    }
}

/**
 * Proses pengingat untuk semua user (INDEPENDEN - tidak perlu user login)
 */
async function processReminders() {
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
    
    // Reset notifikasi harian
    resetDailyNotifications();
    
    // Cek apakah hari ini libur
    const isHoliday = await isTodayHolidayAsync();
    if (isHoliday) {
        console.log('🏖️ Today is holiday, skipping reminder');
        return;
    }
    
    const now = new Date();
    const currentHour = now.getHours();
    
    // Cek jam reminder (hanya antara jam 6-12)
    if (currentHour < REMINDER_CONFIG.reminderStartHour || currentHour > REMINDER_CONFIG.reminderEndHour) {
        console.log(`⏰ Reminder only between ${REMINDER_CONFIG.reminderStartHour}:00 - ${REMINDER_CONFIG.reminderEndHour}:00, current hour: ${currentHour}`);
        return;
    }
    
    const schoolStartTime = await getSchoolStartTimeAsync();
    const [startHour, startMinute] = schoolStartTime.split(':').map(Number);
    
    // Hitung menit setelah jam mulai
    const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();
    const startTotalMinutes = startHour * 60 + startMinute;
    const minutesAfterStart = currentTotalMinutes - startTotalMinutes;
    
    // Cek apakah sudah melebihi delay (5 menit)
    if (minutesAfterStart < REMINDER_CONFIG.delayAfterStart) {
        console.log(`⏳ Not yet time for reminder (${minutesAfterStart}/${REMINDER_CONFIG.delayAfterStart} minutes after start)`);
        return;
    }
    
    console.log(`🔔 Checking reminders at ${now.toLocaleTimeString()} (${minutesAfterStart} minutes after school start)`);
    
    // Dapatkan semua user dengan WhatsApp (langsung dari Firebase)
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
    
    for (const user of users) {
        // Cek apakah sudah dapat notifikasi hari ini
        const notifKey = `${user.uid}_${todayStr}`;
        if (alreadyNotifiedToday.has(notifKey)) {
            alreadyNotifiedCount++;
            continue;
        }
        
        // Cek apakah sudah absen
        const hasCheckedIn = await hasUserCheckedInToday(user);
        if (hasCheckedIn) {
            alreadyAbsentCount++;
            continue;
        }
        
        // ============ KIRIM PENGINGAT VIA WHATSAPP ============
        const minutesLate = minutesAfterStart;
        let success = false;
        
        // Gunakan fungsi sendAttendanceReminder dari whatsapp.js jika tersedia
        if (typeof sendAttendanceReminder === 'function') {
            try {
                const role = user.role === 'siswa' ? 'siswa' : 'staff';
                // Untuk siswa, kirim ke orang tua (nomor sudah di-set di user.phoneNumber)
                // Untuk staff, kirim ke staff itu sendiri
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
            } catch (err) {
                console.error('Error sending reminder via sendAttendanceReminder:', err);
                success = false;
            }
        }
        
        // Fallback: kirim langsung via sendReminderViaWhatsApp
        if (!success) {
            const message = generateReminderMessage(user, schoolStartTime, minutesLate);
            success = await sendReminderViaWhatsApp(user.phoneNumber, message);
        }
        
        if (success) {
            sentCount++;
            alreadyNotifiedToday.set(notifKey, Date.now());
            
            // Catat ke log (jika fungsi tersedia)
            if (typeof window.logActivity === 'function') {
                try {
                    window.logActivity('attendance_reminder', `Kirim pengingat absensi ke ${user.nama} (${user.role}) - terlambat ${minutesLate} menit`);
                } catch(e) { console.warn(e); }
            }
        } else {
            errorCount++;
        }
    }
    
    if (sentCount > 0 || alreadyAbsentCount > 0 || alreadyNotifiedCount > 0) {
        console.log(`📊 Reminder summary: Sent=${sentCount}, AlreadyAbsent=${alreadyAbsentCount}, AlreadyNotified=${alreadyNotifiedCount}, Errors=${errorCount}`);
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
            console.log(`✅ Reminder sent to ${phoneNumber}`);
            return true;
        } else {
            console.error('Send reminder error:', result.error);
            return false;
        }
    } catch (error) {
        console.error('Send reminder error:', error);
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
    
    // Jalankan pertama kali setelah 10 detik
    setTimeout(() => {
        processReminders();
    }, 10000);
    
    // Jalankan secara periodik
    reminderInterval = setInterval(() => {
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
    await processReminders();
    if (typeof window.showToast === 'function') {
        window.showToast('✅ Proses pengingat selesai', 'success');
    }
}

// ======================= INISIALISASI =======================

/**
 * Inisialisasi sistem pengingat (INDEPENDEN - langsung jalan tanpa user login)
 */
function initAttendanceReminder() {
    if (reminderInitialized) {
        console.log('🔔 Attendance reminder already initialized');
        return;
    }
    
    console.log('🔔 Initializing Attendance Reminder System (Independent Mode)...');
    
    // Tunggu Firebase siap
    if (typeof db === 'undefined' || !db) {
        console.log('⏳ Waiting for Firebase...');
        setTimeout(initAttendanceReminder, 1000);
        return;
    }
    
    reminderInitialized = true;
    
    // Start scheduler
    startReminderScheduler();
    
    console.log('✅ Attendance Reminder System initialized (running independently without user login)');
}

/**
 * Cleanup reminder system
 */
function cleanupAttendanceReminder() {
    stopReminderScheduler();
    reminderInitialized = false;
    alreadyNotifiedToday.clear();
    console.log('🧹 Attendance reminder system cleaned up');
}

// ======================= AUTO INITIALIZATION ========================
// Sistem akan langsung berjalan tanpa menunggu user login

function autoInit() {
    if (typeof db !== 'undefined' && db) {
        initAttendanceReminder();
    } else {
        setTimeout(autoInit, 1000);
    }
}

// Mulai auto-inisialisasi
autoInit();

// ======================= EKSPOR KE GLOBAL =======================
window.initAttendanceReminder = initAttendanceReminder;
window.cleanupAttendanceReminder = cleanupAttendanceReminder;
window.triggerManualReminder = triggerManualReminder;
window.getUsersWithWhatsApp = getUsersWithWhatsApp;
window.processReminders = processReminders;

console.log('✅ attendance-reminder.js v1.2 loaded - DENGAN WhatsApp utility! Reminder runs without user login.');