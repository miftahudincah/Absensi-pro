// users.js - VERSION 5.2 (FULLY LOCKED: GURU & STAFF SAME AS STUDENT)
// Manajemen User: Generate kode registrasi (dengan QR), daftar kode,
// daftar pengguna, ubah role, hapus user, reset password, reset sistem.
// Role yang didukung: developer, admin (Kepala Sekolah), wakil_kepala, staff_tu, guru, siswa
// PERUBAHAN V5.2: 
//   - GURU dan STAFF memiliki validasi KETAT seperti SISWA
//   - CEK apakah sudah memiliki akun (berdasarkan email)
//   - CEK apakah masih memiliki kode aktif (berdasarkan linkedId)
//   - HIGHLIGHT di tabel user/kode jika sudah ada
//   - RESET dropdown setelah generate
// ============================================================================

let usersDataReadyListenerAdded = false;

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

// ======================= EVENT LISTENER DATA READY ========================
function setupUsersDataReadyListener() {
    if (usersDataReadyListenerAdded) return;
    usersDataReadyListenerAdded = true;
    console.log("📡 Setting up dataReady event listener for users module");

    window.addEventListener('dataReady', (e) => {
        console.log("🔄 users.js: dataReady received, updating users UI");
        if (typeof renderUsersTable === 'function') renderUsersTable();
        if (typeof renderCodesTable === 'function') renderCodesTable();
        updateCodesStatistics();
        if (typeof populateStudentSelectForCode === 'function') populateStudentSelectForCode();
        if (typeof populateStaffSelectForCode === 'function') populateStaffSelectForCode();
    });

    window.addEventListener('uiReady', (e) => {
        console.log("👥 users.js: uiReady received, checking permissions");
        if (typeof renderUsersTable === 'function') renderUsersTable();
        if (typeof populateStaffSelectForCode === 'function') populateStaffSelectForCode();
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
    const teacherCodes = codes.filter(c => (c.type === 'guru' || c.type === 'staff_tu' || c.type === 'wakil_kepala' || c.type === 'staff') && !c.used).length;

    statsContainer.innerHTML = `
        <div style="display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 15px; padding: 10px; background: #1e1e1e; border-radius: 8px;">
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
    
    // Ambil staff yang sudah memiliki kode aktif
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

// ======================= DROPDOWN STAFF UNTUK GENERATE KODE (FILTER KETAT) ========================
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
        
        // Ambil semua staff yang sudah memiliki kode aktif (belum used)
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
                
                // ========== HANYA STAFF YANG BELUM PUNYA AKUN DAN BELUM PUNYA KODE AKTIF ==========
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
        
        // Tampilkan ringkasan di console
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

// ======================= GENERATE KODE REGISTRASI + QR CODE (VALIDASI KETAT) ========================
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

    // ========== VALIDASI WAJIB PILIH SEBELUM GENERATE ==========
    
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
    }
    // ========== VALIDASI UNTUK GURU (WAJIB PILIH DROPDOWN & CEK KETAT) ==========
    else if (targetType === 'guru') {
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
        
        // ========== VALIDASI WAJIB: Harus memilih staff dari dropdown! ==========
        if (!isValidSelection) {
            return showDropdownError(selectStaff, "⚠️ HARAP PILIH GURU DARI DROPDOWN TERLEBIH DAHULU sebelum generate kode!");
        }
        
        const selectedOption = selectStaff.querySelector('option[value="' + selectedStaffId + '"]');
        const staffEmail = selectedOption?.getAttribute('data-email');
        const staffName = selectedOption?.getAttribute('data-nama');
        const staffJabatan = selectedOption?.getAttribute('data-jabatan') || 'guru';
        
        if (!staffEmail) {
            showToast(`❌ GURU ini tidak memiliki email! Silakan edit data staff dan isi email terlebih dahulu.`, "error");
            return;
        }
        
        // ========== CEK APAKAH SUDAH MEMILIKI AKUN (SAMA SEPERTI SISWA) ==========
        const existingUser = dbData.users_auth?.find(u => u.email?.toLowerCase() === staffEmail.toLowerCase());
        if (existingUser) {
            showToast(`❌ GAGAL: Guru (${staffName}) sudah memiliki akun dengan email ${staffEmail}.`, "error");
            highlightUserInTable(staffEmail);
            return;
        }
        
        // ========== CEK APAKAH MASIH ADA KODE AKTIF UNTUK ID STAFF YANG SAMA ==========
        const existingCode = dbData.codes?.find(c => c.linkedId == selectedStaffId && !c.used && (c.type === 'guru' || c.type === 'staff'));
        if (existingCode) {
            showToast(`❌ GAGAL: Guru ini masih memiliki kode aktif (${existingCode.code})! Tunggu expired atau hapus kode lama!`, "error");
            highlightExistingCode(existingCode.code);
            return;
        }
        
        // Jika lolos semua validasi, generate kode GURU dengan data lengkap
        const codeData = {
            used: false,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            type: targetType,
            createdBy: currentUser.nama || currentUser.email,
            createdRole: currentUser.role,
            linkedId: selectedStaffId,
            linkedEmail: staffEmail,
            linkedName: staffName,
            targetRole: 'guru',
            requireId: true,
            nama: staffName,
            email: staffEmail,
            jabatan: staffJabatan
        };
        
        generateStaffCode(codeData, targetType, selectedStaffId, staffName, staffEmail, staffJabatan, 'guru');
        return;
    }
    // ========== VALIDASI UNTUK STAFF (WAJIB PILIH DROPDOWN & CEK KETAT) ==========
    else if (targetType === 'staff') {
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
        
        // ========== VALIDASI WAJIB: Harus memilih staff dari dropdown! ==========
        if (!isValidSelection) {
            return showDropdownError(selectStaff, "⚠️ HARAP PILIH STAFF DARI DROPDOWN TERLEBIH DAHULU sebelum generate kode!");
        }
        
        const selectedOption = selectStaff.querySelector('option[value="' + selectedStaffId + '"]');
        const staffEmail = selectedOption?.getAttribute('data-email');
        const staffName = selectedOption?.getAttribute('data-nama');
        const staffRole = selectedOption?.getAttribute('data-role');
        const staffJabatan = selectedOption?.getAttribute('data-jabatan') || 'guru';
        
        if (!staffEmail) {
            showToast(`❌ STAFF ini tidak memiliki email! Silakan edit data staff dan isi email terlebih dahulu.`, "error");
            return;
        }
        
        // ========== CEK APAKAH SUDAH MEMILIKI AKUN (SAMA SEPERTI SISWA) ==========
        const existingUser = dbData.users_auth?.find(u => u.email?.toLowerCase() === staffEmail.toLowerCase());
        if (existingUser) {
            const roleName = existingUser.role === 'admin' ? 'Kepala Sekolah' : 
                            (existingUser.role === 'wakil_kepala' ? 'Wakil Kepala' :
                            (existingUser.role === 'staff_tu' ? 'Staff TU' : 'Guru'));
            showToast(`❌ GAGAL: Staff (${staffName}) sudah memiliki akun sebagai ${roleName} dengan email ${staffEmail}.`, "error");
            highlightUserInTable(staffEmail);
            return;
        }
        
        // ========== CEK APAKAH MASIH ADA KODE AKTIF UNTUK ID STAFF YANG SAMA ==========
        const existingCode = dbData.codes?.find(c => c.linkedId == selectedStaffId && !c.used && (c.type === 'staff' || c.type === 'staff_tu' || c.type === 'wakil_kepala'));
        if (existingCode) {
            showToast(`❌ GAGAL: Staff ini masih memiliki kode aktif (${existingCode.code})! Tunggu expired atau hapus kode lama!`, "error");
            highlightExistingCode(existingCode.code);
            return;
        }
        
        let targetRole = staffRole || 'guru';
        
        // Jika lolos semua validasi, generate kode STAFF dengan data lengkap
        const codeData = {
            used: false,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            type: targetType,
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
            roleLabel: targetRole === 'admin' ? 'Kepala Sekolah' : 
                      (targetRole === 'wakil_kepala' ? 'Wakil Kepala Sekolah' :
                      (targetRole === 'staff_tu' ? 'Staff TU' : 'Guru'))
        };
        
        generateStaffCode(codeData, targetType, selectedStaffId, staffName, staffEmail, staffJabatan, targetRole);
        return;
    }
    else {
        showToast("❌ Target kode tidak valid!", "error");
        return;
    }

    // ========== GENERATE KODE UNTUK SISWA ==========
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const code = `REG-${timestamp.slice(-3)}${random}`;

    const codeData = {
        used: false,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        type: targetType,
        createdBy: currentUser.nama || currentUser.email,
        createdRole: currentUser.role
    };

    const btn = document.querySelector('button[onclick="generateRegistrationCode()"]');
    const originalText = btn?.innerHTML;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ Generating...';
    }

    if (targetType === 'siswa') {
        const selectedId = document.getElementById('selectStudentForCode').value;
        if (!selectedId) {
            showToast("⚠️ Harap pilih Siswa terlebih dahulu!", "error");
            if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
            return;
        }

        const existingUser = dbData.users_auth?.find(u => u.fpId == selectedId);
        if (existingUser) {
            showToast(`❌ GAGAL: ID Siswa (${selectedId}) sudah terdaftar pada akun (${existingUser.email}).`, "error");
            if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
            return;
        }

        const existingCode = dbData.codes?.find(c => c.linkedId == selectedId && !c.used && c.type === 'siswa');
        if (existingCode) {
            showToast(`❌ GAGAL: Siswa ini masih memiliki kode aktif (${existingCode.code}). Tunggu expired!`, "error");
            if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
            return;
        }

        codeData.linkedId = selectedId;
        const student = dbData.users.find(s => s.id == selectedId);
        const studentName = student?.nama || selectedId;

        db.ref('codes/' + code).set(codeData).then(() => {
            const display = document.getElementById('generatedKeyDisplay');
            display.style.display = 'block';
            const qrData = JSON.stringify({ 
                code: code, 
                studentId: selectedId,
                type: 'siswa',
                requireId: true,
                nama: studentName
            });
            const qrContainerId = `qrcode-${code.replace(/[^a-zA-Z0-9]/g, '')}`;

            display.innerHTML = `
                <div style="background: #1a1a2e; border-radius: 8px; padding: 15px; margin: 10px 0; border-left: 4px solid #4a90e2;">
                    <div style="font-size: 12px; color: #888;">✨ KODE REGISTRASI BERHASIL DIGENERATE ✨</div>
                    <div style="font-size: 20px; font-family: monospace; font-weight: bold; color: #4a90e2; margin: 10px 0;">${code}</div>
                    <div>Tipe: <strong>SISWA</strong> 👨‍🎓</div>
                    <div><span style="color: #ff9800;">🆔 ID WAJIB: <strong>${selectedId}</strong></span></div>
                    <div>Terkunci ID: <strong>${selectedId}</strong> - ${studentName}</div>
                    <div>Kelas: <strong>${student?.kelas || '-'}</strong> | Jurusan: <strong>${student?.jurusan || '-'}</strong></div>
                    <div>Dibuat oleh: <strong>${currentUser.nama || currentUser.email} (${getRoleDisplayName(currentUser.role)})</strong></div>
                    <div style="margin-top: 10px;"><small>⏰ Kode akan expired dalam 5 jam</small></div>
                    <div id="${qrContainerId}" style="margin: 15px auto; display: flex; justify-content: center;"></div>
                    <button class="btn-action btn-success" onclick="copyToClipboard('${code}')" style="margin-top: 10px;">📋 Copy Kode</button>
                </div>
            `;

            try {
                new QRCode(document.getElementById(qrContainerId), {
                    text: qrData,
                    width: 150,
                    height: 150,
                    colorDark: "#000000",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.H
                });
            } catch (err) {
                console.error("QR Code generation error:", err);
                document.getElementById(qrContainerId).innerHTML = '<span style="color:red;">Gagal generate QR</span>';
            }
            showToast(`✅ Kode untuk ${studentName} berhasil dibuat!`, "success");
            
            if (typeof logActivity === 'function') {
                logActivity('generate_code', `Generate kode ${targetType}: ${code} untuk ${studentName} (ID: ${selectedId}) oleh ${getRoleDisplayName(currentUser.role)}`);
            }
            
            // RESET DROPDOWN agar tidak bisa generate ulang dengan ID yang sama
            const selectSiswa = document.getElementById('selectStudentForCode');
            if (selectSiswa) {
                selectSiswa.value = '';
                selectSiswa.style.borderColor = '';
                selectSiswa.style.backgroundColor = '';
            }
            
            // Refresh dropdown untuk menghilangkan siswa yang sudah digenerate
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
}

/**
 * Fungsi helper untuk generate kode staff/guru dengan reset dropdown
 */
function generateStaffCode(codeData, targetType, selectedStaffId, staffName, staffEmail, staffJabatan, targetRole) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const code = `REG-${timestamp.slice(-3)}${random}`;
    
    codeData.code = code;
    
    const btn = document.querySelector('button[onclick="generateRegistrationCode()"]');
    const originalText = btn?.innerHTML;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ Generating...';
    }
    
    let typeDisplay = '';
    let borderColor = '';
    let textColor = '';
    let roleIcon = '';
    let roleLabel = '';
    
    if (targetType === 'guru') {
        typeDisplay = 'GURU';
        borderColor = '#ff9800';
        textColor = '#ff9800';
        roleIcon = '👨‍🏫';
        roleLabel = 'Guru';
    } else {
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
    }
    
    db.ref('codes/' + code).set(codeData).then(() => {
        const display = document.getElementById('generatedKeyDisplay');
        display.style.display = 'block';
        
        const qrData = JSON.stringify({ 
            code: code, 
            staffId: selectedStaffId, 
            email: staffEmail, 
            nama: staffName,
            jabatan: staffJabatan,
            type: targetType,
            targetRole: targetRole,
            requireId: true,
            roleLabel: roleLabel
        });
        const qrContainerId = `qrcode-${code.replace(/[^a-zA-Z0-9]/g, '')}`;
        
        let additionalInfo = '';
        if (targetType === 'guru') {
            additionalInfo = `<div>Jabatan: <strong>Guru</strong></div>`;
        } else {
            additionalInfo = `<div>Jabatan: <strong>${roleLabel}</strong> ${roleIcon}</div>`;
        }

        display.innerHTML = `
            <div style="background: #1a1a2e; border-radius: 8px; padding: 15px; margin: 10px 0; border-left: 4px solid ${borderColor};">
                <div style="font-size: 12px; color: #888;">✨ KODE REGISTRASI BERHASIL DIGENERATE ✨</div>
                <div style="font-size: 20px; font-family: monospace; font-weight: bold; color: ${textColor}; margin: 10px 0;">${code}</div>
                <div>Tipe: <strong>${typeDisplay}</strong> ${roleIcon}</div>
                <div><span style="color: #ff9800;">🆔 ID WAJIB: <strong>${selectedStaffId}</strong></span></div>
                <div>Terkunci ID: <strong>${selectedStaffId}</strong> - ${escapeHtmlString(staffName)}</div>
                <div>Email: <strong>${escapeHtmlString(staffEmail)}</strong></div>
                ${additionalInfo}
                <div>Dibuat oleh: <strong>${currentUser.nama || currentUser.email} (${getRoleDisplayName(currentUser.role)})</strong></div>
                <div style="margin-top: 10px;"><small>⏰ Kode akan expired dalam 5 jam</small></div>
                <div id="${qrContainerId}" style="margin: 15px auto; display: flex; justify-content: center;"></div>
                <button class="btn-action btn-success" onclick="copyToClipboard('${code}')" style="margin-top: 10px;">📋 Copy Kode</button>
            </div>
        `;

        try {
            new QRCode(document.getElementById(qrContainerId), {
                text: qrData,
                width: 150,
                height: 150,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
        } catch (err) {
            console.error("QR Code generation error:", err);
            document.getElementById(qrContainerId).innerHTML = '<span style="color:red;">Gagal generate QR</span>';
        }
        
        const roleDisplayName = targetType === 'guru' ? 'GURU' : typeDisplay;
        showToast(`✅ Kode registrasi untuk ${staffName} (${roleDisplayName}) berhasil dibuat!`, "success");
        
        if (typeof logActivity === 'function') {
            logActivity('generate_code', `Generate kode ${targetType}: ${code} untuk ${staffName} (ID: ${selectedStaffId}) role ${targetRole} oleh ${getRoleDisplayName(currentUser.role)}`);
        }
        
        // RESET DROPDOWN agar tidak bisa generate ulang dengan ID yang sama
        const selectStaff = document.getElementById('selectStaffForCode');
        if (selectStaff) {
            selectStaff.value = '';
            selectStaff.style.borderColor = '';
            selectStaff.style.backgroundColor = '';
        }
        
        // Refresh dropdown untuk menghilangkan staff yang sudah digenerate
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
            
            // Refresh dropdown setelah hapus kode
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
        tbody.innerHTML = `<td><td colspan="5" style="text-align:center; padding: 30px; color:#888;">🔑 Belum ada kode registrasi. Generate kode di atas.</option></tr></tr>`;
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
        } else if (c.type === 'staff_tu') {
            typeLabel = 'STAFF TU';
            typeIcon = '📋';
            colorStyle = '#607d8b';
            linkedInfo = c.linkedName ? `<br><small style="color:#888">👤 ${escapeHtmlString(c.linkedName)}</small>` : '';
            if (c.linkedEmail) linkedInfo += `<br><small style="color:#888">📧 ${escapeHtmlString(c.linkedEmail)}</small>`;
        } else if (c.type === 'wakil_kepala') {
            typeLabel = 'WAKIL KEPALA SEKOLAH';
            typeIcon = '👔';
            colorStyle = '#9c27b0';
            linkedInfo = c.linkedName ? `<br><small style="color:#888">👤 ${escapeHtmlString(c.linkedName)}</small>` : '';
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
                 </td>
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

    const btn = document.querySelector(`select[onchange*="updateUserRole('${uid}']`);
    if (btn) btn.disabled = true;

    db.ref('users_auth/' + uid).update({
        role: newRole,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        showToast(`✅ Role ${user.nama} berhasil diubah menjadi ${roleNames[newRole]}`, "success");
        
        if (typeof logActivity === 'function') {
            logActivity('update_user_role', `Ubah role ${user.nama} (${user.email}) dari ${user.role} menjadi ${newRole} oleh ${getRoleDisplayName(currentUser.role)}`);
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
    }).finally(() => {
        if (btn) btn.disabled = false;
    });
}

// ======================= RENDER TABEL PENGGUNA (USER MANAGEMENT) ========================
function renderUsersTable() {
    console.log("🎨 renderUsersTable dipanggil");
    const tbody = document.getElementById('tbody-users');
    const searchInput = document.getElementById('searchUser');
    const search = searchInput?.value.toLowerCase() || '';
    if (!tbody) {
        console.warn("⚠️ tbody-users tidak ditemukan!");
        return;
    }
    tbody.innerHTML = '';
    if (typeof dbData === 'undefined' || !dbData.users_auth || dbData.users_auth.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 30px; color:#888;">👥 Belum ada pengguna terdaftar.</option></td></tr>`;
        return;
    }

    let data = dbData.users_auth.filter(u => u.nama && u.nama.toLowerCase().includes(search));
    data.sort((a, b) => getRolePriority(a.role) - getRolePriority(b.role));

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 30px; color:#888;">🔍 Tidak ada pengguna yang cocok dengan pencarian.</option></td></tr>`;
        return;
    }

    data.forEach(u => {
        const isMe = (currentUser && currentUser.uid === u.uid);
        const avatar = u.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.nama || 'User')}&background=random&color=fff&size=40`;

        let roleHtml = '';
        let actionsHtml = '-';

        const isDeveloper = (u.role === 'developer');
        const canManageThisUser = canManageUser(currentUser, u);
        const canDeleteThisUser = canDeleteUser(currentUser?.role);
        const canResetPassThisUser = canResetPassword(currentUser?.role);

        if (canManageThisUser) {
            roleHtml = `
                <select class="form-control" onchange="updateUserRole('${u.uid}', this.value)" 
                        style="background:#2c2c2c; color:white; border:1px solid #444; padding:5px; border-radius:4px; font-size:0.8rem;">
                    <option value="siswa" ${u.role === 'siswa' ? 'selected' : ''}>👨‍🎓 Siswa</option>
                    <option value="guru" ${u.role === 'guru' ? 'selected' : ''}>👨‍🏫 Guru</option>
                    <option value="staff_tu" ${u.role === 'staff_tu' ? 'selected' : ''}>📋 Staff TU</option>
                    <option value="wakil_kepala" ${u.role === 'wakil_kepala' ? 'selected' : ''}>👔 Wakil Kepala Sekolah</option>
                    <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>👑 Kepala Sekolah</option>
                </select>
            `;
            
            let actionButtons = '';
            if (canDeleteThisUser && !isDeveloper && !isMe) {
                actionButtons += `<button class="btn-icon delete" onclick="deleteUser('${u.uid}', '${escapeHtmlString(u.nama)}')" 
                        title="Hapus User" style="background:transparent; border:none; cursor:pointer; color:#f44336; font-size:18px;">🗑️</button>`;
            }
            if (canResetPassThisUser && !isDeveloper) {
                actionButtons += `<button class="btn-icon" onclick="resetUserPassword('${u.email}')" 
                        title="Reset Password" style="background:transparent; border:none; cursor:pointer; color:#ff9800; font-size:18px;">🔑</button>`;
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

        tbody.innerHTML += `
            <tr class="${isMe ? 'current-user-row' : ''}">
                <td style="text-align:center;"><img src="${avatar}" style="width:40px; height:40px; border-radius:50%; object-fit:cover;"></td>
                <td><strong>${escapeHtmlString(u.nama)}</strong>${isMe ? '<br><small style="color:#4a90e2;">Akun Anda</small>' : ''}</td>
                <td style="color:#aaa; font-size:0.85rem;">${u.email || '-'}</div>
                <td>${roleHtml}</div>
                <td style="color:#888; font-size:0.8rem;">${detailIcon} ${escapeHtmlString(detailText)}<br><small>📅 ${registeredDate}</small></div>
                <td style="text-align:center;">${actionsHtml}</div>
            </tr>
        `;
    });
    console.log(`✅ renderUsersTable: ${data.length} users ditampilkan`);
}

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
                logActivity('reset_user_password', `Kirim link reset password ke ${email} oleh ${getRoleDisplayName(currentUser.role)}`);
            }
        })
        .catch((err) => {
            if (err.code === 'auth/user-not-found') showToast("❌ Email tersebut tidak terdaftar di Firebase Auth!", "error");
            else showToast("❌ Gagal mengirim: " + err.message, "error");
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

    const btn = document.querySelector(`button[onclick*="deleteUser('${uid}']`);
    if (btn) btn.disabled = true;

    db.ref('users_auth/' + uid).remove()
        .then(() => {
            showToast(`✅ User "${nama}" berhasil dihapus dari Database.`, "success");
            
            if (typeof logActivity === 'function') {
                logActivity('delete_user', `Hapus user: ${nama} (UID: ${uid}) oleh ${getRoleDisplayName(currentUser.role)}`);
            }
            
            renderUsersTable();
        })
        .catch((err) => showToast("❌ Gagal menghapus: " + err.message, "error"))
        .finally(() => { if (btn) btn.disabled = false; });
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
    console.log("🧹 Users system cleaned up");
}

function escapeHtmlString(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

// ======================= INISIALISASI ========================
setupUsersDataReadyListener();

if (typeof dbData !== 'undefined' && dbData.users_auth) {
    setTimeout(() => {
        if (typeof renderUsersTable === 'function') renderUsersTable();
        if (typeof renderCodesTable === 'function') renderCodesTable();
        if (typeof populateStudentSelectForCode === 'function') populateStudentSelectForCode();
        if (typeof populateStaffSelectForCode === 'function') populateStaffSelectForCode();
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

console.log("✅ users.js V5.2 loaded - FULLY LOCKED: GURU & STAFF validasi ketat seperti SISWA (cek akun, cek kode aktif, reset dropdown, highlight)!");