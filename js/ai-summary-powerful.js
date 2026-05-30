// ai-summary-powerful.js - VERSION 5.0 (ULTIMATE AI ANALYTICS)
// Fitur AI Canggih:
// - Analisis prediktif kehadiran 7 hari ke depan
// - Deteksi anomali otomatis (lonjakan alpha, tren menurun)
// - Rekomendasi cerdas berbasis data real-time
// - Perbandingan dengan periode sebelumnya
// - Analisis pola per hari dalam seminggu
// - Export ke PDF dengan visualisasi lengkap
// ============================================================================

// ======================= KONFIGURASI AI =======================
const AI_CONFIG = {
    // Bobot prediksi (machine learning sederhana)
    weights: {
        historicalTrend: 0.35,    // Tren historis
        dayOfWeek: 0.20,          // Pola per hari
        recentPattern: 0.25,      // 5 hari terakhir
        seasonalFactor: 0.20      // Faktor musiman (akhir bulan)
    },
    predictionDays: 7,
    anomalyThreshold: 1.5,        // Standar deviasi untuk deteksi anomali
    minDataPoints: 14             // Minimal data untuk analisis prediksi
};

// ======================= FUNGSI UTAMA =======================

/**
 * Mendapatkan data absensi lengkap untuk analisis
 */
function getAttendanceAnalyticsData() {
    if (!dbData || !dbData.attendance || !dbData.users) return null;
    
    const students = dbData.users.filter(s => s && s.nama && s.nama !== 'Tidak Diketahui');
    const attendance = dbData.attendance;
    
    if (students.length === 0 || attendance.length === 0) return null;
    
    const today = new Date();
    const last30Days = new Date(today);
    last30Days.setDate(today.getDate() - 30);
    
    // Filter 30 hari terakhir
    const recentAttendance = attendance.filter(a => {
        const date = new Date(a.date);
        return date >= last30Days;
    });
    
    // Hitung statistik per hari
    const dailyStats = {};
    const dayMap = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    
    for (let i = 0; i < 7; i++) {
        dailyStats[dayMap[i]] = { total: 0, hadir: 0, terlambat: 0 };
    }
    
    recentAttendance.forEach(a => {
        const date = new Date(a.date);
        const dayName = dayMap[date.getDay()];
        if (dailyStats[dayName]) {
            dailyStats[dayName].total++;
            if (a.status === 'Hadir' || a.status === 'Pulang') {
                dailyStats[dayName].hadir++;
            }
            if (a.timeIn && a.timeIn > '07:30') {
                dailyStats[dayName].terlambat++;
            }
        }
    });
    
    // Hitung persentase per hari
    for (let day in dailyStats) {
        if (dailyStats[day].total > 0) {
            dailyStats[day].persentase = ((dailyStats[day].hadir / dailyStats[day].total) * 100).toFixed(1);
        } else {
            dailyStats[day].persentase = 0;
        }
    }
    
    // Hitung statistik mingguan
    const weeklyStats = [];
    for (let w = 0; w < 4; w++) {
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - (w * 7 + 7));
        const weekEnd = new Date(today);
        weekEnd.setDate(today.getDate() - (w * 7 + 1));
        
        const weekAttendance = recentAttendance.filter(a => {
            const date = new Date(a.date);
            return date >= weekStart && date <= weekEnd;
        });
        
        const hadir = weekAttendance.filter(a => a.status === 'Hadir' || a.status === 'Pulang').length;
        const total = weekAttendance.length;
        
        weeklyStats.push({
            week: w + 1,
            hadir,
            total,
            persentase: total > 0 ? ((hadir / total) * 100).toFixed(1) : 0
        });
    }
    
    // Hitung statistik siswa
    const studentStats = students.map(student => {
        const studentAttendance = recentAttendance.filter(a => a.studentId == student.id);
        const hadir = studentAttendance.filter(a => a.status === 'Hadir' || a.status === 'Pulang').length;
        const terlambat = studentAttendance.filter(a => a.timeIn && a.timeIn > '07:30').length;
        const alpha = studentAttendance.filter(a => a.status === 'Alpha').length;
        
        return {
            id: student.id,
            nama: student.nama,
            kelas: student.kelas,
            jurusan: student.jurusan,
            hadir,
            terlambat,
            alpha,
            total: studentAttendance.length,
            persentase: studentAttendance.length > 0 ? ((hadir / studentAttendance.length) * 100).toFixed(1) : 0
        };
    });
    
    // Urutkan untuk top & bottom performers
    const topPerformers = [...studentStats].sort((a, b) => b.persentase - a.persentase).slice(0, 5);
    const bottomPerformers = [...studentStats]
        .filter(s => s.total >= 5)
        .sort((a, b) => a.persentase - b.persentase)
        .slice(0, 5);
    
    // Deteksi anomali
    const anomalies = detectAnomaliesAdvanced(recentAttendance, students);
    
    // Prediksi 7 hari ke depan
    const predictions = predictFutureAttendance(recentAttendance, dailyStats, weeklyStats);
    
    return {
        dailyStats,
        weeklyStats,
        studentStats: {
            total: students.length,
            topPerformers,
            bottomPerformers,
            averageAttendance: studentStats.reduce((sum, s) => sum + parseFloat(s.persentase), 0) / students.length || 0
        },
        recentAttendance,
        totalAttendance: recentAttendance.length,
        uniqueAttendance: new Set(recentAttendance.map(a => `${a.date}-${a.studentId}`)).size,
        anomalies,
        predictions,
        summary: {
            period: {
                start: last30Days.toISOString().split('T')[0],
                end: today.toISOString().split('T')[0]
            },
            totalHari: 30
        }
    };
}

