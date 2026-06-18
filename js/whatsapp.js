// whatsapp.js - VERSION 1.0
// Utility untuk mengirim WhatsApp via Backend
// ============================================================================

/**
 * Kirim pesan WhatsApp via backend
 * @param {string} phoneNumber - Nomor tujuan (format: 628xxxx)
 * @param {string} message - Pesan yang akan dikirim
 * @param {string} type - Tipe notifikasi (check_in, check_out, reminder, late)
 * @returns {Promise<{success: boolean, error: string}>}
 */
async function sendWhatsAppMessage(phoneNumber, message, type = 'general') {
    // Validasi nomor
    if (!phoneNumber) {
        console.warn('❌ No phone number provided');
        return { success: false, error: 'No phone number' };
    }
    
    // Format nomor
    let formattedNumber = phoneNumber.replace(/[^0-9]/g, '');
    if (formattedNumber.startsWith('0')) {
        formattedNumber = '62' + formattedNumber.substring(1);
    }
    if (!formattedNumber.startsWith('62')) {
        formattedNumber = '62' + formattedNumber;
    }
    
    // Cek konfigurasi
    if (typeof WHATSAPP_CONFIG === 'undefined' || !WHATSAPP_CONFIG.enabled) {
        console.log('📱 WhatsApp notifications disabled');
        return { success: false, error: 'WhatsApp disabled' };
    }
    
    // Log
    console.log(`📤 Sending WhatsApp to ${formattedNumber} (${type})...`);
    
    try {
        const response = await fetch(WHATSAPP_CONFIG.backendUrl || 'https://backendtest-azure.vercel.app/api/whatsapp/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                phoneNumber: formattedNumber,
                message: message
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            console.log(`✅ WhatsApp sent to ${formattedNumber}`);
            // Log activity
            if (typeof logActivity === 'function') {
                logActivity('whatsapp_sent', `${type} - ${phoneNumber.substring(0, 4)}****`);
            }
            return { success: true, data: data.data };
        } else {
            console.error('❌ WhatsApp send failed:', data.error);
            return { success: false, error: data.error || 'Unknown error' };
        }
    } catch (error) {
        console.error('❌ WhatsApp send error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Kirim notifikasi absen masuk ke orang tua siswa
 * @param {object} student - Data siswa
 * @param {string} time - Waktu absen
 * @param {string} status - Status (Hadir, Terlambat)
 */
async function sendParentCheckInNotification(student, time, status = 'Hadir') {
    const phoneNumber = student.parentPhone || student.noHp;
    if (!phoneNumber) {
        console.warn(`⚠️ No parent phone for student ${student.nama}`);
        return false;
    }
    
    const schoolName = document.getElementById('schoolNameDisplay')?.innerText || 'Sekolah';
    const statusText = status === 'Terlambat' ? '⚠️ TERLAMBAT' : '✅ TEPAT WAKTU';
    
    const message = `*📋 NOTIFIKASI ABSENSI MASUK - ${schoolName}*

👨‍🎓 *Siswa:* ${student.nama}
🆔 *ID:* ${student.id}
📚 *Kelas:* ${student.kelas} - ${student.jurusan}
📅 *Tanggal:* ${new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
🕐 *Jam Masuk:* ${time} WIB
${status === 'Terlambat' ? '⚠️ *Status: TERLAMBAT*' : '✅ *Status: TEPAT WAKTU*'}

--- 
📱 *Sistem Absensi IoT*
🔔 Notifikasi ini dikirim secara otomatis.`;
    
    const result = await sendWhatsAppMessage(phoneNumber, message, 'check_in');
    return result.success;
}

/**
 * Kirim notifikasi absen pulang ke orang tua siswa
 */
async function sendParentCheckOutNotification(student, timeIn, timeOut) {
    const phoneNumber = student.parentPhone || student.noHp;
    if (!phoneNumber) {
        console.warn(`⚠️ No parent phone for student ${student.nama}`);
        return false;
    }
    
    const schoolName = document.getElementById('schoolNameDisplay')?.innerText || 'Sekolah';
    
    const message = `*🏠 NOTIFIKASI ABSENSI PULANG - ${schoolName}*

👨‍🎓 *Siswa:* ${student.nama}
🆔 *ID:* ${student.id}
📚 *Kelas:* ${student.kelas} - ${student.jurusan}
📅 *Tanggal:* ${new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
🕐 *Jam Masuk:* ${timeIn} WIB
🏠 *Jam Pulang:* ${timeOut} WIB

✅ *Siswa sudah pulang dengan selamat.*

--- 
📱 *Sistem Absensi IoT*
🔔 Notifikasi ini dikirim secara otomatis.`;
    
    const result = await sendWhatsAppMessage(phoneNumber, message, 'check_out');
    return result.success;
}

/**
 * Kirim notifikasi absensi staff
 */
async function sendStaffAttendanceNotification(staff, time, type = 'masuk') {
    const phoneNumber = staff.noHp;
    if (!phoneNumber || phoneNumber === '-') {
        console.warn(`⚠️ No phone for staff ${staff.nama}`);
        return false;
    }
    
    const schoolName = document.getElementById('schoolNameDisplay')?.innerText || 'Sekolah';
    const typeText = type === 'masuk' ? 'MASUK' : 'PULANG';
    const icon = type === 'masuk' ? '📥' : '🏠';
    
    const message = `*${icon} NOTIFIKASI ABSENSI STAFF - ${schoolName}*

👤 *Staff:* ${staff.nama}
🆔 *ID:* ${staff.id}
📋 *Jabatan:* ${staff.jabatan || '-'}
📅 *Tanggal:* ${new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
🕐 *Jam ${typeText}:* ${time} WIB

✅ *Absensi ${typeText} berhasil dicatat.*

--- 
📱 *Sistem Absensi IoT*
🔔 Notifikasi ini dikirim secara otomatis.`;
    
    const result = await sendWhatsAppMessage(phoneNumber, message, `staff_${type}`);
    return result.success;
}

/**
 * Kirim pengingat absensi (umum)
 */
async function sendAttendanceReminder(user, role, minutesLate) {
    const phoneNumber = user.noHp || user.parentPhone;
    if (!phoneNumber) {
        console.warn(`⚠️ No phone for ${user.nama}`);
        return false;
    }
    
    const schoolName = document.getElementById('schoolNameDisplay')?.innerText || 'Sekolah';
    const roleText = role === 'siswa' ? 'Siswa' : 'Staff';
    
    const message = `*🔔 PENGINGAT ABSENSI - ${schoolName}*

Halo *${user.nama}* (${roleText}),

⚠️ *Anda BELUM melakukan absensi ${role === 'siswa' ? 'masuk' : ''}* hari ini!
⏰ Sudah *${minutesLate} menit* sejak jam masuk.

📅 Tanggal: ${new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

*🚨 SEGERA LAKUKAN ABSENSI!*

📍 Lokasi:
• ${role === 'siswa' ? 'Ruang kelas / Fingerprint scanner' : 'Ruang guru / Fingerprint scanner'}

--- 
📱 *Sistem Absensi IoT*
🔔 Notifikasi ini dikirim secara otomatis.`;
    
    const result = await sendWhatsAppMessage(phoneNumber, message, 'reminder');
    return result.success;
}

// Ekspor ke global
window.sendWhatsAppMessage = sendWhatsAppMessage;
window.sendParentCheckInNotification = sendParentCheckInNotification;
window.sendParentCheckOutNotification = sendParentCheckOutNotification;
window.sendStaffAttendanceNotification = sendStaffAttendanceNotification;
window.sendAttendanceReminder = sendAttendanceReminder;

console.log('✅ whatsapp.js loaded - WhatsApp notification utilities ready');