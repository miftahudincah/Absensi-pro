// users.js - VERSION 5.3 (FIXED USER TABLE DISPLAY & PHOTO CACHE)
// Manajemen User: Generate kode registrasi (dengan QR), daftar kode,
// daftar pengguna, ubah role, hapus user, reset password, reset sistem.
// Role yang didukung: developer, admin (Kepala Sekolah), wakil_kepala, staff_tu, guru, siswa
// PERUBAHAN V5.3: 
//   - Memperbaiki bug tabel user tidak menampilkan data
//   - Menambahkan timestamp pada foto user untuk bypass cache
//   - Menambahkan statistik ringkasan user
//   - Menambahkan fallback jika tbody tidak ditemukan
//   - Memperbaiki renderUsersTable dengan logging lengkap
// ============================================================================

let usersDataReadyListenerAdded = false;
let usersTableRetryCount = 0;
const MAX_USERS_TABLE_RETRY = 10;

// Cache untuk foto user dengan timestamp management
const usersPhotoCache = new Map();
const usersPhotoTimestampCache = new Map();

// ======================= ROLE HELPER FUNCTIONS =======================

/**
 * Mendapatkan display name role
 */
function getRoleDisplayName(role) {
    const names = {
        developer: 'Developer',
        admin: 'Kepala Sekolah',
        wakil_kepala: 'Wakil Kepala Sekolah',
        staff_tu: 'Staff TU',
        guru: 'Guru',
        siswa: 'Siswa'
    };
    return names[role] || role.toUpperCase();
}

/**
 * Mendapatkan icon untuk role
 */
function getRoleIcon(role) {
    const icons = {
        developer: '👨‍💻',
        admin: '👑',
        wakil_kepala: '👔',
        staff_tu: '📋',
        guru: '👨‍🏫',
        siswa: '👨‍🎓'
    };
    return icons[role] || '👤';
}

/**
 * Mendapatkan priority role untuk sorting
 */
function getRolePriority(role) {
    const priorities = {
        developer: 0,
        admin: 1,
        wakil_kepala: 2,
        staff_tu: 3,
        guru: 4,
        siswa: 5
    };
    return priorities[role] !== undefined ? priorities[role] : 99;
}

/**
 * Cek apakah user dapat mengelola user lain
 */
function canManageUser(currentUser, targetUser) {
    if (!currentUser) return false;
    
    if (currentUser.role === 'developer') {
        return targetUser.role !== 'developer';
    }
    
    if (currentUser.role === 'admin') {
        return targetUser.role !== 'developer' && targetUser.role !== 'admin';
    }
    
    if (currentUser.role === 'wakil_kepala') {
        return targetUser.role === 'siswa' || targetUser.role === 'guru';
    }
    
    if (currentUser.role === 'staff_tu') {
        return targetUser.role === 'siswa';
    }
    
    if (currentUser.role === 'guru') {
        return targetUser.role === 'siswa';
    }
    
    return false;
}

/**
 * Cek apakah user dapat menggenerate kode
 */
function canGenerateCode(userRole) {
    const allowedRoles = ['admin', 'developer', 'wakil_kepala', 'guru'];
    return allowedRoles.includes(userRole);
}

/**
 * Cek apakah user dapat mereset password user lain
 */
function canResetPassword(userRole) {
    const allowedRoles = ['admin', 'developer', 'wakil_kepala'];
    return allowedRoles.includes(userRole);
}

/**
 * Cek apakah user dapat menghapus user
 */
function canDeleteUser(userRole) {
    const allowedRoles = ['admin', 'developer'];
    return allowedRoles.includes(userRole);
}

/**
 * Validasi apakah role valid
 */
function isValidRole(role) {
    const validRoles = ['developer', 'admin', 'wakil_kepala', 'staff_tu', 'guru', 'siswa'];
    return validRoles.includes(role);
}

// ======================= FUNGSI FOTO USER ========================

/**
 * Mendapatkan URL foto user dengan timestamp untuk bypass cache
 * @param {string} uid - User ID
 * @param {string} userName - Nama user (fallback)
 * @param {string} photoUrl - URL foto yang tersimpan
 * @returns {string} URL foto atau avatar inisial
 */