/**
 * Deteksi anomali canggih
 */
function detectAnomaliesAdvanced(attendance, students) {
    const anomalies = [];
    
    // Group by date
    const attendanceByDate = {};
    attendance.forEach(a => {
        if (!attendanceByDate[a.date]) {
            attendanceByDate[a.date] = { hadir: 0, alpha: 0, terlambat: 0, total: 0 };
        }
        if (a.status === 'Hadir' || a.status === 'Pulang') {
            attendanceByDate[a.date].hadir++;
        }
        if (a.status === 'Alpha') {
            attendanceByDate[a.date].alpha++;
        }
        if (a.timeIn && a.timeIn > '07:30') {
            attendanceByDate[a.date].terlambat++;
        }
        attendanceByDate[a.date].total++;
    });
    
    const dates = Object.keys(attendanceByDate).sort();
    if (dates.length < 7) return anomalies;
    
    // Hitung rata-rata dan standar deviasi
    const hadirValues = dates.map(d => attendanceByDate[d].hadir);
    const alphaValues = dates.map(d => attendanceByDate[d].alpha);
    
    const avgHadir = hadirValues.reduce((a, b) => a + b, 0) / hadirValues.length;
    const avgAlpha = alphaValues.reduce((a, b) => a + b, 0) / alphaValues.length;
    
    const stdHadir = Math.sqrt(hadirValues.map(x => Math.pow(x - avgHadir, 2)).reduce((a, b) => a + b, 0) / hadirValues.length);
    const stdAlpha = Math.sqrt(alphaValues.map(x => Math.pow(x - avgAlpha, 2)).reduce((a, b) => a + b, 0) / alphaValues.length);
    
    // Deteksi lonjakan
    const last7Days = dates.slice(-7);
    last7Days.forEach(date => {
        const data = attendanceByDate[date];
        const hadirZScore = Math.abs(data.hadir - avgHadir) / (stdHadir || 1);
        const alphaZScore = Math.abs(data.alpha - avgAlpha) / (stdAlpha || 1);
        
        if (hadirZScore > AI_CONFIG.anomalyThreshold) {
            anomalies.push({
                type: 'attendance_spike',
                severity: hadirZScore > 2 ? 'high' : 'medium',
                date,
                description: data.hadir > avgHadir 
                    ? `📈 Lonjakan kehadiran: ${data.hadir} orang (rata-rata ${Math.round(avgHadir)})`
                    : `📉 Penurunan drastis kehadiran: ${data.hadir} orang (rata-rata ${Math.round(avgHadir)})`,
                value: data.hadir,
                expected: Math.round(avgHadir)
            });
        }
        
        if (alphaZScore > AI_CONFIG.anomalyThreshold && data.alpha > 5) {
            anomalies.push({
                type: 'absence_spike',
                severity: alphaZScore > 2.5 ? 'high' : 'medium',
                date,
                description: `⚠️ Lonjakan ketidakhadiran (Alpha): ${data.alpha} siswa`,
                value: data.alpha,
                expected: Math.round(avgAlpha)
            });
        }
    });
    
    return anomalies;
}

/**
 * Prediksi kehadiran menggunakan weighted moving average + pola harian
 */
