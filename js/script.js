// ======================== SOCIAL BADGE UPDATE FUNCTIONS ========================

let pendingFriendRequestsCount = 0;
let unreadChatMessagesCount = 0;
let unviewedStatusCount = 0;

function updateSocialBadges() {
    const socialDropdownBtn = document.getElementById('socialDropdownBtn');
    const friendsBadge = document.getElementById('friendsBadgeInMenu');
    const chatBadge = document.getElementById('chatBadgeInMenu');
    const statusBadge = document.getElementById('statusBadgeInMenu');
    const totalBadgeSpan = document.getElementById('socialTotalBadge');
    
    let total = 0;
    
    if (pendingFriendRequestsCount > 0) {
        if (friendsBadge) {
            friendsBadge.textContent = pendingFriendRequestsCount;
            friendsBadge.style.display = 'inline-block';
            friendsBadge.style.backgroundColor = '#4caf50';
        }
        total += pendingFriendRequestsCount;
    } else if (friendsBadge) {
        friendsBadge.style.display = 'none';
    }
    
    if (unreadChatMessagesCount > 0) {
        if (chatBadge) {
            chatBadge.textContent = unreadChatMessagesCount > 99 ? '99+' : unreadChatMessagesCount;
            chatBadge.style.display = 'inline-block';
            chatBadge.style.backgroundColor = '#2196f3';
        }
        total += unreadChatMessagesCount;
    } else if (chatBadge) {
        chatBadge.style.display = 'none';
    }
    
    if (unviewedStatusCount > 0) {
        if (statusBadge) {
            statusBadge.textContent = unviewedStatusCount;
            statusBadge.style.display = 'inline-block';
            statusBadge.style.backgroundColor = '#ff9800';
        }
        total += unviewedStatusCount;
    } else if (statusBadge) {
        statusBadge.style.display = 'none';
    }
    
    if (total > 0) {
        if (totalBadgeSpan) {
            totalBadgeSpan.textContent = total > 99 ? '99+' : total;
            totalBadgeSpan.style.display = 'inline-block';
            totalBadgeSpan.style.backgroundColor = '#f44336';
        }
    } else if (totalBadgeSpan) {
        totalBadgeSpan.style.display = 'none';
    }
}

function markChatAsRead() {
    unreadChatMessagesCount = 0;
    updateSocialBadges();
}

function markFriendRequestsAsRead() {
    pendingFriendRequestsCount = 0;
    updateSocialBadges();
}

function markStatusAsViewed() {
    unviewedStatusCount = 0;
    updateSocialBadges();
}

function initFriendRequestListener() {
    if (!currentUser || !currentUser.uid) return;
    db.ref('friendships/requests').on('value', (snapshot) => {
        const data = snapshot.val();
        if (!currentUser) return;
        let count = 0;
        if (data) {
            count = Object.keys(data).filter(key => data[key].to === currentUser.uid && data[key].status === 'pending').length;
        }
        pendingFriendRequestsCount = count;
        updateSocialBadges();
    });
}

function initChatUnreadListener() {
    if (!currentUser || !currentUser.uid) return;
    db.ref(`chats/${currentUser.uid}/inbox`).on('value', (snapshot) => {
        const data = snapshot.val();
        let totalUnread = 0;
        if (data) {
            Object.values(data).forEach(inbox => {
                if (inbox.unreadCount && inbox.unreadCount > 0) {
                    totalUnread += inbox.unreadCount;
                }
            });
        }
        unreadChatMessagesCount = totalUnread;
        updateSocialBadges();
    });
}

function initStatusUnviewedListener() {
    if (!currentUser || !currentUser.uid) return;
    db.ref('statuses').on('value', async (snapshot) => {
        const data = snapshot.val();
        let totalUnviewed = 0;
        const now = Date.now();
        const twentyFourHours = 24 * 60 * 60 * 1000;
        
        if (data) {
            for (const [userId, statuses] of Object.entries(data)) {
                if (userId === currentUser.uid) continue;
                const isFriendSnapshot = await db.ref(`friendships/list/${currentUser.uid}/${userId}`).once('value');
                const isFriend = isFriendSnapshot.exists();
                if (!isFriend) continue;
                if (statuses) {
                    for (const [statusId, status] of Object.entries(statuses)) {
                        if (status.createdAt && (now - status.createdAt) < twentyFourHours) {
                            if (!status.viewedBy || !status.viewedBy[currentUser.uid]) {
                                totalUnviewed++;
                            }
                        }
                    }
                }
            }
        }
        unviewedStatusCount = totalUnviewed;
        updateSocialBadges();
    });
}

const originalToggleDropdown = window.toggleDropdown;
if (originalToggleDropdown) {
    window.toggleDropdown = function(dropdownId) {
        originalToggleDropdown(dropdownId);
        if (dropdownId === 'dropdownSocial') {
            updateSocialBadges();
        }
    };
}

function initBadgeListeners() {
    if (!currentUser || !currentUser.uid) return;
    console.log("🔔 Initializing social badge listeners...");
    initFriendRequestListener();
    initChatUnreadListener();
    initStatusUnviewedListener();
}