function getUserPhotoUrl(uid, userName, photoUrl) {
    if (!uid && !userName) {
        return `https://ui-avatars.com/api/?name=U&background=00bcd4&color=fff&size=100&bold=true&t=${Date.now()}`;
    }
    
    // Cek cache dengan timestamp management
    const lastUpdate = usersPhotoTimestampCache.get(uid);
    const now = Date.now();
    
    if (usersPhotoCache.has(uid) && lastUpdate && (now - lastUpdate) < 5000) {
        return usersPhotoCache.get(uid);
    }
    
    let finalPhotoUrl;
    const timestamp = now;
    
    if (photoUrl && photoUrl !== 'null' && photoUrl !== 'undefined' && photoUrl !== '') {
        const separator = photoUrl.includes('?') ? '&' : '?';
        finalPhotoUrl = photoUrl.split('?')[0] + separator + 't=' + timestamp;
    } else {
        const initial = userName ? userName.charAt(0).toUpperCase() : 'U';
        finalPhotoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(initial)}&background=00bcd4&color=fff&size=100&bold=true&t=${timestamp}`;
    }
    
    usersPhotoCache.set(uid, finalPhotoUrl);
    usersPhotoTimestampCache.set(uid, timestamp);
    
    return finalPhotoUrl;
}

/**
 * Refresh cache foto user
 */
function refreshUsersPhotoCache() {
    usersPhotoCache.clear();
    usersPhotoTimestampCache.clear();
    if (typeof renderUsersTable === 'function') {
        renderUsersTable();
    }
    console.log("🖼️ Users photo cache cleared");
}

// ======================= EVENT LISTENER DATA READY ========================

function setupUsersDataReadyListener() {
    if (usersDataReadyListenerAdded) return;
    usersDataReadyListenerAdded = true;
    console.log("📡 Setting up dataReady event listener for users module");

    window.addEventListener('dataReady', (e) => {
        console.log("🔄 users.js: dataReady received, updating users UI");
        if (typeof renderUsersTable === 'function') {
            renderUsersTable();
        }
        if (typeof renderCodesTable === 'function') {
            renderCodesTable();
        }
        updateCodesStatistics();
        if (typeof populateStudentSelectForCode === 'function') {
            populateStudentSelectForCode();
        }
        if (typeof populateStaffSelectForCode === 'function') {
            populateStaffSelectForCode();
        }
    });

    window.addEventListener('uiReady', (e) => {
        console.log("👥 users.js: uiReady received, checking permissions");
        if (typeof renderUsersTable === 'function') {
            renderUsersTable();
        }
        if (typeof populateStaffSelectForCode === 'function') {
            populateStaffSelectForCode();
        }
    });
}

// ======================= UPDATE STATISTIK KODE ========================

function updateCodesStatistics() {
    const statsContainer = document.getElementById('codesStats');
    if (!statsContainer) {
        createCodesStatsContainer();
        return;
    }

    const codes = dbData?.codes || [];
    const activeCodes = codes.filter(c => !c.used).length;
    const usedCodes = codes.filter(c => c.used).length;
    const studentCodes = codes.filter(c => c.type === 'siswa' && !c.used).length;
    const teacherCodes = codes.filter(c => (c.type === 'guru' || c.type === 'staff' || c.type === 'staff_tu' || c.type === 'wakil_kepala') && !c.used).length;

    statsContainer.innerHTML = `
        <div style="display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 15px; padding: 10px; background: var(--bg-hover); border-radius: 8px;">
            <div><span style="color: #4caf50;">🟢 Aktif:</span> <strong>${activeCodes}</strong></div>
            <div><span style="color: #888;">🔴 Terpakai:</span> <strong>${usedCodes}</strong></div>
            <div><span style="color: #4a90e2;">👨‍🎓 Siswa:</span> <strong>${studentCodes}</strong></div>
            <div><span style="color: #ff9800;">👨‍🏫 Guru/Staff:</span> <strong>${teacherCodes}</strong></div>
            <div><span style="color: #888;">📊 Total:</span> <strong>${codes.length}</strong></div>
        </div>
    `;
}

function createCodesStatsContainer() {
    const keyBox = document.querySelector('#tab-users .key-box');
    if (keyBox && !document.getElementById('codesStats')) {
        const statsDiv = document.createElement('div');
        statsDiv.id = 'codesStats';
        statsDiv.style.marginTop = '10px';
        keyBox.insertAdjacentElement('afterend', statsDiv);
    }
}

// ======================= UPDATE STATISTIK USER ========================

function updateUsersStatistics() {
    let statsContainer = document.getElementById('usersStats');
    
    // Cari atau buat container statistik user
    if (!statsContainer) {
        const controlsBar = document.querySelector('#tab-users .controls-bar:first-child');
        if (controlsBar && !document.getElementById('usersStats')) {
            const statsDiv = document.createElement('div');
            statsDiv.id = 'usersStats';
            statsDiv.style.marginBottom = '10px';
            statsDiv.style.padding = '10px';
            statsDiv.style.background = 'var(--bg-hover)';
            statsDiv.style.borderRadius = '8px';
            controlsBar.insertAdjacentElement('afterend', statsDiv);
            statsContainer = statsDiv;
        } else {
            return;
        }
    }
    
    const users = dbData?.users_auth || [];
    const total = users.length;
    const siswa = users.filter(u => u.role === 'siswa').length;
    const guru = users.filter(u => u.role === 'guru').length;
    const staffTu = users.filter(u => u.role === 'staff_tu').length;
    const wakil = users.filter(u => u.role === 'wakil_kepala').length;
    const admin = users.filter(u => u.role === 'admin').length;
    const developer = users.filter(u => u.role === 'developer').length;
    
    statsContainer.innerHTML = `
        <div style="display: flex; gap: 15px; flex-wrap: wrap;">
            <span>👥 <strong>Total User:</strong> ${total}</span>
            <span>👨‍🎓 <strong>Siswa:</strong> ${siswa}</span>
            <span>👨‍🏫 <strong>Guru:</strong> ${guru}</span>
            <span>📋 <strong>Staff TU:</strong> ${staffTu}</span>
            <span>👔 <strong>Wakil Kepala:</strong> ${wakil}</span>
            <span>👑 <strong>Kepala Sekolah:</strong> ${admin}</span>
            <span>⚡ <strong>Developer:</strong> ${developer}</span>
        </div>
    `;
}

// ======================= DROPDOWN SISWA UNTUK GENERATE KODE ========================

function populateStudentSelectForCode() {
    const select = document.getElementById('selectStudentForCode');
    if (!select) return;

    const currentVal = select.value;

    if (typeof dbData === 'undefined' || !dbData.users || !dbData.users_auth) {
        console.log("⏳ users.js: dbData not ready yet for populateStudentSelectForCode");
        select.innerHTML = '<option value="">-- Memuat data siswa --</option>';
        return;
    }

    select.innerHTML = '<option value="">-- Pilih Siswa --</option>';

    const registeredUserIds = dbData.users_auth?.map(u => u.fpId).filter(id => id) || [];
    const activeCodes = dbData.codes?.filter(c => !c.used && c.type === 'siswa') || [];
    const studentIdsWithActiveCode = activeCodes.map(c => c.linkedId).filter(id => id);
    const availableStudents = dbData.users.filter(s => 
        !registeredUserIds.includes(s.id) && !studentIdsWithActiveCode.includes(s.id)
    );

    if (availableStudents.length === 0) {
        if (studentIdsWithActiveCode.length > 0) {
            select.innerHTML += '<option value="" disabled>⏳ Beberapa siswa masih memiliki kode aktif</option>';
        } else {
            select.innerHTML += '<option value="" disabled>✨ Semua siswa sudah memiliki akun</option>';
        }
    } else {
        availableStudents.forEach(s => {
            select.innerHTML += `<option value="${s.id}">${escapeHtmlString(s.nama)} (ID: ${s.id}) | Kelas ${s.kelas || '-'}</option>`;
        });
    }

    if (currentVal && availableStudents.some(s => s.id == currentVal)) {
        select.value = currentVal;
    }
}

// ======================= DROPDOWN STAFF UNTUK GENERATE KODE ========================

let staffListCacheForCode = [];
let staffListLoadedForCode = false;

async function populateStaffSelectForCode() {
    console.log("📋 populateStaffSelectForCode dipanggil...");
    
    const select = document.getElementById('selectStaffForCode');
    if (!select) {
        console.log("⚠️ selectStaffForCode tidak ditemukan di DOM");
        return;
    }

    select.innerHTML = '<option value="">⏳ Memuat data staff...</option>';
    select.disabled = true;

    try {
        if (typeof db === 'undefined' || !db) {
            throw new Error('Database tidak tersedia');
        }
        
        const staffSnapshot = await db.ref('staff').once('value');
        const staffData = staffSnapshot.val();
        
        const availableStaff = [];
        const registeredEmails = dbData?.users_auth?.map(u => u.email?.toLowerCase()) || [];
        const activeCodes = dbData?.codes?.filter(c => !c.used && (c.type === 'guru' || c.type === 'staff' || c.type === 'staff_tu' || c.type === 'wakil_kepala')) || [];
        const staffIdsWithActiveCode = activeCodes.map(c => c.linkedId).filter(id => id);
        
        console.log(`🔒 Staff dengan kode aktif: ${staffIdsWithActiveCode.join(', ') || 'tidak ada'}`);
        
        if (staffData) {
            console.log(`📁 Ditemukan ${Object.keys(staffData).length} staff di database`);
            
            for (const [staffId, staff] of Object.entries(staffData)) {
                const hasAccount = staff.email && registeredEmails.includes(staff.email.toLowerCase());
                const hasActiveCode = staffIdsWithActiveCode.includes(staffId);
                
                let targetRole = 'guru';
                if (staff.jabatan === 'kepala_sekolah') targetRole = 'admin';
                else if (staff.jabatan === 'wakil_kepala') targetRole = 'wakil_kepala';
                else if (staff.jabatan === 'staff_tu') targetRole = 'staff_tu';
                else if (staff.jabatan === 'guru') targetRole = 'guru';
                
                if (!hasAccount && !hasActiveCode && staff.nama && staff.email) {
                    availableStaff.push({
                        id: staffId,
                        nama: staff.nama,
                        email: staff.email,
                        jabatan: staff.jabatan,
                        targetRole: targetRole,
                        departemen: staff.departemen || '-'
                    });
                } else {
                    if (hasAccount) {
                        console.log(`✅ Staff ${staff.nama} (${staffId}) sudah memiliki akun, tidak ditampilkan`);
                    }
                    if (hasActiveCode) {
                        console.log(`⏳ Staff ${staff.nama} (${staffId}) masih memiliki kode aktif, tidak ditampilkan`);
                    }
                }
            }
        }
        
        staffListCacheForCode = availableStaff;
        staffListLoadedForCode = true;
        
        select.innerHTML = '<option value="">-- Pilih Staff --</option>';
        
        if (availableStaff.length === 0) {
            if (staffIdsWithActiveCode.length > 0) {
                select.innerHTML += '<option value="" disabled>⏳ Beberapa staff masih memiliki kode aktif</option>';
                select.title = "Staff yang masih memiliki kode aktif tidak dapat dipilih. Hapus kode lama terlebih dahulu.";
            } else {
                select.innerHTML += '<option value="" disabled>✨ Semua staff sudah memiliki akun</option>';
                select.title = "Semua staff sudah memiliki akun. Tidak ada staff yang perlu digenerate kode.";
            }
            select.style.borderColor = '#ff9800';
            select.style.backgroundColor = 'rgba(255, 152, 0, 0.1)';
        } else {
            availableStaff.forEach(s => {
                let roleDisplay = '';
                switch(s.jabatan) {
                    case 'kepala_sekolah': roleDisplay = '👑 Kepala Sekolah'; break;
                    case 'wakil_kepala': roleDisplay = '👔 Wakil Kepala Sekolah'; break;
                    case 'staff_tu': roleDisplay = '📋 Staff TU'; break;
                    default: roleDisplay = '👨‍🏫 Guru';
                }
                select.innerHTML += `<option value="${s.id}" data-email="${escapeHtmlString(s.email)}" data-role="${s.targetRole}" data-nama="${escapeHtmlString(s.nama)}" data-jabatan="${s.jabatan}">${escapeHtmlString(s.nama)} (${roleDisplay}) - ${escapeHtmlString(s.email)}</option>`;
            });
            select.style.borderColor = '#4caf50';
            select.style.backgroundColor = 'rgba(76, 175, 80, 0.1)';
            select.title = "Pilih staff yang akan digenerate kode registrasi";
        }
        
        if (staffData) {
            const totalStaff = Object.keys(staffData).length;
            const withAccount = Object.values(staffData).filter(s => s.email && registeredEmails.includes(s.email.toLowerCase())).length;
            const withActiveCode = staffIdsWithActiveCode.length;
            const availableCount = availableStaff.length;
            
            console.log(`📊 Staff Summary: Total ${totalStaff}, Sudah Akun ${withAccount}, Punya Kode Aktif ${withActiveCode}, Tersedia ${availableCount}`);
        }
        
    } catch (err) {
        console.error("❌ Error loading staff for dropdown:", err);
        select.innerHTML = '<option value="" disabled>❌ Gagal memuat data staff</option>';
        if (typeof showToast === 'function') {
            showToast("❌ Gagal memuat data staff: " + err.message, "error");
        }
    } finally {
        select.disabled = false;
    }
}

function refreshStaffDropdown() {
    console.log("🔄 Refreshing staff dropdown...");
    staffListLoadedForCode = false;
    populateStaffSelectForCode();
}

/**
 * Helper function untuk menampilkan error pada dropdown
 */
function showDropdownError(selectElement, message) {
    if (!selectElement) return false;
    
    selectElement.style.borderColor = '#f44336';
    selectElement.style.borderWidth = '2px';
    selectElement.style.backgroundColor = 'rgba(244, 67, 54, 0.1)';
    
    if (typeof showToast === 'function') {
        showToast(message, "error");
    } else {
        alert(message);
    }
    
    selectElement.focus();
    selectElement.style.transition = 'all 0.3s ease';
    setTimeout(() => {
        if (selectElement) {
            selectElement.style.borderColor = '';
            selectElement.style.borderWidth = '';
            selectElement.style.backgroundColor = '';
        }
    }, 2000);
    
    return false;
}

/**
 * Highlight user yang sudah memiliki akun di tabel user
 */
function highlightUserInTable(email) {
    if (!email) return;
    
    const rows = document.querySelectorAll('#tbody-users tr');
    for (const row of rows) {
        const emailCell = row.querySelector('td:nth-child(3)');
        if (emailCell && emailCell.textContent.trim().toLowerCase() === email.toLowerCase()) {
            row.style.backgroundColor = 'rgba(244, 67, 54, 0.3)';
            row.style.transition = 'background-color 0.3s';
            row.style.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => {
                row.style.backgroundColor = '';
            }, 3000);
            break;
        }
    }
}

/**
 * Highlight kode yang masih aktif di tabel kode
 */
function highlightExistingCode(code) {
    const rows = document.querySelectorAll('#tbody-codes tr');
    for (const row of rows) {
        const codeCell = row.querySelector('td:first-child strong');
        if (codeCell && codeCell.textContent === code) {
            row.style.backgroundColor = 'rgba(255, 152, 0, 0.3)';
            row.style.transition = 'background-color 0.3s';
            row.style.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => {
                row.style.backgroundColor = '';
            }, 3000);
            break;
        }
    }
}

// ======================= GENERATE KODE REGISTRASI ========================

function generateRegistrationCode() {
    if (!currentUser) {
        showToast("Anda harus login!", "error");
        return;
    }

    if (!canGenerateCode(currentUser.role)) {
        showToast("⛔ Hanya Kepala Sekolah, Wakil Kepala Sekolah, Guru, dan Developer yang dapat generate kode!", "error");
        return;
    }

    const targetType = document.querySelector('input[name="genTarget"]:checked')?.value;
    if (!targetType) {
        showToast("Pilih target kode (Siswa/Guru/Staff)!", "error");
        return;
    }

    // VALIDASI UNTUK SISWA
    if (targetType === 'siswa') {
        const selectSiswa = document.getElementById('selectStudentForCode');
        const selectedId = selectSiswa?.value;
        
        if (!selectedId || selectedId === '' || selectedId === '-- Pilih Siswa --' || selectedId === '-- Memuat data siswa --') {
            return showDropdownError(selectSiswa, "⚠️ HARAP PILIH SISWA TERLEBIH DAHULU sebelum generate kode!");
        }
        
        const existingUser = dbData.users_auth?.find(u => u.fpId == selectedId);
        if (existingUser) {
            showToast(`❌ GAGAL: ID Siswa (${selectedId}) sudah terdaftar pada akun (${existingUser.email}).`, "error");
            highlightUserInTable(existingUser.email);
            return;
        }
        
        const existingCode = dbData.codes?.find(c => c.linkedId == selectedId && !c.used && c.type === 'siswa');
        if (existingCode) {
            showToast(`❌ GAGAL: Siswa ini masih memiliki kode aktif (${existingCode.code}). Tunggu expired atau hapus kode lama!`, "error");
            highlightExistingCode(existingCode.code);
            return;
        }
        
        // Generate kode SISWA
        generateStudentCode(selectedId);
        return;
    }
    // VALIDASI UNTUK GURU/STAFF
    else if (targetType === 'guru' || targetType === 'staff') {
        const selectStaff = document.getElementById('selectStaffForCode');
        
        if (!selectStaff) {
            showToast("❌ Error: Dropdown staff tidak ditemukan!", "error");
            return;
        }
        
        const selectedStaffId = selectStaff.value;
        const isValidSelection = selectedStaffId && 
                                 selectedStaffId !== '' && 
                                 selectedStaffId !== '-- Pilih Staff --' &&
                                 selectedStaffId !== '⏳ Memuat data staff...' &&
                                 selectedStaffId !== '-- Memuat data staff --';
        
        if (!isValidSelection) {
            return showDropdownError(selectStaff, "⚠️ HARAP PILIH STAFF DARI DROPDOWN TERLEBIH DAHULU sebelum generate kode!");
        }
        
        const selectedOption = selectStaff.querySelector('option[value="' + selectedStaffId + '"]');
        const staffEmail = selectedOption?.getAttribute('data-email');
        const staffName = selectedOption?.getAttribute('data-nama');
        const staffRole = selectedOption?.getAttribute('data-role') || 'guru';
        const staffJabatan = selectedOption?.getAttribute('data-jabatan') || 'guru';
        
        if (!staffEmail) {
            showToast(`❌ Staff ini tidak memiliki email! Silakan edit data staff dan isi email terlebih dahulu.`, "error");
            return;
        }
        
        const existingUser = dbData.users_auth?.find(u => u.email?.toLowerCase() === staffEmail.toLowerCase());
        if (existingUser) {
            const roleName = existingUser.role === 'admin' ? 'Kepala Sekolah' : 
                            (existingUser.role === 'wakil_kepala' ? 'Wakil Kepala' :
                            (existingUser.role === 'staff_tu' ? 'Staff TU' : 'Guru'));
            showToast(`❌ GAGAL: Staff (${staffName}) sudah memiliki akun sebagai ${roleName} dengan email ${staffEmail}.`, "error");
            highlightUserInTable(staffEmail);
            return;
        }
        
        const existingCode = dbData.codes?.find(c => c.linkedId == selectedStaffId && !c.used && (c.type === 'guru' || c.type === 'staff' || c.type === 'staff_tu' || c.type === 'wakil_kepala'));
        if (existingCode) {
            showToast(`❌ GAGAL: Staff ini masih memiliki kode aktif (${existingCode.code})! Tunggu expired atau hapus kode lama!`, "error");
            highlightExistingCode(existingCode.code);
            return;
        }
        
        let targetRole = staffRole;
        if (targetType === 'guru') targetRole = 'guru';
        
        generateStaffCode(selectedStaffId, staffEmail, staffName, staffJabatan, targetRole);
        return;
    }
    else {
        showToast("❌ Target kode tidak valid!", "error");
        return;
    }
}

function generateStudentCode(selectedId) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const code = `REG-${timestamp.slice(-3)}${random}`;
    
    const student = dbData.users.find(s => s.id == selectedId);
    const studentName = student?.nama || selectedId;
    
    const codeData = {
        used: false,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        type: 'siswa',
        createdBy: currentUser.nama || currentUser.email,
        createdRole: currentUser.role,
        linkedId: selectedId,
        linkedName: studentName,
        requireId: true,
        kelas: student?.kelas || '-',
        jurusan: student?.jurusan || '-'
    };
    
    const btn = document.querySelector('button[onclick="generateRegistrationCode()"]');
    const originalText = btn?.innerHTML;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ Generating...';
    }
    
    db.ref('codes/' + code).set(codeData).then(() => {
        showToast(`✅ Kode untuk ${studentName} berhasil dibuat!`, "success");
        
        if (typeof logActivity === 'function') {
            logActivity('generate_code', `Generate kode siswa: ${code} untuk ${studentName} (ID: ${selectedId})`);
        }
        
        const selectSiswa = document.getElementById('selectStudentForCode');
        if (selectSiswa) {
            selectSiswa.value = '';
        }
        
        setTimeout(() => populateStudentSelectForCode(), 500);
        if (typeof renderCodesTable === 'function') renderCodesTable();
        updateCodesStatistics();
    }).catch(err => {
        console.error("Generate code error:", err);
        showToast("❌ Gagal membuat kode: " + err.message, "error");
    }).finally(() => {
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
    });
}

function generateStaffCode(selectedStaffId, staffEmail, staffName, staffJabatan, targetRole) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const code = `REG-${timestamp.slice(-3)}${random}`;
    
    let typeDisplay = '';
    let borderColor = '';
    let textColor = '';
    let roleIcon = '';
    let roleLabel = '';
    
    switch(targetRole) {
        case 'admin':
            typeDisplay = 'KEPALA SEKOLAH';
            borderColor = '#f44336';
            textColor = '#f44336';
            roleIcon = '👑';
            roleLabel = 'Kepala Sekolah';
            break;
        case 'wakil_kepala':
            typeDisplay = 'WAKIL KEPALA SEKOLAH';
            borderColor = '#9c27b0';
            textColor = '#9c27b0';
            roleIcon = '👔';
            roleLabel = 'Wakil Kepala Sekolah';
            break;
        case 'staff_tu':
            typeDisplay = 'STAFF TU';
            borderColor = '#607d8b';
            textColor = '#607d8b';
            roleIcon = '📋';
            roleLabel = 'Staff TU';
            break;
        default:
            typeDisplay = 'GURU';
            borderColor = '#ff9800';
            textColor = '#ff9800';
            roleIcon = '👨‍🏫';
            roleLabel = 'Guru';
    }
    
    const codeData = {
        used: false,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        type: 'staff',
        createdBy: currentUser.nama || currentUser.email,
        createdRole: currentUser.role,
        linkedId: selectedStaffId,
        linkedEmail: staffEmail,
        linkedName: staffName,
        targetRole: targetRole,
        requireId: true,
        staffJabatan: staffJabatan,
        nama: staffName,
        email: staffEmail,
        roleLabel: roleLabel
    };
    
    const btn = document.querySelector('button[onclick="generateRegistrationCode()"]');
    const originalText = btn?.innerHTML;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ Generating...';
    }
    
    db.ref('codes/' + code).set(codeData).then(() => {
        showToast(`✅ Kode registrasi untuk ${staffName} (${typeDisplay}) berhasil dibuat!`, "success");
        
        if (typeof logActivity === 'function') {
            logActivity('generate_code', `Generate kode staff: ${code} untuk ${staffName} (ID: ${selectedStaffId}) role ${targetRole}`);
        }
        
        const selectStaff = document.getElementById('selectStaffForCode');
        if (selectStaff) {
            selectStaff.value = '';
        }
        
        setTimeout(() => populateStaffSelectForCode(), 500);
        if (typeof renderCodesTable === 'function') renderCodesTable();
        updateCodesStatistics();
        
    }).catch(err => {
        console.error("Generate code error:", err);
        showToast("❌ Gagal membuat kode: " + err.message, "error");
    }).finally(() => {
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
    });
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast("📋 Kode berhasil disalin!", "success");
    }).catch(() => {
        showToast("❌ Gagal menyalin kode", "error");
    });
}

// ======================= DELETE KODE REGISTRASI ========================

function deleteCode(code) {
    const codeData = dbData.codes?.find(c => c.code === code);
    const typeDisplay = codeData?.type ? getRoleDisplayName(codeData.type) : 'UMUM';
    const linkedInfo = codeData?.linkedName ? ` - ${codeData.linkedName}` : (codeData?.linkedId ? ` - ID: ${codeData.linkedId}` : '');
    const codeInfo = `${typeDisplay}${linkedInfo} - ${code}`;
    
    if (!confirm(`⚠️ Yakin ingin menghapus kode: ${codeInfo}?\n\nKode yang sudah dihapus tidak dapat digunakan lagi.`)) return;
    
    db.ref('codes/' + code).remove()
        .then(() => {
            showToast(`✅ Kode ${code} berhasil dihapus`, "success");
            
            if (typeof logActivity === 'function') {
                logActivity('delete_code', `Hapus kode: ${codeInfo}`);
            }
            
            setTimeout(() => {
                if (typeof populateStudentSelectForCode === 'function') populateStudentSelectForCode();
                if (typeof populateStaffSelectForCode === 'function') populateStaffSelectForCode();
            }, 500);
            
            if (typeof renderCodesTable === 'function') renderCodesTable();
            updateCodesStatistics();
        })
        .catch((err) => showToast("❌ Gagal menghapus kode: " + err.message, "error"));
}

// ======================= RENDER TABEL KODE REGISTRASI ========================

function renderCodesTable() {
    const tbody = document.getElementById('tbody-codes');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (typeof dbData === 'undefined' || !dbData.codes || dbData.codes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 30px; color:#888;">🔑 Belum ada kode registrasi. Generate kode di atas.</td></tr>`;
        updateCodesStatistics();
        return;
    }
    
    const sorted = [...dbData.codes].reverse();
    sorted.forEach(c => {
        let typeLabel = '';
        let typeIcon = '🔑';
        let colorStyle = '#4a90e2';
        let linkedInfo = '';
        let requireIdBadge = '';
        
        if (c.type === 'siswa') {
            typeLabel = 'SISWA';
            typeIcon = '👨‍🎓';
            colorStyle = '#4a90e2';
            linkedInfo = c.linkedId ? `<br><small style="color:#888">🔒 ID: ${c.linkedId}</small>` : '';
            if (c.requireId) {
                requireIdBadge = `<br><small style="color:#ff9800;">⚠️ ID WAJIB</small>`;
            }
        } else if (c.type === 'guru') {
            typeLabel = 'GURU';
            typeIcon = '👨‍🏫';
            colorStyle = '#ff9800';
            linkedInfo = c.linkedName ? `<br><small style="color:#888">👤 ${escapeHtmlString(c.linkedName)}</small>` : '';
            if (c.linkedEmail) linkedInfo += `<br><small style="color:#888">📧 ${escapeHtmlString(c.linkedEmail)}</small>`;
            if (c.linkedId) {
                linkedInfo += `<br><small style="color:#ff9800;">🆔 ID: ${c.linkedId}</small>`;
                requireIdBadge = `<br><small style="color:#ff9800;">⚠️ ID WAJIB</small>`;
            }
        } else if (c.type === 'staff') {
            const roleDisplay = c.targetRole === 'admin' ? 'KEPALA SEKOLAH' : (c.targetRole === 'wakil_kepala' ? 'WAKIL KEPALA' : (c.targetRole === 'staff_tu' ? 'STAFF TU' : 'GURU'));
            typeLabel = roleDisplay;
            typeIcon = c.targetRole === 'admin' ? '👑' : (c.targetRole === 'wakil_kepala' ? '👔' : (c.targetRole === 'staff_tu' ? '📋' : '👨‍🏫'));
            colorStyle = c.targetRole === 'admin' ? '#f44336' : (c.targetRole === 'wakil_kepala' ? '#9c27b0' : (c.targetRole === 'staff_tu' ? '#607d8b' : '#ff9800'));
            linkedInfo = c.linkedName ? `<br><small style="color:#888">👤 ${escapeHtmlString(c.linkedName)}</small>` : '';
            if (c.linkedEmail) linkedInfo += `<br><small style="color:#888">📧 ${escapeHtmlString(c.linkedEmail)}</small>`;
            if (c.linkedId) {
                linkedInfo += `<br><small style="color:#ff9800;">🆔 ID: ${c.linkedId}</small>`;
                requireIdBadge = `<br><small style="color:#f44336;">🔒 ID WAJIB DIINPUT SAAT REGISTRASI</small>`;
            }
        }
        
        const createdByName = c.createdBy ? `<br><small>👤 ${escapeHtmlString(c.createdBy)}</small>` : '';
        const timeRemaining = getCodeTimeRemaining(c.createdAt);
        const isExpiringSoon = !c.used && timeRemaining && (timeRemaining.includes('menit') && parseInt(timeRemaining) < 30);
        
        tbody.innerHTML += `
            <tr class="${isExpiringSoon ? 'code-expiring-soon' : ''}" style="${isExpiringSoon ? 'background: rgba(255, 152, 0, 0.2);' : ''}">
                <td style="font-family:monospace; font-weight:bold;">
                    <span style="color:${colorStyle}">${typeIcon}</span>
                    <strong>${c.code}</strong>
                    <br><small style="font-weight:normal; color:#888">${typeLabel}${linkedInfo}${requireIdBadge}${createdByName}</small>
                  </div>
                <td>${c.used ? '<span style="color:#4caf50;">✅ Terpakai</span>' : `<span style="color:#ff9800;">🟢 Aktif</span>${timeRemaining ? `<br><small style="color:#888;">⏰ ${timeRemaining}</small>` : ''}`}</div>
                <td style="font-size: 12px;">${c.createdAt ? new Date(c.createdAt).toLocaleString('id-ID') : '-'}</div>
                <td style="font-size: 12px;">${c.userId ? c.userId.substring(0, 20) + '...' : '-'}</div>
                <td>${!c.used ? `<button class="btn-icon" onclick="copyToClipboard('${c.code}')" title="Salin Kode">📋</button>
                                <button class="btn-icon delete" onclick="deleteCode('${c.code}')" title="Hapus Kode">🗑️</button>` : '-'}</div>
            </tr>
        `;
    });
    updateCodesStatistics();
}