function predictFutureAttendance(historicalAttendance, dailyStats, weeklyStats) {
    const predictions = [];
    const today = new Date();
    
    // Hitung trend dari 4 minggu terakhir
    const recentWeeks = weeklyStats.slice(0, 4);
    let trend = 0;
    if (recentWeeks.length >= 2) {
        const week1 = parseFloat(recentWeeks[0]?.persentase || 0);
        const week4 = parseFloat(recentWeeks[3]?.persentase || week1);
        trend = (week4 - week1) / 4;
    }
    
    // Hitung moving average 5 hari terakhir
    const last5Days = historicalAttendance
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);
    
    const avgLast5Days = last5Days.length > 0 
        ? last5Days.filter(a => a.status === 'Hadir' || a.status === 'Pulang').length / last5Days.length * 100
        : 70;
    
    for (let i = 1; i <= AI_CONFIG.predictionDays; i++) {
        const predDate = new Date(today);
        predDate.setDate(today.getDate() + i);
        const dateStr = predDate.toISOString().split('T')[0];
        const dayName = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][predDate.getDay()];
        
        // Weekend = tidak ada sekolah
        if (dayName === 'Minggu' || dayName === 'Sabtu') {
            predictions.push({
                date: dateStr,
                dayName,
                predictedAttendance: 0,
                isWeekend: true
            });
            continue;
        }
        
        // Dapatkan pola historis untuk hari ini
        const dayPattern = parseFloat(dailyStats[dayName]?.persentase || 70);
        
        // Faktor akhir bulan (tanggal > 25 cenderung menurun)
        const dayOfMonth = predDate.getDate();
        const monthFactor = dayOfMonth > 25 ? 0.85 : (dayOfMonth > 20 ? 0.95 : 1);
        
        // Hitung prediksi dengan bobot
        let predicted = (
            (dayPattern * AI_CONFIG.weights.dayOfWeek) +
            (avgLast5Days * AI_CONFIG.weights.recentPattern) +
            ((70 + trend) * AI_CONFIG.weights.historicalTrend) +
            (monthFactor * 100 * AI_CONFIG.weights.seasonalFactor)
        );
        
        // Normalisasi
        predicted = Math.min(95, Math.max(40, predicted));
        
        // Confidence level
        const confidence = Math.min(90, Math.max(60, 
            70 - (Math.abs(predicted - dayPattern) * 0.5) + (historicalAttendance.length > 100 ? 10 : 0)
        ));
        
        predictions.push({
            date: dateStr,
            dayName,
            predictedAttendance: Math.round(predicted),
            confidence: Math.round(confidence),
            factors: {
                dayPattern: Math.round(dayPattern),
                recentTrend: Math.round(avgLast5Days),
                monthFactor: monthFactor
            }
        });
    }
    
    return predictions;
}

/**
 * Generate rekomendasi cerdas
 */