const originalInitApp = window.initApp;
if (originalInitApp) {
    window.initApp = function() {
        originalInitApp();
        setTimeout(initBadgeListeners, 2000);
    };
} else {
    setTimeout(() => {
        if (currentUser && currentUser.uid) {
            initBadgeListeners();
        }
    }, 3000);
}

window.markChatAsRead = markChatAsRead;
window.markFriendRequestsAsRead = markFriendRequestsAsRead;
window.markStatusAsViewed = markStatusAsViewed;

console.log("✅ Social badge system initialized - Badge akan muncul di dropdown Sosial untuk chat baru, permintaan teman, dan status baru!");

// ======================== DROPDOWN FUNCTIONS ========================

function toggleDropdown(dropdownId) {
    var dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    var content = dropdown.querySelector('.dropdown-content');
    if (!content) return;
    var isOpen = content.classList.contains('open');
    closeAllDropdowns();
    if (!isOpen) {
        content.classList.add('open');
        var overlay = document.getElementById('dropdownOverlay');
        if (overlay) overlay.classList.add('active');
    }
}

function closeAllDropdowns() {
    document.querySelectorAll('.dropdown-content').forEach(function(c) {
        c.classList.remove('open');
    });
    var overlay = document.getElementById('dropdownOverlay');
    if (overlay) overlay.classList.remove('active');
}

// ======================== THEME TOGGLE ========================

function initTheme() {
    var savedTheme = localStorage.getItem('theme') || 'dark';
    applyTheme(savedTheme);
    
    var themeToggleBtn = document.getElementById('themeToggleBtn');
    if (themeToggleBtn) {
        var newToggleBtn = themeToggleBtn.cloneNode(true);
        themeToggleBtn.parentNode.replaceChild(newToggleBtn, themeToggleBtn);
        
        newToggleBtn.addEventListener('click', function(e) {
            e.preventDefault();
            var currentTheme = document.body.classList.contains('light-mode') ? 'light' : 'dark';
            var newTheme = currentTheme === 'light' ? 'dark' : 'light';
            applyTheme(newTheme);
        });
    }
}

function applyTheme(theme) {
    var isLight = theme === 'light';
    var toggleBtn = document.getElementById('themeToggleBtn');
    
    if (isLight) {
        document.body.classList.add('light-mode');
        if (toggleBtn) toggleBtn.innerHTML = '☀️';
        console.log("🌞 Light mode activated");
    } else {
        document.body.classList.remove('light-mode');
        if (toggleBtn) toggleBtn.innerHTML = '🌙';
        console.log("🌙 Dark mode activated");
    }
    
    localStorage.setItem('theme', theme);
    
    setTimeout(function() {
        if (typeof window.updateDashboardChart === 'function') window.updateDashboardChart();
        if (typeof window.updateAttendanceDonutChart === 'function') window.updateAttendanceDonutChart();
        if (typeof window.loadRekap === 'function' && document.getElementById('tab-rekap') && document.getElementById('tab-rekap').classList.contains('active')) {
            window.loadRekap();
        }
    }, 100);
}

function renderFullAnnouncementList() {
    var container = document.getElementById('fullAnnouncementList');
    if (!container) return;
    if (typeof db === 'undefined' || !db) {
        container.innerHTML = '<div style="text-align:center; padding:40px;">⏳ Menunggu database...</div>';
        return;
    }
    db.ref('announcements/active').once('value', function(snapshot) {
        var data = snapshot.val();
        if (!data) { container.innerHTML = '<div style="text-align:center; padding:40px;">📭 Belum ada pengumuman</div>'; return; }
        var announcements = Object.keys(data).map(function(key) { return { id: key, ...data[key] }; });
        announcements.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
        var html = '<div style="display:flex; flex-direction:column; gap:15px;">';
        announcements.forEach(function(ann) {
            var priorityClass = ann.priority === 'high' ? 'announcement-high' : (ann.priority === 'low' ? 'announcement-low' : 'announcement-normal');
            var createdDate = ann.createdAt ? new Date(ann.createdAt).toLocaleString('id-ID') : '-';
            var expiryInfo = '';
            if (ann.expiryDate) expiryInfo += '📅 Berakhir: ' + ann.expiryDate;
            if (ann.expiryTime) expiryInfo += ' ' + ann.expiryTime;
            if (!expiryInfo) expiryInfo = '⏰ Tidak terbatas';
            var imageHtml = '';
            if (ann.imageUrl && ann.imageUrl !== 'null' && ann.imageUrl !== 'undefined') {
                imageHtml = '<div style="margin-top:10px;"><img src="' + ann.imageUrl + '" style="max-width:100%; max-height:150px; border-radius:12px; cursor:pointer; object-fit:cover;" onclick="viewAnnouncementImage(\'' + ann.imageUrl + '\')" onerror="this.style.display=\'none\'"></div>';
            }
            html += '<div class="announcement-item ' + priorityClass + '" style="padding:15px; border-radius:12px; background:var(--bg-hover);">' +
                '<div class="announcement-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:10px;">' +
                    '<span class="announcement-title" style="font-weight:bold; font-size:1.1rem;">📢 ' + escapeHtml(ann.title) + '</span>' +
                    '<div style="display:flex; gap:8px;"><button class="btn-icon" onclick="editAnnouncement(\'' + ann.id + '\')" title="Edit">✏️</button><button class="btn-icon delete" onclick="deleteAnnouncement(\'' + ann.id + '\')" title="Hapus">🗑️</button></div>' +
                '</div>' +
                '<div class="announcement-message" style="margin-bottom:10px;">' + escapeHtml(ann.message) + '</div>' +
                imageHtml +
                '<div class="announcement-footer" style="font-size:0.7rem; color:var(--text-muted); display:flex; gap:15px; flex-wrap:wrap; margin-top:10px;">' +
                    '<span>👤 ' + escapeHtml(ann.createdBy || 'Admin') + '</span>' +
                    '<span>📅 ' + createdDate + '</span>' +
                    '<span>' + expiryInfo + '</span>' +
                    '<span>' + (ann.priority === 'high' ? '🔴 Penting' : (ann.priority === 'low' ? '🔵 Rendah' : '🟢 Normal')) + '</span>' +
                '</div>' +
            '</div>';
        });
        html += '</div>';
        container.innerHTML = html;
    }).catch(function(err) {
        console.error("Error loading announcements:", err);
        container.innerHTML = '<div style="text-align:center; padding:40px;">❌ Gagal memuat pengumuman</div>';
    });
}

