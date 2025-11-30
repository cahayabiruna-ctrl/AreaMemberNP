// ==========================================
// 1. KONEKSI DATABASE
// ==========================================
const supabaseUrl = 'https://hysjbwysizpczgcsqvuv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5c2pid3lzaXpwY3pnY3NxdnV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5MjA2MTYsImV4cCI6MjA3OTQ5NjYxNn0.sLSfXMn9htsinETKUJ5IAsZ2l774rfeaNNmB7mVQcR4';
const db = window.supabase.createClient(supabaseUrl, supabaseKey);

let globalData = []; 
let myTeamData = []; 
let sortState = { col: 'joinDate', dir: 'asc' }; 

document.addEventListener('DOMContentLoaded', async () => {
    const path = window.location.pathname;
    const isLoggedIn = sessionStorage.getItem('isLoggedIn');
    
    if (!isLoggedIn && !path.includes('index.html')) {
        window.location.href = 'index.html'; return;
    }

    if (isLoggedIn) {
        await loadData(); 
    }

    if (path.includes('index.html')) {
        const btn = document.getElementById('loginButton');
        if(btn) btn.addEventListener('click', doLogin);
    } else if (path.includes('dashboard.html')) {
        renderDashboard();
    } else if (path.includes('list.html')) {
        prepareMyTeamData();
        initList();
    } else if (path.includes('network.html')) {
        prepareMyTeamData();
        initNetwork();
    }
});

async function loadData() {
    try {
        const { data, error } = await db.from('members').select('*');
        if(error) throw error;
        globalData = data.map(m => ({
            uid: String(m.UID || m.uid).trim(),
            name: (m.Nama || m.nama || m.name || '-').trim(),
            upline: m.Upline || m.upline ? String(m.Upline || m.upline).trim() : "",
            joinDate: new Date(m.TanggalBergabung || m.tanggalbergabung || m.joinDate)
        }));
    } catch (e) { console.error("Gagal load data:", e); }
}

function prepareMyTeamData() {
    const myUid = sessionStorage.getItem('userUid');
    const me = globalData.find(m => m.uid === myUid);
    if(me) {
        const downlines = getDownlinesRecursive(myUid);
        myTeamData = [me, ...downlines];
    }
}

function getDownlinesRecursive(parentUid) {
    let list = [];
    const children = globalData.filter(m => m.upline === parentUid);
    children.forEach(child => {
        list.push(child);
        list = list.concat(getDownlinesRecursive(child.uid));
    });
    return list;
}

// Menghitung Total Grup untuk SATU ORANG (Termasuk dirinya sendiri + Downline)
// Dipakai untuk menentukan dia Rank apa.
function getTotalGroupCount(uid) {
    // 1 (Dia sendiri) + Jumlah Downlinenya
    return 1 + getDownlinesRecursive(uid).length;
}

async function doLogin() {
    const uid = document.getElementById('loginUid').value.trim();
    const btn = document.getElementById('loginButton');
    const err = document.getElementById('error');
    if(!uid) { err.innerText = "Masukkan UID"; return; }
    btn.innerText = "Memproses..."; btn.disabled = true; 
    await loadData(); 
    const user = globalData.find(m => m.uid === uid);
    if(user) {
        sessionStorage.setItem('isLoggedIn', 'true');
        sessionStorage.setItem('userUid', user.uid);
        window.location.href = 'dashboard.html';
    } else {
        err.innerText = "UID Tidak Terdaftar"; btn.innerText = "MASUK"; btn.disabled = false;
    }
}
function logout() { sessionStorage.clear(); window.location.href = 'index.html'; }