function generateSmartRecommendations(analytics) {
    if (!analytics) return [];
    
    const recommendations = [];
    
    // 1. Rekomendasi berdasarkan top/bottom performers
    if (analytics.studentStats.bottomPerformers.length > 0) {
        const worst = analytics.studentStats.bottomPerformers[0];
        recommendations.push({
            priority: 'high',
            category: '🚨 Intervensi Siswa',
            title: `Siswa dengan Kehadiran Terendah: ${worst.nama}`,
            description: `Kehadiran ${worst.persentase}% dari ${worst.total} total kehadiran. Telah ${worst.alpha} kali alpha.`,
            action: `Segera hubungi orang tua ${worst.nama} dan lakukan pembinaan.`
        });
    }
    
    if (analytics.studentStats.topPerformers.length > 0) {
        const best = analytics.studentStats.topPerformers[0];
        recommendations.push({
            priority: 'low',
            category: '🏆 Apresiasi',
            title: `Siswa Teladan: ${best.nama}`,
            description: `Kehadiran sempurna ${best.persentase}% dengan disiplin tinggi.`,
            action: `Berikan penghargaan atau pujian di depan kelas.`
        });
    }
    
    // 2. Rekomendasi berdasarkan pola harian
    const worstDay = Object.entries(analytics.dailyStats)
        .filter(([day]) => day !== 'Minggu' && day !== 'Sabtu')
        .sort((a, b) => a[1].persentase - b[1].persentase)[0];
    
    if (worstDay && worstDay[1].persentase < 70) {
        recommendations.push({
            priority: 'medium',
            category: '📊 Pola Kehadiran',
            title: `Hari ${worstDay[0]} Memiliki Kehadiran Rendah`,
            description: `Rata-rata kehadiran hari ${worstDay[0]} hanya ${worstDay[1].persentase}%.`,
            action: `Evaluasi jadwal pelajaran hari ${worstDay[0]}, mungkin ada faktor penyebab.`
        });
    }
    
    // 3. Rekomendasi berdasarkan tren
    if (analytics.weeklyStats.length >= 3) {
        const lastWeek = parseFloat(analytics.weeklyStats[0]?.persentase || 0);
        const prevWeek = parseFloat(analytics.weeklyStats[1]?.persentase || 0);
        const twoWeeksAgo = parseFloat(analytics.weeklyStats[2]?.persentase || 0);
        
        if (lastWeek < prevWeek && lastWeek < twoWeeksAgo) {
            recommendations.push({
                priority: 'high',
                category: '📉 Tren Menurun',
                title: 'Kehadiran Menunjukkan Tren Penurunan',
                description: `Kehadiran turun dari ${twoWeeksAgo}% → ${prevWeek}% → ${lastWeek}% dalam 3 minggu terakhir.`,
                action: 'Adakan rapat koordinasi dengan wali kelas untuk mengevaluasi penyebab.'
            });
        } else if (lastWeek > prevWeek && lastWeek > twoWeeksAgo) {
            recommendations.push({
                priority: 'low',
                category: '📈 Tren Meningkat',
                title: 'Kehadiran Mengalami Peningkatan',
                description: `Kehadiran naik dari ${prevWeek}% menjadi ${lastWeek}% dalam seminggu.`,
                action: 'Pertahankan strategi yang berhasil dan beri apresiasi pada siswa.'
            });
        }
    }
    
    // 4. Rekomendasi berdasarkan anomali
    if (analytics.anomalies && analytics.anomalies.length > 0) {
        const highAnomalies = analytics.anomalies.filter(a => a.severity === 'high');
        if (highAnomalies.length > 0) {
            recommendations.push({
                priority: 'critical',
                category: '⚠️ Anomali Terdeteksi',
                title: `${highAnomalies.length} Anomali Signifikan Terdeteksi`,
                description: highAnomalies[0].description,
                action: `Periksa tanggal ${highAnomalies[0].date} - ${highAnomalies[0].description}`
            });
        }
    }
    
    // 5. Prediksi peringatan untuk 3 hari ke depan
    if (analytics.predictions && analytics.predictions.length >= 3) {
        const lowPrediction = analytics.predictions.slice(0, 3).find(p => !p.isWeekend && p.predictedAttendance < 65);
        if (lowPrediction) {
            recommendations.push({
                priority: 'medium',
                category: '🔮 Prediksi Kehadiran',
                title: `Prediksi Kehadiran Rendah: ${lowPrediction.dayName}, ${lowPrediction.date}`,
                description: `Diperkirakan kehadiran hanya ${lowPrediction.predictedAttendance}% (confidence ${lowPrediction.confidence}%).`,
                action: 'Siapkan strategi antisipasi, ingatkan siswa melalui pengumuman.'
            });
        }
    }
    
    return recommendations;
}

/**
 * Generate insights tambahan
 */
function generateAdvancedInsights(analytics) {
    const insights = [];
    
    if (!analytics) return insights;
    
    // Insight 1: Performa keseluruhan
    const avgAttendance = analytics.studentStats.averageAttendance;
    if (avgAttendance >= 90) {
        insights.push({ type: 'success', message: `🎉 Kehadiran keseluruhan SANGAT BAIK (${avgAttendance.toFixed(1)}%)! Pertahankan prestasi ini.` });
    } else if (avgAttendance >= 75) {
        insights.push({ type: 'info', message: `📊 Kehadiran keseluruhan BAIK (${avgAttendance.toFixed(1)}%). Masih ada ruang untuk peningkatan.` });
    } else {
        insights.push({ type: 'warning', message: `⚠️ Kehadiran keseluruhan RENDAH (${avgAttendance.toFixed(1)}%). Perlu intervensi segera!` });
    }
    
    // Insight 2: Perbandingan antar kelas (jika ada data kelas)
    if (dbData.users && dbData.users.length > 0) {
        const kelasStats = {};
        dbData.users.forEach(s => {
            if (s.kelas && s.nama && s.nama !== 'Tidak Diketahui') {
                if (!kelasStats[s.kelas]) kelasStats[s.kelas] = { total: 0 };
                kelasStats[s.kelas].total++;
            }
        });
        
        const kelasList = Object.keys(kelasStats);
        if (kelasList.length >= 2) {
            insights.push({ type: 'info', message: `🏫 Terdapat ${kelasList.length} kelas aktif. Pantau performa masing-masing kelas secara berkala.` });
        }
    }
    
    // Insight 3: Efektivitas fingerprint
    const totalSiswa = analytics.studentStats.total;
    const uniqueAttendance = analytics.uniqueAttendance;
    const avgPerSiswa = (uniqueAttendance / totalSiswa).toFixed(1);
    insights.push({ type: 'info', message: `🖐️ Rata-rata ${avgPerSiswa} kali absensi per siswa dalam 30 hari terakhir.` });
    
    // Insight 4: Hari paling sepi
    const busiestDay = Object.entries(analytics.dailyStats)
        .filter(([day]) => day !== 'Minggu' && day !== 'Sabtu')
        .sort((a, b) => b[1].persentase - a[1].persentase)[0];
    
    const quietestDay = Object.entries(analytics.dailyStats)
        .filter(([day]) => day !== 'Minggu' && day !== 'Sabtu')
        .sort((a, b) => a[1].persentase - b[1].persentase)[0];
    
    if (busiestDay && quietestDay) {
        insights.push({ type: 'info', message: `📅 Hari paling ramai: ${busiestDay[0]} (${busiestDay[1].persentase}%), paling sepi: ${quietestDay[0]} (${quietestDay[1].persentase}%).` });
    }
    
    return insights;
}