function escapeHtml(str) { if (!str) return ''; return str.replace(/[&<>]/g, function(m) { return m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;'; }); }

// ======================= WHATSAPP FUNCTIONS =======================

async function saveParentContactFromModal() {
    const studentId = document.getElementById('parentStudentName').getAttribute('data-id');
    const studentName = document.getElementById('parentStudentName').value;
    const phoneNumber = document.getElementById('parentPhoneNumber').value.trim();
    const relation = document.getElementById('parentRelation').value;
    
    if (!phoneNumber) {
        showToast('Masukkan nomor WhatsApp!', 'error');
        return;
    }
    
    if (typeof window.saveParentContact === 'function') {
        await window.saveParentContact(studentId, studentName, phoneNumber, relation);
        closeModal('modal-parent-contact');
    } else {
        showToast('Fungsi saveParentContact tidak tersedia', 'error');
    }
}

window.openParentContactModal = function(studentId, studentName) {
    const modal = document.getElementById('modal-parent-contact');
    if (modal) {
        document.getElementById('parentStudentName').value = studentName;
        document.getElementById('parentStudentName').setAttribute('data-id', studentId);
        document.getElementById('parentPhoneNumber').value = '';
        document.getElementById('parentRelation').value = 'orang_tua';
        modal.classList.add('open');
    }
};

// ======================= STAFF FUNCTIONS =======================

window.openSimulateStaffInModal = function() {
    if (typeof window.openSimulateStaffInModalFn === 'function') {
        window.openSimulateStaffInModalFn();
    }
};

window.openSimulateStaffOutModal = function() {
    if (typeof window.openSimulateStaffOutModalFn === 'function') {
        window.openSimulateStaffOutModalFn();
    }
};

window.exportStaffAttendanceToExcel = function() {
    if (typeof window.exportStaffAttendanceToExcelFn === 'function') {
        window.exportStaffAttendanceToExcelFn();
    }
};

// ======================= IZIN FUNCTIONS =======================

function goToIzinTab() {
    console.log('📝 Membuka tab Izin Online...');
    if (typeof switchTab === 'function') {
        switchTab('izin');
    }
    closeAllDropdowns();
    
    setTimeout(function() {
        if (typeof window.filterIzinList === 'function') {
            console.log('🔄 Reset filter ke "all" untuk menampilkan semua izin');
            window.filterIzinList('all');
        } else {
            console.log('⚠️ filterIzinList belum siap, mencoba lagi...');
            setTimeout(function() {
                if (typeof window.filterIzinList === 'function') {
                    window.filterIzinList('all');
                }
            }, 500);
        }
    }, 300);
}

// ======================= TOGGLE GENERATE INPUT =======================

function toggleGenerateInput() {
    const typeRadio = document.querySelector('input[name="genTarget"]:checked');
    if (!typeRadio) return;
    const type = typeRadio.value;
    const selectGroupSiswa = document.getElementById('group-select-siswa');
    const selectGroupStaff = document.getElementById('group-select-staff');
    const desc = document.getElementById('gen-desc');
    
    if (type === 'siswa') {
        if (selectGroupSiswa) selectGroupSiswa.style.display = 'block';
        if (selectGroupStaff) selectGroupStaff.style.display = 'none';
        if (desc) desc.innerText = '🔒 Kode akan dikunci ke ID Siswa terpilih.';
        if (typeof populateStudentSelectForCode === 'function') {
            populateStudentSelectForCode();
        }
    } else if (type === 'staff') {
        if (selectGroupSiswa) selectGroupSiswa.style.display = 'none';
        if (selectGroupStaff) selectGroupStaff.style.display = 'block';
        if (desc) desc.innerText = '🔒 Kode akan dikunci ke Staff yang dipilih. WAJIB input ID Staff saat registrasi!';
        if (typeof populateStaffSelectForCode === 'function') {
            populateStaffSelectForCode();
        }
    } else {
        if (selectGroupSiswa) selectGroupSiswa.style.display = 'none';
        if (selectGroupStaff) selectGroupStaff.style.display = 'none';
        if (desc) desc.innerText = '🔓 Kode bebas digunakan.';
    }
}

// ======================= TOGGLE REGISTER INPUT =======================

function toggleRegisterInput() {
    const typeRadio = document.querySelector('input[name="regRoleType"]:checked');
    if (!typeRadio) return;
    const type = typeRadio.value;
    
    const idGroup = document.getElementById('group-reg-id');
    const staffGroup = document.getElementById('group-reg-staff');
    const codeInput = document.getElementById('regCode');
    
    if (idGroup) idGroup.style.display = 'none';
    if (staffGroup) staffGroup.style.display = 'none';
    
    if (type === 'siswa') {
        if (idGroup) {
            idGroup.style.display = 'block';
            const idHint = idGroup.querySelector('.text-small');
            if (idHint) idHint.textContent = 'Masukkan ID Fingerprint yang diberikan oleh guru';
        }
        if (codeInput) codeInput.placeholder = '🔑 Kode Unik (Siswa)';
    } 
    else if (type === 'staff') {
        if (staffGroup) staffGroup.style.display = 'block';
        if (codeInput) codeInput.placeholder = '🔑 Kode Unik (Staff/Guru)';
        
        const staffIdInput = document.getElementById('regStaffId');
        if (staffIdInput) staffIdInput.required = true;
    }
}

// ======================= SWITCH TAB OVERRIDE =======================

var originalSwitchTab = window.switchTab;
if (originalSwitchTab) {
    window.switchTab = function(tabId) {
        originalSwitchTab(tabId);
        if (tabId === 'announcement_list') { setTimeout(renderFullAnnouncementList, 100); }
        if (tabId === 'chat') { setTimeout(function() { if (typeof forceRenderChat === 'function') forceRenderChat(); }, 100); }
        if (tabId === 'friends') { setTimeout(function() { if (typeof loadFriendRequests === 'function') loadFriendRequests(); if (typeof loadFriendsList === 'function') loadFriendsList(); }, 100); }
        if (tabId === 'izin') { 
            setTimeout(function() { 
                if (typeof window.renderIzinTab === 'function') {
                    window.renderIzinTab();
                    setTimeout(function() {
                        if (typeof window.filterIzinList === 'function') {
                            console.log('🔄 Memanggil filterIzinList("all") dari switchTab');
                            window.filterIzinList('all');
                        }
                    }, 200);
                }
            }, 100);
        }
        if (tabId === 'staff') { setTimeout(function() { if (typeof renderStaffTable === 'function') renderStaffTable(); }, 100); }
        if (tabId === 'staff-attendance') { 
            setTimeout(function() { 
                if (typeof window.renderStaffAttendanceTable === 'function') {
                    window.renderStaffAttendanceTable();
                }
                if (typeof filterStaffAttendance === 'function') {
                    filterStaffAttendance();
                }
            }, 100); 
        }
        if (tabId === 'users') {
            setTimeout(function() {
                if (typeof refreshCodesTable === 'function') {
                    refreshCodesTable();
                }
            }, 100);
        }
    };
}

// ======================= REFRESH CODES TABLE =======================

function refreshCodesTable() {
    console.log("🔄 Manual refresh codes table triggered from main");
    if (typeof window.refreshCodesTableFn === 'function') {
        window.refreshCodesTableFn();
    } else if (typeof db !== 'undefined' && db) {
        db.ref('codes').once('value').then((snapshot) => {
            const codes = snapshot.val();
            if (typeof dbData !== 'undefined') {
                if (codes) {
                    dbData.codes = Object.keys(codes).map(key => ({ code: key, ...codes[key] }));
                } else {
                    dbData.codes = [];
                }
            }
            if (typeof renderCodesTable === 'function') renderCodesTable();
            if (typeof updateCodesStatistics === 'function') updateCodesStatistics();
            showToast("✅ Tabel kode berhasil di-refresh", "success");
        }).catch(err => {
            console.error("Error refreshing codes:", err);
            showToast("❌ Gagal refresh tabel kode", "error");
        });
    } else {
        if (typeof renderCodesTable === 'function') renderCodesTable();
        showToast("✅ Tabel kode di-refresh dari cache", "success");
    }
}

// ======================= AI ASSISTANT MODAL (FIXED) =======================

function closeAIAssistantModal() {
    var modal = document.getElementById('modal-ai-assistant');
    if (modal && modal.classList) {
        modal.classList.remove('open');
    }
    if (typeof window.closeAIAssistantModalFn === 'function') window.closeAIAssistantModalFn();
}

function openAIAssistantModal() {
    console.log("🤖 Opening AI Assistant Modal...");
    
    // Cek akses
    if (typeof hasAIAccessForce !== 'undefined' && !hasAIAccessForce()) {
        console.log("🔒 AI Assistant access denied");
        if (typeof showToast === 'function') {
            showToast("🔒 AI Assistant hanya untuk Admin, Guru, dan Staff", "error");
        }
        return;
    }
    
    // Cari modal yang sudah ada
    var modal = document.getElementById('modal-ai-assistant');
    
    // Jika modal belum ada, buat
    if (!modal) {
        console.log("📦 Creating AI Assistant modal...");
        modal = document.createElement('div');
        modal.id = 'modal-ai-assistant';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-box" style="max-width: 600px; width: 90%; height: 80vh; display: flex; flex-direction: column; padding: 0;">
                <div class="modal-title" style="padding: 15px 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
                    <span>🤖 AI Assistant <small style="font-size: 11px; color: #888;" id="aiProviderBadge">Ready</small></span>
                    <span onclick="closeAIAssistantModal()" style="cursor: pointer; font-size: 24px;">✖</span>
                </div>
                <div id="aiChatMessages" style="flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 12px;">
                    <div class="ai-message ai-bot">
                        <div class="ai-avatar">🤖</div>
                        <div class="ai-bubble">Halo! Saya asisten AI untuk sistem absensi.<br><br>Saya bisa membantu:<br>• 🔍 Mencari data siswa<br>• 📊 Melihat rekap absensi<br>• 📈 Menampilkan statistik<br>• ✏️ Membantu operasional (tambah/edit/hapus data)<br><br><strong>Ketik "bantuan" untuk melihat semua perintah!</strong></div>
                    </div>
                </div>
                <div style="padding: 15px; border-top: 1px solid var(--border); display: flex; gap: 10px;">
                    <input type="text" id="aiChatInput" placeholder="Tanyakan sesuatu... misal: 'data siswa kelas X'" style="flex: 1; padding: 12px; border-radius: 30px; border: 1px solid var(--border); background: var(--bg-card); color: var(--text-primary);">
                    <button id="aiSendBtn" style="padding: 12px 20px; border-radius: 30px; background: linear-gradient(135deg, #00bcd4, #2196f3); border: none; color: white; cursor: pointer;">📤 Kirim</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    // Buka modal
    if (modal && modal.classList) {
        modal.classList.add('open');
    } else {
        console.error("Modal element tidak valid");
        return;
    }
    
    // Setup event handlers untuk chat
    setTimeout(function() {
        var input = document.getElementById('aiChatInput');
        var sendBtn = document.getElementById('aiSendBtn');
        var messagesContainer = document.getElementById('aiChatMessages');
        
        if (!input || !sendBtn || !messagesContainer) {
            console.error("AI Chat elements not found");
            return;
        }
        
        // Hapus event listener lama dengan clone
        var newInput = input.cloneNode(true);
        var newSendBtn = sendBtn.cloneNode(true);
        input.parentNode.replaceChild(newInput, input);
        sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
        
        input = newInput;
        sendBtn = newSendBtn;
        
        // Fungsi kirim pesan
        var sendMessage = async function() {
            var message = input.value.trim();
            if (!message) return;
            
            // Add user message
            var userMsgDiv = document.createElement('div');
            userMsgDiv.className = 'ai-message ai-user';
            userMsgDiv.innerHTML = '<div class="ai-avatar">👤</div><div class="ai-bubble">' + escapeHtml(message) + '</div>';
            messagesContainer.appendChild(userMsgDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            
            input.value = '';
            sendBtn.disabled = true;
            sendBtn.innerHTML = '⏳';
            
            // Add typing indicator
            var typingDiv = document.createElement('div');
            typingDiv.className = 'ai-message ai-bot';
            typingDiv.id = 'ai-typing-indicator';
            typingDiv.innerHTML = '<div class="ai-avatar">🤖</div><div class="ai-bubble"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>';
            messagesContainer.appendChild(typingDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            
            try {
                var response;
                if (typeof window.processAIMessage === 'function') {
                    response = await window.processAIMessage(message);
                } else if (typeof processAIMessage === 'function') {
                    response = await processAIMessage(message);
                } else {
                    response = "Maaf, AI Assistant sedang dalam proses inisialisasi. Silakan coba lagi nanti.";
                }
                
                // Remove typing indicator
                var typingIndicator = document.getElementById('ai-typing-indicator');
                if (typingIndicator) typingIndicator.remove();
                
                // Add bot response
                var botMsgDiv = document.createElement('div');
                botMsgDiv.className = 'ai-message ai-bot';
                var formattedResponse = (typeof formatMarkdown === 'function') ? formatMarkdown(response) : response;
                botMsgDiv.innerHTML = '<div class="ai-avatar">🤖</div><div class="ai-bubble">' + formattedResponse + '</div>';
                messagesContainer.appendChild(botMsgDiv);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
                
            } catch (error) {
                console.error("AI Error:", error);
                var typingIndicator = document.getElementById('ai-typing-indicator');
                if (typingIndicator) typingIndicator.remove();
                
                var errorMsgDiv = document.createElement('div');
                errorMsgDiv.className = 'ai-message ai-bot';
                errorMsgDiv.innerHTML = '<div class="ai-avatar">🤖</div><div class="ai-bubble" style="background: rgba(244, 67, 54, 0.2);">❌ Maaf, terjadi kesalahan: ' + error.message + '</div>';
                messagesContainer.appendChild(errorMsgDiv);
            } finally {
                sendBtn.disabled = false;
                sendBtn.innerHTML = '📤 Kirim';
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        };
        
        sendBtn.onclick = sendMessage;
        input.onkeypress = function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        };
        
        input.focus();
    }, 200);
}

// ======================= REMINDER FUNCTIONS =======================

async function triggerManualReminder() {
    if (typeof window.triggerManualReminderFn === 'function') {
        console.log("🔔 Manual reminder triggered from button");
        await window.triggerManualReminderFn();
    } else {
        console.log("⚠️ triggerManualReminder function not available yet");
        if (typeof showToast === 'function') {
            showToast("⏳ Sistem pengingat sedang dimuat, coba lagi nanti", "info");
        }
    }
}

window.triggerManualReminder = triggerManualReminder;

// ======================= UTILITY FUNCTIONS =======================

function showToast(msg, type) { 
    var t = document.getElementById('toast'); 
    if (t) { 
        t.textContent = msg; 
        t.style.borderLeftColor = type === 'error' ? '#f44336' : '#00bcd4'; 
        t.className = 'toast show'; 
        setTimeout(function() { 
            t.className = t.className.replace('show', ''); 
        }, 3000); 
    } 
}

function closeModal(id) { 
    var m = document.getElementById(id); 
    if (m) m.classList.remove('open'); 
}

function toggleFriendsModal() { 
    var modal = document.getElementById('modal-friends'); 
    if (modal) { 
        modal.classList.add('open'); 
        if (typeof renderFriendsPanel === 'function') renderFriendsPanel(); 
    } 
}

function openChatModal() { 
    var modal = document.getElementById('modal-chat'); 
    if (modal) { 
        modal.classList.add('open'); 
        if (typeof renderChatInterface === 'function') renderChatInterface('chatModalPanel'); 
    } 
}

function openAISummaryModal() { 
    if (typeof window.openAISummaryModalFn === 'function') window.openAISummaryModalFn(); 
}

// ======================= FORCE AI ASSISTANT BUTTON =======================
// Memastikan tombol AI Assistant muncul untuk role yang diizinkan

const ALLOWED_AI_ROLES_FORCE = ['admin', 'guru', 'developer', 'wakil', 'staff_tu', 'kepala_sekolah'];

function hasAIAccessForce() {
    if (!currentUser || !currentUser.role) return false;
    if (currentUser.role === 'siswa') return false;
    return ALLOWED_AI_ROLES_FORCE.includes(currentUser.role);
}

function createAIAssistantButtonManually() {
    if (document.getElementById('aiAssistantBtn')) return;
    
    const btn = document.createElement('button');
    btn.id = 'aiAssistantBtn';
    btn.innerHTML = '💬';
    btn.title = 'AI Assistant - Tanya apapun tentang sistem';
    btn.style.cssText = `
        position: fixed;
        bottom: 100px;
        right: 20px;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: linear-gradient(135deg, #00bcd4, #2196f3);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        z-index: 998;
        border: none;
        font-size: 28px;
        transition: transform 0.2s;
    `;
    btn.onmouseenter = () => btn.style.transform = 'scale(1.1)';
    btn.onmouseleave = () => btn.style.transform = 'scale(1)';
    btn.onclick = () => {
        if (typeof window.openAIAssistantModal === 'function') {
            window.openAIAssistantModal();
        } else {
            showToast("🤖 AI Assistant sedang dimuat, coba lagi nanti", "info");
        }
    };
    
    document.body.appendChild(btn);
    console.log("✅ AI Assistant button created manually for role:", currentUser?.role);
}

function forceShowAIAssistantButton() {
    if (!currentUser || !currentUser.role) {
        console.log("⏳ Menunggu user login untuk AI Assistant...");
        return false;
    }
    
    if (hasAIAccessForce()) {
        console.log("✅ User role:", currentUser.role, "- Menampilkan tombol AI Assistant");
        
        if (!document.getElementById('aiAssistantBtn')) {
            if (typeof window.initAIAssistant === 'function') {
                window.initAIAssistant();
            } else {
                createAIAssistantButtonManually();
            }
        }
        return true;
    } else {
        console.log("🔒 User role:", currentUser.role, "- TIDAK memiliki akses AI Assistant");
        return false;
    }
}

// Watcher untuk memastikan tombol muncul
let aiButtonCheckInterval = null;

function startAIAssistantWatcher() {
    if (aiButtonCheckInterval) clearInterval(aiButtonCheckInterval);
    
    aiButtonCheckInterval = setInterval(function() {
        if (currentUser && currentUser.role) {
            if (hasAIAccessForce()) {
                if (!document.getElementById('aiAssistantBtn')) {
                    console.log("🔍 Tombol AI belum ada, mencoba membuat...");
                    if (typeof window.initAIAssistant === 'function') {
                        window.initAIAssistant();
                    } else {
                        createAIAssistantButtonManually();
                    }
                } else {
                    // Tombol sudah ada, hentikan interval
                    if (aiButtonCheckInterval) clearInterval(aiButtonCheckInterval);
                }
            }
        }
    }, 3000);
}

// Override fungsi initAIAssistant yang mungkin sudah ada
if (typeof window.initAIAssistant === 'function') {
    const originalInit = window.initAIAssistant;
    window.initAIAssistant = function() {
        console.log("🎯 Calling original initAIAssistant");
        originalInit();
        setTimeout(() => {
            if (!document.getElementById('aiAssistantBtn') && hasAIAccessForce()) {
                createAIAssistantButtonManually();
            }
        }, 500);
    };
}

// ======================= LOGIN SECURITY UI HELPERS =======================

/**
 * Check and restore login lockout state on page load
 * Jika ada lockout aktif, restore UI lockout
 */
function checkAndRestoreLoginLockout() {
    if (typeof window.getLoginLockStatus !== 'function') {
        console.log("🔐 Login security functions not loaded yet");
        return;
    }
    
    // Cek email yang terakhir login (dari localStorage)
    const lastLoginEmail = localStorage.getItem('lastLoginEmail');
    if (!lastLoginEmail) return;
    
    const lockStatus = window.getLoginLockStatus(lastLoginEmail);
    if (lockStatus.isLocked) {
        console.log(`🔐 Restoring lockout UI for ${lastLoginEmail}, remaining: ${lockStatus.remainingTime}s`);
        if (typeof window.updateLockoutUI === 'function') {
            window.updateLockoutUI(lastLoginEmail, lockStatus.remainingTime);
        }
    }
}

/**
 * Save last login email untuk restore lockout
 */
function saveLastLoginEmail(email) {
    if (email) {
        localStorage.setItem('lastLoginEmail', email);
    }
}

/**
 * Clear last login email setelah login berhasil
 */
function clearLastLoginEmail() {
    localStorage.removeItem('lastLoginEmail');
}

// ======================= DOM READY EVENT =======================

document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM Ready - Initializing...");
    
    // ====== CHECK LOGIN LOCKOUT STATE ======
    // Cek apakah ada lockout yang perlu direstore
    setTimeout(function() {
        checkAndRestoreLoginLockout();
    }, 1000);
    
    // ====== INITIALIZE DELAY HOURS DROPDOWNS ======
    var dh = document.getElementById('delayHoursValue');
    if(dh && dh.children.length===0) {
        for(var i=1;i<=24;i++) dh.innerHTML+='<option value="'+i+'">'+i+' Jam</option>';
    }
    
    var gh = document.getElementById('globalDelayHoursValue');
    if(gh && gh.children.length===0) {
        for(var j=1;j<=24;j++) gh.innerHTML+='<option value="'+j+'">'+j+'</option>';
    }
    
    // ====== ADD EVENT LISTENERS FOR DELAY INPUTS ======
    var dm = document.getElementById('delayMinutesValue');
    if(dm && !dm._listenerAdded) { 
        dm.addEventListener('input',function(){var h=document.getElementById('newDelay');if(h)h.value=this.value;}); 
        dm._listenerAdded=true; 
    }
    
    var dh2 = document.getElementById('delayHoursValue');
    if(dh2 && !dh2._listenerAdded) { 
        dh2.addEventListener('change',function(){var h=document.getElementById('newDelay');if(h)h.value=this.value*60;}); 
        dh2._listenerAdded=true; 
    }
    
    var du = document.getElementById('delayUnit');
    if(du && !du._listenerAdded) { 
        du.addEventListener('change',function(){if(typeof toggleDelayInput==='function') toggleDelayInput();}); 
        du._listenerAdded=true; 
    }
    
    var gdm = document.getElementById('globalDelayMinutesValue');
    if(gdm && !gdm._listenerAdded) { 
        gdm.addEventListener('input',function(){var h=document.getElementById('globalDelayHidden');if(h)h.value=this.value;}); 
        gdm._listenerAdded=true; 
    }
    
    var gdh2 = document.getElementById('globalDelayHoursValue');
    if(gdh2 && !gdh2._listenerAdded) { 
        gdh2.addEventListener('change',function(){var h=document.getElementById('globalDelayHidden');if(h)h.value=this.value*60;}); 
        gdh2._listenerAdded=true; 
    }
    
    var gdu = document.getElementById('globalDelayUnit');
    if(gdu && !gdu._listenerAdded) { 
        gdu.addEventListener('change',function(){if(typeof toggleGlobalDelayInput==='function') toggleGlobalDelayInput();}); 
        gdu._listenerAdded=true; 
    }
    
    setTimeout(function() { 
        if(typeof toggleDelayInput==='function') toggleDelayInput(); 
        if(typeof toggleGlobalDelayInput==='function') toggleGlobalDelayInput(); 
    }, 100);
    
    // ====== INITIALIZE CUSTOM RANGE FOR REKAP PERIOD ======
    var periodSelect = document.getElementById('rekapPeriod');
    var customRangeGroup = document.getElementById('customRangeGroup');
    if(periodSelect && customRangeGroup) {
        var today = new Date();
        var startDate = new Date();
        startDate.setDate(today.getDate() - 30);
        var startInput = document.getElementById('rekapStartDate');
        var endInput = document.getElementById('rekapEndDate');
        if(startInput && !startInput.value) startInput.value = startDate.toISOString().split('T')[0];
        if(endInput && !endInput.value) endInput.value = today.toISOString().split('T')[0];
        
        function toggleCustomRange() { 
            customRangeGroup.style.display = periodSelect.value === 'custom' ? 'flex' : 'none'; 
        }
        periodSelect.addEventListener('change', toggleCustomRange);
        toggleCustomRange();
    }
    
    // ====== INITIALIZE THEME ======
    setTimeout(function() { initTheme(); }, 50);
    
    // ====== INITIALIZE MODULES ======
    setTimeout(function() {
        if (typeof initRekapPerSiswa === 'function') { initRekapPerSiswa(); }
        if (typeof initAISummary === 'function') { initAISummary(); }
        if (typeof initAIAssistant === 'function') { initAIAssistant(); }
        if (typeof initChatSystem === 'function' && !window._chatInitialized) { window._chatInitialized = true; initChatSystem(); }
        if (typeof initFriendsSystem === 'function' && !window._friendsInitialized) { window._friendsInitialized = true; initFriendsSystem(); }
        if (typeof initStatusSystem === 'function' && !window._statusInitialized) { window._statusInitialized = true; initStatusSystem(); }
        if (typeof initIzinOnline === 'function' && !window._izinInitialized) { window._izinInitialized = true; initIzinOnline(); }
        if (typeof initStaffSystem === 'function' && !window._staffInitialized) { window._staffInitialized = true; initStaffSystem(); }
        if (typeof initStaffAttendance === 'function' && !window._staffAttendanceInitialized) { window._staffAttendanceInitialized = true; initStaffAttendance(); }
        if (typeof initStaffAttendanceFilter === 'function') { 
            setTimeout(() => initStaffAttendanceFilter(), 500);
        }
        if (typeof initAttendanceReminder === 'function') {
            console.log("🔔 Initializing Attendance Reminder System...");
            initAttendanceReminder();
        }
        
        // Start AI Assistant watcher after modules loaded
        setTimeout(startAIAssistantWatcher, 2000);
        setTimeout(forceShowAIAssistantButton, 3000);
    }, 1500);
    
    // ====== LISTENER UNTUK LOCKOUT ENDED EVENT ======
    document.addEventListener('loginLockoutEnded', function(e) {
        console.log("🔓 Login lockout ended for:", e.detail.email);
        // Clear last login email
        clearLastLoginEmail();
    });
});

// ====== EVENT LISTENER UNTUK USER LOGIN ======
window.addEventListener('userLoggedIn', function(e) {
    console.log("🔔 User logged in event detected");
    
    // Clear lockout data
    clearLastLoginEmail();
    if (e.detail && e.detail.user && e.detail.user.email) {
        if (typeof window.resetLoginAttempts === 'function') {
            window.resetLoginAttempts(e.detail.user.email);
        }
    }
    
    setTimeout(forceShowAIAssistantButton, 500);
    setTimeout(startAIAssistantWatcher, 1000);
});

// ====== EVENT LISTENER UNTUK LOGIN FAILURE ======
document.addEventListener('loginFailed', function(e) {
    if (e.detail && e.detail.email) {
        console.log("🔐 Login failed for:", e.detail.email);
        saveLastLoginEmail(e.detail.email);
    }
});

// ======================= EXPOSE FUNCTIONS TO GLOBAL =======================

window.showToast = showToast;
window.closeModal = closeModal;
window.toggleDropdown = toggleDropdown;
window.closeAllDropdowns = closeAllDropdowns;
window.renderFullAnnouncementList = renderFullAnnouncementList;
window.toggleFriendsModal = toggleFriendsModal;
window.openChatModal = openChatModal;
window.openAISummaryModal = openAISummaryModal;
window.openAIAssistantModal = openAIAssistantModal;
window.closeAIAssistantModal = closeAIAssistantModal;
window.initTheme = initTheme;
window.applyTheme = applyTheme;
window.saveParentContactFromModal = saveParentContactFromModal;
window.goToIzinTab = goToIzinTab;
window.toggleGenerateInput = toggleGenerateInput;
window.toggleRegisterInput = toggleRegisterInput;
window.refreshCodesTable = refreshCodesTable;
window.forceShowAIAssistantButton = forceShowAIAssistantButton;
window.hasAIAccessForce = hasAIAccessForce;

// Ekspor fungsi keamanan
window.checkAndRestoreLoginLockout = checkAndRestoreLoginLockout;
window.saveLastLoginEmail = saveLastLoginEmail;
window.clearLastLoginEmail = clearLastLoginEmail;

console.log("✅ Script.js loaded successfully");
console.log("✅ AI Assistant Force Loader initialized - Role SISWA TIDAK memiliki akses");
console.log("🔐 Login Security UI helpers initialized - Lockout restore on page load");