function getCodeTimeRemaining(createdAt) {
    if (!createdAt) return null;
    const now = Date.now();
    const expiredAt = createdAt + (5 * 60 * 60 * 1000);
    const remaining = expiredAt - now;
    if (remaining <= 0) return 'Expired';
    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
    if (hours > 0) return `${hours} jam ${minutes} menit`;
    else if (minutes > 0) return `${minutes} menit`;
    else return '< 1 menit';
}

// ======================= RENDER TABEL PENGGUNA (FIXED) ========================

function renderUsersTable() {
    console.log("🎨 renderUsersTable dipanggil - users_auth count:", dbData?.users_auth?.length || 0);
    
    let tbody = document.getElementById('tbody-users');
    
    // Jika tbody tidak ditemukan, coba buat secara dinamis
    if (!tbody) {
        console.warn("⚠️ tbody-users tidak ditemukan, mencoba membuat...");
        const table = document.querySelector('#tab-users .table-container table');
        if (table) {
            const newTbody = document.createElement('tbody');
            newTbody.id = 'tbody-users';
            table.appendChild(newTbody);
            tbody = newTbody;
            console.log("✅ tbody-users created dynamically");
        } else {
            console.error("❌ Table not found in #tab-users");
            return;
        }
    }
    
    const searchInput = document.getElementById('searchUser');
    const search = searchInput?.value.toLowerCase() || '';
    
    // ========== CEK DATA ==========
    if (typeof dbData === 'undefined' || !dbData.users_auth) {
        console.log("⏳ users.js: dbData.users_auth not ready yet");
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 30px;">⏳ Memuat data pengguna...</td></tr>`;
        return;
    }
    
    if (!dbData.users_auth || dbData.users_auth.length === 0) {
        console.log("📭 users.js: Tidak ada data user auth");
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 30px; color:#888;">👥 Belum ada pengguna terdaftar.</td></tr>`;
        updateUsersStatistics();
        return;
    }
    
    // ========== FILTER DATA ==========
    let data = [...dbData.users_auth];
    
    if (search) {
        data = data.filter(u => u.nama && u.nama.toLowerCase().includes(search));
    }
    
    data.sort((a, b) => getRolePriority(a.role) - getRolePriority(b.role));
    
    console.log(`📊 Users data to render: ${data.length} users (total: ${dbData.users_auth.length}, search: "${search}")`);
    
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 30px; color:#888;">🔍 Tidak ada pengguna yang cocok dengan pencarian.</td></tr>`;
        updateUsersStatistics();
        return;
    }
    
    // ========== RENDER TABLE ==========
    tbody.innerHTML = '';
    
    for (const u of data) {
        const isMe = (currentUser && currentUser.uid === u.uid);
        const isDeveloper = (u.role === 'developer');
        
        // Dapatkan URL foto dengan timestamp
        const photoUrl = getUserPhotoUrl(u.uid, u.nama, u.photoUrl);
        const initial = u.nama ? u.nama.charAt(0).toUpperCase() : 'U';
        
        const canManageThisUser = canManageUser(currentUser, u);
        const canDeleteThisUser = canDeleteUser(currentUser?.role);
        const canResetPassThisUser = canResetPassword(currentUser?.role);
        
        // Role HTML
        let roleHtml = '';
        let actionsHtml = '-';
        
        if (canManageThisUser && !isDeveloper) {
            roleHtml = `
                <select class="form-control" onchange="updateUserRole('${u.uid}', this.value)" 
                        style="background:var(--bg-input); color:var(--text-primary); border:1px solid var(--border); padding:5px; border-radius:4px; font-size:0.8rem;">
                    <option value="siswa" ${u.role === 'siswa' ? 'selected' : ''}>👨‍🎓 Siswa</option>
                    <option value="guru" ${u.role === 'guru' ? 'selected' : ''}>👨‍🏫 Guru</option>
                    <option value="staff_tu" ${u.role === 'staff_tu' ? 'selected' : ''}>📋 Staff TU</option>
                    <option value="wakil_kepala" ${u.role === 'wakil_kepala' ? 'selected' : ''}>👔 Wakil Kepala Sekolah</option>
                    <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>👑 Kepala Sekolah</option>
                </select>
            `;
            
            let actionButtons = '';
            if (canDeleteThisUser && !isDeveloper && !isMe) {
                actionButtons += `<button class="btn-icon delete" onclick="deleteUser('${u.uid}', '${escapeHtmlString(u.nama)}')" title="Hapus User" style="background:transparent; border:none; cursor:pointer; font-size:18px;">🗑️</button>`;
            }
            if (canResetPassThisUser && !isDeveloper) {
                actionButtons += `<button class="btn-icon" onclick="resetUserPassword('${u.email}')" title="Reset Password" style="background:transparent; border:none; cursor:pointer; font-size:18px;">🔑</button>`;
            }
            actionsHtml = actionButtons || '-';
        } else {
            const roleIcon = getRoleIcon(u.role);
            const roleDisplay = getRoleDisplayName(u.role);
            let roleClass = `role-${u.role}`;
            if (u.role === 'admin') roleClass = 'role-admin';
            else if (u.role === 'wakil_kepala') roleClass = 'role-wakil-kepala';
            else if (u.role === 'staff_tu') roleClass = 'role-staff-tu';
            else if (u.role === 'guru') roleClass = 'role-guru';
            else if (u.role === 'developer') roleClass = 'role-developer';
            else roleClass = 'role-siswa';
            
            roleHtml = `<span class="role-badge ${roleClass}">${roleIcon} ${roleDisplay}</span>`;
            if (isMe) roleHtml += ` <small style="color:#4a90e2;">(Anda)</small>`;
        }
        
        // Detail text
        let detailText = '';
        let detailIcon = '';
        if (u.role === 'siswa') {
            detailIcon = '📚';
            detailText = `${u.kelas || '-'} / ${u.jurusan || '-'}`;
        } else if (u.role === 'guru') {
            detailIcon = '📖';
            detailText = u.subject || '-';
        } else if (u.role === 'staff_tu') {
            detailIcon = '📋';
            detailText = u.departemen || 'Staff TU';
        } else if (u.role === 'wakil_kepala') {
            detailIcon = '👔';
            detailText = u.bidang || 'Wakil Kepala Sekolah';
        } else if (u.role === 'developer') {
            detailIcon = '⚡';
            detailText = 'Developer (Super Admin)';
        } else {
            detailIcon = '👑';
            detailText = 'Kepala Sekolah';
        }
        
        const registeredDate = u.registeredAt ? new Date(u.registeredAt).toLocaleDateString('id-ID') : '-';
        
        // Error handler untuk gambar
        const onErrorScript = `this.onerror=null; this.src='https://ui-avatars.com/api/?name=${initial}&background=00bcd4&color=fff&size=100&bold=true&t=${Date.now()}'; usersPhotoCache.delete('${u.uid}');`;
        
        tbody.innerHTML += `
            <tr class="${isMe ? 'current-user-row' : ''}" style="border-bottom: 1px solid var(--border);">
                <td style="text-align:center; padding:8px;">
                    <img src="${photoUrl}" 
                         style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; cursor: pointer;"
                         onerror="${onErrorScript}"
                         title="Foto ${escapeHtmlString(u.nama)}">
                 </div>
                <td style="padding:8px;">
                    <strong>${escapeHtmlString(u.nama)}</strong>
                    ${isMe ? '<br><small style="color:#4a90e2;">Akun Anda</small>' : ''}
                  </div>
                <td style="padding:8px; color: var(--text-muted); font-size:0.85rem;">${u.email || '-'}</div>
                <td style="padding:8px;">${roleHtml}</div>
                <td style="padding:8px; color: var(--text-muted); font-size:0.8rem;">
                    ${detailIcon} ${escapeHtmlString(detailText)}<br>
                    <small>📅 ${registeredDate}</small>
                  </div>
                <td style="text-align:center; padding:8px;">${actionsHtml}</div>
            </tr>
        `;
    }
    
    console.log(`✅ renderUsersTable selesai, menampilkan ${data.length} users`);
    updateUsersStatistics();
}

