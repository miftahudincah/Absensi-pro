// friends.js - VERSION 2.4 (FIXED: FRIENDS LIST DISPLAY & REAL-TIME SYNC)
// Fitur Pertemanan (Friendship System)
// Mengirim request, menerima/menolak, dan daftar teman
// Dengan integrasi Chat System
// PERBAIKAN V2.4: Memperbaiki render daftar teman dan real-time sync
// ============================================================================

let friendsRealtimeListener = null;
let friendRequestsListener = null;
let friendsListListener = null;
let friendsUiReadyListenerAdded = false;
let friendsDataReadyListenerAdded = false;

// Cache untuk data user
let userDataCache = {};

// ======================= EVENT LISTENER ========================

function setupFriendsUiReadyListener() {
    if (friendsUiReadyListenerAdded) return;
    friendsUiReadyListenerAdded = true;
    console.log("📡 Setting up uiReady event listener for friends module");

    window.addEventListener('uiReady', (e) => {
        const user = e.detail.currentUser;
        if (user) {
            console.log("👥 friends.js: uiReady received, initializing friends system");
            initFriendsSystem();
        }
    });
}

function setupFriendsDataReadyListener() {
    if (friendsDataReadyListenerAdded) return;
    friendsDataReadyListenerAdded = true;
    console.log("📡 Setting up dataReady event listener for friends module");

    window.addEventListener('dataReady', (e) => {
        console.log("👥 friends.js: dataReady received, refreshing friends list");
        if (currentUser) {
            loadFriendsList();
            loadFriendRequests();
        }
    });
}

// ======================= INISIALISASI =======================

function initFriendsSystem() {
    console.log("👥 Initializing friends system...");
    
    if (!currentUser) {
        console.log("No user logged in, skipping friends init");
        return;
    }
    
    cleanupFriendsSystem();
    setupFriendRequestsListener();
    setupFriendsListListener();
    renderFriendsPanel();
    
    // Load data awal
    setTimeout(() => {
        loadFriendRequests();
        loadFriendsList();
    }, 500);
}

function setupFriendRequestsListener() {
    if (friendRequestsListener) {
        db.ref('friendships/requests').off('value', friendRequestsListener);
    }
    
    friendRequestsListener = db.ref('friendships/requests').on('value', (snapshot) => {
        if (!currentUser) return;
        const data = snapshot.val();
        if (data) {
            const pendingRequests = Object.keys(data)
                .filter(key => data[key].to === currentUser.uid && data[key].status === 'pending')
                .map(key => ({ id: key, ...data[key] }));
            updateFriendRequestBadge(pendingRequests.length);
            renderFriendRequestsList(pendingRequests);
        } else {
            updateFriendRequestBadge(0);
            renderFriendRequestsList([]);
        }
    });
}

function setupFriendsListListener() {
    if (!currentUser) return;
    
    if (friendsListListener) {
        db.ref(`friendships/list/${currentUser.uid}`).off('value', friendsListListener);
    }
    
    console.log(`👥 Setting up friends list listener for user: ${currentUser.uid}`);
    
    friendsListListener = db.ref(`friendships/list/${currentUser.uid}`).on('value', async (snapshot) => {
        if (!currentUser) return;
        const data = snapshot.val();
        console.log("👥 Friends list data from Firebase:", data);
        
        const friendsList = data ? Object.values(data) : [];
        console.log(`👥 Found ${friendsList.length} friends in database`);
        
        // Update count badge
        updateFriendsCount(friendsList.length);
        
        if (friendsList.length === 0) {
            renderFriendsList([]);
            return;
        }
        
        // Enrich data dengan informasi terbaru dari users_auth
        const enrichedFriends = await enrichFriendsWithLatestData(friendsList);
        renderFriendsList(enrichedFriends);
    });
}