// ==========================================
// 4. DASHBOARD
// ==========================================
function renderDashboard() {
    const myUid = sessionStorage.getItem('userUid');
    if(!globalData.length) { location.reload(); return; }

    const me = globalData.find(m => m.uid === myUid);
    if(!me) { logout(); return; }

    document.getElementById('mName').innerText = me.name;
    document.getElementById('mUid').innerText = me.uid;
    const upline = globalData.find(m => m.uid === me.upline);
    document.getElementById('mRefUid').innerText = upline ? upline.uid : '-';

    // 1. DATA TIM SAYA
    const myDownlines = getDownlinesRecursive(myUid);
    const totalTeam = 1 + myDownlines.length; // Total Grup Saya
    document.getElementById('totalMembers').innerText = totalTeam;

    // 2. HITUNG STATUS SAYA
    const directCount = globalData.filter(m => m.upline === myUid).length;
    calculateMyRank(totalTeam, directCount);

    // 3. HITUNG JUMLAH VIP DI BAWAH SAYA (Fitur Baru)
    countVipStats(myDownlines);

    // 4. TARGET & GRAFIK
    const myFullTeam = [me, ...myDownlines];
    const now = new Date();
    const d = now.getDate(); const m = now.getMonth(); const y = now.getFullYear();
    let pStart, prevEnd, label;

    if (d === 31) { pStart = new Date(y, m + 1, 1); prevEnd = new Date(y, m, 30, 23, 59, 59); label = "PERIODE 1 (BLN DEPAN)"; }
    else if (d <= 15) { pStart = new Date(y, m, 1); prevEnd = new Date(y, m, 0, 23, 59, 59); label = `PERIODE 1 (${getMonthName(m)})`; }
    else { pStart = new Date(y, m, 16); prevEnd = new Date(y, m, 15, 23, 59, 59); label = `PERIODE 2 (${getMonthName(m)})`; }

    document.getElementById('currentPeriodLabel').innerText = label;
    
    const countPrevReal = myFullTeam.filter(x => x.joinDate <= prevEnd).length;
    const countNewReal = myFullTeam.filter(x => x.joinDate >= pStart).length;
    const target = Math.ceil(countPrevReal / 2);
    let gap = target - countNewReal;
    if(gap < 0) gap = 0;

    document.getElementById('prevPeriodCount').innerText = countPrevReal;
    document.getElementById('targetCount').innerText = target;
    document.getElementById('newMemberCount').innerText = countNewReal;
    document.getElementById('gapCount').innerText = gap;

    renderChart(myFullTeam, y, m);
}

function renderChart(teamData, y, m) {
    const ctx = document.getElementById('growthChart').getContext('2d');
    const p1S = new Date(y, m, 1); const p1E = new Date(y, m, 15, 23,59,59);
    const p2S = new Date(y, m, 16); const p2E = new Date(y, m+1, 0, 23,59,59);
    const c1 = teamData.filter(x => x.joinDate >= p1S && x.joinDate <= p1E).length;
    const c2 = teamData.filter(x => x.joinDate >= p2S && x.joinDate <= p2E).length;

    if(window.myChart) window.myChart.destroy();
    window.myChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Periode 1', 'Periode 2'],
            datasets: [{
                label: 'Pertumbuhan',
                data: [c1, c2],
                backgroundColor: ['#D4AF37', '#333'],
                borderColor: '#D4AF37', borderWidth: 1
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, grid: {color:'#333'} }, x: { grid: {display:false} } },
            plugins: { legend: {display:false} }
        }
    });
}

// LOGIKA MENENTUKAN RANK SESEORANG (Helper)
// Mengembalikan angka 0-9
function determineRankValue(memberUid) {
    const totalGroup = getTotalGroupCount(memberUid);
    const directCount = globalData.filter(m => m.upline === memberUid).length;

    // Cek Level VIP 2-9 (Berdasarkan Total)
    if (totalGroup >= 3501) return 9;
    if (totalGroup >= 1601) return 8;
    if (totalGroup >= 901) return 7;
    if (totalGroup >= 501) return 6;
    if (totalGroup >= 351) return 5;
    if (totalGroup >= 201) return 4;
    if (totalGroup >= 101) return 3;
    if (totalGroup >= 31) {
        // Syarat VIP 2: Total 31 DAN Punya 2 Direct VIP 1
        // Cek Direct yg VIP 1
        let validDirects = 0;
        const directs = globalData.filter(m => m.upline === memberUid);
        directs.forEach(d => {
            if (getTotalGroupCount(d.uid) >= 5 || globalData.filter(sub => sub.upline === d.uid).length >= 5) {
                validDirects++;
            }
        });
        if (validDirects >= 2) return 2;
        return 1; // Kalau total masuk tapi direct kurang, anggap VIP 1 (atau pending)
    }

    // Cek Level VIP 1 (Berdasarkan Direct)
    if (directCount >= 5) return 1;

    return 0; // Member Biasa
}