// ======================= UPDATE USER ROLE ========================

function updateUserRole(uid, newRole) {
    if (!currentUser) {
        showToast("Anda harus login!", "error");
        return;
    }
    
    if (currentUser.role !== 'admin' && currentUser.role !== 'developer') {
        showToast("⛔ Hanya Kepala Sekolah dan Developer yang dapat mengubah role!", "error");
        return;
    }

    const user = dbData.users_auth?.find(u => u.uid === uid);
    if (!user) {
        showToast("❌ User tidak ditemukan!", "error");
        return;
    }

    if (user.role === 'developer') {
        showToast("⛔ Role Developer tidak dapat diubah!", "error");
        return;
    }
    if (newRole === 'developer') {
        showToast("⛔ Tidak dapat memberikan role Developer! Role ini hanya untuk akun paten.", "error");
        return;
    }
    if (currentUser.uid === uid) {
        showToast("❌ Anda tidak dapat mengubah role sendiri!", "error");
        return;
    }

    const roleNames = { 
        siswa: 'Siswa', 
        guru: 'Guru', 
        staff_tu: 'Staff TU',
        wakil_kepala: 'Wakil Kepala Sekolah',
        admin: 'Kepala Sekolah' 
    };
    
    if (!confirm(`⚠️ Yakin ingin mengubah role ${user.nama} dari ${roleNames[user.role]} menjadi ${roleNames[newRole]}?`)) return;

    db.ref('users_auth/' + uid).update({
        role: newRole,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        showToast(`✅ Role ${user.nama} berhasil diubah menjadi ${roleNames[newRole]}`, "success");
        
        if (typeof logActivity === 'function') {
            logActivity('update_user_role', `Ubah role ${user.nama} (${user.email}) dari ${user.role} menjadi ${newRole}`);
        }
        
        if (currentUser.uid === uid) {
            currentUser.role = newRole;
            if (typeof saveUserToLocalStorage === 'function') saveUserToLocalStorage(currentUser);
            if (typeof applyRolePermissions === 'function') applyRolePermissions();
            if (typeof updateUserInterface === 'function') updateUserInterface();
        }
        renderUsersTable();
    }).catch((err) => {
        console.error("Update role error:", err);
        showToast("❌ Gagal mengubah role: " + err.message, "error");
    });
}

