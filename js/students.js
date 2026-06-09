// students.js - VERSION 4.0 (DENGAN TOMBOL WHATSAPP UNTUK ADMIN/GURU/DEVELOPER)
// ======================= MANAJEMEN DATA SISWA =======================
// Fitur: CRUD siswa, sinkronisasi dengan ESP32, delay per siswa,
//        dukungan kelas & jurusan dinamis dari pengaturan sekolah,
//        real-time update, import/export CSV.
// PERUBAHAN V4.0: 
//   - Menambahkan tombol WhatsApp untuk input nomor orang tua
//   - Developer memiliki akses penuh seperti Admin/Guru
// ====================================================================

let studentFormResetTimer = null;
let studentsDataReadyListenerAdded = false;
let studentsTabActive = false;
let studentFiltersRetryCount = 0;
let formDropdownRetryCount = 0;
const MAX_STUDENT_FILTERS_RETRY = 10;
const MAX_FORM_DROPDOWN_RETRY = 10;

// Cache untuk foto siswa
const studentPhotoCache = new Map();

// ======================= CEK AKSES EDIT SISWA ========================
function canEditStudents() {
    if (!currentUser) return false;
    // Admin, Guru, dan Developer dapat mengedit siswa
    return (currentUser.role === 'admin' || currentUser.role === 'guru' || currentUser.role === 'developer');
}

/**
 * Mendapatkan filter kelas & jurusan berdasarkan role user
 * @returns {Object} { kelas, jurusan }
 */
function getStudentFilterByRole() {
    if (!currentUser) return { kelas: 'all', jurusan: 'all' };
    
    // Untuk siswa: filter berdasarkan kelas dan jurusan mereka sendiri
    if (currentUser.role === 'siswa') {
        return {
            kelas: currentUser.kelas || 'all',
            jurusan: currentUser.jurusan || 'all',
            isSiswa: true
        };
    }
    
    // Untuk admin/guru/developer: bisa melihat semua
    return { kelas: 'all', jurusan: 'all', isSiswa: false };
}

// ======================= FUNGSI FOTO SISWA ========================

/**
 * Mendapatkan URL foto siswa berdasarkan ID
 * @param {string|number} studentId - ID siswa
 * @param {string} studentName - Nama siswa (fallback)
 * @returns {string} URL foto atau avatar inisial
 */
function getStudentPhotoUrl(studentId, studentName) {
    if (!studentId) {
        const initial = studentName ? studentName.charAt(0).toUpperCase() : 'U';
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(initial)}&background=00bcd4&color=fff&size=100&bold=true`;
    }
    
    // Cek cache
    if (studentPhotoCache.has(studentId)) {
        return studentPhotoCache.get(studentId);
    }
    
    // Cari user auth yang memiliki fpId = studentId
    const userAuth = dbData?.users_auth?.find(u => u.fpId == studentId);
    
    let photoUrl;
    if (userAuth && userAuth.photoUrl && userAuth.photoUrl !== 'null' && userAuth.photoUrl !== 'undefined') {
        photoUrl = userAuth.photoUrl;
    } else {
        // Fallback: avatar inisial nama
        const initial = studentName ? studentName.charAt(0).toUpperCase() : 'U';
        photoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(initial)}&background=00bcd4&color=fff&size=100&bold=true`;
    }
    
    // Simpan ke cache
    studentPhotoCache.set(studentId, photoUrl);
    return photoUrl;
}

/**
 * Refresh cache foto siswa
 */
function refreshStudentPhotoCache() {
    studentPhotoCache.clear();
    if (studentsTabActive) {
        renderStudentsTable();
    }
    console.log("🖼️ Student photo cache cleared");
}

/**
 * Setup listener untuk perubahan foto dari user auth
 */
function setupStudentPhotoListener() {
    if (!db) return;
    
    db.ref('users_auth').on('child_changed', (snapshot) => {
        const userData = snapshot.val();
        if (userData && userData.photoUrl && userData.fpId) {
            console.log(`🖼️ Photo changed for student ID: ${userData.fpId}, clearing cache`);
            studentPhotoCache.delete(userData.fpId);
            if (studentsTabActive) {
                renderStudentsTable();
            }
        }
    });
}

/**
 * Modal untuk melihat foto siswa lebih besar
 */