async function enrichFriendsWithLatestData(friendsList) {
    if (!friendsList || friendsList.length === 0) return [];
    
    const friendUids = friendsList.map(f => f.friendUid).filter(Boolean);
    if (friendUids.length === 0) return friendsList;
    
    // Cek cache terlebih dahulu
    const missingUids = [];
    const enrichedList = [];
    
    for (const friend of friendsList) {
        const uid = friend.friendUid;
        if (userDataCache[uid]) {
            // Gunakan data dari cache
            enrichedList.push({
                ...friend,
                friendName: userDataCache[uid].nama || friend.friendName,
                friendEmail: userDataCache[uid].email || friend.friendEmail,
                friendPhoto: userDataCache[uid].photoUrl || null,
                friendRole: userDataCache[uid].role || 'siswa'
            });
        } else {
            missingUids.push(uid);
            enrichedList.push(friend);
        }
    }
    
    if (missingUids.length === 0) {
        console.log("⚡ friends.js: Using cached user data for all friends");
        return enrichedList;
    }
    
    // Gunakan dbData jika tersedia
    if (dbData && dbData.users_auth && dbData.users_auth.length > 0) {
        const userDataMap = {};
        for (const user of dbData.users_auth) {
            userDataMap[user.uid] = user;
            userDataCache[user.uid] = user;
        }
        
        const updatedList = friendsList.map(friend => {
            const latest = userDataMap[friend.friendUid];
            if (latest) {
                return {
                    ...friend,
                    friendName: latest.nama || friend.friendName,
                    friendEmail: latest.email || friend.friendEmail,
                    friendPhoto: latest.photoUrl || null,
                    friendRole: latest.role || 'siswa'
                };
            }
            return friend;
        });
        
        return updatedList;
    }
    
    // Fallback: ambil dari Firebase langsung
    console.log("📡 Fetching missing user data from Firebase");
    const snapshots = await Promise.all(
        missingUids.map(uid => db.ref(`users_auth/${uid}`).once('value'))
    );
    
    snapshots.forEach(snap => {
        const uid = snap.key;
        const val = snap.val();
        if (val) {
            userDataCache[uid] = val;
        }
    });
    
    const finalList = friendsList.map(friend => {
        const latest = userDataCache[friend.friendUid];
        if (latest) {
            return {
                ...friend,
                friendName: latest.nama || friend.friendName,
                friendEmail: latest.email || friend.friendEmail,
                friendPhoto: latest.photoUrl || null,
                friendRole: latest.role || 'siswa'
            };
        }
        return friend;
    });
    
    return finalList;
}

// ======================= UI RENDER =======================

function renderFriendsPanel() {
    const container = document.getElementById('friendsPanel');
    if (!container) return;
    
    container.innerHTML = `
        <div class="friends-container">
            <div class="friends-search-section">
                <h4>🔍 Cari Teman</h4>
                <div class="search-box" style="display: flex; gap: 10px;">
                    <input type="email" id="searchFriendEmail" placeholder="Cari berdasarkan email..." style="flex: 1;">
                    <button class="btn-action btn-primary" onclick="searchUserByEmail()">Cari</button>
                </div>
                <div id="searchResult" style="margin-top: 10px; display: none;"></div>
            </div>
            <hr>
            <div class="friends-requests-section">
                <h4>📨 Permintaan Pertemanan 
                    <span id="friendRequestBadge" class="request-badge" style="display: none;">0</span>
                </h4>
                <div id="friendRequestsList" class="friends-list">
                    <p class="text-small" style="color: var(--text-muted);">📭 Tidak ada permintaan pertemanan</p>
                </div>
            </div>
            <hr>
            <div class="friends-list-section">
                <h4>👥 Daftar Teman 
                    <span id="friendsCount" class="count-badge">0</span>
                </h4>
                <div id="friendsList" class="friends-list">
                    <p class="text-small" style="color: var(--text-muted);">👥 Belum ada teman. Cari dan tambahkan teman!</p>
                </div>
            </div>
        </div>
    `;
    
    if (currentUser) {
        loadFriendRequests();
        loadFriendsList();
    }
}

function updateFriendRequestBadge(count) {
    const badge = document.getElementById('friendRequestBadge');
    if (badge) {
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }
    
    // Update floating button badge jika ada
    const floatingBtn = document.getElementById('floatingFriendsBtn');
    if (floatingBtn) {
        let existingBadge = floatingBtn.querySelector('.friends-badge-count');
        if (count > 0) {
            if (!existingBadge) {
                existingBadge = document.createElement('span');
                existingBadge.className = 'friends-badge-count';
                existingBadge.textContent = count;
                existingBadge.style.cssText = `
                    position: absolute;
                    top: -5px;
                    right: -5px;
                    background: #f44336;
                    color: white;
                    border-radius: 50%;
                    width: 18px;
                    height: 18px;
                    font-size: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: bold;
                `;
                floatingBtn.style.position = 'relative';
                floatingBtn.appendChild(existingBadge);
            } else {
                existingBadge.textContent = count;
            }
        } else if (existingBadge) {
            existingBadge.remove();
        }
    }
}

