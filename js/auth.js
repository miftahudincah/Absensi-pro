// auth.js - VERSION 5.0 (DENGAN ROLE BARU: WAKIL KEPALA SEKOLAH & STAFF TU)
// Fitur: Registrasi langsung, QR Scanner, Upload foto profil ke Supabase
// Role yang didukung: developer, admin (Kepala Sekolah), wakil_kepala, staff_tu, guru, siswa
// ============================================================================

let lastRegisterAttempt = 0;
const REGISTER_COOLDOWN = 30000;

// Variabel untuk QR Scanner
let html5QrCode = null;
let isScanning = false;

// ======================= ROLE HELPER FUNCTIONS =======================

/**
 * Validasi apakah role valid
 */
function isValidRole(role) {
    const validRoles = ['developer', 'admin', 'wakil_kepala', 'staff_tu', 'guru', 'siswa'];
    return validRoles.includes(role);
}

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
 * Update tampilan user interface berdasarkan role
 */
function updateUserInterfaceByRole() {
    if (!currentUser) return;
    
    // Update navbar
    const navbarUserRole = document.getElementById('navbarUserRole');
    if (navbarUserRole) {
        navbarUserRole.textContent = getRoleDisplayName(currentUser.role);
    }
    
    // Update user role display
    const userRoleDisplay = document.getElementById('userRoleDisplay');
    if (userRoleDisplay) {
        userRoleDisplay.textContent = `${getRoleIcon(currentUser.role)} ${getRoleDisplayName(currentUser.role)}`;
    }
    
    // Update sidebar user role
    const sidebarUserRole = document.getElementById('sidebarUserRole');
    if (sidebarUserRole) {
        sidebarUserRole.textContent = getRoleDisplayName(currentUser.role);
    }
}

// ======================= FUNGSI QR SCANNER =======================

function openQrScanner() {
    const modal = document.getElementById('modal-qr-scanner');
    if (!modal) {
        showToast("Modal scanner tidak ditemukan!", "error");
        return;
    }
    
    if (typeof Html5Qrcode === 'undefined') {
        showToast("Library QR scanner belum dimuat. Muat ulang halaman.", "error");
        console.error("Html5Qrcode is not defined");
        return;
    }
    
    modal.classList.add('open');
    
    const qrReader = document.getElementById('qr-reader');
    const resultsDiv = document.getElementById('qr-reader-results');
    if (!qrReader) {
        showToast("Elemen scanner tidak ditemukan!", "error");
        return;
    }
    
    qrReader.style.width = '100%';
    qrReader.style.minHeight = '300px';
    qrReader.style.backgroundColor = '#000';
    
    qrReader.innerHTML = '';
    if (resultsDiv) {
        resultsDiv.innerHTML = '<span style="color:#ff9800;">⏳ Mengaktifkan kamera...</span>';
        resultsDiv.style.padding = '8px';
    }
    
    if (html5QrCode && isScanning) {
        html5QrCode.stop().then(() => {
            html5QrCode.clear();
            isScanning = false;
            startScanner(qrReader, resultsDiv);
        }).catch((err) => {
            console.warn("Error stopping previous scanner:", err);
            startScanner(qrReader, resultsDiv);
        });
    } else {
        startScanner(qrReader, resultsDiv);
    }
}