// ======================= DELETE USER ========================

function deleteUser(uid, nama) {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'developer')) {
        showToast("⛔ Hanya Kepala Sekolah dan Developer yang dapat menghapus user!", "error");
        return;
    }
    if (currentUser.uid === uid) {
        showToast("❌ Anda tidak dapat menghapus akun sendiri!", "error");
        return;
    }

    const targetUser = dbData.users_auth?.find(u => u.uid === uid);
    if (targetUser && targetUser.role === 'developer') {
        showToast("⛔ Akun Developer tidak dapat dihapus!", "error");
        return;
    }

    if (!confirm(`⚠️ Yakin ingin menghapus user: ${nama}?\n\nUser ini akan kehilangan akses login.\nData absensi yang terkait tidak akan terpengaruh.\n\nTINDAKAN INI TIDAK DAPAT DIBATALKAN!`)) return;

    db.ref('users_auth/' + uid).remove()
        .then(() => {
            showToast(`✅ User "${nama}" berhasil dihapus dari Database.`, "success");
            
            if (typeof logActivity === 'function') {
                logActivity('delete_user', `Hapus user: ${nama} (UID: ${uid})`);
            }
            
            // Refresh cache foto
            usersPhotoCache.delete(uid);
            usersPhotoTimestampCache.delete(uid);
            
            renderUsersTable();
        })
        .catch((err) => showToast("❌ Gagal menghapus: " + err.message, "error"));
}