/**
 * Generate HTML lengkap untuk AI Summary
 */
function generatePowerfulAIHTML(analytics) {
    if (!analytics) return '<div class="ai-error">❌ Data tidak tersedia untuk analisis</div>';
    
    const recommendations = generateSmartRecommendations(analytics);
    const insights = generateAdvancedInsights(analytics);
    
    // Warna berdasarkan performa
    const avgColor = analytics.studentStats.averageAttendance >= 90 ? '#4caf50' : 
                     analytics.studentStats.averageAttendance >= 75 ? '#2196f3' : '#f44336';
    
    let html = `
        <div class="ai-summary-powerful">
            <!-- HEADER STATS -->
            <div class="ai-stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;">
                <div class="ai-stat-card" style="background: linear-gradient(135deg, #1a1a2e, #16213e); border-radius: 16px; padding: 16px; text-align: center;">
                    <div style="font-size: 32px;">👥</div>
                    <div style="font-size: 28px; font-weight: bold;">${analytics.studentStats.total}</div>
                    <div style="font-size: 12px; color: #888;">Total Siswa</div>
                </div>
                <div class="ai-stat-card" style="background: linear-gradient(135deg, #1a1a2e, #16213e); border-radius: 16px; padding: 16px; text-align: center;">
                    <div style="font-size: 32px;">📊</div>
                    <div style="font-size: 28px; font-weight: bold; color: ${avgColor};">${analytics.studentStats.averageAttendance.toFixed(1)}%</div>
                    <div style="font-size: 12px; color: #888;">Rata-rata Kehadiran</div>
                </div>
                <div class="ai-stat-card" style="background: linear-gradient(135deg, #1a1a2e, #16213e); border-radius: 16px; padding: 16px; text-align: center;">
                    <div style="font-size: 32px;">✅</div>
                    <div style="font-size: 28px; font-weight: bold;">${analytics.totalAttendance}</div>
                    <div style="font-size: 12px; color: #888;">Total Absensi (30 Hari)</div>
                </div>
                <div class="ai-stat-card" style="background: linear-gradient(135deg, #1a1a2e, #16213e); border-radius: 16px; padding: 16px; text-align: center;">
                    <div style="font-size: 32px;">⚠️</div>
                    <div style="font-size: 28px; font-weight: bold; color: ${analytics.anomalies.length > 0 ? '#ff9800' : '#4caf50'};">${analytics.anomalies.length}</div>
                    <div style="font-size: 12px; color: #888;">Anomali Terdeteksi</div>
                </div>
            </div>
            
            <!-- INSIGHTS -->
            <div style="background: rgba(0, 188, 212, 0.1); border-left: 4px solid #00bcd4; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
                <h4 style="margin: 0 0 8px 0;">💡 AI Insights</h4>
                ${insights.map(i => `<div style="margin: 8px 0; font-size: 14px;">${i.message}</div>`).join('')}
            </div>
            
            <!-- REKOMENDASI PRIORITAS -->
            <div style="margin-bottom: 24px;">
                <h4 style="margin: 0 0 12px 0;">🎯 Rekomendasi Prioritas</h4>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    ${recommendations.slice(0, 5).map(rec => `
                        <div style="background: ${rec.priority === 'critical' ? 'rgba(244, 67, 54, 0.15)' : 
                                          rec.priority === 'high' ? 'rgba(255, 152, 0, 0.15)' : 
                                          rec.priority === 'medium' ? 'rgba(33, 150, 243, 0.15)' : 'rgba(76, 175, 80, 0.15)'}; 
                                border-left: 4px solid ${rec.priority === 'critical' ? '#f44336' : 
                                          rec.priority === 'high' ? '#ff9800' : 
                                          rec.priority === 'medium' ? '#2196f3' : '#4caf50'}; 
                                border-radius: 12px; padding: 14px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">
                                <strong style="font-size: 15px;">${rec.title}</strong>
                                <span style="font-size: 11px; background: ${rec.priority === 'critical' ? '#f44336' : 
                                          rec.priority === 'high' ? '#ff9800' : 
                                          rec.priority === 'medium' ? '#2196f3' : '#4caf50'}; 
                                     padding: 2px 8px; border-radius: 20px; color: white;">${rec.category}</span>
                            </div>
                            <p style="margin: 4px 0; font-size: 13px; color: var(--text-muted);">${rec.description}</p>
                            <p style="margin: 8px 0 0 0; font-size: 12px;">💡 ${rec.action}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <!-- POLA KEHADIRAN PER HARI -->
            <div style="margin-bottom: 24px;">
                <h4 style="margin: 0 0 12px 0;">📅 Pola Kehadiran per Hari</h4>
                <div style="display: flex; flex-wrap: wrap; gap: 12px;">
                    ${Object.entries(analytics.dailyStats).filter(([day]) => day !== 'Sabtu' && day !== 'Minggu').map(([day, data]) => {
                        const persen = data.persentase;
                        const barColor = persen >= 85 ? '#4caf50' : persen >= 70 ? '#ff9800' : '#f44336';
                        return `
                            <div style="flex: 1; min-width: 100px; text-align: center;">
                                <div style="font-size: 12px; margin-bottom: 6px;">${day}</div>
                                <div style="height: 80px; background: #2a2a35; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column-reverse;">
                                    <div style="height: ${persen}%; background: ${barColor}; width: 100%; transition: height 0.3s;"></div>
                                </div>
                                <div style="font-size: 13px; font-weight: bold; margin-top: 6px; color: ${barColor};">${persen}%</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
            
            <!-- PREDIKSI 7 HARI -->
            <div style="margin-bottom: 24px;">
                <h4 style="margin: 0 0 12px 0;">🔮 Prediksi Kehadiran (7 Hari ke Depan)</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px;">
                    ${analytics.predictions.map(pred => {
                        const date = new Date(pred.date);
                        const dateStr = `${date.getDate()}/${date.getMonth()+1}`;
                        const barColor = pred.isWeekend ? '#666' : 
                                        pred.predictedAttendance >= 80 ? '#4caf50' : 
                                        pred.predictedAttendance >= 60 ? '#ff9800' : '#f44336';
                        return `
                            <div style="background: ${pred.isWeekend ? '#2a2a35' : 'rgba(0, 188, 212, 0.1)'}; border-radius: 12px; padding: 12px; text-align: center;">
                                <div style="font-size: 11px; color: #888;">${pred.dayName}</div>
                                <div style="font-size: 14px; font-weight: bold;">${dateStr}</div>
                                ${!pred.isWeekend ? `
                                    <div style="margin-top: 8px;">
                                        <div style="height: 6px; background: #3a3a45; border-radius: 3px; overflow: hidden;">
                                            <div style="width: ${pred.predictedAttendance}%; height: 100%; background: ${barColor};"></div>
                                        </div>
                                        <div style="font-size: 20px; font-weight: bold; margin-top: 6px; color: ${barColor};">${pred.predictedAttendance}%</div>
                                        <div style="font-size: 9px; color: #888;">confidence ${pred.confidence}%</div>
                                    </div>
                                ` : '<div style="margin-top: 12px; font-size: 12px; color: #888;">🚫 Libur Akhir Pekan</div>'}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
            
            <!-- TOP & BOTTOM PERFORMERS -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
                <div>
                    <h4 style="margin: 0 0 10px 0;">🏆 Top 5 Performers</h4>
                    <div style="background: rgba(76, 175, 80, 0.1); border-radius: 12px; overflow: hidden;">
                        ${analytics.studentStats.topPerformers.map((s, i) => `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                                <div><span style="font-weight: bold;">${i+1}.</span> ${s.nama}</div>
                                <div style="color: #4caf50; font-weight: bold;">${s.persentase}%</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div>
                    <h4 style="margin: 0 0 10px 0;">⚠️ Perlu Perhatian</h4>
                    <div style="background: rgba(244, 67, 54, 0.1); border-radius: 12px; overflow: hidden;">
                        ${analytics.studentStats.bottomPerformers.map((s, i) => `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                                <div><span style="font-weight: bold;">${i+1}.</span> ${s.nama}</div>
                                <div style="color: #f44336; font-weight: bold;">${s.persentase}%</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            
            <!-- TREN MINGGUAN -->
            <div style="margin-bottom: 16px;">
                <h4 style="margin: 0 0 12px 0;">📈 Tren Kehadiran 4 Minggu Terakhir</h4>
                <div style="display: flex; align-items: flex-end; gap: 20px; height: 150px; justify-content: center;">
                    ${analytics.weeklyStats.slice(0, 4).map((week, idx) => {
                        const height = Math.max(30, week.persentase * 1.2);
                        const barColor = week.persentase >= 80 ? '#4caf50' : week.persentase >= 65 ? '#ff9800' : '#f44336';
                        return `
                            <div style="flex: 1; text-align: center;">
                                <div style="height: ${height}px; background: ${barColor}; border-radius: 6px 6px 0 0; transition: height 0.3s;"></div>
                                <div style="margin-top: 8px; font-size: 11px;">Minggu ${4-idx}</div>
                                <div style="font-size: 12px; font-weight: bold; color: ${barColor};">${week.persentase}%</div>
                            </div>
                        `;
                    }).join('')}
                </div>
                <div style="text-align: center; font-size: 11px; color: #888; margin-top: 12px;">
                    ${analytics.weeklyStats[0]?.persentase > analytics.weeklyStats[3]?.persentase ? 
                        '📈 Tren meningkat dalam 3 minggu terakhir!' : 
                        analytics.weeklyStats[0]?.persentase < analytics.weeklyStats[3]?.persentase ?
                        '📉 Tren menurun, perlu perhatian!' : '📊 Tren stabil'}
                </div>
            </div>
            
            <!-- FOOTER -->
            <div style="text-align: center; padding-top: 16px; border-top: 1px solid #2a2a35; font-size: 10px; color: #666;">
                🤖 Analisis AI • ${new Date().toLocaleString('id-ID')} • ${analytics.summary.period.start} s/d ${analytics.summary.period.end}
            </div>
        </div>
    `;
    
    return html;
}

/**
 * Modal AI Summary utama
 */
let currentPowerfulAIAnalytics = null;

async function openPowerfulAISummaryModal() {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'guru' && currentUser.role !== 'developer')) {
        if (typeof showToast === 'function') {
            showToast("🔒 Akses ditolak! Fitur AI Summary hanya untuk Admin, Guru, dan Developer.", "error");
        }
        return;
    }
    
    // Tampilkan loading
    let modal = document.getElementById('modal-ai-summary');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend', `
            <div id="modal-ai-summary" class="modal-overlay">
                <div class="modal-box" style="max-width: 900px; max-height: 85vh; overflow-y: auto;">
                    <div class="modal-title" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                        <span>🤖 AI POWER SUMMARY - Analisis Cerdas Kehadiran</span>
                        <span onclick="closeModal('modal-ai-summary')" style="cursor: pointer; font-size: 24px;">✖</span>
                    </div>
                    <div style="padding: 20px;" id="aiSummaryContent">
                        <div style="text-align: center; padding: 40px;">
                            <div style="font-size: 48px; margin-bottom: 16px;">🚀</div>
                            <h3>Menganalisis Data Kehadiran...</h3>
                            <div style="width: 40px; height: 40px; margin: 20px auto; border: 4px solid #00bcd4; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                        </div>
                    </div>
                    <div class="modal-actions" style="padding: 15px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                        <div>
                            <button class="btn-action btn-success" onclick="exportPowerfulAISummaryToPDF()" id="aiExportPdfBtn" style="display: none;">📄 Export PDF</button>
                            <button class="btn-action btn-secondary" onclick="copyPowerfulAISummaryToClipboard()" id="aiCopyBtn" style="display: none;">📋 Copy ke Clipboard</button>
                        </div>
                        <button class="btn-cancel" onclick="closeModal('modal-ai-summary')">Tutup</button>
                    </div>
                </div>
            </div>
        `);
        modal = document.getElementById('modal-ai-summary');
    }
    
    modal.classList.add('open');
    
    // Proses analisis
    setTimeout(async () => {
        const analytics = getAttendanceAnalyticsData();
        currentPowerfulAIAnalytics = analytics;
        
        const contentDiv = document.getElementById('aiSummaryContent');
        if (contentDiv) {
            if (!analytics) {
                contentDiv.innerHTML = '<div style="text-align:center; padding:40px;"><span style="font-size:48px;">📭</span><h3>Data Tidak Tersedia</h3><p>Pastikan ada data siswa dan absensi yang cukup untuk analisis.</p></div>';
                return;
            }
            contentDiv.innerHTML = generatePowerfulAIHTML(analytics);
            
            const exportBtn = document.getElementById('aiExportPdfBtn');
            const copyBtn = document.getElementById('aiCopyBtn');
            if (exportBtn) exportBtn.style.display = 'inline-block';
            if (copyBtn) copyBtn.style.display = 'inline-block';
        }
    }, 100);
}

function copyPowerfulAISummaryToClipboard() {
    const content = document.querySelector('#aiSummaryContent .ai-summary-powerful')?.innerText;
    if (content) {
        navigator.clipboard.writeText(content);
        if (typeof showToast === 'function') showToast("✅ Analisis disalin ke clipboard", "success");
    }
}

function exportPowerfulAISummaryToPDF() {
    if (!currentPowerfulAIAnalytics) {
        if (typeof showToast === 'function') showToast("Tidak ada data untuk diekspor", "error");
        return;
    }
    
    const html = generatePowerfulAIHTML(currentPowerfulAIAnalytics);
    const schoolName = document.getElementById('schoolNameDisplay')?.innerText || 'Sistem Absensi';
    const roleText = currentUser?.role === 'admin' ? 'Admin' : (currentUser?.role === 'guru' ? 'Guru' : 'Developer');
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>AI Summary Absensi - ${schoolName}</title>
            <meta charset="UTF-8">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; background: white; }
                .header { text-align: center; margin-bottom: 25px; padding-bottom: 15px; border-bottom: 3px solid #00bcd4; }
                .header h1 { color: #00bcd4; font-size: 24px; }
                .ai-summary-powerful { font-size: 13px; }
                .ai-stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 25px; }
                .ai-stat-card { background: #f5f5f5; border-radius: 12px; padding: 15px; text-align: center; }
                @media print { body { padding: 20px; } button, .modal-actions { display: none; } }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🤖 AI POWER SUMMARY</h1>
                <p>${schoolName} | ${new Date().toLocaleString('id-ID')}</p>
                <p>Dicetak oleh: ${roleText}</p>
            </div>
            ${html}
            <div style="text-align: center; margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 10px; color: #888;">
                Sistem Absensi IoT - Fingerprint & Real-time
            </div>
            <div style="text-align: center; margin-top: 20px;">
                <button onclick="window.print()" style="padding: 10px 20px; background: #00bcd4; color: white; border: none; border-radius: 5px; cursor: pointer;">🖨️ Cetak PDF</button>
                <button onclick="window.close()" style="padding: 10px 20px; background: #666; color: white; border: none; border-radius: 5px; cursor: pointer; margin-left: 10px;">✖ Tutup</button>
            </div>
        </body>
        </html>
    `);
    printWindow.document.close();
    if (typeof showToast === 'function') showToast("📄 Membuka halaman print", "info");
}

// ======================= INISIALISASI =======================
function initPowerfulAISummary() {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'guru' && currentUser.role !== 'developer')) {
        return;
    }
    
    // Cek apakah tombol sudah ada
    if (document.getElementById('aiSummaryBtnContainer')) return;
    
    // Tambahkan tombol ke dashboard
    const statsGrid = document.querySelector('.stats-grid');
    if (statsGrid && !document.getElementById('aiSummaryBtnContainer')) {
        const aiButton = document.createElement('div');
        aiButton.className = 'stat-card-new';
        aiButton.id = 'aiSummaryBtnContainer';
        aiButton.style.cssText = `
            cursor: pointer;
            background: linear-gradient(135deg, #667eea, #764ba2);
            transition: transform 0.2s;
            border-radius: 20px;
            padding: 20px;
            text-align: center;
        `;
        aiButton.onclick = () => openPowerfulAISummaryModal();
        aiButton.innerHTML = `
            <div class="stat-title-new" style="color: white;">🚀 AI Power Summary</div>
            <div class="stat-number" style="color: white; font-size: 1.1rem;">Analisis Prediktif</div>
            <div class="stat-percent" style="color: rgba(255,255,255,0.8);">Prediksi & Rekomendasi</div>
        `;
        statsGrid.appendChild(aiButton);
    }
}

// Override fungsi AI summary yang lama
window.openAISummaryModal = openPowerfulAISummaryModal;
window.openPowerfulAISummaryModal = openPowerfulAISummaryModal;
window.copyPowerfulAISummaryToClipboard = copyPowerfulAISummaryToClipboard;
window.exportPowerfulAISummaryToPDF = exportPowerfulAISummaryToPDF;
window.getAttendanceAnalyticsData = getAttendanceAnalyticsData;

// Inisialisasi
setTimeout(() => {
    if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'guru' || currentUser.role === 'developer')) {
        initPowerfulAISummary();
    }
}, 2000);

console.log("✅ ai-summary-powerful.js loaded - Ultimate AI Analytics ready!");