function updateFriendsCount(count) {
    const countSpan = document.getElementById('friendsCount');
    if (countSpan) {
        countSpan.textContent = count;
        countSpan.style.display = count > 0 ? 'inline-block' : 'inline-block';
    }
    
    // Update floating button badge untuk total teman (opsional)
    const friendsTabBtn = document.querySelector('.dropdown-content button[onclick*="friends"]');
    if (friendsTabBtn && count > 0) {
        let badge = friendsTabBtn.querySelector('.friends-count-badge');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'friends-count-badge';
            badge.style.cssText = 'margin-left: 8px; background: #4caf50; color: white; border-radius: 30px; padding: 2px 8px; font-size: 10px;';
            friendsTabBtn.appendChild(badge);
        }
        badge.textContent = count;
    }
}

function renderFriendRequestsList(requests) {
    const container = document.getElementById('friendRequestsList');
    if (!container) return;
    
    if (!requests || requests.length === 0) {
        container.innerHTML = '<p class="text-small" style="color: var(--text-muted);">📭 Tidak ada permintaan pertemanan</p>';
        return;
    }
    
    let html = '';
    for (const req of requests) {
        const fromName = req.fromName || 'Pengguna';
        const fromEmail = req.fromEmail || '-';
        const fromPhoto = req.fromPhoto || getAvatarUrl(fromName);
        const createdAt = req.createdAt;
        
        html += `
            <div class="friend-request-item" data-request-id="${req.id}" style="display: flex; align-items: center; gap: 12px; padding: 12px; border-bottom: 1px solid var(--border);">
                <div class="friend-avatar" style="flex-shrink: 0;">
                    <img src="${fromPhoto}" alt="${escapeHtml(fromName)}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover;">
                </div>
                <div class="friend-info" style="flex: 1;">
                    <div class="friend-name" style="font-weight: bold;">${escapeHtml(fromName)}</div>
                    <div class="friend-email" style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(fromEmail)}</div>
                    <div class="friend-request-time" style="font-size: 0.7rem; color: var(--text-muted);">${formatTimeAgo(createdAt)}</div>
                </div>
                <div class="friend-actions" style="display: flex; gap: 8px;">
                    <button class="btn-icon accept" onclick="acceptFriendRequest('${req.id}', '${req.from}')" title="Terima" style="background: #4caf50; border: none; border-radius: 50%; width: 36px; height: 36px; cursor: pointer;">✅</button>
                    <button class="btn-icon reject" onclick="rejectFriendRequest('${req.id}', '${req.from}')" title="Tolak" style="background: #f44336; border: none; border-radius: 50%; width: 36px; height: 36px; cursor: pointer;">❌</button>
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
}

function renderFriendsList(friends) {
    const container = document.getElementById('friendsList');
    if (!container) return;
    
    console.log("🎨 renderFriendsList called with:", friends?.length || 0, "friends");
    
    if (!friends || friends.length === 0) {
        container.innerHTML = '<p class="text-small" style="color: var(--text-muted);">👥 Belum ada teman. Cari dan tambahkan teman!</p>';
        return;
    }
    
    // Urutkan berdasarkan nama
    const sortedFriends = [...friends].sort((a, b) => {
        const nameA = (a.friendName || '').toLowerCase();
        const nameB = (b.friendName || '').toLowerCase();
        return nameA.localeCompare(nameB);
    });
    
    let html = '';
    for (const friend of sortedFriends) {
        const friendName = friend.friendName || 'Teman';
        const friendEmail = friend.friendEmail || '-';
        const friendPhoto = friend.friendPhoto || getAvatarUrl(friendName);
        const friendUid = friend.friendUid;
        const friendRole = friend.friendRole || 'siswa';
        const createdAt = friend.createdAt;
        
        let roleIcon = '';
        let roleClass = '';
        if (friendRole === 'admin') {
            roleIcon = '👑';
            roleClass = 'role-admin';
        } else if (friendRole === 'guru') {
            roleIcon = '👨‍🏫';
            roleClass = 'role-guru';
        } else if (friendRole === 'developer') {
            roleIcon = '👨‍💻';
            roleClass = 'role-developer';
        } else if (friendRole === 'wakil_kepala') {
            roleIcon = '👔';
            roleClass = 'role-wakil-kepala';
        } else if (friendRole === 'staff_tu') {
            roleIcon = '📋';
            roleClass = 'role-staff-tu';
        } else {
            roleIcon = '👨‍🎓';
            roleClass = 'role-siswa';
        }
        
        html += `
            <div class="friend-item" data-friend-uid="${friendUid}" style="display: flex; align-items: center; gap: 12px; padding: 12px; border-bottom: 1px solid var(--border);">
                <div class="friend-avatar" style="flex-shrink: 0;">
                    <img src="${friendPhoto}" alt="${escapeHtml(friendName)}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover;">
                </div>
                <div class="friend-info" style="flex: 1;">
                    <div class="friend-name" style="font-weight: bold;">
                        ${escapeHtml(friendName)} 
                        <span class="role-badge ${roleClass}" style="font-size: 10px; padding: 2px 6px; border-radius: 12px; margin-left: 6px;">${roleIcon} ${getRoleDisplayName(friendRole)}</span>
                    </div>
                    <div class="friend-email" style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(friendEmail)}</div>
                    <div class="friend-since" style="font-size: 0.7rem; color: var(--text-muted);">Teman sejak ${formatDate(createdAt)}</div>
                </div>
                <div class="friend-actions" style="display: flex; gap: 8px;">
                    <button class="btn-icon chat" onclick="startChatWithFriend('${friendUid}', '${escapeHtml(friendName)}', '${escapeHtml(friendEmail)}')" title="Chat" style="background: #2196f3; border: none; border-radius: 50%; width: 36px; height: 36px; cursor: pointer;">💬</button>
                    <button class="btn-icon" onclick="viewFriendProfile('${friendUid}')" title="Lihat Profil" style="background: #00bcd4; border: none; border-radius: 50%; width: 36px; height: 36px; cursor: pointer;">👤</button>
                    <button class="btn-icon delete" onclick="removeFriend('${friendUid}', '${escapeHtml(friendName)}')" title="Hapus Teman" style="background: #f44336; border: none; border-radius: 50%; width: 36px; height: 36px; cursor: pointer;">🗑️</button>
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
}

