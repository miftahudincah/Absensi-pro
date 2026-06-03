// whatsapp-notif.js - VERSION 1.0
// WhatsApp Gateway Integration untuk notifikasi absensi
// Support: Fonnte API, WABA, Wati
// ============================================================================

let whatsappInitialized = false;
let pendingNotificationQueue = [];
let isProcessingQueue = false;

// ======================= KONFIGURASI =======================

const NOTIF_TEMPLATES = {
    check_in: {
        title: '✅ Anak Anda Telah Masuk Sekolah',
        body: (studentName, time, status) => {
            if (status === 'terlambat') {
                return `*${studentName}* telah masuk sekolah pada pukul *${time}*.\n\n⚠️ *TERLAMBAT!* Mohon perhatikan jam kedatangan anak Anda.`;
            }
            return `*${studentName}* telah masuk sekolah pada pukul *${time}*.\n\nSemangat belajar! 📚`;
        }
    },
    check_out: {
        title: '🏠 Anak Anda Telah Pulang',
        body: (studentName, time) => {
            return `*${studentName}* telah pulang sekolah pada pukul *${time}*.\n\nSemoga sampai rumah dengan selamat. 🏡`;
        }
    },
    alpha: {
        title: '⚠️ Peringatan: Anak Tidak Masuk Sekolah',
        body: (studentName, date) => {
            return `*${studentName}* TIDAK HADIR pada tanggal *${date}* tanpa keterangan.\n\nMohon konfirmasi ke wali kelas untuk informasi lebih lanjut.`;
        }
    },
    izin: {
        title: '📝 Konfirmasi Izin Diterima',
        body: (studentName, type, date) => {
            const typeText = type === 'sakit' ? 'Sakit' : 'Izin';
            return `Izin *${typeText}* untuk *${studentName}* pada tanggal *${date}* telah disetujui.\n\nTerima kasih atas informasinya.`;
        }
    }
};

// ======================= CEK STATUS ORANG TUA =======================

/**
 * Mendapatkan nomor WhatsApp orang tua siswa
 * @param {string|number} studentId - ID siswa
 * @returns {Promise<string|null>} Nomor WhatsApp
 */
async function getParentWhatsAppNumber(studentId) {
    try {
        // Cari di database parent_contacts
        const snapshot = await db.ref(`parent_contacts/${studentId}`).once('value');
        const parentData = snapshot.val();
        
        if (parentData && parentData.phoneNumber) {
            // Format nomor: hapus '+', spasi, strip
            let phone = parentData.phoneNumber.replace(/[^0-9]/g, '');
            if (phone.startsWith('0')) phone = '62' + phone.substring(1);
            if (!phone.startsWith('62')) phone = '62' + phone;
            return phone;
        }
        
        // Fallback: cari dari data siswa (field wa_ortu)
        const studentSnapshot = await db.ref(`users/${studentId}`).once('value');
        const student = studentSnapshot.val();
        if (student && student.wa_ortu) {
            let phone = student.wa_ortu.replace(/[^0-9]/g, '');
            if (phone.startsWith('0')) phone = '62' + phone.substring(1);
            if (!phone.startsWith('62')) phone = '62' + phone;
            return phone;
        }
        
        return null;
    } catch (error) {
        console.error('Error getting parent number:', error);
        return null;
    }
}

// ======================= SEND WHATSAPP VIA FONNTE =======================

/**
 * Kirim pesan via Fonnte API
 * @param {string} phoneNumber - Nomor tujuan (format: 62xxxx)
 * @param {string} message - Pesan yang akan dikirim
 * @returns {Promise<boolean>}
 */
async function sendViaFonnte(phoneNumber, message) {
    const apiKey = window.WHATSAPP_CONFIG?.fonnteApiKey;
    if (!apiKey || apiKey === 'YOUR_FONNTE_API_KEY') {
        console.warn('⚠️ Fonnte API Key belum dikonfigurasi');
        return false;
    }
    
    try {
        const response = await fetch('https://api.fonnte.com/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': apiKey
            },
            body: JSON.stringify({
                target: phoneNumber,
                message: message,
                countryCode: '62'
            })
        });
        
        const result = await response.json();
        
        if (result.status === true) {
            console.log(`✅ WhatsApp sent to ${phoneNumber}`);
            return true;
        } else {
            console.error('Fonnte error:', result);
            return false;
        }
    } catch (error) {
        console.error('Fonnte send error:', error);
        return false;
    }
}

/**
 * Kirim pesan via WhatsApp Business API (fallback)
 */
async function sendViaWABA(phoneNumber, message) {
    // Implementasi jika pakai WABA official
    console.warn('WABA not implemented yet');
    return false;
}

/**
 * Kirim notifikasi WhatsApp (auto pilih gateway)
 */