function showStudentPhotoModal(studentId, studentName, photoUrl) {
    const userAuth = dbData?.users_auth?.find(u => u.fpId == studentId);
    const hasAccount = !!userAuth;
    const accountInfo = hasAccount 
        ? `✅ Sudah memiliki akun (${userAuth.email || userAuth.nama})` 
        : '❌ Belum memiliki akun. Foto menggunakan inisial nama.';
    
    let modalHtml = `
        <div id="modal-student-photo" class="modal-overlay open">
            <div class="modal-box" style="max-width: 500px; text-align: center;">
                <div class="modal-title">
                    <span>📸 Foto ${escapeHtmlStudents(studentName)}</span>
                    <span onclick="closeModal('modal-student-photo')">✖</span>
                </div>
                <div style="padding: 20px;">
                    <img src="${photoUrl}" 
                         style="max-width: 100%; max-height: 60vh; border-radius: 20px; object-fit: contain;"
                         onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(studentName?.charAt(0) || 'U')}&background=00bcd4&color=fff&size=200&bold=true'">
                    <p style="margin-top: 15px;">
                        <strong>${escapeHtmlStudents(studentName)}</strong><br>
                        <span style="color: var(--text-muted);">ID: ${studentId}</span>
                    </p>
                    <hr>
                    <div class="text-small" style="color: var(--text-muted); padding: 8px; background: var(--bg-hover); border-radius: 8px;">
                        ℹ️ ${accountInfo}<br>
                        ${hasAccount ? 'Siswa dapat mengganti foto dari menu Profil.' : 'Silakan daftarkan akun siswa untuk memiliki foto profil.'}
                    </div>
                </div>
                <div class="modal-actions">
                    <button class="btn-cancel" onclick="closeModal('modal-student-photo')">Tutup</button>
                </div>
            </div>
        </div>
    `;
    const existingModal = document.getElementById('modal-student-photo');
    if (existingModal) existingModal.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// ======================= FUNGSI WHATSAPP ORANG TUA ========================

/**
 * Modal input nomor WhatsApp orang tua
 */
function openParentWhatsAppModal(studentId, studentName) {
    if (!canEditStudents()) {
        showToast("⛔ Hanya Admin, Guru, dan Developer yang dapat mengatur nomor WhatsApp!", "error");
        return;
    }
    
    // Load existing data
    getParentContact(studentId).then(contact => {
        let existingNumber = '';
        let existingRelation = 'orang_tua';
        
        if (contact && contact.rawNumber) {
            existingNumber = contact.rawNumber;
            existingRelation = contact.relation || 'orang_tua';
        }
        
        let modalHtml = `
            <div id="modal-wa-student" class="modal-overlay open">
                <div class="modal-box" style="max-width: 450px;">
                    <div class="modal-title">
                        <span>📱 WhatsApp Orang Tua - ${escapeHtmlStudents(studentName)}</span>
                        <span onclick="closeModal('modal-wa-student')">✖</span>
                    </div>
                    <div style="padding: 20px;">
                        <div class="form-group">
                            <label>👨‍🎓 Siswa</label>
                            <input type="text" id="waStudentName" value="${escapeHtmlStudents(studentName)}" readonly style="background: var(--bg-hover);">
                        </div>
                        <div class="form-group">
                            <label>📱 Nomor WhatsApp Orang Tua</label>
                            <input type="tel" id="waPhoneNumber" placeholder="Contoh: 08123456789 atau 628123456789" value="${escapeHtmlStudents(existingNumber)}">
                            <small class="text-small" style="color: var(--text-muted);">Format: 08xxxxxxxxx atau 628xxxxxxxxx</small>
                        </div>
                        <div class="form-group">
                            <label>👤 Hubungan</label>
                            <select id="waRelation">
                                <option value="orang_tua" ${existingRelation === 'orang_tua' ? 'selected' : ''}>Orang Tua</option>
                                <option value="ayah" ${existingRelation === 'ayah' ? 'selected' : ''}>Ayah</option>
                                <option value="ibu" ${existingRelation === 'ibu' ? 'selected' : ''}>Ibu</option>
                                <option value="wali" ${existingRelation === 'wali' ? 'selected' : ''}>Wali</option>
                            </select>
                        </div>
                        <div class="modal-actions">
                            <button class="btn-cancel" onclick="closeModal('modal-wa-student')">Batal</button>
                            <button class="btn-save" onclick="saveParentWhatsAppNumber('${studentId}', '${escapeHtmlStudents(studentName)}')">💾 Simpan Nomor</button>
                        </div>
                        <div class="text-small" style="margin-top: 15px; text-align: center; color: var(--text-muted);">
                            <hr>
                            📱 <strong>Test Kirim Pesan</strong><br>
                            <button class="btn-action btn-success" onclick="testSendWhatsApp('${studentId}', '${escapeHtmlStudents(studentName)}')" style="margin-top: 8px; padding: 6px 12px; font-size: 0.75rem;">
                                🔔 Kirim Test WhatsApp
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        const existingModal = document.getElementById('modal-wa-student');
        if (existingModal) existingModal.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }).catch(() => {
        // Jika error, tetap tampilkan modal kosong
        let modalHtml = `
            <div id="modal-wa-student" class="modal-overlay open">
                <div class="modal-box" style="max-width: 450px;">
                    <div class="modal-title">
                        <span>📱 WhatsApp Orang Tua - ${escapeHtmlStudents(studentName)}</span>
                        <span onclick="closeModal('modal-wa-student')">✖</span>
                    </div>
                    <div style="padding: 20px;">
                        <div class="form-group">
                            <label>👨‍🎓 Siswa</label>
                            <input type="text" id="waStudentName" value="${escapeHtmlStudents(studentName)}" readonly style="background: var(--bg-hover);">
                        </div>
                        <div class="form-group">
                            <label>📱 Nomor WhatsApp Orang Tua</label>
                            <input type="tel" id="waPhoneNumber" placeholder="Contoh: 08123456789 atau 628123456789">
                            <small class="text-small" style="color: var(--text-muted);">Format: 08xxxxxxxxx atau 628xxxxxxxxx</small>
                        </div>
                        <div class="form-group">
                            <label>👤 Hubungan</label>
                            <select id="waRelation">
                                <option value="orang_tua">Orang Tua</option>
                                <option value="ayah">Ayah</option>
                                <option value="ibu">Ibu</option>
                                <option value="wali">Wali</option>
                            </select>
                        </div>
                        <div class="modal-actions">
                            <button class="btn-cancel" onclick="closeModal('modal-wa-student')">Batal</button>
                            <button class="btn-save" onclick="saveParentWhatsAppNumber('${studentId}', '${escapeHtmlStudents(studentName)}')">💾 Simpan Nomor</button>
                        </div>
                        <div class="text-small" style="margin-top: 15px; text-align: center; color: var(--text-muted);">
                            <hr>
                            📱 <strong>Test Kirim Pesan</strong><br>
                            <button class="btn-action btn-success" onclick="testSendWhatsApp('${studentId}', '${escapeHtmlStudents(studentName)}')" style="margin-top: 8px; padding: 6px 12px; font-size: 0.75rem;">
                                🔔 Kirim Test WhatsApp
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        const existingModal = document.getElementById('modal-wa-student');
        if (existingModal) existingModal.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    });
}

/**
 * Mendapatkan kontak orang tua dari database
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

/**
 * Menyimpan nomor WhatsApp orang tua
 */
async function saveParentWhatsAppNumber(studentId, studentName) {
    const phoneNumber = document.getElementById('waPhoneNumber')?.value.trim();
    const relation = document.getElementById('waRelation')?.value;
    
    if (!phoneNumber) {
        showToast('Masukkan nomor WhatsApp!', 'error');
        return;
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
            updatedBy: currentUser?.nama || currentUser?.email || 'Admin',
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
        
        // Update juga di data siswa
        await db.ref(`users/${studentId}/wa_ortu`).set(formattedNumber);
        
        showToast(`✅ Nomor WhatsApp ${studentName} berhasil disimpan!`, 'success');
        
        if (typeof logActivity === 'function') {
            logActivity('save_parent_contact', `Simpan kontak orang tua ${studentName} (ID: ${studentId}) - ${formattedNumber}`);
        }
        
        closeModal('modal-wa-student');
        
    } catch (error) {
        console.error('Save parent contact error:', error);
        showToast('❌ Gagal menyimpan nomor: ' + error.message, 'error');
    }
}

/**
 * Test kirim WhatsApp ke nomor orang tua siswa
 */
async function testSendWhatsApp(studentId, studentName) {
    // Ambil nomor dari database
    const contact = await getParentContact(studentId);
    
    if (!contact || !contact.phoneNumber) {
        showToast(`❌ Nomor WhatsApp untuk ${studentName} belum diisi!`, 'error');
        return;
    }
    
    if (typeof sendViaFonnte !== 'function') {
        showToast('❌ Fungsi WhatsApp tidak tersedia. Pastikan whatsapp-notif.js sudah dimuat.', 'error');
        return;
    }
    
    const testMessage = `🧪 *TEST NOTIFIKASI WHATSAPP*

Halo, ini adalah pesan test dari **Sistem Absensi Sekolah**.

*Siswa:* ${studentName}
*Waktu Test:* ${new Date().toLocaleString('id-ID')}

Jika Anda menerima pesan ini, berarti notifikasi WhatsApp berhasil terintegrasi! ✅

Terima kasih.

---
📱 Sistem Absensi IoT - Real-time`;
    
    showToast('📤 Mengirim pesan test...', 'info');
    
    const result = await sendViaFonnte(contact.phoneNumber, testMessage);
    
    if (result) {
        showToast(`✅ Pesan test berhasil dikirim ke ${contact.rawNumber}`, 'success');
        if (typeof logActivity === 'function') {
            logActivity('test_whatsapp', `Test WhatsApp ke ${studentName} (${contact.rawNumber}) - BERHASIL`);
        }
    } else {
        showToast(`❌ Gagal mengirim ke ${contact.rawNumber}. Cek API Key dan koneksi.`, 'error');
        if (typeof logActivity === 'function') {
            logActivity('test_whatsapp', `Test WhatsApp ke ${studentName} (${contact.rawNumber}) - GAGAL`);
        }
    }
}

// ======================= EVENT LISTENER DATA READY ========================
function setupStudentsDataReadyListener() {
    if (studentsDataReadyListenerAdded) {
        console.log("⚠️ students dataReady listener already added, skipping");
        return;
    }
    
    studentsDataReadyListenerAdded = true;
    console.log("📡 Setting up dataReady event listener for students module");
    
    window.addEventListener('dataReady', (e) => {
        console.log("🔄 students.js: dataReady received, updating students UI");
        
        // Sembunyikan form input untuk siswa
        if (currentUser && currentUser.role === 'siswa') {
            hideStudentFormForSiswa();
        }
        
        if (typeof populateKelasOptions === 'function') populateKelasOptions();
        if (typeof populateJurusanOptions === 'function') populateJurusanOptions();
        if (typeof populateStudentFilters === 'function') populateStudentFilters();
        if (typeof populateStudentSelectForCode === 'function') populateStudentSelectForCode();
        
        if (studentsTabActive) {
            if (typeof renderStudentsTable === 'function') renderStudentsTable();
        } else {
            console.log("📊 students.js: Tab siswa tidak aktif, skip render sementara");
        }
        updateStudentStatistics();
    });
}

/**
 * Sembunyikan form input untuk siswa
 */
function hideStudentFormForSiswa() {
    const formContainer = document.querySelector('#tab-students .controls-bar:first-child');
    if (formContainer) {
        formContainer.style.display = 'none';
        console.log("🔒 Form input siswa disembunyikan untuk role siswa");
    }
    
    // Sembunyikan tombol aksi di header tabel
    const actionHeader = document.querySelector('#tab-students table thead th:last-child');
    if (actionHeader) {
        actionHeader.style.display = 'none';
    }
    
    // Sembunyikan filter jika perlu
    const filterBar = document.querySelector('#tab-students .controls-bar:nth-child(2)');
    if (filterBar && currentUser && currentUser.role === 'siswa') {
        filterBar.style.display = 'none';
        console.log("🔒 Filter siswa disembunyikan untuk role siswa");
    }
}

// Monitor tab aktif
function initTabActiveMonitor() {
    const checkActiveTab = () => {
        const tabStudents = document.getElementById('tab-students');
        studentsTabActive = !!(tabStudents && tabStudents.classList.contains('active'));
        if (studentsTabActive) {
            console.log("✅ Tab siswa aktif, siap render");
            if (currentUser && currentUser.role === 'siswa') {
                hideStudentFormForSiswa();
            }
            if (typeof dbData !== 'undefined' && dbData.users) {
                renderStudentsTable();
            }
        }
    };
    
    checkActiveTab();
    
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'class') {
                const target = mutation.target;
                if (target.id === 'tab-students') {
                    const wasActive = studentsTabActive;
                    studentsTabActive = target.classList.contains('active');
                    if (studentsTabActive && !wasActive) {
                        console.log("📊 Tab siswa diaktifkan, render ulang");
                        if (currentUser && currentUser.role === 'siswa') {
                            hideStudentFormForSiswa();
                        }
                        renderStudentsTable();
                        populateStudentFilters();
                        setTimeout(() => {
                            populateKelasOptions();
                            populateJurusanOptions();
                        }, 100);
                    }
                }
            }
        });
    });
    
    const tabStudents = document.getElementById('tab-students');
    if (tabStudents) {
        observer.observe(tabStudents, { attributes: true });
    } else {
        console.warn("Tab students belum ada, observer ditunda");
        setTimeout(() => initTabActiveMonitor(), 500);
        return;
    }
    
    window.addEventListener('tabSwitched', (e) => {
        if (e.detail && e.detail.tabId === 'students') {
            studentsTabActive = true;
            if (currentUser && currentUser.role === 'siswa') {
                hideStudentFormForSiswa();
            }
            renderStudentsTable();
            populateStudentFilters();
            setTimeout(() => {
                populateKelasOptions();
                populateJurusanOptions();
            }, 100);
        } else if (e.detail && e.detail.tabId !== 'students') {
            studentsTabActive = false;
        }
    });
}

