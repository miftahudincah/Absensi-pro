// db.js - VERSION 3.3 (DENGAN DUKUNGAN ROLE DEVELOPER)
// Memastikan akun zaki5go@gmail.com selalu memiliki role 'developer'
// ============================================================================

// Variabel Global untuk State Lokal
let dbData = {
    users: [],     // Data Siswa (Node: users) -> Untuk ESP32
    users_auth: [], // Data User Auth (Node: users_auth) -> Untuk Login Web
    attendance: [], // Data Absensi (Node: absensi)
    codes: []      // Kode Pendaftaran (Node: codes)
};

let currentUser = null;

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
db.ref('users').on('value', (snapshot) => {
    const data = snapshot.val();
    dbData.users = [];
    if (data) {
        Object.keys(data).forEach(key => {
            dbData.users.push({ id: key, ...data[key] });
        });
    }
    
    if(typeof renderStudentsTable === 'function') renderStudentsTable();
    if(typeof populateStudentFilters === 'function') populateStudentFilters();
    if(typeof populateFilters === 'function') populateFilters();
    if(typeof populateStudentSelectForCode === 'function') populateStudentSelectForCode();
});

// ======================= LISTENER DATA AUTH USERS (DENGAN PERBAIKAN ROLE DEVELOPER) =======================
db.ref('users_auth').on('value', (snapshot) => {
    const data = snapshot.val();
    dbData.users_auth = [];
    if (data) {
        Object.keys(data).forEach(uid => {
            let user = { uid: uid, ...data[uid] };
            // Pastikan role developer untuk email khusus
            enforceDeveloperRole(user, uid);
            dbData.users_auth.push(user);
        });
    }
    
    // Jika currentUser sedang login, sinkronkan rolenya jika perlu
    if (currentUser && currentUser.email === 'zaki5go@gmail.com' && currentUser.role !== 'developer') {
        console.log("🔧 Memperbaiki role currentUser menjadi developer");
        currentUser.role = 'developer';
        if (typeof saveUserToLocalStorage === 'function') saveUserToLocalStorage(currentUser);
        if (typeof applyRolePermissions === 'function') applyRolePermissions();
        if (typeof updateUserInterface === 'function') updateUserInterface();
    }
    
    if(typeof renderUsersTable === 'function') renderUsersTable();
});

// ======================= LISTENER DATA ABSENSI =======================
db.ref('absensi').on('value', (snapshot) => {
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
    if(typeof renderTable === 'function') renderTable();
});

// --- FUNGSI BERSIH-BERSIH KODE (HAPUS LEBIH DARI 5 JAM) ---
function cleanupOldCodes(data) {
    const now = Date.now();
    const fiveHoursInMs = 5 * 60 * 60 * 1000;
    if (!data) return;
    Object.keys(data).forEach(key => {
        const item = data[key];
        if (item.createdAt && (now - item.createdAt > fiveHoursInMs)) {
            db.ref('codes/' + key).remove()
                .then(() => console.log(`Kode ${key} kadaluarsa dan dihapus otomatis.`))
                .catch(err => console.error("Gagal hapus kode kadaluarsa:", err));
        }
    });
}

// ======================= LISTENER KODE PENDAFTARAN =======================
db.ref('codes').on('value', (snapshot) => {
    const data = snapshot.val();
    cleanupOldCodes(data);
    dbData.codes = [];
    if(data) {
        Object.keys(data).forEach(key => {
            dbData.codes.push({ code: key, ...data[key] });
        });
    }
    if(typeof renderCodesTable === 'function') renderCodesTable();
});

console.log("✅ db.js dengan enforce role developer (zaki5go@gmail.com) loaded");