// ======================= RESET PASSWORD ========================

function resetUserPassword(email) {
    if (!email) { showToast("❌ Email tidak valid!", "error"); return; }
    
    if (!canResetPassword(currentUser?.role)) {
        showToast("⛔ Hanya Kepala Sekolah, Wakil Kepala Sekolah, dan Developer yang dapat mereset password!", "error");
        return;
    }
    
    if (!confirm(`⚠️ Kirim link reset password ke ${email}?`)) return;
    
    auth.sendPasswordResetEmail(email)
        .then(() => {
            showToast(`✅ Link reset password telah dikirim ke ${email}`, "success");
            if (typeof logActivity === 'function') {
                logActivity('reset_user_password', `Kirim link reset password ke ${email}`);
            }
        })
        .catch((err) => {
            if (err.code === 'auth/user-not-found') showToast("❌ Email tersebut tidak terdaftar di Firebase Auth!", "error");
            else showToast("❌ Gagal mengirim: " + err.message, "error");
        });
}

// ======================= RESET SYSTEM DATA ========================

function resetSystemData() {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'developer')) {
        showToast("⛔ Hanya Kepala Sekolah atau Developer yang dapat mereset sistem!", "error");
        return;
    }

    if (!confirm("🚨 PERINGATAN BERAT! 🚨\n\nSemua data akan dihapus:\n- Data siswa (users)\n- Data absensi\n- Kode registrasi\n- Data pengguna (users_auth) KECUALI akun developer (zaki5go@gmail.com)\n\nTINDAKAN INI TIDAK DAPAT DIBATALKAN!\n\nKetik 'RESET' untuk konfirmasi:")) return;

    const confirmation = prompt("Ketik 'RESET' untuk konfirmasi:");
    if (confirmation !== "RESET") {
        showToast("❌ Reset dibatalkan", "error");
        return;
    }

    showToast("⏳ Mereset data sistem...", "info");

    const protectedEmail = "zaki5go@gmail.com";

    const promises = [
        db.ref('users').remove(),
        db.ref('absensi').remove(),
        db.ref('codes').remove()
    ];

    const deleteUsersPromise = db.ref('users_auth').once('value').then(snapshot => {
        const users = snapshot.val();
        if (users) {
            const deletePromises = [];
            for (const [uid, userData] of Object.entries(users)) {
                if (userData.email !== protectedEmail) {
                    deletePromises.push(db.ref('users_auth/' + uid).remove());
                }
            }
            return Promise.all(deletePromises);
        }
    }).catch(err => console.error("Gagal melindungi akun:", err));

    promises.push(deleteUsersPromise);

    Promise.all(promises)
        .then(() => {
            showToast("✅ Reset berhasil! Akun " + protectedEmail + " tetap aman.", "success");
            
            if (typeof logActivity === 'function') {
                logActivity('reset_system', `Reset semua data sistem oleh ${currentUser.nama} (${getRoleDisplayName(currentUser.role)})`);
            }
            
            setTimeout(() => { auth.signOut().then(() => location.reload()); }, 2000);
        })
        .catch((err) => showToast("❌ Gagal mereset: " + err.message, "error"));
}