function startScanner(qrReader, resultsDiv) {
    qrReader.innerHTML = '';
    
    html5QrCode = new Html5Qrcode("qr-reader");
    const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
        disableFlip: false,
        formatsToSupport: [ Html5QrcodeSupportedFormats.QR_CODE ]
    };
    
    html5QrCode.start(
        { facingMode: "environment" },
        config,
        (decodedText, decodedResult) => {
            console.log("✅ QR Code terbaca:", decodedText);
            if (resultsDiv) {
                resultsDiv.innerHTML = '<span style="color:#4caf50; font-weight:bold;">✅ QR terbaca! Memproses...</span>';
            }
            handleQrScan(decodedText);
            
            if (html5QrCode && isScanning) {
                html5QrCode.stop().then(() => {
                    html5QrCode.clear();
                    isScanning = false;
                    closeModal('modal-qr-scanner');
                }).catch((e) => console.warn("Error stopping scanner:", e));
            }
        },
        (errorMessage) => {
            if (resultsDiv && !resultsDiv.innerHTML.includes('✅') && !resultsDiv.innerHTML.includes('📷')) {
                resultsDiv.innerHTML = '<small style="color:#aaa;">🔍 Arahkan kamera ke QR Code...</small>';
            }
        }
    ).then(() => {
        isScanning = true;
        if (resultsDiv) {
            resultsDiv.innerHTML = '<small style="color:#4caf50; font-weight:bold;">📷 Kamera aktif. Arahkan ke QR Code.</small>';
        }
        console.log("✅ QR Scanner berhasil dimulai");
    }).catch((err) => {
        console.error("Gagal memulai scanner:", err);
        if (resultsDiv) {
            let errorMsg = "❌ Gagal mengakses kamera. ";
            if (err.message && err.message.includes('NotAllowedError')) {
                errorMsg += "Izin kamera ditolak. Periksa pengaturan browser.";
            } else if (err.message && err.message.includes('NotFoundError')) {
                errorMsg += "Tidak ada kamera yang terdeteksi.";
            } else if (err.message && err.message.includes('NotReadableError')) {
                errorMsg += "Kamera sedang digunakan oleh aplikasi lain.";
            } else {
                errorMsg += "Pastikan menggunakan HTTPS dan izinkan akses kamera.";
            }
            resultsDiv.innerHTML = `<span style="color:red;">${errorMsg}</span>`;
        }
        showToast("Tidak dapat mengakses kamera: " + err.message, "error");
        setTimeout(() => closeModal('modal-qr-scanner'), 3000);
    });
}

function closeQrScanner() {
    if (html5QrCode && isScanning) {
        html5QrCode.stop().then(() => {
            html5QrCode.clear();
            isScanning = false;
            console.log("QR Scanner dihentikan");
        }).catch((e) => console.warn("Error stopping scanner:", e));
    }
    closeModal('modal-qr-scanner');
}

function handleQrScan(data) {
    console.log("Data QR mentah:", data);
    try {
        const parsed = JSON.parse(data);
        if (parsed.code) {
            document.getElementById('regCode').value = parsed.code;
            if (parsed.studentId) {
                const idField = document.getElementById('regGeneratedId');
                if (idField) idField.value = parsed.studentId;
                const radioSiswa = document.querySelector('input[name="regRoleType"][value="siswa"]');
                if (radioSiswa) radioSiswa.checked = true;
                if (typeof toggleRegisterInput === 'function') toggleRegisterInput();
                showToast("✅ Data QR terisi! Silakan lengkapi email & password.", "success");
            } else {
                const radioGuru = document.querySelector('input[name="regRoleType"][value="guru"]');
                if (radioGuru) radioGuru.checked = true;
                if (typeof toggleRegisterInput === 'function') toggleRegisterInput();
                showToast("✅ Kode registrasi guru terisi. Silakan lengkapi nama & mapel.", "success");
            }
        } else {
            showToast("❌ QR tidak valid: tidak mengandung kode registrasi.", "error");
        }
    } catch (e) {
        const maybeCode = data.trim();
        if (maybeCode.length > 5) {
            document.getElementById('regCode').value = maybeCode;
            showToast("✅ Kode registrasi terisi. Pilih role yang sesuai.", "success");
        } else {
            showToast("❌ Format QR tidak dikenali.", "error");
        }
    }
}

const originalCloseModal = window.closeModal;
window.closeModal = function(id) {
    if (id === 'modal-qr-scanner') {
        closeQrScanner();
    }
    if (originalCloseModal) originalCloseModal(id);
};

// ======================= FUNGSI LOGIN (DENGAN DETEKSI ROLE) =======================