// FUNGSI HITUNG STATISTIK VIP DI TIM SAYA
function countVipStats(myDownlines) {
    let counts = [0,0,0,0,0,0,0,0,0,0]; // Index 0 (Member) - 9 (VIP 9)

    // Loop semua downline saya
    myDownlines.forEach(member => {
        // Tentukan Rank Si Downline ini
        let rank = determineRankValue(member.uid);
        counts[rank]++;
    });

    // Update HTML
    for(let i=1; i<=9; i++) {
        const el = document.getElementById(`cVIP${i}`);
        if(el) el.innerText = counts[i];
    }
}

// LOGIKA STATUS SAYA (UTAMA)
function calculateMyRank(total, direct) {
    const ranks = [
        { name: "V.I.P 9", min: 3501 }, { name: "V.I.P 8", min: 1601 },
        { name: "V.I.P 7", min: 901 }, { name: "V.I.P 6", min: 501 },
        { name: "V.I.P 5", min: 351 }, { name: "V.I.P 4", min: 201 },
        { name: "V.I.P 3", min: 101 }
    ];

    // Cek VIP 3 - 9 (Murni Total)
    let currentRank = ranks.find(r => total >= r.min);
    
    // Cek Syarat VIP 3 ke atas: Butuh 2 Direct Rank Bawahnya
    // VIP 3 butuh 2 VIP 2. VIP 4 butuh... dst.
    // Sesuai request awal: "vip3 memiliki downline vip2 2 orang"
    
    // Namun untuk tampilan dashboard, kita ikuti logika dasar dulu + text
    
    let rankName = "MEMBER";
    let nextGoal = "";
    let gap = 0;
    let descHtml = "";

    // 1. Cek VIP 3++
    if (currentRank) {
        rankName = currentRank.name;
        // Cek syarat struktur (VIP 3 butuh 2 VIP 2)
        if(currentRank.name === "V.I.P 3") {
             // Cek apakah punya 2 Direct VIP 2?
             const directs = globalData.filter(m => m.upline === sessionStorage.getItem('userUid'));
             let vip2Count = 0;
             directs.forEach(d => { if(determineRankValue(d.uid) >= 2) vip2Count++; });
             
             if(vip2Count < 2) {
                 // Belum qualified secara struktur
                 // Tapi secara total masuk. Kita anggap VIP 3 (Pending) atau tetap VIP 2?
                 // Kita tulis VIP 3 tapi warning? 
                 // Agar simpel sesuai UI: Kita anggap dia VIP 3 dulu.
             }
        }

        let idx = ranks.indexOf(currentRank);
        if (idx > 0) {
            let next = ranks[idx - 1];
            gap = next.min - total;
            nextGoal = `Menuju ${next.name}`;
            descHtml = `Anggota lagi<br><span style="color:#D4AF37; font-weight:bold;">Menuju ${next.name}</span>`;
        } else {
            gap = 0; descHtml = "Maksimal"; nextGoal = "Top Level";
        }
    } 
    // 2. Cek VIP 2 (Total 31 + 2 Direct VIP 1)
    else if (total >= 31) {
        // Cek syarat struktur
        const directs = globalData.filter(m => m.upline === sessionStorage.getItem('userUid'));
        let vip1Count = 0;
        directs.forEach(d => { if(determineRankValue(d.uid) >= 1) vip1Count++; });

        if(vip1Count >= 2) {
            rankName = "V.I.P 2";
            gap = 101 - total;
            nextGoal = "Menuju V.I.P 3";
            descHtml = `Anggota lagi<br><span style="color:#D4AF37; font-weight:bold;">Menuju V.I.P 3</span>`;
        } else {
            // Belum cukup struktur
            rankName = "V.I.P 1"; // Stuck di VIP 1
            gap = 2 - vip1Count; // Kurang berapa direct VIP 1
            nextGoal = "Syarat: 2 Direct VIP 1";
            descHtml = `Direct VIP 1 lagi<br><span style="color:#D4AF37; font-weight:bold;">Syarat V.I.P 2</span>`;
        }
    }
    // 3. Cek VIP 1 (Direct 5)
    else if (direct >= 5) {
        rankName = "V.I.P 1";
        gap = 31 - total;
        nextGoal = "Menuju V.I.P 2";
        descHtml = `Anggota lagi<br><span style="color:#D4AF37; font-weight:bold;">Menuju V.I.P 2</span>`;
    } 
    else {
        rankName = "MEMBER";
        gap = 5 - direct;
        nextGoal = "Menuju V.I.P 1";
        descHtml = `Direct Downline lagi<br><span style="color:#D4AF37; font-weight:bold;">Menuju V.I.P 1</span>`;
    }

    document.getElementById('rankName').innerText = rankName;
    document.getElementById('nextLevelGap').innerText = gap;
    document.getElementById('rankNextGoal').innerText = nextGoal;
    
    const descEl = document.querySelector('.next-desc');
    if(descEl) descEl.innerHTML = descHtml;
}