// ======================= CLEANUP ========================

function cleanupUsersSystem() {
    usersDataReadyListenerAdded = false;
    staffListLoadedForCode = false;
    staffListCacheForCode = [];
    usersPhotoCache.clear();
    usersPhotoTimestampCache.clear();
    console.log("🧹 Users system cleaned up");
}

function escapeHtmlString(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

// ======================= INISIALISASI ========================

setupUsersDataReadyListener();

// Jika data sudah ada, render langsung
if (typeof dbData !== 'undefined' && dbData.users_auth) {
    setTimeout(() => {
        console.log("📊 users.js: Initial render with existing data");
        if (typeof renderUsersTable === 'function') {
            renderUsersTable();
        }
        if (typeof renderCodesTable === 'function') {
            renderCodesTable();
        }
        if (typeof populateStudentSelectForCode === 'function') {
            populateStudentSelectForCode();
        }
        if (typeof populateStaffSelectForCode === 'function') {
            populateStaffSelectForCode();
        }
    }, 100);
}

// ======================= EKSPOR KE GLOBAL ========================
window.populateStudentSelectForCode = populateStudentSelectForCode;
window.populateStaffSelectForCode = populateStaffSelectForCode;
window.refreshStaffDropdown = refreshStaffDropdown;
window.generateRegistrationCode = generateRegistrationCode;
window.deleteCode = deleteCode;
window.renderCodesTable = renderCodesTable;
window.updateUserRole = updateUserRole;
window.renderUsersTable = renderUsersTable;
window.deleteUser = deleteUser;
window.resetSystemData = resetSystemData;
window.copyToClipboard = copyToClipboard;
window.resetUserPassword = resetUserPassword;
window.cleanupUsersSystem = cleanupUsersSystem;
window.getRoleDisplayName = getRoleDisplayName;
window.getRoleIcon = getRoleIcon;
window.canManageUser = canManageUser;
window.canGenerateCode = canGenerateCode;
window.canResetPassword = canResetPassword;
window.canDeleteUser = canDeleteUser;
window.isValidRole = isValidRole;
window.highlightUserInTable = highlightUserInTable;
window.highlightExistingCode = highlightExistingCode;
window.refreshUsersPhotoCache = refreshUsersPhotoCache;
window.updateUsersStatistics = updateUsersStatistics;

console.log("✅ users.js V5.3 loaded - Fixed user table display & photo cache");