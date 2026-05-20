// db.js - VERSION 3.4 (FIXED: GUARANTEE dbData GLOBAL & ERROR HANDLING)
// Memastikan akun zaki5go@gmail.com selalu memiliki role 'developer'
// ============================================================================

// Variabel Global untuk State Lokal - gunakan var agar benar-benar global
var dbData = {
    users: [],       // Data Siswa (Node: users) -> Untuk ESP32
    users_auth: [],  // Data User Auth (Node: users_auth) -> Untuk Login Web
    attendance: [],  // Data Absensi (Node: absensi)
    codes: []        // Kode Pendaftaran (Node: codes)
};

var currentUser = null;

console.log("📦 dbData initialized with default empty arrays", dbData);

// ======================= FUNGSI BANTU =======================
// Memastikan user developer memiliki role yang benar
function enforceDeveloperRole(userData, uid) {
    if (userData && userData.email === 'zaki5go@gmail.com') {
        if (userData.role !== 'developer') {
            console.log(`🔧 Memperbaiki role untuk ${userData.email} menjadi 'developer'`);
            userData.role = 'developer';
            // Update ke Firebase secara async (tidak perlu menunggu)
            db.ref(`users_auth/${uid}/role`).set('developer')
                .catch(err => console.error("Gagal update role developer:", err));
        }
        return true;
    }
    return false;
}

// ======================= LISTENER DATA SISWA =======================
if (db) {
    db.ref('users').on('value', (snapshot) => {
        try {
            const data = snapshot.val();
            dbData.users = [];
            if (data) {
                Object.keys(data).forEach(key => {
                    dbData.users.push({ id: key, ...data[key] });
                });
            }
            console.log(`👨‍🎓 Students data loaded: ${dbData.users.length} students`);

            if (typeof renderStudentsTable === 'function') renderStudentsTable();
            if (typeof populateStudentFilters === 'function') populateStudentFilters();
            if (typeof populateFilters === 'function') populateFilters();
            if (typeof populateStudentSelectForCode === 'function') populateStudentSelectForCode();
        } catch (e) {
            console.error("Error processing users data:", e);
        }
    });
} else {
    console.error("❌ db not available, cannot attach users listener");
}

// ======================= LISTENER DATA AUTH USERS =======================
if (db) {
    db.ref('users_auth').on('value', (snapshot) => {
        try {
            const data = snapshot.val();
            dbData.users_auth = [];
            if (data) {
                Object.keys(data).forEach(uid => {
                    let user = { uid: uid, ...data[uid] };
                    enforceDeveloperRole(user, uid);
                    dbData.users_auth.push(user);
                });
            }
            console.log(`👥 Auth users loaded: ${dbData.users_auth.length} users`);

            // Jika currentUser sedang login, sinkronkan rolenya jika perlu
            if (currentUser && currentUser.email === 'zaki5go@gmail.com' && currentUser.role !== 'developer') {
                console.log("🔧 Memperbaiki role currentUser menjadi developer");
                currentUser.role = 'developer';
                if (typeof saveUserToLocalStorage === 'function') saveUserToLocalStorage(currentUser);
                if (typeof applyRolePermissions === 'function') applyRolePermissions();
                if (typeof updateUserInterface === 'function') updateUserInterface();
            }

            if (typeof renderUsersTable === 'function') renderUsersTable();
        } catch (e) {
            console.error("Error processing users_auth data:", e);
        }
    });
}

// ======================= LISTENER DATA ABSENSI =======================
if (db) {
    db.ref('absensi').on('value', (snapshot) => {
        try {
            const data = snapshot.val();
            dbData.attendance = [];
            if (data) {
                Object.keys(data).forEach(date => {
                    const dailyRecords = data[date];
                    if (dailyRecords) {
                        Object.keys(dailyRecords).forEach(id => {
                            const record = dailyRecords[id];
                            if (record) {
                                dbData.attendance.push({
                                    id: date + "-" + id,
                                    studentId: id,
                                    timestamp: date + "T" + (record.in || "00:00"),
                                    date: date,
                                    timeIn: record.in,
                                    timeOut: record.out,
                                    nama: record.nama,
                                    kelas: record.kelas,
                                    jurusan: record.jurusan,
                                    status: (record.out) ? "Pulang" : "Hadir"
                                });
                            }
                        });
                    }
                });
            }
            dbData.attendance.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            console.log(`📋 Attendance records loaded: ${dbData.attendance.length} records`);

            if (typeof renderTable === 'function') renderTable();
        } catch (e) {
            console.error("Error processing attendance data:", e);
        }
    });
}

// ======================= FUNGSI BERSIH-BERSIH KODE =======================
function cleanupOldCodes(data) {
    const now = Date.now();
    const fiveHoursInMs = 5 * 60 * 60 * 1000;
    if (!data) return;
    Object.keys(data).forEach(key => {
        const item = data[key];
        if (item.createdAt && (now - item.createdAt > fiveHoursInMs)) {
            db.ref('codes/' + key).remove()
                .then(() => console.log(`🗑️ Kode ${key} kadaluarsa dan dihapus otomatis.`))
                .catch(err => console.error("Gagal hapus kode kadaluarsa:", err));
        }
    });
}

// ======================= LISTENER KODE PENDAFTARAN =======================
if (db) {
    db.ref('codes').on('value', (snapshot) => {
        try {
            const data = snapshot.val();
            cleanupOldCodes(data);
            dbData.codes = [];
            if (data) {
                Object.keys(data).forEach(key => {
                    dbData.codes.push({ code: key, ...data[key] });
                });
            }
            console.log(`🔑 Registration codes loaded: ${dbData.codes.length} codes`);

            if (typeof renderCodesTable === 'function') renderCodesTable();
        } catch (e) {
            console.error("Error processing codes data:", e);
        }
    });
}

console.log("✅ db.js loaded - All Firebase listeners attached");