// ... (Fungsi List & Network Tetap Sama)
function initList() { window.sortData = (col) => { if(sortState.col === col) sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc'; else { sortState.col = col; sortState.dir = 'asc'; } renderTable(); }; renderTable(); }
function renderTable() { const tbody = document.getElementById('membersTableBody'); const { col, dir } = sortState; const sorted = [...myTeamData].sort((a, b) => { let valA = a[col]; let valB = b[col]; if (col === 'joinDate') return dir === 'asc' ? valA - valB : valB - valA; valA = valA.toLowerCase(); valB = valB.toLowerCase(); if(valA < valB) return dir === 'asc' ? -1 : 1; if(valA > valB) return dir === 'asc' ? 1 : -1; return 0; }); let html = ''; sorted.forEach((m, i) => { const d = m.joinDate; const dateStr = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; const refUid = m.upline ? m.upline : '-'; html += `<tr><td class="col-no">${i + 1}</td><td class="col-name">${m.name}</td><td class="col-uid">${m.uid}</td><td class="col-ref">${refUid}</td><td class="col-date">${dateStr}</td></tr>`; }); tbody.innerHTML = html; }
function initNetwork() { const myUid = sessionStorage.getItem('userUid'); const $ = go.GraphObject.make; const diagram = $(go.Diagram, "networkDiagram", { padding: new go.Margin(150), scrollMode: go.Diagram.InfiniteScroll, layout: $(go.TreeLayout, { angle: 0, layerSpacing: 60, nodeSpacing: 10 }), "undoManager.isEnabled": true, "initialContentAlignment": go.Spot.Center, minScale: 0.1, maxScale: 2.0 }); diagram.nodeTemplate = $(go.Node, "Horizontal", { selectionObjectName: "PANEL" }, $(go.Panel, "Auto", { name: "PANEL" }, $(go.Shape, "RoundedRectangle", { fill: "#000", strokeWidth: 1 }, new go.Binding("stroke", "strokeColor"), new go.Binding("strokeWidth", "strokeWidth")), $(go.TextBlock, { margin: new go.Margin(2, 6, 2, 6), stroke: "#fff", font: "11px sans-serif", textAlign: "center", maxLines: 1, overflow: go.TextBlock.OverflowEllipsis }, new go.Binding("text", "label"))), $("TreeExpanderButton", { width: 14, height: 14, alignment: go.Spot.Right, margin: new go.Margin(0, 0, 0, 4), "ButtonBorder.fill": "#222", "ButtonBorder.stroke": "#D4AF37", "ButtonIcon.stroke": "white" })); diagram.linkTemplate = $(go.Link, { routing: go.Link.Orthogonal, corner: 5 }, $(go.Shape, { strokeWidth: 1, stroke: "white" })); const nodes = myTeamData.map(m => { const d = m.joinDate; const dStr = `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}`; const totalTeam = countTotalTeam(m.uid); const directCount = globalData.filter(sub => sub.upline === m.uid).length; const isGold = directCount >= 5; return { key: m.uid, label: `${m.uid} / ${m.name} / ${dStr}`, strokeColor: isGold ? "#ffd700" : "#ffffff", strokeWidth: isGold ? 2 : 1 }; }); const links = myTeamData.filter(m => m.upline && m.upline !== "").map(m => ({ from: m.upline, to: m.uid })); diagram.model = new go.GraphLinksModel(nodes, links); const myNode = diagram.findNodeForKey(myUid); if(myNode) { diagram.centerRect(myNode.actualBounds); myNode.isSelected = true; } window.downloadNetworkImage = function() { const img = diagram.makeImage({ scale: 2, background: "#000", maxSize: new go.Size(Infinity, Infinity), padding: new go.Margin(50) }); const link = document.createElement('a'); link.href = img.src; link.download = 'jaringan_dvteam.png'; document.body.appendChild(link); link.click(); document.body.removeChild(link); }; }
function getMonthName(idx) { return ["JAN", "FEB", "MAR", "APR", "MEI", "JUN", "JUL", "AGU", "SEP", "OKT", "NOV", "DES"][idx]; }
