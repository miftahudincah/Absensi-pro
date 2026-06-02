// announcement-ui.js - VERSION 1.0
// Fungsi UI untuk pengumuman (render full announcement list, dll)
// ============================================================================

/**
 * Render daftar lengkap pengumuman (untuk tab announcement_list)
 */
function renderFullAnnouncementList() {
    var container = document.getElementById('fullAnnouncementList');
    if (!container) return;
    
    if (typeof db === 'undefined' || !db) {
        container.innerHTML = '<div style="text-align:center; padding:40px;">⏳ Menunggu database...</div>';
        return;
    }
    
    db.ref('announcements/active').once('value', function(snapshot) {
        var data = snapshot.val();
        if (!data) { 
            container.innerHTML = '<div style="text-align:center; padding:40px;">📭 Belum ada pengumuman</div>'; 
            return; 
        }
        
        var announcements = Object.keys(data).map(function(key) { 
            return { id: key, ...data[key] }; 
        });
        
        announcements.sort(function(a, b) { 
            return (b.createdAt || 0) - (a.createdAt || 0); 
        });
        
        var html = '<div style="display:flex; flex-direction:column; gap:15px;">';
        
        announcements.forEach(function(ann) {
            var priorityClass = ann.priority === 'high' ? 'announcement-high' : 
                               (ann.priority === 'low' ? 'announcement-low' : 'announcement-normal');
            var createdDate = ann.createdAt ? new Date(ann.createdAt).toLocaleString('id-ID') : '-';
            
            var expiryInfo = '';
            if (ann.expiryDate) expiryInfo += '📅 Berakhir: ' + ann.expiryDate;
            if (ann.expiryTime) expiryInfo += ' ' + ann.expiryTime;
            if (!expiryInfo) expiryInfo = '⏰ Tidak terbatas';
            
            var imageHtml = '';
            if (ann.imageUrl && ann.imageUrl !== 'null' && ann.imageUrl !== 'undefined') {
                imageHtml = '<div style="margin-top:10px;"><img src="' + ann.imageUrl + '" ' +
                           'style="max-width:100%; max-height:150px; border-radius:12px; cursor:pointer; object-fit:cover;" ' +
                           'onclick="viewAnnouncementImage(\'' + ann.imageUrl + '\')" ' +
                           'onerror="this.style.display=\'none\'"></div>';
            }
            
            html += '<div class="announcement-item ' + priorityClass + '" style="padding:15px; border-radius:12px; background:var(--bg-hover);">' +
                '<div class="announcement-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:10px;">' +
                    '<span class="announcement-title" style="font-weight:bold; font-size:1.1rem;">📢 ' + escapeHtmlString(ann.title) + '</span>' +
                    '<div style="display:flex; gap:8px;">' +
                        '<button class="btn-icon" onclick="editAnnouncement(\'' + ann.id + '\')" title="Edit">✏️</button>' +
                        '<button class="btn-icon delete" onclick="deleteAnnouncement(\'' + ann.id + '\')" title="Hapus">🗑️</button>' +
                    '</div>' +
                '</div>' +
                '<div class="announcement-message" style="margin-bottom:10px;">' + escapeHtmlString(ann.message) + '</div>' +
                imageHtml +
                '<div class="announcement-footer" style="font-size:0.7rem; color:var(--text-muted); display:flex; gap:15px; flex-wrap:wrap; margin-top:10px;">' +
                    '<span>👤 ' + escapeHtmlString(ann.createdBy || 'Admin') + '</span>' +
                    '<span>📅 ' + createdDate + '</span>' +
                    '<span>' + expiryInfo + '</span>' +
                    '<span>' + (ann.priority === 'high' ? '🔴 Penting' : (ann.priority === 'low' ? '🔵 Rendah' : '🟢 Normal')) + '</span>' +
                '</div>' +
            '</div>';
        });
        
        html += '</div>';
        container.innerHTML = html;
    });
}

/**
 * Escape HTML string
 * @param {string} str - String yang akan di-escape
 * @returns {string}
 */
function escapeHtmlString(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        return m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;';
    });
}

// Ekspor ke global
window.renderFullAnnouncementList = renderFullAnnouncementList;
window.escapeHtmlString = escapeHtmlString;

console.log("✅ announcement-ui.js loaded");