function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPassword').value;
    if (!email || !pass) {
        showToast("Email dan password wajib diisi!", "error");
        return;
    }
    const btn = document.getElementById('btnLoginSubmit');
    btn.innerText = "Memproses...";
    btn.disabled = true;
    auth.signInWithEmailAndPassword(email, pass)
        .then((userCredential) => {
            const user = userCredential.user;
            return db.ref('users_auth/' + user.uid).once('value').then((snapshot) => {
                let userData = snapshot.val();
                if (userData) {
                    if (userData.kelas) userData.kelas = userData.kelas.toUpperCase();
                    
                    // ============ ROLE DEVELOPER (SUPER ADMIN) ============
                    // Jika email adalah zaki5go@gmail.com, role dipaksa menjadi 'developer'
                    if (user.email === 'zaki5go@gmail.com') {
                        userData.role = 'developer';
                        if (snapshot.val().role !== 'developer') {
                            db.ref('users_auth/' + user.uid + '/role').set('developer');
                        }
                    }
                    
                    // ============ VALIDASI ROLE ============
                    // Pastikan role yang tersimpan valid
                    if (!isValidRole(userData.role)) {
                        console.warn(`⚠️ Role tidak valid: ${userData.role}, default ke siswa`);
                        userData.role = 'siswa';
                        db.ref('users_auth/' + user.uid + '/role').set('siswa');
                    }
                    // ========================================
                    
                    currentUser = { uid: user.uid, email: user.email, ...userData };
                    
                    // Update UI berdasarkan role
                    updateUserInterfaceByRole();
                    
                    // LOG: Login berhasil
                    if (typeof logActivity === 'function') {
                        const roleDisplay = getRoleDisplayName(userData.role);
                        logActivity('login', `Login berhasil sebagai ${roleDisplay} (${userData.nama || userData.email})`);
                    }
                    
                    initApp();
                    showToast(`Selamat datang, ${userData.nama} (${getRoleDisplayName(userData.role)})`);
                } else {
                    showToast("Data user tidak ditemukan di Database!", "error");
                    auth.signOut();
                }
            });
        })
        .catch((error) => {
            let msg = error.message;
            if (error.code === 'auth/user-not-found') msg = "Email tidak terdaftar!";
            else if (error.code === 'auth/wrong-password') msg = "Password salah!";
            else if (error.code === 'auth/invalid-email') msg = "Format email tidak valid!";
            showToast(msg, "error");
        })
        .finally(() => {
            btn.innerText = "MASUK";
            btn.disabled = false;
        });
}

// ======================= FUNGSI REGISTRASI =======================