function getRoleDisplayName(role) {
    const names = {
        developer: 'Developer',
        admin: 'Kepala Sekolah',
        wakil_kepala: 'Wakil Kepala',
        staff_tu: 'Staff TU',
        guru: 'Guru',
        siswa: 'Siswa'
    };
    return names[role] || role.toUpperCase();
}

// ======================= FUNGSI PENCARIAN =======================

async function searchUserByEmail() {
    const emailInput = document.getElementById('searchFriendEmail');
    const email = emailInput.value.trim().toLowerCase();
    if (!email) {
        showToast("Masukkan email yang ingin dicari!", "error");
        return;
    }
    if (email === currentUser.email.toLowerCase()) {
        showToast("❌ Anda tidak bisa berteman dengan diri sendiri!", "error");
        return;
    }
    showToast("🔍 Mencari pengguna...", "info");
    
    try {
        const snapshot = await db.ref('users_auth').once('value');
        const users = snapshot.val();
        let foundUser = null;
        let foundUid = null;
        if (users) {
            for (const [uid, userData] of Object.entries(users)) {
                if (userData.email && userData.email.toLowerCase() === email) {
                    foundUser = userData;
                    foundUid = uid;
                    break;
                }
            }
        }
        
        const resultContainer = document.getElementById('searchResult');
        if (foundUser && foundUid) {
            const isFriend = await checkIsFriend(foundUid);
            const hasPendingRequest = await checkPendingRequest(foundUid);
            const hasIncomingRequest = await checkIncomingRequest(foundUid);
            
            let actionButton = '';
            let statusMessage = '';
            
            if (isFriend) {
                actionButton = `<button class="btn-action" disabled style="background:#4caf50; color:white; border:none; padding:8px 16px; border-radius:30px;">✓ Sudah Teman</button>`;
                statusMessage = '<small style="color:#4caf50;">✅ Anda sudah berteman</small>';
            } else if (hasPendingRequest) {
                actionButton = `<button class="btn-action" disabled style="background:#ff9800; color:white; border:none; padding:8px 16px; border-radius:30px;">⏳ Menunggu Konfirmasi</button>`;
                statusMessage = '<small style="color:#ff9800;">⏳ Permintaan sudah dikirim, menunggu konfirmasi</small>';
            } else if (hasIncomingRequest) {
                actionButton = `<button class="btn-action btn-success" onclick="acceptFriendRequestByEmail('${foundUid}')" style="background:#4caf50; color:white; border:none; padding:8px 16px; border-radius:30px; cursor:pointer;">✅ Terima Permintaan</button>`;
                statusMessage = '<small style="color:#2196f3;">📨 Pengguna ini mengirimkan permintaan pertemanan</small>';
            } else {
                actionButton = `<button class="btn-action btn-primary" onclick="sendFriendRequest('${foundUid}', '${escapeHtml(foundUser.nama)}', '${escapeHtml(foundUser.email)}')" style="background:#00bcd4; color:white; border:none; padding:8px 16px; border-radius:30px; cursor:pointer;">➕ Kirim Permintaan</button>`;
            }
            
            const roleDisplay = foundUser.role === 'admin' ? '👑 Kepala Sekolah' : (foundUser.role === 'guru' ? '👨‍🏫 Guru' : (foundUser.role === 'developer' ? '👨‍💻 Developer' : '👨‍🎓 Siswa'));
            
            resultContainer.style.display = 'block';
            resultContainer.innerHTML = `
                <div class="search-result-item" style="display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--bg-hover); border-radius: 12px; margin-top: 10px;">
                    <div class="friend-avatar" style="flex-shrink: 0;">
                        <img src="${foundUser.photoUrl || getAvatarUrl(foundUser.nama)}" alt="${escapeHtml(foundUser.nama)}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover;">
                    </div>
                    <div class="friend-info" style="flex: 1;">
                        <div class="friend-name" style="font-weight: bold;">${escapeHtml(foundUser.nama)}</div>
                        <div class="friend-email" style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(foundUser.email)}</div>
                        <div class="friend-role" style="font-size: 0.7rem;">${roleDisplay}</div>
                        ${statusMessage}
                    </div>
                    <div class="friend-actions">
                        ${actionButton}
                    </div>
                </div>
            `;
        } else {
            resultContainer.style.display = 'block';
            resultContainer.innerHTML = `
                <div class="search-result-item error" style="padding: 12px; background: rgba(244, 67, 54, 0.1); border-radius: 12px; margin-top: 10px;">
                    <div class="friend-info">
                        <div class="friend-name" style="color: #f44336;">❌ Pengguna tidak ditemukan</div>
                        <div class="friend-email" style="font-size: 0.75rem;">Email "${escapeHtml(email)}" tidak terdaftar di sistem</div>
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error("Search error:", error);
        showToast("❌ Gagal mencari pengguna", "error");
    }
}

// ======================= FUNGSI PERTEMANAN =======================

async function checkIsFriend(friendUid) {
    if (!currentUser) return false;
    const snapshot = await db.ref(`friendships/list/${currentUser.uid}/${friendUid}`).once('value');
    return snapshot.exists();
}

async function checkPendingRequest(friendUid) {
    if (!currentUser) return false;
    const snapshot = await db.ref('friendships/requests').once('value');
    const requests = snapshot.val();
    if (!requests) return false;
    return Object.values(requests).some(req => 
        req.from === currentUser.uid && req.to === friendUid && req.status === 'pending'
    );
}

async function checkIncomingRequest(friendUid) {
    if (!currentUser) return false;
    const snapshot = await db.ref('friendships/requests').once('value');
    const requests = snapshot.val();
    if (!requests) return false;
    return Object.values(requests).some(req => 
        req.from === friendUid && req.to === currentUser.uid && req.status === 'pending'
    );
}

async function sendFriendRequest(toUid, toName, toEmail) {
    if (!currentUser) {
        showToast("Anda harus login!", "error");
        return;
    }
    if (toUid === currentUser.uid) {
        showToast("❌ Anda tidak bisa mengirim request ke diri sendiri!", "error");
        return;
    }
    
    const isFriend = await checkIsFriend(toUid);
    if (isFriend) {
        showToast("👥 Anda sudah berteman dengan pengguna ini!", "info");
        return;
    }
    
    const hasPending = await checkPendingRequest(toUid);
    if (hasPending) {
        showToast("⏳ Permintaan pertemanan sudah dikirim sebelumnya!", "info");
        return;
    }
    
    const hasIncoming = await checkIncomingRequest(toUid);
    if (hasIncoming) {
        const incomingReq = await findIncomingRequest(toUid);
        if (incomingReq) {
            await acceptFriendRequest(incomingReq.id, toUid);
            return;
        }
    }
    
    const requestId = `${currentUser.uid}_${toUid}_${Date.now()}`;
    const requestData = {
        from: currentUser.uid,
        to: toUid,
        fromName: currentUser.nama,
        toName: toName,
        fromEmail: currentUser.email,
        toEmail: toEmail,
        fromPhoto: currentUser.photoUrl || null,
        toPhoto: null,
        status: 'pending',
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    };
    
    try {
        await db.ref(`friendships/requests/${requestId}`).set(requestData);
        showToast(`✅ Permintaan pertemanan dikirim ke ${toName}`, "success");
        
        if (typeof logActivity === 'function') {
            logActivity('send_friend_request', `Mengirim permintaan pertemanan ke ${toName} (${toEmail})`);
        }
        
        // Bersihkan search result
        const resultContainer = document.getElementById('searchResult');
        if (resultContainer) {
            resultContainer.style.display = 'none';
            resultContainer.innerHTML = '';
        }
        const emailInput = document.getElementById('searchFriendEmail');
        if (emailInput) emailInput.value = '';
        
        // Refresh friends list
        setTimeout(() => loadFriendsList(), 500);
        
    } catch (error) {
        console.error("Send friend request error:", error);
        showToast("❌ Gagal mengirim permintaan", "error");
    }
}

async function findIncomingRequest(fromUid) {
    if (!currentUser) return null;
    const snapshot = await db.ref('friendships/requests').once('value');
    const requests = snapshot.val();
    if (!requests) return null;
    for (const [id, req] of Object.entries(requests)) {
        if (req.from === fromUid && req.to === currentUser.uid && req.status === 'pending') {
            return { id, ...req };
        }
    }
    return null;
}

async function acceptFriendRequest(requestId, fromUid) {
    if (!currentUser) {
        showToast("Anda harus login!", "error");
        return;
    }
    
    const existingFriend = await db.ref(`friendships/list/${currentUser.uid}/${fromUid}`).once('value');
    if (existingFriend.exists()) {
        showToast("👥 Anda sudah berteman dengan pengguna ini.", "info");
        await db.ref(`friendships/requests/${requestId}`).remove();
        return;
    }
    
    showToast("⏳ Memproses...", "info");
    
    const senderSnapshot = await db.ref(`users_auth/${fromUid}`).once('value');
    const senderData = senderSnapshot.val();
    const senderName = senderData?.nama || fromUid;
    
    try {
        await db.ref(`friendships/requests/${requestId}`).update({
            status: 'accepted',
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
        
        const now = firebase.database.ServerValue.TIMESTAMP;
        
        // Data untuk user saat ini (currentUser)
        const friendDataForCurrent = {
            friendUid: fromUid,
            friendName: senderData?.nama || fromUid,
            friendEmail: senderData?.email || '',
            friendPhoto: senderData?.photoUrl || null,
            createdAt: now
        };
        
        // Data untuk user target (teman)
        const friendDataForTarget = {
            friendUid: currentUser.uid,
            friendName: currentUser.nama,
            friendEmail: currentUser.email,
            friendPhoto: currentUser.photoUrl || null,
            createdAt: now
        };
        
        await Promise.all([
            db.ref(`friendships/list/${currentUser.uid}/${fromUid}`).set(friendDataForCurrent),
            db.ref(`friendships/list/${fromUid}/${currentUser.uid}`).set(friendDataForTarget)
        ]);
        
        // Hapus request yang sudah diproses
        await db.ref(`friendships/requests/${requestId}`).remove();
        
        showToast(`✅ Anda sekarang berteman dengan ${senderName}!`, "success");
        
        if (typeof logActivity === 'function') {
            logActivity('accept_friend_request', `Menerima permintaan pertemanan dari ${senderName}`);
        }
        
        // Refresh daftar teman
        await loadFriendsList();
        await loadFriendRequests();
        
    } catch (error) {
        console.error("Accept friend request error:", error);
        showToast("❌ Gagal menerima permintaan", "error");
    }
}

async function acceptFriendRequestByEmail(fromUid) {
    const request = await findIncomingRequest(fromUid);
    if (request) {
        await acceptFriendRequest(request.id, fromUid);
        searchUserByEmail();
    }
}

async function rejectFriendRequest(requestId, fromUid) {
    if (!currentUser) {
        showToast("Anda harus login!", "error");
        return;
    }
    if (!confirm("❌ Tolak permintaan pertemanan ini?")) return;
    
    const senderSnapshot = await db.ref(`users_auth/${fromUid}`).once('value');
    const senderData = senderSnapshot.val();
    const senderName = senderData?.nama || fromUid;
    
    try {
        await db.ref(`friendships/requests/${requestId}`).remove();
        showToast(`✅ Permintaan pertemanan dari ${senderName} ditolak`, "info");
        
        if (typeof logActivity === 'function') {
            logActivity('reject_friend_request', `Menolak permintaan pertemanan dari ${senderName}`);
        }
        
        await loadFriendRequests();
        
    } catch (error) {
        console.error("Reject friend request error:", error);
        showToast("❌ Gagal menolak permintaan", "error");
    }
}

async function removeFriend(friendUid, friendName) {
    if (!currentUser) {
        showToast("Anda harus login!", "error");
        return;
    }
    if (!confirm(`⚠️ Hapus ${friendName} dari daftar teman?\n\nAnda tidak akan bisa melihat profil dan chat dengannya.`)) return;
    
    try {
        await Promise.all([
            db.ref(`friendships/list/${currentUser.uid}/${friendUid}`).remove(),
            db.ref(`friendships/list/${friendUid}/${currentUser.uid}`).remove()
        ]);
        showToast(`✅ ${friendName} telah dihapus dari daftar teman`, "success");
        
        if (typeof logActivity === 'function') {
            logActivity('remove_friend', `Menghapus teman: ${friendName}`);
        }
        
        // Refresh daftar teman
        await loadFriendsList();
        
    } catch (error) {
        console.error("Remove friend error:", error);
        showToast("❌ Gagal menghapus teman", "error");
    }
}

// ======================= FUNGSI CHAT INTEGRATION =======================

async function startChatWithFriend(friendUid, friendName, friendEmail) {
    const isFriend = await checkIsFriend(friendUid);
    if (!isFriend) {
        showToast("Anda tidak bisa chat dengan orang yang bukan teman!", "error");
        return;
    }
    if (typeof switchTab === 'function') {
        switchTab('chat');
    } else if (typeof openChatModal === 'function') {
        openChatModal();
    }
    setTimeout(() => {
        if (typeof selectChat === 'function') {
            selectChat(friendUid);
        } else {
            showToast("⚠️ Fitur chat sedang dimuat, coba lagi nanti", "warning");
        }
    }, 500);
}

// ======================= LOAD DATA =======================

async function loadFriendRequests() {
    if (!currentUser) return;
    const snapshot = await db.ref('friendships/requests').once('value');
    const data = snapshot.val();
    if (data) {
        const pendingRequests = Object.keys(data)
            .filter(key => data[key].to === currentUser.uid && data[key].status === 'pending')
            .map(key => ({ id: key, ...data[key] }));
        updateFriendRequestBadge(pendingRequests.length);
        renderFriendRequestsList(pendingRequests);
    } else {
        updateFriendRequestBadge(0);
        renderFriendRequestsList([]);
    }
}

async function loadFriendsList() {
    if (!currentUser) {
        console.log("loadFriendsList: No currentUser");
        return;
    }
    
    console.log("📋 loadFriendsList called for user:", currentUser.uid);
    
    try {
        const snapshot = await db.ref(`friendships/list/${currentUser.uid}`).once('value');
        const data = snapshot.val();
        console.log("📋 Friends list data:", data);
        
        const friendsList = data ? Object.values(data) : [];
        console.log(`📋 Found ${friendsList.length} friends`);
        
        updateFriendsCount(friendsList.length);
        
        if (friendsList.length === 0) {
            renderFriendsList([]);
            return;
        }
        
        const enrichedFriends = await enrichFriendsWithLatestData(friendsList);
        renderFriendsList(enrichedFriends);
        
    } catch (error) {
        console.error("Load friends list error:", error);
        renderFriendsList([]);
    }
}

// ======================= UTILITY =======================

function getAvatarUrl(name) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'User')}&background=00bcd4&color=fff&size=100`;
}

function formatTimeAgo(timestamp) {
    if (!timestamp) return '';
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (days > 0) return `${days} hari yang lalu`;
    if (hours > 0) return `${hours} jam yang lalu`;
    if (minutes > 0) return `${minutes} menit yang lalu`;
    return 'baru saja';
}

function formatDate(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

function viewFriendProfile(friendUid) {
    openFriendProfileModal(friendUid);
}

async function openFriendProfileModal(friendUid) {
    try {
        const snapshot = await db.ref(`users_auth/${friendUid}`).once('value');
        const friendData = snapshot.val();
        if (!friendData) {
            showToast("❌ Data teman tidak ditemukan", "error");
            return;
        }
        
        let modalHtml = `
            <div id="modal-friend-profile" class="modal-overlay open">
                <div class="modal-box" style="max-width: 450px;">
                    <div class="modal-title" style="display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; border-bottom: 1px solid var(--border);">
                        <span>👤 Profil ${escapeHtml(friendData.nama)}</span>
                        <span onclick="closeModal('modal-friend-profile')" style="cursor: pointer; font-size: 24px;">✖</span>
                    </div>
                    <div style="text-align: center; padding: 20px;">
                        <img src="${friendData.photoUrl || getAvatarUrl(friendData.nama)}" style="width: 100px; height: 100px; border-radius: 50%; object-fit: cover; border: 3px solid var(--primary);">
                        <h3 style="margin-top: 10px;">${escapeHtml(friendData.nama)}</h3>
                        <p style="color: var(--text-muted);">${escapeHtml(friendData.email)}</p>
                        <div class="role-badge role-${friendData.role || 'siswa'}" style="display: inline-block; padding: 4px 12px; border-radius: 20px; background: var(--primary); color: white;">${getRoleDisplayName(friendData.role || 'siswa')}</div>
                    </div>
                    <div class="form-group" style="padding: 0 20px;">
                        <label>📚 Kelas / Mata Pelajaran</label>
                        <p style="padding: 8px; background: var(--bg-hover); border-radius: 8px;">${friendData.kelas || friendData.subject || '-'}</p>
                    </div>
                    <div class="modal-actions" style="display: flex; gap: 10px; justify-content: center; padding: 15px 20px; border-top: 1px solid var(--border);">
                        <button class="btn-cancel" onclick="closeModal('modal-friend-profile')" style="padding: 8px 20px; border-radius: 30px; border: none; cursor: pointer;">Tutup</button>
                        <button class="btn-primary" onclick="startChatFromProfile('${friendUid}', '${escapeHtml(friendData.nama)}', '${escapeHtml(friendData.email)}')" style="padding: 8px 20px; border-radius: 30px; border: none; background: #2196f3; color: white; cursor: pointer;">💬 Chat</button>
                        <button class="btn-danger" onclick="removeFriendAndClose('${friendUid}', '${escapeHtml(friendData.nama)}')" style="padding: 8px 20px; border-radius: 30px; border: none; background: #f44336; color: white; cursor: pointer;">🗑️ Hapus Teman</button>
                    </div>
                </div>
            </div>
        `;
        const existingModal = document.getElementById('modal-friend-profile');
        if (existingModal) existingModal.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    } catch (error) {
        console.error("Load friend profile error:", error);
        showToast("❌ Gagal memuat profil", "error");
    }
}

async function startChatFromProfile(friendUid, friendName, friendEmail) {
    closeModal('modal-friend-profile');
    await startChatWithFriend(friendUid, friendName, friendEmail);
}

async function removeFriendAndClose(friendUid, friendName) {
    await removeFriend(friendUid, friendName);
    closeModal('modal-friend-profile');
}

// ======================= CLEANUP =======================

function cleanupFriendsSystem() {
    if (friendRequestsListener) {
        db.ref('friendships/requests').off('value', friendRequestsListener);
        friendRequestsListener = null;
    }
    if (friendsListListener && currentUser) {
        db.ref(`friendships/list/${currentUser.uid}`).off('value', friendsListListener);
        friendsListListener = null;
    }
    console.log("🧹 Friends system cleaned up");
}

// ======================= INISIALISASI ========================
setupFriendsUiReadyListener();
setupFriendsDataReadyListener();

if (typeof window !== 'undefined' && window.currentUser) {
    console.log("👥 friends.js: currentUser already exists, initializing immediately");
    setTimeout(() => {
        if (window.currentUser && !friendsListListener) {
            initFriendsSystem();
        }
    }, 100);
}

// ======================= EKSPOR KE GLOBAL =======================
window.initFriendsSystem = initFriendsSystem;
window.searchUserByEmail = searchUserByEmail;
window.sendFriendRequest = sendFriendRequest;
window.acceptFriendRequest = acceptFriendRequest;
window.acceptFriendRequestByEmail = acceptFriendRequestByEmail;
window.rejectFriendRequest = rejectFriendRequest;
window.removeFriend = removeFriend;
window.viewFriendProfile = viewFriendProfile;
window.removeFriendAndClose = removeFriendAndClose;
window.startChatWithFriend = startChatWithFriend;
window.startChatFromProfile = startChatFromProfile;
window.cleanupFriendsSystem = cleanupFriendsSystem;
window.loadFriendsList = loadFriendsList;
window.loadFriendRequests = loadFriendRequests;

console.log("✅ friends.js V2.4 loaded - Fixed friends list display with real-time sync");