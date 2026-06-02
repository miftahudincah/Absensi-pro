// users.js - VERSION 4.2 (DENGAN LOG AKTIVITAS)
// ============================================================================
// Manajemen User: Generate kode registrasi (dengan QR), daftar kode,
// daftar pengguna, ubah role, hapus user, reset password, reset sistem.
// Role developer (zaki5go@gmail.com) memiliki akses penuh seperti admin
// namun akun developer TIDAK bisa diubah role, dihapus, atau direset.
//
// PERUBAHAN V4.2:
// - Menambahkan logActivity untuk generate kode, delete kode, update role,
//   delete user, reset system, dan reset password
// ============================================================================

let usersDataReadyListenerAdded = false;

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
    });

    window.addEventListener('uiReady', (e) => {
        console.log("👥 users.js: uiReady received, checking permissions");
        if (typeof renderUsersTable === 'function') renderUsersTable();
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
    const teacherCodes = codes.filter(c => c.type === 'guru' && !c.used).length;

    statsContainer.innerHTML = `
        <div style="display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 15px; padding: 10px; background: #1e1e1e; border-radius: 8px;">
            <div><span style="color: #4caf50;">🟢 Aktif:</span> <strong>${activeCodes}</strong></div>
            <div><span style="color: #888;">🔴 Terpakai:</span> <strong>${usedCodes}</strong></div>
            <div><span style="color: #4a90e2;">👨‍🎓 Siswa:</span> <strong>${studentCodes}</strong></div>
            <div><span style="color: #ff9800;">👨‍🏫 Guru:</span> <strong>${teacherCodes}</strong></div>
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
    const currentSelectedText = select.options[select.selectedIndex]?.text;

    if (typeof dbData === 'undefined' || !dbData.users || !dbData.users_auth) {
        console.log("⏳ users.js: dbData not ready yet for populateStudentSelectForCode");
        select.innerHTML = '<option value="">-- Memuat data siswa --</option>';
        return;
    }

    select.innerHTML = '<option value="">-- Pilih Siswa --</option>';

    const registeredUserIds = dbData.users_auth?.map(u => u.fpId).filter(id => id) || [];
    const availableStudents = dbData.users.filter(s => !registeredUserIds.includes(s.id));

    if (availableStudents.length === 0) {
        select.innerHTML += '<option value="" disabled>✨ Semua siswa sudah memiliki akun</option>';
    } else {
        availableStudents.forEach(s => {
            select.innerHTML += `<option value="${s.id}">${escapeHtmlString(s.nama)} (ID: ${s.id}) | Kelas ${s.kelas || '-'}</option>`;
        });
    }

    if (currentVal && availableStudents.some(s => s.id == currentVal)) {
        select.value = currentVal;
    } else if (currentSelectedText && currentVal) {
        const match = availableStudents.find(s => s.nama === currentSelectedText.split('(')[0].trim());
        if (match) select.value = match.id;
    }
}

// ======================= GENERATE KODE REGISTRASI + QR CODE (DENGAN LOG) ========================
function generateRegistrationCode() {
    if (!currentUser) {
        showToast("Anda harus login!", "error");
        return;
    }

    if (currentUser.role !== 'admin' && currentUser.role !== 'guru' && currentUser.role !== 'developer') {
        showToast("⛔ Hanya Admin, Guru, dan Developer yang dapat generate kode!", "error");
        return;
    }

    const targetType = document.querySelector('input[name="genTarget"]:checked')?.value;
    if (!targetType) {
        showToast("Pilih target kode (Siswa/Guru)!", "error");
        return;
    }

    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const code = `REG-${timestamp.slice(-3)}${random}`;

    const codeData = {
        used: false,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        type: targetType,
        createdBy: currentUser.nama || currentUser.email
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
            const qrData = JSON.stringify({ code: code, studentId: selectedId });
            const qrContainerId = `qrcode-${code.replace(/[^a-zA-Z0-9]/g, '')}`;

            display.innerHTML = `
                <div style="background: #1a1a2e; border-radius: 8px; padding: 15px; margin: 10px 0; border-left: 4px solid #4a90e2;">
                    <div style="font-size: 12px; color: #888;">✨ KODE REGISTRASI BERHASIL DIGENERATE ✨</div>
                    <div style="font-size: 20px; font-family: monospace; font-weight: bold; color: #4a90e2; margin: 10px 0;">${code}</div>
                    <div>Tipe: <strong>${targetType.toUpperCase()}</strong></div>
                    <div>Terkunci ID: <strong>${selectedId}</strong> - ${studentName}</div>
                    <div>Dibuat oleh: <strong>${currentUser.nama || currentUser.email}</strong></div>
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
            
            // LOG: Generate kode siswa
            if (typeof logActivity === 'function') {
                logActivity('generate_code', `Generate kode ${targetType}: ${code} untuk ${studentName} (ID: ${selectedId})`);
            }
            
            if (typeof renderCodesTable === 'function') renderCodesTable();
            updateCodesStatistics();
        }).catch(err => {
            console.error("Generate code error:", err);
            showToast("❌ Gagal membuat kode: " + err.message, "error");
        }).finally(() => {
            if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
        });

    } else { // targetType === 'guru'
        db.ref('codes/' + code).set(codeData).then(() => {
            const display = document.getElementById('generatedKeyDisplay');
            display.style.display = 'block';
            const qrData = JSON.stringify({ code: code });
            const qrContainerId = `qrcode-${code.replace(/[^a-zA-Z0-9]/g, '')}`;

            display.innerHTML = `
                <div style="background: #1a1a2e; border-radius: 8px; padding: 15px; margin: 10px 0; border-left: 4px solid #ff9800;">
                    <div style="font-size: 12px; color: #888;">✨ KODE REGISTRASI GURU ✨</div>
                    <div style="font-size: 20px; font-family: monospace; font-weight: bold; color: #ff9800; margin: 10px 0;">${code}</div>
                    <div>Tipe: <strong>${targetType.toUpperCase()}</strong></div>
                    <div>Dibuat oleh: <strong>${currentUser.nama || currentUser.email}</strong></div>
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
            showToast(`✅ Kode registrasi Guru berhasil dibuat!`, "success");
            
            // LOG: Generate kode guru
            if (typeof logActivity === 'function') {
                logActivity('generate_code', `Generate kode ${targetType}: ${code}`);
            }
            
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

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast("📋 Kode berhasil disalin!", "success");
    }).catch(() => {
        showToast("❌ Gagal menyalin kode", "error");
    });
}

// ======================= DELETE KODE REGISTRASI (DENGAN LOG) ========================
function deleteCode(code) {
    const codeData = dbData.codes?.find(c => c.code === code);
    const codeInfo = codeData?.type ? `${codeData.type.toUpperCase()} - ${code}` : code;
    if (!confirm(`⚠️ Yakin ingin menghapus kode: ${codeInfo}?\n\nKode yang sudah dihapus tidak dapat digunakan lagi.`)) return;
    
    db.ref('codes/' + code).remove()
        .then(() => {
            showToast(`✅ Kode ${code} berhasil dihapus`, "success");
            
            // LOG: Hapus kode
            if (typeof logActivity === 'function') {
                logActivity('delete_code', `Hapus kode: ${codeInfo}`);
            }
            
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
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 30px; color:#888;">🔑 Belum ada kode registrasi. Generate kode di atas.</option></td></tr>`;
        updateCodesStatistics();
        return;
    }
    const sorted = [...dbData.codes].reverse();
    sorted.forEach(c => {
        const typeLabel = c.type ? c.type.toUpperCase() : 'UMUM';
        const typeIcon = c.type === 'siswa' ? '👨‍🎓' : (c.type === 'guru' ? '👨‍🏫' : '🔑');
        const linkedLabel = c.linkedId ? `<br><small style="color:#888">🔒 ID: ${c.linkedId}</small>` : '';
        const createdByName = c.createdBy ? `<br><small>👤 ${c.createdBy}</small>` : '';
        const timeRemaining = getCodeTimeRemaining(c.createdAt);
        tbody.innerHTML += `
            <tr class="${!c.used && timeRemaining?.includes('menit') ? 'code-expiring-soon' : ''}">
                <td style="font-family:monospace; font-weight:bold;">
                    <span style="color:${c.type === 'siswa' ? '#4a90e2' : '#ff9800'}">${typeIcon}</span>
                    <strong>${c.code}</strong>
                    <br><small style="font-weight:normal; color:#888">${typeLabel}${linkedLabel}${createdByName}</small>
                </td>
                <td>${c.used ? '<span style="color:#4caf50;">✅ Terpakai</span>' : `<span style="color:#ff9800;">🟢 Aktif</span>${timeRemaining ? `<br><small style="color:#888;">⏰ ${timeRemaining}</small>` : ''}`}</td>
                <td style="font-size: 12px;">${c.createdAt ? new Date(c.createdAt).toLocaleString('id-ID') : '-'}</td>
                <td style="font-size: 12px;">${c.userId ? c.userId.substring(0, 20) + '...' : '-'}</td>
                <td>${!c.used ? `<button class="btn-icon" onclick="copyToClipboard('${c.code}')" title="Salin Kode">📋</button>
                                <button class="btn-icon delete" onclick="deleteCode('${c.code}')" title="Hapus Kode">🗑️</button>` : '-'}</td>
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

// ======================= UPDATE USER ROLE (DENGAN LOG) ========================
function updateUserRole(uid, newRole) {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'developer')) {
        showToast("⛔ Hanya Admin dan Developer yang dapat mengubah role!", "error");
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

    const roleNames = { siswa: 'Siswa', guru: 'Guru', admin: 'Admin' };
    if (!confirm(`⚠️ Yakin ingin mengubah role ${user.nama} dari ${roleNames[user.role]} menjadi ${roleNames[newRole]}?`)) return;

    const btn = document.querySelector(`select[onchange*="updateUserRole('${uid}']`);
    if (btn) btn.disabled = true;

    db.ref('users_auth/' + uid).update({
        role: newRole,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        showToast(`✅ Role ${user.nama} berhasil diubah menjadi ${roleNames[newRole]}`, "success");
        
        // LOG: Ubah role user
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
    const roleOrder = { developer: 0, admin: 1, guru: 2, siswa: 3 };
    data.sort((a, b) => (roleOrder[a.role] || 4) - (roleOrder[b.role] || 4));

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
        const canManage = currentUser && (currentUser.role === 'admin' || currentUser.role === 'developer');
        const canManageThisUser = canManage && !isDeveloper && !isMe;

        if (canManageThisUser) {
            roleHtml = `
                <select class="form-control" onchange="updateUserRole('${u.uid}', this.value)" 
                        style="background:#2c2c2c; color:white; border:1px solid #444; padding:5px; border-radius:4px; font-size:0.8rem;">
                    <option value="siswa" ${u.role === 'siswa' ? 'selected' : ''}>👨‍🎓 Siswa</option>
                    <option value="guru" ${u.role === 'guru' ? 'selected' : ''}>👨‍🏫 Guru</option>
                    <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>👑 Admin</option>
                </select>
            `;
            actionsHtml = `
                <button class="btn-icon delete" onclick="deleteUser('${u.uid}', '${escapeHtmlString(u.nama)}')" 
                        title="Hapus User" style="background:transparent; border:none; cursor:pointer; color:#f44336; font-size:18px;">🗑️</button>
                <button class="btn-icon" onclick="resetUserPassword('${u.email}')" 
                        title="Reset Password" style="background:transparent; border:none; cursor:pointer; color:#ff9800; font-size:18px;">🔑</button>
            `;
        } else {
            let roleIcon = '👨‍🎓';
            let roleClass = 'role-siswa';
            if (u.role === 'admin') {
                roleIcon = '👑';
                roleClass = 'role-admin';
            } else if (u.role === 'guru') {
                roleIcon = '👨‍🏫';
                roleClass = 'role-guru';
            } else if (u.role === 'developer') {
                roleIcon = '👨‍💻';
                roleClass = 'role-developer';
            }
            roleHtml = `<span class="role-badge ${roleClass}">${roleIcon} ${u.role.toUpperCase()}</span>`;
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
        } else if (u.role === 'developer') {
            detailIcon = '⚡';
            detailText = 'Developer (Paten)';
        } else {
            detailIcon = '⚙️';
            detailText = 'Administrator';
        }
        const registeredDate = u.registeredAt ? new Date(u.registeredAt).toLocaleDateString('id-ID') : '-';

        tbody.innerHTML += `
            <tr class="${isMe ? 'current-user-row' : ''}">
                <td style="text-align:center;"><img src="${avatar}" style="width:40px; height:40px; border-radius:50%; object-fit:cover;"></td>
                <td><strong>${escapeHtmlString(u.nama)}</strong>${isMe ? '<br><small style="color:#4a90e2;">Akun Anda</small>' : ''}</td>
                <td style="color:#aaa; font-size:0.85rem;">${u.email || '-'}</td>
                <td>${roleHtml}</td>
                <td style="color:#888; font-size:0.8rem;">${detailIcon} ${escapeHtmlString(detailText)}<br><small>📅 ${registeredDate}</small></td>
                <td style="text-align:center;">${actionsHtml}</td>
            </tr>
        `;
    });
    console.log(`✅ renderUsersTable: ${data.length} users ditampilkan`);
}

function resetUserPassword(email) {
    if (!email) { showToast("❌ Email tidak valid!", "error"); return; }
    if (!confirm(`⚠️ Kirim link reset password ke ${email}?`)) return;
    
    auth.sendPasswordResetEmail(email)
        .then(() => {
            showToast(`✅ Link reset password telah dikirim ke ${email}`, "success");
            // LOG: Reset password user
            if (typeof logActivity === 'function') {
                logActivity('reset_user_password', `Kirim link reset password ke ${email}`);
            }
        })
        .catch((err) => {
            if (err.code === 'auth/user-not-found') showToast("❌ Email tersebut tidak terdaftar di Firebase Auth!", "error");
            else showToast("❌ Gagal mengirim: " + err.message, "error");
        });
}

// ======================= DELETE USER (DENGAN LOG) ========================
function deleteUser(uid, nama) {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'developer')) {
        showToast("⛔ Hanya Admin dan Developer yang dapat menghapus user!", "error");
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
            
            // LOG: Hapus user
            if (typeof logActivity === 'function') {
                logActivity('delete_user', `Hapus user: ${nama} (UID: ${uid})`);
            }
            
            renderUsersTable();
        })
        .catch((err) => showToast("❌ Gagal menghapus: " + err.message, "error"))
        .finally(() => { if (btn) btn.disabled = false; });
}

// ======================= RESET SYSTEM DATA (DENGAN LOG) ========================
function resetSystemData() {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'developer')) {
        showToast("⛔ Hanya Admin atau Developer yang dapat mereset sistem!", "error");
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
            
            // LOG: Reset sistem
            if (typeof logActivity === 'function') {
                logActivity('reset_system', `Reset semua data sistem oleh ${currentUser.nama} (${currentUser.email})`);
            }
            
            setTimeout(() => { auth.signOut().then(() => location.reload()); }, 2000);
        })
        .catch((err) => showToast("❌ Gagal mereset: " + err.message, "error"));
}

// ======================= CLEANUP ========================
function cleanupUsersSystem() {
    usersDataReadyListenerAdded = false;
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
    }, 100);
}

// Ekspor ke global
window.populateStudentSelectForCode = populateStudentSelectForCode;
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

console.log("✅ users.js V4.2 loaded - Dengan log aktivitas untuk manajemen user & kode");