async function sendWhatsAppNotification(phoneNumber, title, message) {
    if (!window.WHATSAPP_CONFIG?.enabled) {
        console.log('WhatsApp notification disabled');
        return false;
    }
    
    if (!phoneNumber) {
        console.log('No phone number provided');
        return false;
    }
    
    const fullMessage = `*📢 SISTEM ABSENSI SEKOLAH*\n\n*${title}*\n\n${message}\n\n---\n📱 Sistem Absensi IoT - Real-time`;
    
    const gateway = window.WHATSAPP_CONFIG?.gateway || 'fonnte';
    
    let success = false;
    if (gateway === 'fonnte') {
        success = await sendViaFonnte(phoneNumber, fullMessage);
    } else if (gateway === 'waba') {
        success = await sendViaWABA(phoneNumber, fullMessage);
    }
    
    // Log notifikasi
    if (typeof logActivity === 'function') {
        logActivity('whatsapp_notification', `Kirim notif ke ${phoneNumber}: ${title} - ${success ? 'SUCCESS' : 'FAILED'}`);
    }
    
    return success;
}

// ======================= NOTIFIKASI ABSENSI =======================

/**
 * Kirim notifikasi saat siswa absen masuk
 * @param {Object} attendanceData - Data absensi
 */
async function sendCheckInNotification(attendanceData) {
    if (!window.WHATSAPP_CONFIG?.sendOnCheckIn) return;
    
    const { studentId, nama, timeIn, status, isLate } = attendanceData;
    
    const phoneNumber = await getParentWhatsAppNumber(studentId);
    if (!phoneNumber) {
        console.log(`No WhatsApp number for student ${nama} (ID: ${studentId})`);
        return;
    }
    
    const notifStatus = isLate ? 'terlambat' : 'on-time';
    const title = NOTIF_TEMPLATES.check_in.title;
    const message = NOTIF_TEMPLATES.check_in.body(nama, timeIn, notifStatus);
    
    await sendWhatsAppNotification(phoneNumber, title, message);
}

/**
 * Kirim notifikasi saat siswa absen pulang
 */
async function sendCheckOutNotification(studentId, nama, timeOut) {
    if (!window.WHATSAPP_CONFIG?.sendOnCheckOut) return;
    
    const phoneNumber = await getParentWhatsAppNumber(studentId);
    if (!phoneNumber) return;
    
    const title = NOTIF_TEMPLATES.check_out.title;
    const message = NOTIF_TEMPLATES.check_out.body(nama, timeOut);
    
    await sendWhatsAppNotification(phoneNumber, title, message);
}

/**
 * Kirim notifikasi jika siswa alpha (tidak hadir)
 */
async function sendAlphaNotification(studentId, nama, date) {
    if (!window.WHATSAPP_CONFIG?.sendOnAbsent) return;
    
    const phoneNumber = await getParentWhatsAppNumber(studentId);
    if (!phoneNumber) return;
    
    const title = NOTIF_TEMPLATES.alpha.title;
    const message = NOTIF_TEMPLATES.alpha.body(nama, date);
    
    await sendWhatsAppNotification(phoneNumber, title, message);
}

/**
 * Kirim notifikasi izin disetujui
 */
async function sendIzinApprovedNotification(studentId, nama, type, date) {
    const phoneNumber = await getParentWhatsAppNumber(studentId);
    if (!phoneNumber) return;
    
    const title = NOTIF_TEMPLATES.izin.title;
    const message = NOTIF_TEMPLATES.izin.body(nama, type, date);
    
    await sendWhatsAppNotification(phoneNumber, title, message);
}

// ======================= ANTRIAN NOTIFIKASI =======================

/**
 * Tambahkan notifikasi ke antrian
 */
function queueNotification(notification) {
    pendingNotificationQueue.push(notification);
    if (!isProcessingQueue) {
        processNotificationQueue();
    }
}

async function processNotificationQueue() {
    if (isProcessingQueue) return;
    isProcessingQueue = true;
    
    while (pendingNotificationQueue.length > 0) {
        const notif = pendingNotificationQueue.shift();
        try {
            await sendWhatsAppNotification(notif.phone, notif.title, notif.message);
            await new Promise(resolve => setTimeout(resolve, 1000)); // delay 1 detik
        } catch (error) {
            console.error('Queue notification error:', error);
        }
    }
    
    isProcessingQueue = false;
}

// ======================= MANAJEMEN NOMOR ORANG TUA =======================

/**
 * Simpan nomor WhatsApp orang tua
 */