async function handleRegister(e) {
    e.preventDefault();
    const now = Date.now();
    if (now - lastRegisterAttempt < 30000) {
        const wait = Math.ceil((30000 - (now - lastRegisterAttempt)) / 1000);
        showToast(`Tunggu ${wait} detik sebelum mencoba lagi`, "error");
        return;
    }
    lastRegisterAttempt = now;

    const regType = document.querySelector('input[name="regRoleType"]:checked')?.value;
    const codeInput = document.getElementById('regCode').value.trim().toUpperCase();
    const email = document.getElementById('regEmail').value.trim();
    const pass = document.getElementById('regPassword').value;

    if (!regType || !codeInput || !email || !pass) {
        showToast("Semua bidang wajib diisi!", "error");
        return;
    }
    if (!/^[^\s@]+@([^\s@.,]+\.)+[^\s@.,]{2,}$/.test(email)) {
        showToast("Format email tidak valid!", "error");
        return;
    }
    if (pass.length < 6) {
        showToast("Password minimal 6 karakter!", "error");
        return;
    }
    
    // Cegah registrasi dengan email developer (super admin)
    if (email === 'zaki5go@gmail.com') {
        showToast("❌ Email ini tidak dapat didaftarkan melalui kode registrasi.", "error");
        return;
    }

    let extraData = {};
    if (regType === 'siswa') {
        const inputId = document.getElementById('regGeneratedId').value.trim();
        if (!inputId) { showToast("Masukkan ID Siswa!", "error"); return; }
        extraData = { fpId: inputId };
    } else {
        const namaGuru = document.getElementById('regNama').value.trim();
        if (!namaGuru) { showToast("Nama Guru wajib diisi!", "error"); return; }
        extraData = { nama: namaGuru, subject: document.getElementById('regSubject').value.trim() };
    }

    const btn = document.getElementById('btnRegSubmit');
    const originalText = btn.innerText;
    btn.innerText = "⏳ Mendaftar...";
    btn.disabled = true;

    try {
        const codeSnapshot = await db.ref(`codes/${codeInput}`).once('value');
        const codeData = codeSnapshot.val();
        if (!codeData || codeData.used === true) throw new Error('Kode tidak valid atau sudah digunakan');
        
        // Validasi tipe kode (siswa/guru)
        if (codeData.type !== regType) throw new Error(`Kode ini untuk ${codeData.type}, bukan ${regType}`);

        const methods = await auth.fetchSignInMethodsForEmail(email);
        if (methods.length > 0) throw new Error('Email sudah terdaftar');

        const userCredential = await auth.createUserWithEmailAndPassword(email, pass);
        const user = userCredential.user;

        // Role default sesuai tipe registrasi
        let userRole = regType; // 'siswa' atau 'guru'
        
        let userData = { 
            uid: user.uid, 
            email, 
            role: userRole, 
            registeredAt: firebase.database.ServerValue.TIMESTAMP 
        };
        let userName = '';
        
        if (regType === 'siswa') {
            const fpId = extraData.fpId;
            const studentSnap = await db.ref(`users/${fpId}`).once('value');
            if (!studentSnap.exists()) {
                await user.delete();
                throw new Error(`ID Fingerprint ${fpId} tidak ditemukan di data siswa`);
            }
            const student = studentSnap.val();
            userData.nama = student.nama;
            userData.kelas = student.kelas;
            userData.jurusan = student.jurusan;
            userData.fpId = fpId;
            userName = student.nama;
        } else {
            userData.nama = extraData.nama;
            userData.subject = extraData.subject || '';
            userName = extraData.nama;
        }

        await db.ref(`users_auth/${user.uid}`).set(userData);
        await db.ref(`codes/${codeInput}`).update({ 
            used: true, 
            userId: user.uid, 
            usedAt: firebase.database.ServerValue.TIMESTAMP 
        });

        // LOG: Registrasi berhasil
        try {
            const roleDisplay = getRoleDisplayName(userRole);
            const logEntry = {
                action: 'register',
                userId: user.uid,
                userName: userName,
                userRole: userRole,
                details: `Registrasi berhasil sebagai ${roleDisplay} dengan email ${email}`,
                timestamp: firebase.database.ServerValue.TIMESTAMP,
                userAgent: navigator.userAgent.substring(0, 200)
            };
            await db.ref('logs').push(logEntry);
            console.log(`📝 Log activity: register - ${roleDisplay} ${email}`);
        } catch (logErr) {
            console.warn("Gagal menyimpan log registrasi:", logErr);
        }

        showToast("Pendaftaran Berhasil! Silakan Login.", "success");
        toggleAuth('login');
        document.getElementById('registerForm').reset();
        if (typeof toggleRegisterInput === 'function') toggleRegisterInput();
    } catch (error) {
        console.error(error);
        let msg = error.message;
        if (msg.includes('Kode tidak valid')) msg = "Kode pendaftaran tidak valid atau sudah kadaluarsa.";
        else if (msg.includes('Email sudah terdaftar')) msg = "Email sudah digunakan.";
        else if (msg.includes('ID Fingerprint')) msg = error.message;
        else msg = "Registrasi gagal: " + msg;
        showToast(msg, "error");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

function handleLogout() {
    // LOG: Logout sebelum cleanup
    if (typeof logActivity === 'function' && currentUser) {
        logActivity('logout', `Logout dari akun ${currentUser.nama || currentUser.email} (${getRoleDisplayName(currentUser.role)})`);
    }
    
    const cleanups = [
        'cleanupAttendanceListeners', 'cleanupStudentsSystem', 'cleanupUsersSystem',
        'cleanupChatSystem', 'cleanupFriendsSystem', 'cleanupStatusSystem',
        'cleanupSettingsSystem', 'cleanupRekap', 'cleanupUI', 'cleanupAnnouncementSystem'
    ];
    cleanups.forEach(fn => { if (typeof window[fn] === 'function') window[fn](); });
    auth.signOut().then(() => {
        if (typeof clearUserSession === 'function') clearUserSession();
        location.reload();
    }).catch(() => location.reload());
}

function processForgot() {
    const email = document.getElementById('forgotEmail').value.trim();
    if (!email) { showToast('Masukkan email terlebih dahulu!', 'error'); return; }
    const btn = document.querySelector('#modal-forgot .btn-save');
    if (btn) { btn.innerText = '📧 Mengirim...'; btn.disabled = true; }
    auth.sendPasswordResetEmail(email)
        .then(() => {
            showToast(`✅ Link reset password telah dikirim ke ${email}`, 'success');
            closeModal('modal-forgot');
            // LOG: Kirim link reset password
            if (typeof logActivity === 'function' && currentUser) {
                logActivity('forgot_password', `Link reset password dikirim ke ${email}`);
            } else {
                db.ref('logs').push({
                    action: 'forgot_password',
                    userId: 'unknown',
                    userName: email,
                    userRole: 'unknown',
                    details: `Link reset password dikirim ke ${email}`,
                    timestamp: firebase.database.ServerValue.TIMESTAMP,
                    userAgent: navigator.userAgent.substring(0, 200)
                }).catch(e => console.warn(e));
            }
        })
        .catch(error => { 
            let msg = error.code === 'auth/user-not-found' ? '❌ Email belum terdaftar!' : error.message; 
            showToast(msg, 'error'); 
        })
        .finally(() => { if (btn) { btn.innerText = 'Kirim Link'; btn.disabled = false; } });
}

async function handleChangePassword(e) {
    e.preventDefault();
    const oldPass = document.getElementById('cpOld').value;
    const newPass = document.getElementById('cpNew').value;
    const confirmPass = document.getElementById('cpConfirm').value;
    if (!oldPass || !newPass || !confirmPass) { showToast("Semua field harus diisi!", "error"); return; }
    if (newPass !== confirmPass) { showToast("Password baru tidak cocok!", "error"); return; }
    if (newPass.length < 6) { showToast("Password minimal 6 karakter!", "error"); return; }
    const btn = document.querySelector('#modal-change-pass button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = "Memproses..."; }
    const user = auth.currentUser;
    const credential = firebase.auth.EmailAuthProvider.credential(user.email, oldPass);
    try {
        await user.reauthenticateWithCredential(credential);
        await user.updatePassword(newPass);
        showToast("✅ Password berhasil diubah!", "success");
        closeModal('modal-change-pass');
        document.getElementById('cpNew').value = '';
        document.getElementById('cpConfirm').value = '';
        // LOG: Ganti password berhasil
        if (typeof logActivity === 'function' && currentUser) {
            logActivity('change_password', 'Password berhasil diubah');
        }
    } catch (err) {
        if (err.code === 'auth/wrong-password') showToast("Password lama salah!", "error");
        else if (err.code === 'auth/requires-recent-login') showToast("Silakan logout dan login kembali.", "error");
        else showToast("Gagal: " + err.message, "error");
    } finally { if (btn) { btn.disabled = false; btn.textContent = "Simpan"; } }
}

function toggleAuth(mode) {
    const loginCard = document.getElementById('login-card');
    const registerCard = document.getElementById('register-card');
    if (mode === 'register') {
        if (loginCard) loginCard.style.display = 'none';
        if (registerCard) registerCard.style.display = 'block';
    } else {
        if (loginCard) loginCard.style.display = 'block';
        if (registerCard) registerCard.style.display = 'none';
    }
}

function togglePassword(id, icon) {
    const input = document.getElementById(id);
    if (!input) return;
    input.type = input.type === "password" ? "text" : "password";
    if (icon) icon.style.color = input.type === "text" ? "var(--primary)" : "#aaa";
}

// ======================= FUNGSI UPLOAD FOTO PROFIL =======================

async function uploadProfilePhoto(input) {
    if (!input.files || !input.files[0]) return;
    
    const imgEl = document.getElementById('profileImg');
    if (!imgEl) {
        showToast('Buka modal profil terlebih dahulu (klik "Profil Saya")', 'error');
        input.value = '';
        return;
    }
    
    const file = input.files[0];
    if (!file.type.match('image.*')) {
        showToast('Hanya file gambar yang diperbolehkan!', 'error');
        input.value = '';
        return;
    }
    if (file.size > 2 * 1024 * 1024) {
        showToast('Ukuran gambar maksimal 2MB!', 'error');
        input.value = '';
        return;
    }
    
    const originalSrc = imgEl.src;
    imgEl.style.opacity = '0.5';
    showToast('📤 Mengunggah ke Supabase...', 'neutral');
    
    try {
        if (typeof uploadWithFallback === 'undefined') {
            throw new Error('Fungsi uploadWithFallback tidak tersedia. Pastikan supabase-config.js sudah dimuat.');
        }
        
        const result = await uploadWithFallback(file, 'profiles', currentUser.uid);
        
        if (typeof deleteOldProfilePhoto === 'function') {
            await deleteOldProfilePhoto(currentUser.uid, result.url);
        } else {
            console.warn('deleteOldProfilePhoto function not available, skipping old photo deletion');
        }
        
        await db.ref(`users_auth/${currentUser.uid}`).update({ photoUrl: result.url });
        
        const oldPhotoUrl = currentUser.photoUrl;
        currentUser.photoUrl = result.url;
        
        if (typeof saveUserToLocalStorage === 'function') {
            saveUserToLocalStorage(currentUser);
        }
        
        if (typeof refreshAllAvatars === 'function') {
            refreshAllAvatars();
        } else {
            console.warn("refreshAllAvatars not available, using manual update");
            const headerAvatar = document.getElementById('headerAvatar');
            if (headerAvatar) headerAvatar.src = result.url;
            imgEl.src = result.url;
            const sidebarAvatar = document.getElementById('sidebarAvatar');
            if (sidebarAvatar) sidebarAvatar.src = result.url;
            const navbarAvatar = document.getElementById('navbarAvatar');
            if (navbarAvatar) navbarAvatar.src = result.url;
        }
        
        const fallbackMsg = result.isFallback ? ' (via ImgBB fallback)' : '';
        showToast(`✅ Foto profil berhasil diperbarui!${fallbackMsg}`, 'success');
        
        if (typeof logActivity === 'function') {
            logActivity('upload_profile_photo', `Upload foto profil ${result.isFallback ? '(fallback ImgBB)' : '(Supabase)'}`);
        }
        
        if (result.isFallback) {
            console.warn('Supabase gagal, menggunakan ImgBB sebagai fallback');
            setTimeout(() => {
                showToast('ℹ️ Catatan: Gambar disimpan via ImgBB (fallback)', 'info');
            }, 2000);
        }
        
    } catch (error) {
        console.error('Upload error:', error);
        showToast('❌ Gagal upload: ' + error.message, 'error');
        imgEl.src = originalSrc;
    } finally {
        imgEl.style.opacity = '1';
        input.value = '';
    }
}

// ======================= EKSPOR KE GLOBAL =======================
window.openQrScanner = openQrScanner;
window.closeQrScanner = closeQrScanner;
window.handleQrScan = handleQrScan;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.handleLogout = handleLogout;
window.toggleAuth = toggleAuth;
window.togglePassword = togglePassword;
window.processForgot = processForgot;
window.handleChangePassword = handleChangePassword;
window.uploadProfilePhoto = uploadProfilePhoto;
window.isValidRole = isValidRole;
window.getRoleDisplayName = getRoleDisplayName;
window.getRoleIcon = getRoleIcon;
window.updateUserInterfaceByRole = updateUserInterfaceByRole;

console.log("✅ auth.js V5.0 loaded - Dengan role: Developer, Kepala Sekolah, Wakil Kepala Sekolah, Staff TU, Guru, Siswa");