// ======================= DROPDOWN DINAMIS (DIPERKUAT) =======================

function populateKelasOptions() {
    console.log("🔧 populateKelasOptions dipanggil untuk form tambah siswa");
    
    const kelasSelect = document.getElementById('newKelas');
    if (!kelasSelect) {
        if (formDropdownRetryCount < MAX_FORM_DROPDOWN_RETRY) {
            formDropdownRetryCount++;
            console.warn(`⚠️ newKelas not found, retrying (${formDropdownRetryCount}/${MAX_FORM_DROPDOWN_RETRY})...`);
            setTimeout(() => populateKelasOptions(), 300);
        }
        return;
    }
    
    formDropdownRetryCount = 0;
    
    let options = [];
    
    if (window.currentSchoolConfig && window.currentSchoolConfig.classes && window.currentSchoolConfig.classes.length > 0) {
        options = window.currentSchoolConfig.classes;
        console.log(`📚 populateKelasOptions: ${options.length} kelas dari window.currentSchoolConfig`);
    } else {
        const schoolType = window.currentSchoolConfig?.type || 'smp';
        if (schoolType === 'smp') {
            options = ['VII', 'VIII', 'IX'];
        } else if (schoolType === 'smk') {
            options = ['X', 'XI', 'XII'];
        } else {
            options = ['VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
        }
        console.log(`📚 populateKelasOptions: menggunakan default (${schoolType}) -> ${options.join(', ')}`);
    }
    
    const currentVal = kelasSelect.value;
    kelasSelect.innerHTML = '<option value="">-- Pilih Kelas --</option>' + options.map(k => `<option value="${k}">${k}</option>`).join('');
    
    if (currentVal && options.includes(currentVal)) {
        kelasSelect.value = currentVal;
    }
    
    console.log(`✅ populateKelasOptions selesai, total options: ${kelasSelect.options.length}`);
}

function populateJurusanOptions() {
    console.log("🔧 populateJurusanOptions dipanggil untuk form tambah siswa");
    
    const jurusanSelect = document.getElementById('newJurusan');
    if (!jurusanSelect) {
        if (formDropdownRetryCount < MAX_FORM_DROPDOWN_RETRY) {
            setTimeout(() => populateJurusanOptions(), 300);
        }
        return;
    }
    
    const currentVal = jurusanSelect.value;
    jurusanSelect.innerHTML = '<option value="">-- Pilih Jurusan --</option>';
    
    if (window.currentSchoolConfig && window.currentSchoolConfig.majors && window.currentSchoolConfig.majors.length > 0) {
        window.currentSchoolConfig.majors.forEach(j => {
            jurusanSelect.innerHTML += `<option value="${j}">${j}</option>`;
        });
        console.log(`🎓 populateJurusanOptions: ${window.currentSchoolConfig.majors.length} jurusan dari config`);
    } else {
        jurusanSelect.innerHTML += '<option value="UMUM">UMUM</option>';
        console.log(`🎓 populateJurusanOptions: menggunakan default UMUM`);
    }
    
    const availableOptions = Array.from(jurusanSelect.options).map(opt => opt.value);
    if (currentVal && availableOptions.includes(currentVal)) {
        jurusanSelect.value = currentVal;
    }
    
    console.log(`✅ populateJurusanOptions selesai, total options: ${jurusanSelect.options.length}`);
}

function populateStudentFilters() {
    console.log("🔧 populateStudentFilters dipanggil, retry count:", studentFiltersRetryCount);
    
    const kSelect = document.getElementById('filterStudentKelas');
    const jSelect = document.getElementById('filterStudentJurusan');
    
    if (!kSelect || !jSelect) {
        if (studentFiltersRetryCount < MAX_STUDENT_FILTERS_RETRY) {
            studentFiltersRetryCount++;
            console.warn(`⚠️ Student filter elements not found, retrying (${studentFiltersRetryCount}/${MAX_STUDENT_FILTERS_RETRY})...`);
            setTimeout(() => populateStudentFilters(), 300);
            return;
        } else {
            console.error("❌ Gagal menemukan filterStudentKelas atau filterStudentJurusan");
            return;
        }
    }
    
    studentFiltersRetryCount = 0;

    let kelasOptions = [];
    if (window.currentSchoolConfig && window.currentSchoolConfig.classes && window.currentSchoolConfig.classes.length > 0) {
        kelasOptions = window.currentSchoolConfig.classes;
    } else {
        const type = window.currentSchoolConfig?.type || 'smp';
        if (type === 'smp') kelasOptions = ['VII', 'VIII', 'IX'];
        else if (type === 'smk') kelasOptions = ['X', 'XI', 'XII'];
        else kelasOptions = ['VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    }
    
    const currentKelas = kSelect.value;
    kSelect.innerHTML = '<option value="all">📚 Semua Kelas</option>' + 
        kelasOptions.map(k => `<option value="${k}">${k}</option>`).join('');
    if (currentKelas !== 'all' && kelasOptions.includes(currentKelas)) {
        kSelect.value = currentKelas;
    }

    let jurusanOptions = ['UMUM'];
    if (window.currentSchoolConfig && window.currentSchoolConfig.majors && window.currentSchoolConfig.majors.length > 0) {
        jurusanOptions = window.currentSchoolConfig.majors;
    }
    
    const currentJurusan = jSelect.value;
    jSelect.innerHTML = '<option value="all">🎓 Semua Jurusan</option>' + 
        jurusanOptions.map(j => `<option value="${j}">${j}</option>`).join('');
    if (currentJurusan !== 'all' && jurusanOptions.includes(currentJurusan)) {
        jSelect.value = currentJurusan;
    }
    
    console.log(`✅ populateStudentFilters selesai: ${kelasOptions.length} kelas, ${jurusanOptions.length} jurusan`);
}

// ======================= DELAY INPUT HANDLERS =======================

function toggleDelayInput() {
    const unit = document.getElementById('delayUnit');
    if (!unit) return;
    const minutesGroup = document.getElementById('delayMinutesGroup');
    const hoursGroup = document.getElementById('delayHoursGroup');
    const hidden = document.getElementById('newDelay');
    if (unit.value === 'minutes') {
        if (minutesGroup) minutesGroup.style.display = 'flex';
        if (hoursGroup) hoursGroup.style.display = 'none';
        if (hidden) hidden.value = parseInt(document.getElementById('delayMinutesValue')?.value) || 60;
    } else {
        if (minutesGroup) minutesGroup.style.display = 'none';
        if (hoursGroup) hoursGroup.style.display = 'flex';
        if (hidden) hidden.value = (parseInt(document.getElementById('delayHoursValue')?.value) || 1) * 60;
    }
}

function updateDelayFromMinutes() {
    const val = parseInt(document.getElementById('delayMinutesValue')?.value) || 0;
    const hidden = document.getElementById('newDelay');
    if (hidden) hidden.value = val;
}

function updateDelayFromHours() {
    const val = parseInt(document.getElementById('delayHoursValue')?.value) || 0;
    const hidden = document.getElementById('newDelay');
    if (hidden) hidden.value = val * 60;
}

function getDelayInMinutes() {
    const unit = document.getElementById('delayUnit')?.value;
    if (unit === 'minutes') return parseInt(document.getElementById('delayMinutesValue')?.value) || 60;
    return (parseInt(document.getElementById('delayHoursValue')?.value) || 1) * 60;
}

function setDelayFormValue(delayMinutes) {
    if (!delayMinutes && delayMinutes !== 0) delayMinutes = 60;
    const hours = Math.floor(delayMinutes / 60);
    const minutes = delayMinutes % 60;
    const unit = document.getElementById('delayUnit');
    const hoursSelect = document.getElementById('delayHoursValue');
    const minutesInput = document.getElementById('delayMinutesValue');
    if (hours > 0 && minutes === 0) {
        if (unit) unit.value = 'hours';
        if (hoursSelect) hoursSelect.value = hours;
    } else {
        if (unit) unit.value = 'minutes';
        if (minutesInput) minutesInput.value = delayMinutes;
    }
    toggleDelayInput();
}

function formatDelayDisplay(delayMinutes) {
    if (!delayMinutes && delayMinutes !== 0) return '-';
    const jam = Math.floor(delayMinutes / 60);
    const menit = delayMinutes % 60;
    if (jam > 0 && menit > 0) return `${jam} jam ${menit} menit`;
    if (jam > 0) return `${jam} jam`;
    return `${menit} menit`;
}

// ======================= RENDER TABEL SISWA (DENGAN FILTER ROLE) =======================

function renderStudentsTable(retryCount = 0) {
    const MAX_RETRY = 5;
    const RETRY_DELAY = 200;
    
    const tabStudents = document.getElementById('tab-students');
    if (!tabStudents) {
        console.error("students.js: Tab students container not found!");
        return;
    }
    
    let tbody = document.getElementById('tbody-students');
    if (!tbody) {
        tbody = tabStudents.querySelector('.table-container tbody');
    }
    
    if (!tbody) {
        const tableContainer = tabStudents.querySelector('.table-container');
        if (tableContainer) {
            let table = tableContainer.querySelector('table');
            if (!table) {
                table = document.createElement('table');
                // UPDATE HEADER: Tambah kolom Foto dan Aksi
                table.innerHTML = '<thead><tr><th>Foto</th><th>ID FP</th><th>Nama</th><th>Kelas</th><th>Jurusan</th><th>Delay</th><th>Aksi</th></tr></thead>';
                tableContainer.appendChild(table);
                console.log("students.js: Created table dynamically with photo column");
            }
            tbody = document.createElement('tbody');
            tbody.id = 'tbody-students';
            table.appendChild(tbody);
            console.log("students.js: Created tbody-students dynamically");
        }
    }
    
    if (!tbody) {
        if (retryCount < MAX_RETRY) {
            console.warn(`students.js: tbody-students not found, retrying (${retryCount+1}/${MAX_RETRY})...`);
            setTimeout(() => renderStudentsTable(retryCount + 1), RETRY_DELAY);
            return;
        } else {
            console.error("students.js: Gagal menemukan tbody-students");
            return;
        }
    }
    
    if (typeof dbData === 'undefined' || !dbData.users) {
        console.log("⏳ students.js: dbData.users not ready yet");
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;">⏳ Memuat data siswa...</td></tr>`;
        return;
    }
    
    if (dbData.users.length === 0) {
        console.log("📭 students.js: Tidak ada data siswa");
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;">📭 Belum ada data siswa. Silakan tambah siswa melalui form di atas.</td></tr>`;
        updateStudentStatistics();
        return;
    }
    
    // ========== FILTER DATA BERDASARKAN ROLE ==========
    let data = [...dbData.users];
    // Perbaikan: isSiswa hanya true jika role === 'siswa', developer tetap dapat akses penuh
    const isSiswa = (currentUser && currentUser.role === 'siswa');
    // Perbaikan: canEdit untuk Admin, Guru, dan Developer
    const canEdit = canEditStudents();
    
    if (isSiswa) {
        // SISWA: Hanya lihat siswa dengan kelas dan jurusan yang sama
        const userKelas = currentUser.kelas;
        const userJurusan = currentUser.jurusan;
        
        data = data.filter(u => {
            let match = true;
            if (userKelas && u.kelas !== userKelas) match = false;
            if (userJurusan && u.jurusan !== userJurusan) match = false;
            return match;
        });
        
        console.log(`👨‍🎓 Siswa filter: kelas=${userKelas}, jurusan=${userJurusan} → ${data.length} siswa ditampilkan`);
        
        // Sembunyikan form input
        hideStudentFormForSiswa();
        
        // Sembunyikan filter
        const filterBar = document.querySelector('#tab-students .controls-bar:nth-child(2)');
        if (filterBar) filterBar.style.display = 'none';
    } else {
        // ADMIN/GURU/DEVELOPER: Tampilkan semua dengan filter opsional
        const search = document.getElementById('searchStudentName')?.value.toLowerCase() || '';
        const kelas = document.getElementById('filterStudentKelas')?.value || 'all';
        const jurusan = document.getElementById('filterStudentJurusan')?.value || 'all';
        
        if (search) data = data.filter(u => u.nama && u.nama.toLowerCase().includes(search));
        if (kelas !== 'all') data = data.filter(u => u.kelas === kelas);
        if (jurusan !== 'all') data = data.filter(u => u.jurusan === jurusan);
        
        // Tampilkan filter
        const filterBar = document.querySelector('#tab-students .controls-bar:nth-child(2)');
        if (filterBar) filterBar.style.display = '';
    }
    
    data.sort((a, b) => parseInt(a.id) - parseInt(b.id));
    
    tbody.innerHTML = '';
    
    if (data.length === 0) {
        if (isSiswa) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;">📭 Tidak ada teman sekelas dengan kelas dan jurusan yang sama.</td></tr>`;
        } else {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;">📭 Data siswa tidak ditemukan.${search ? '<br><small>Coba kata kunci lain</small>' : ''}</td></tr>`;
        }
        updateStudentStatistics();
        return;
    }

    // RENDER SISWA DENGAN FOTO DAN TOMBOL AKSI (untuk Admin/Guru/Developer)
    for (const s of data) {
        const isNew = s.createdAt && (Date.now() - s.createdAt < 300000);
        const photoUrl = getStudentPhotoUrl(s.id, s.nama);
        const studentInitial = s.nama ? s.nama.charAt(0).toUpperCase() : 'U';
        
        // Cek apakah siswa memiliki akun
        const hasAccount = dbData.users_auth?.some(u => u.fpId == s.id);
        const accountBadge = hasAccount 
            ? '<span class="badge-account" style="background:#4caf50; font-size:10px; margin-left:6px; padding:2px 6px; border-radius:20px;">✓ Berakun</span>' 
            : '<span class="badge-no-account" style="background:#888; font-size:10px; margin-left:6px; padding:2px 6px; border-radius:20px;">❌ Belum Berakun</span>';
        
        // ========== PERBAIKAN: Tombol Aksi untuk Admin, Guru, dan Developer ==========
        let actionCell = '';
        if (canEdit) {
            actionCell = `
                <td style="white-space: nowrap;">
                    <button class="btn-icon edit" onclick="editStudent('${s.id}')" title="Edit Siswa" style="margin-right: 5px;">✏️</button>
                    <button class="btn-icon delete" onclick="deleteStudentWithFP('${s.id}')" title="Hapus Siswa" style="margin-right: 5px;">🗑️</button>
                    <button class="btn-wa" onclick="openParentWhatsAppModal('${s.id}', '${escapeHtmlStudents(s.nama)}')" title="Input Nomor WhatsApp Orang Tua">
                        📱 WA
                    </button>
                 </td>
            `;
        } else {
            actionCell = '<td style="display: none;"></td>';
        }
        
        tbody.innerHTML += `
            <tr data-id="${s.id}">
                <td style="text-align:center;">
                    <img src="${photoUrl}" 
                         class="student-avatar" 
                         style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; cursor: pointer; transition: transform 0.2s;"
                         onerror="this.src='https://ui-avatars.com/api/?name=${studentInitial}&background=00bcd4&color=fff&size=100&bold=true'"
                         onclick="showStudentPhotoModal('${s.id}', '${escapeHtmlStudents(s.nama)}', this.src)"
                         title="Klik untuk perbesar foto">
                 </td>
                <td><strong>${s.id}</strong>${isNew ? '<br><span class="badge-new-student">NEW</span>' : ''}</td>
                <td>${escapeHtmlStudents(s.nama)}${accountBadge}</td>
                <td>${s.kelas || '-'}</td>
                <td>${s.jurusan || '-'}</td>
                <td><span class="delay-badge">⏱️ ${formatDelayDisplay(s.delayOut)}</span></td>
                ${actionCell}
             </tr>
        `;
    }
    
    updateStudentStatistics();
    console.log(`✅ renderStudentsTable selesai, menampilkan ${data.length} siswa${isSiswa ? ' (filtered by kelas/jurusan)' : ''}, canEdit: ${canEdit}`);
}

// ======================= UPDATE STATISTIK =======================

function updateStudentStatistics() {
    let statsContainer = document.getElementById('studentsStats');
    if (!statsContainer) {
        const controlsBar = document.querySelector('#tab-students .controls-bar:first-child');
        if (controlsBar) {
            statsContainer = document.createElement('div');
            statsContainer.id = 'studentsStats';
            statsContainer.style.marginBottom = '10px';
            controlsBar.insertAdjacentElement('afterend', statsContainer);
        } else return;
    }

    // Untuk siswa, hanya hitung statistik dari data yang terfilter
    const isSiswa = (currentUser && currentUser.role === 'siswa');
    let filteredData = dbData.users || [];
    
    if (isSiswa && currentUser) {
        const userKelas = currentUser.kelas;
        const userJurusan = currentUser.jurusan;
        filteredData = filteredData.filter(u => {
            let match = true;
            if (userKelas && u.kelas !== userKelas) match = false;
            if (userJurusan && u.jurusan !== userJurusan) match = false;
            return match;
        });
    }
    
    const total = filteredData.length;
    const withAccount = dbData.users_auth?.filter(u => u.fpId && filteredData.some(s => s.id == u.fpId)).length || 0;
    const withoutAccount = total - withAccount;
    
    const kelasCount = {}, jurusanCount = {};
    filteredData.forEach(s => {
        if (s.kelas) kelasCount[s.kelas] = (kelasCount[s.kelas] || 0) + 1;
        if (s.jurusan) jurusanCount[s.jurusan] = (jurusanCount[s.jurusan] || 0) + 1;
    });
    const topKelas = Object.entries(kelasCount).sort((a,b) => b[1]-a[1])[0];
    const topJurusan = Object.entries(jurusanCount).sort((a,b) => b[1]-a[1])[0];

    statsContainer.innerHTML = `
        <div style="display:flex;gap:20px;flex-wrap:wrap;padding:10px;background:#1e1e1e;border-radius:8px;margin-bottom:15px;">
            <div><span style="color:#4a90e2;">👥 Total Siswa:</span> <strong>${total}</strong></div>
            <div><span style="color:#4caf50;">✅ Sudah Berakun:</span> <strong>${withAccount}</strong></div>
            <div><span style="color:#f44336;">❌ Belum Berakun:</span> <strong>${withoutAccount}</strong></div>
            <div><span style="color:#4a90e2;">📚 Kelas Terbanyak:</span> <strong>${topKelas ? `${topKelas[0]} (${topKelas[1]})` : '-'}</strong></div>
            <div><span style="color:#4a90e2;">🎓 Jurusan Terbanyak:</span> <strong>${topJurusan ? `${topJurusan[0]} (${topJurusan[1]})` : '-'}</strong></div>
        </div>
    `;
}

// ======================= CRUD SISWA =======================

function saveStudent() {
    if (!canEditStudents()) {
        showToast("⛔ Anda tidak memiliki akses!", "error");
        return;
    }
    let idStr = document.getElementById('newId')?.value.trim();
    const nama = document.getElementById('newNama')?.value.trim();
    const kelas = document.getElementById('newKelas')?.value;
    const jurusan = document.getElementById('newJurusan')?.value;
    const delay = getDelayInMinutes();
    const mode = document.getElementById('editMode')?.value;

    if (!nama || !idStr) { showToast("⚠️ ID dan Nama wajib diisi!", "error"); return; }
    if (!kelas) { showToast("⚠️ Pilih Kelas!", "error"); return; }
    if (!jurusan) { showToast("⚠️ Pilih Jurusan!", "error"); return; }
    if (delay <= 0) { showToast("⚠️ Delay harus > 0!", "error"); return; }
    if (isNaN(parseInt(idStr))) { showToast("⚠️ ID harus angka!", "error"); return; }

    const studentData = {
        id: parseInt(idStr),
        nama: nama,
        kelas: kelas,
        jurusan: jurusan,
        delayOut: delay,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    };
    if (mode === 'add') studentData.createdAt = firebase.database.ServerValue.TIMESTAMP;

    if (mode === 'add' && dbData.users?.some(u => u.id == idStr)) {
        showToast("❌ ID sudah ada!", "error");
        return;
    }

    const btn = document.getElementById('btnSaveStudent');
    const originalText = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = '💾 Menyimpan...'; }

    db.ref(`users/${idStr}`).set(studentData)
        .then(() => {
            showToast(mode === 'add' ? "✅ Siswa ditambahkan" : "✅ Siswa diupdate");
            
            if (typeof logActivity === 'function') {
                const action = mode === 'add' ? 'add_student' : 'edit_student';
                const details = `${action}: ${nama} (ID: ${idStr}, Kelas: ${kelas}, Jurusan: ${jurusan}, Delay: ${delay} menit)`;
                logActivity(action, details);
            }
            
            // Clear cache foto untuk siswa ini
            studentPhotoCache.delete(idStr);
            
            resetStudentForm();
            const authUser = dbData.users_auth?.find(u => u.fpId == idStr);
            if (authUser) {
                db.ref(`users_auth/${authUser.uid}`).update({ nama, kelas, jurusan });
                if (currentUser.uid === authUser.uid) {
                    currentUser.nama = nama;
                    currentUser.kelas = kelas;
                    currentUser.jurusan = jurusan;
                    if (typeof saveUserToLocalStorage === 'function') saveUserToLocalStorage(currentUser);
                    if (typeof updateUserInterface === 'function') updateUserInterface();
                }
            }
        })
        .catch(err => showToast("❌ Gagal: " + err.message, "error"))
        .finally(() => {
            if (btn) { btn.disabled = false; btn.innerHTML = originalText || (mode === 'add' ? '➕ Simpan Siswa' : '💾 Update'); }
        });
}

function editStudent(id) {
    // Cek akses
    if (!canEditStudents()) {
        showToast("⛔ Anda tidak memiliki akses untuk mengedit siswa!", "error");
        return;
    }
    
    const s = dbData.users?.find(u => u.id == id);
    if (!s) { showToast("❌ Data tidak ditemukan", "error"); return; }
    document.querySelector('#tab-students .controls-bar:first-child')?.scrollIntoView({ behavior: 'smooth' });
    document.getElementById('newId').value = s.id;
    document.getElementById('newId').disabled = true;
    document.getElementById('newNama').value = s.nama;
    document.getElementById('newKelas').value = s.kelas;
    document.getElementById('newJurusan').value = s.jurusan;
    setDelayFormValue(s.delayOut || 60);
    document.getElementById('editMode').value = 'edit';
    const btnSave = document.getElementById('btnSaveStudent');
    const btnCancel = document.getElementById('btnCancelStudent');
    if (btnSave) { btnSave.innerHTML = '💾 Update Siswa'; btnSave.style.background = 'var(--warning)'; }
    if (btnCancel) btnCancel.classList.remove('hidden');
    showToast(`✏️ Edit mode: ${s.nama}`, "info");
}

function resetStudentForm() {
    if (studentFormResetTimer) clearTimeout(studentFormResetTimer);
    document.getElementById('newId').value = '';
    document.getElementById('newId').disabled = false;
    document.getElementById('newNama').value = '';
    document.getElementById('newKelas').value = '';
    document.getElementById('newJurusan').value = '';
    setDelayFormValue(60);
    document.getElementById('editMode').value = 'add';
    const btnSave = document.getElementById('btnSaveStudent');
    const btnCancel = document.getElementById('btnCancelStudent');
    if (btnSave) { btnSave.innerHTML = '➕ Simpan Siswa'; btnSave.style.background = ''; }
    if (btnCancel) btnCancel.classList.add('hidden');
    studentFormResetTimer = setTimeout(() => document.getElementById('newId')?.focus(), 100);
}

// ======================= HAPUS SISWA =======================

async function deleteStudentWithFP(studentId) {
    if (!canEditStudents()) {
        showToast("⛔ Akses ditolak!", "error");
        return;
    }
    const student = dbData.users?.find(u => u.id == studentId);
    const name = student?.nama || studentId;
    if (!confirm(`⚠️ Hapus siswa "${name}"?\n\nTINDAKAN INI TIDAK DAPAT DIBATALKAN!`)) return;

    const registeredUser = dbData.users_auth?.find(u => u.fpId == studentId);
    if (registeredUser && !confirm(`⚠️ Siswa ini punya akun (${registeredUser.email}). Hapus juga akunnya?`)) return;

    const btns = document.querySelectorAll(`button[onclick*="deleteStudent"][onclick*="${studentId}"]`);
    btns.forEach(btn => { btn.disabled = true; btn.innerHTML = '⏳'; });

    showToast(`🗑️ Menghapus ${name}...`, "info");

    try {
        await db.ref('commands/esp32/delete_fingerprint').set({
            studentId: parseInt(studentId),
            studentName: name,
            requestedBy: currentUser.nama || currentUser.email,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        setTimeout(() => db.ref('commands/esp32/delete_fingerprint').remove().catch(()=>{}), 2000);
    } catch(e) { console.warn(e); }

    // Clear cache foto
    studentPhotoCache.delete(studentId);
    
    if (registeredUser) await db.ref(`users_auth/${registeredUser.uid}`).remove().catch(()=>{});
    await db.ref(`users/${studentId}`).remove();
    showToast(`✅ Siswa "${name}" dihapus`, "success");
    
    if (typeof logActivity === 'function') {
        logActivity('delete_student', `Menghapus siswa: ${name} (ID: ${studentId})${registeredUser ? ' beserta akunnya' : ''}`);
    }
    
    if (typeof renderStudentsTable === 'function') renderStudentsTable();
    btns.forEach(btn => { btn.disabled = false; btn.innerHTML = '🗑️'; });
}

function deleteStudent(id) {
    if (confirm("Hapus siswa ini?")) deleteStudentWithFP(id);
}

// ======================= BULK OPERATIONS =======================

function importStudentsFromCSV(csvText) {
    if (!canEditStudents()) {
        showToast("⛔ Anda tidak memiliki akses untuk import siswa!", "error");
        return;
    }
    
    const lines = csvText.trim().split('\n');
    let success = 0, fail = 0;
    let importedNames = [];
    
    for (const line of lines) {
        const parts = line.split(',');
        if (parts.length >= 4) {
            const id = parts[0].trim();
            const nama = parts[1].trim();
            const kelas = parts[2].trim();
            const jurusan = parts[3].trim();
            const delay = parts[4] ? parseInt(parts[4].trim()) : 60;
            if (id && nama && kelas && jurusan) {
                importedNames.push(`${nama} (ID: ${id})`);
                db.ref(`users/${id}`).set({
                    id: parseInt(id), nama, kelas, jurusan, delayOut: delay,
                    createdAt: firebase.database.ServerValue.TIMESTAMP
                }).then(() => success++).catch(() => fail++);
            } else fail++;
        } else fail++;
    }
    
    if (typeof logActivity === 'function' && success > 0) {
        const summary = `${success} berhasil, ${fail} gagal. Contoh: ${importedNames.slice(0, 3).join(', ')}${importedNames.length > 3 ? '...' : ''}`;
        logActivity('import_students', summary);
    }
    
    setTimeout(() => showToast(`✅ Import: ${success} berhasil, ${fail} gagal`, fail ? "warning" : "success"), 1000);
}

function exportStudentsToCSV() {
    if (!dbData.users?.length) { showToast("❌ Tidak ada data", "error"); return; }
    
    // Untuk siswa, hanya export data yang terfilter
    let dataToExport = dbData.users;
    if (currentUser && currentUser.role === 'siswa') {
        const userKelas = currentUser.kelas;
        const userJurusan = currentUser.jurusan;
        dataToExport = dataToExport.filter(u => {
            let match = true;
            if (userKelas && u.kelas !== userKelas) match = false;
            if (userJurusan && u.jurusan !== userJurusan) match = false;
            return match;
        });
    }
    
    let csv = "\uFEFFID,Nama,Kelas,Jurusan,Delay (menit)\n";
    dataToExport.forEach(s => {
        csv += `"${s.id}","${escapeCsv(s.nama)}","${s.kelas || '-'}","${s.jurusan || '-'}","${s.delayOut || 60}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `data_siswa_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast("📥 Data siswa diekspor", "success");
    
    if (typeof logActivity === 'function') {
        logActivity('export_students', `Ekspor ${dataToExport.length} data siswa ke CSV`);
    }
}

function escapeCsv(str) {
    if (!str) return '';
    if (str.includes(',') || str.includes('"') || str.includes('\n')) return '"' + str.replace(/"/g, '""') + '"';
    return str;
}

// ======================= CLEANUP =======================

function cleanupStudentsSystem() {
    if (studentFormResetTimer) clearTimeout(studentFormResetTimer);
    studentsDataReadyListenerAdded = false;
    studentsTabActive = false;
    studentFiltersRetryCount = 0;
    formDropdownRetryCount = 0;
    studentPhotoCache.clear();
    console.log("🧹 Students system cleaned up");
}

// ======================= UTILITY =======================

function escapeHtmlStudents(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

function initDelayEventListeners() {
    const minutes = document.getElementById('delayMinutesValue');
    const hours = document.getElementById('delayHoursValue');
    const unit = document.getElementById('delayUnit');
    if (minutes) minutes.addEventListener('input', updateDelayFromMinutes);
    if (hours) hours.addEventListener('change', updateDelayFromHours);
    if (unit) unit.addEventListener('change', toggleDelayInput);
    setTimeout(() => toggleDelayInput(), 100);
}

// ======================= INISIALISASI ========================
setupStudentsDataReadyListener();
initTabActiveMonitor();
setupStudentPhotoListener(); // Mulai listener foto

// Initial population of student filters
function initialPopulateStudentFilters() {
    if (document.getElementById('filterStudentKelas') && document.getElementById('filterStudentJurusan')) {
        populateStudentFilters();
        // Sembunyikan filter untuk siswa
        if (currentUser && currentUser.role === 'siswa') {
            const filterBar = document.querySelector('#tab-students .controls-bar:nth-child(2)');
            if (filterBar) filterBar.style.display = 'none';
        }
    } else {
        console.log("⏳ Menunggu DOM untuk populateStudentFilters...");
        setTimeout(initialPopulateStudentFilters, 300);
    }
}

// Initial population of form dropdowns
function initialPopulateFormDropdowns() {
    if (document.getElementById('newKelas') && document.getElementById('newJurusan')) {
        populateKelasOptions();
        populateJurusanOptions();
        console.log("✅ Form dropdowns initialized");
    } else {
        console.log("⏳ Menunggu DOM untuk form dropdowns...");
        setTimeout(initialPopulateFormDropdowns, 300);
    }
}

// Start initial populations
setTimeout(initialPopulateStudentFilters, 500);
setTimeout(initialPopulateFormDropdowns, 500);

// Jika data sudah ada
if (typeof window !== 'undefined' && window.dbData && window.dbData.users) {
    console.log("📊 students.js: Data already available");
    setTimeout(() => {
        if (studentsTabActive) {
            renderStudentsTable();
        }
        populateKelasOptions();
        populateJurusanOptions();
        populateStudentFilters();
        
        // Sembunyikan form untuk siswa
        if (currentUser && currentUser.role === 'siswa') {
            hideStudentFormForSiswa();
        }
    }, 100);
}

// Override switchTab
const originalSwitchTab = window.switchTab;
if (originalSwitchTab && typeof originalSwitchTab === 'function') {
    window.switchTab = function(tabId) {
        originalSwitchTab(tabId);
        window.dispatchEvent(new CustomEvent('tabSwitched', { detail: { tabId: tabId } }));
        if (tabId === 'students') {
            setTimeout(() => {
                if (currentUser && currentUser.role === 'siswa') {
                    hideStudentFormForSiswa();
                }
                renderStudentsTable();
                populateStudentFilters();
                populateKelasOptions();
                populateJurusanOptions();
            }, 100);
        }
    };
}

// ======================= EXPORT KE GLOBAL =======================
window.populateKelasOptions = populateKelasOptions;
window.populateJurusanOptions = populateJurusanOptions;
window.populateStudentFilters = populateStudentFilters;
window.renderStudentsTable = renderStudentsTable;
window.saveStudent = saveStudent;
window.editStudent = editStudent;
window.resetStudentForm = resetStudentForm;
window.deleteStudent = deleteStudent;
window.deleteStudentWithFP = deleteStudentWithFP;
window.importStudentsFromCSV = importStudentsFromCSV;
window.exportStudentsToCSV = exportStudentsToCSV;
window.cleanupStudentsSystem = cleanupStudentsSystem;
window.initDelayEventListeners = initDelayEventListeners;
window.canEditStudents = canEditStudents;
window.hideStudentFormForSiswa = hideStudentFormForSiswa;
// Ekspor fungsi foto
window.getStudentPhotoUrl = getStudentPhotoUrl;
window.refreshStudentPhotoCache = refreshStudentPhotoCache;
window.showStudentPhotoModal = showStudentPhotoModal;
// Ekspor fungsi WhatsApp
window.openParentWhatsAppModal = openParentWhatsAppModal;
window.saveParentWhatsAppNumber = saveParentWhatsAppNumber;
window.getParentContact = getParentContact;
window.testSendWhatsApp = testSendWhatsApp;

console.log("✅ students.js V4.0 loaded - Dengan tombol WhatsApp untuk input nomor orang tua (Admin/Guru/Developer)");