async function saveParentContact(studentId, studentName, phoneNumber, relation = 'orang_tua') {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'guru')) {
        showToast('⛔ Hanya Admin/Guru yang dapat mengedit kontak orang tua!', 'error');
        return false;
    }
    
    // Format nomor
    let formattedNumber = phoneNumber.replace(/[^0-9]/g, '');
    if (formattedNumber.startsWith('0')) formattedNumber = '62' + formattedNumber.substring(1);
    if (!formattedNumber.startsWith('62')) formattedNumber = '62' + formattedNumber;
    
    try {
        await db.ref(`parent_contacts/${studentId}`).set({
            studentId: studentId,
            studentName: studentName,
            phoneNumber: formattedNumber,
            rawNumber: phoneNumber,
            relation: relation,
            updatedBy: currentUser.nama || currentUser.email,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
        
        // Update juga di data siswa
        await db.ref(`users/${studentId}/wa_ortu`).set(formattedNumber);
        
        showToast(`✅ Nomor WhatsApp ${studentName} berhasil disimpan!`, 'success');
        
        if (typeof logActivity === 'function') {
            logActivity('save_parent_contact', `Simpan kontak orang tua ${studentName} (ID: ${studentId}) - ${formattedNumber}`);
        }
        
        return true;
    } catch (error) {
        console.error('Save parent contact error:', error);
        showToast('❌ Gagal menyimpan nomor', 'error');
        return false;
    }
}

/**
 * Ambil kontak orang tua
 */
async function getParentContact(studentId) {
    try {
        const snapshot = await db.ref(`parent_contacts/${studentId}`).once('value');
        return snapshot.val();
    } catch (error) {
        console.error('Get parent contact error:', error);
        return null;
    }
}

// ======================= MODAL KONTAK ORANG TUA =======================

function openParentContactModal(studentId, studentName) {
    let modalHtml = `
        <div id="modal-parent-contact" class="modal-overlay open">
            <div class="modal-box" style="max-width: 450px;">
                <div class="modal-title">
                    <span>📱 WhatsApp Orang Tua</span>
                    <span onclick="closeModal('modal-parent-contact')">✖</span>
                </div>
                <div style="padding: 20px;">
                    <div class="form-group">
                        <label>👨‍🎓 Siswa</label>
                        <input type="text" id="parentStudentName" value="${escapeHtml(studentName)}" readonly style="background: var(--bg-hover);">
                    </div>
                    <div class="form-group">
                        <label>📱 Nomor WhatsApp Orang Tua</label>
                        <input type="tel" id="parentPhoneNumber" placeholder="Contoh: 08123456789 atau 628123456789" value="">
                        <small class="text-small" style="color: var(--text-muted);">Format: 08xxxxxxxxx atau 628xxxxxxxxx</small>
                    </div>
                    <div class="form-group">
                        <label>👤 Hubungan</label>
                        <select id="parentRelation">
                            <option value="orang_tua">Orang Tua</option>
                            <option value="ayah">Ayah</option>
                            <option value="ibu">Ibu</option>
                            <option value="wali">Wali</option>
                        </select>
                    </div>
                    <div class="modal-actions">
                        <button class="btn-cancel" onclick="closeModal('modal-parent-contact')">Batal</button>
                        <button class="btn-save" onclick="saveParentContactFromModal('${studentId}', '${escapeHtml(studentName)}')">💾 Simpan</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const existingModal = document.getElementById('modal-parent-contact');
    if (existingModal) existingModal.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Load existing data
    getParentContact(studentId).then(contact => {
        if (contact && contact.rawNumber) {
            document.getElementById('parentPhoneNumber').value = contact.rawNumber;
            document.getElementById('parentRelation').value = contact.relation || 'orang_tua';
        }
    });
}

async function saveParentContactFromModal(studentId, studentName) {
    const phoneNumber = document.getElementById('parentPhoneNumber').value.trim();
    const relation = document.getElementById('parentRelation').value;
    
    if (!phoneNumber) {
        showToast('Masukkan nomor WhatsApp!', 'error');
        return;
    }
    
    await saveParentContact(studentId, studentName, phoneNumber, relation);
    closeModal('modal-parent-contact');
}

// ======================= INISIALISASI =======================

function initWhatsAppNotification() {
    if (whatsappInitialized) return;
    whatsappInitialized = true;
    
    console.log('📱 WhatsApp Notification system initialized');
    
    // Setup listener untuk auto-send notifikasi
    setupAutoNotificationListener();
}

function setupAutoNotificationListener() {
    // Listener untuk absensi masuk
    db.ref('absensi').on('child_added', async (snapshot) => {
        const date = snapshot.key;
        const dailyData = snapshot.val();
        
        if (dailyData) {
            for (const [studentId, record] of Object.entries(dailyData)) {
                // Cek apakah ini record baru (dalam 30 detik terakhir)
                const isNew = record.timestamp && (Date.now() - record.timestamp < 30000);
                
                if (isNew && record.in && !record.notification_sent) {
                    const isLate = record.in > '07:30';
                    
                    // Kirim notifikasi
                    await sendCheckInNotification({
                        studentId: studentId,
                        nama: record.nama,
                        timeIn: record.in,
                        status: 'check_in',
                        isLate: isLate
                    });
                    
                    // Tandai sudah dikirim
                    await db.ref(`absensi/${date}/${studentId}/notification_sent`).set(true);
                    await db.ref(`absensi/${date}/${studentId}/notification_time`).set(firebase.database.ServerValue.TIMESTAMP);
                }
            }
        }
    });
}

// Ekspor ke global
window.sendCheckInNotification = sendCheckInNotification;
window.sendCheckOutNotification = sendCheckOutNotification;
window.sendAlphaNotification = sendAlphaNotification;
window.sendIzinApprovedNotification = sendIzinApprovedNotification;
window.saveParentContact = saveParentContact;
window.getParentContact = getParentContact;
window.openParentContactModal = openParentContactModal;
window.initWhatsAppNotification = initWhatsAppNotification;

console.log('✅ whatsapp-notif.js loaded');