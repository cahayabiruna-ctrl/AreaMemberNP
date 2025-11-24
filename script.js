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
    if (isLoggedIn) await loadData(); 

    if (path.includes('index.html')) document.getElementById('loginButton').addEventListener('click', doLogin);
    else if (path.includes('dashboard.html')) renderDashboard();
    else if (path.includes('list.html')) initList();
    else if (path.includes('network.html')) initNetwork();
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

        const myUid = sessionStorage.getItem('userUid');
        if(myUid) {
            const me = globalData.find(m => m.uid === myUid);
            const downlines = getDownlinesRecursive(myUid);
            myTeamData = me ? [me, ...downlines] : [];
        }
    } catch (e) { console.error("Gagal load data:", e); }
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

function countTotalTeam(uid) {
    let count = 0;
    const children = globalData.filter(m => m.upline === uid);
    count += children.length;
    children.forEach(child => { count += countTotalTeam(child.uid); });
    return count;
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
// 5. DASHBOARD
// ==========================================
function renderDashboard() {
    const myUid = sessionStorage.getItem('userUid');
    const me = globalData.find(m => m.uid === myUid);
    if(!me) { logout(); return; }

    document.getElementById('mName').innerText = me.name;
    document.getElementById('mUid').innerText = me.uid;
    const upline = globalData.find(m => m.uid === me.upline);
    document.getElementById('mRefUid').innerText = upline ? upline.uid : '-';

    const totalTeam = myTeamData.length; 
    document.getElementById('totalMembers').innerText = totalTeam;

    // HITUNG PERINGKAT (UPDATE BARU)
    calculateRank(totalTeam);

    const now = new Date();
    const d = now.getDate(); const m = now.getMonth(); const y = now.getFullYear();
    let pStart, prevEnd, label;
    if (d === 31) { pStart = new Date(y, m + 1, 1); prevEnd = new Date(y, m, 30, 23, 59, 59); label = "PERIODE 1 (BLN DEPAN)"; }
    else if (d <= 15) { pStart = new Date(y, m, 1); prevEnd = new Date(y, m, 0, 23, 59, 59); label = `PERIODE 1 (${getMonthName(m)})`; }
    else { pStart = new Date(y, m, 16); prevEnd = new Date(y, m, 15, 23, 59, 59); label = `PERIODE 2 (${getMonthName(m)})`; }

    document.getElementById('currentPeriodLabel').innerText = label;
    
    const countPrevReal = myTeamData.filter(x => x.joinDate <= prevEnd).length;
    const countNewReal = myTeamData.filter(x => x.joinDate >= pStart).length;
    
    const target = Math.ceil(countPrevReal / 2);
    let gap = target - countNewReal;
    if(gap < 0) gap = 0;

    document.getElementById('prevPeriodCount').innerText = countPrevReal;
    document.getElementById('targetCount').innerText = target;
    document.getElementById('newMemberCount').innerText = countNewReal;
    document.getElementById('gapCount').innerText = gap;

    renderChart(y, m);
}

function renderChart(y, m) {
    const ctx = document.getElementById('growthChart').getContext('2d');
    const p1S = new Date(y, m, 1); const p1E = new Date(y, m, 15, 23,59,59);
    const p2S = new Date(y, m, 16); const p2E = new Date(y, m+1, 0, 23,59,59);
    const c1 = myTeamData.filter(x => x.joinDate >= p1S && x.joinDate <= p1E).length;
    const c2 = myTeamData.filter(x => x.joinDate >= p2S && x.joinDate <= p2E).length;

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

// LOGIKA PERINGKAT (REVISI: TEKS DUA BARIS RAPI)
function calculateRank(total) {
    const ranks = [
        { name: "V.I.P 9", min: 3501 },
        { name: "V.I.P 8", min: 1601 },
        { name: "V.I.P 7", min: 901 },
        { name: "V.I.P 6", min: 501 },
        { name: "V.I.P 5", min: 351 },
        { name: "V.I.P 4", min: 201 },
        { name: "V.I.P 3", min: 101 },
        { name: "V.I.P 2", min: 31 },
        { name: "V.I.P 1", min: 5 },
        { name: "MEMBER", min: 0 }
    ];

    let currentRank = ranks.find(r => total >= r.min);
    document.getElementById('rankName').innerText = currentRank.name;

    let nextRankIndex = ranks.indexOf(currentRank) - 1;
    
    // MENGGUNAKAN innerHTML AGAR BISA PAKAI <br> DAN WARNA
    if (nextRankIndex >= 0) {
        let nextRank = ranks[nextRankIndex];
        let gap = nextRank.min - total;
        
        document.getElementById('nextLevelGap').innerText = gap;
        
        // Teks Dua Baris Rapi:
        // Baris 1: "Anggota lagi"
        // Baris 2: "Menuju V.I.P 4" (Warna Emas)
        const descEl = document.querySelector('.next-desc');
        if(descEl) {
            descEl.innerHTML = `Anggota lagi<br><span style="color:#D4AF37; font-weight:bold;">Menuju ${nextRank.name}</span>`;
        }
        
        document.getElementById('rankNextGoal').innerText = `Menuju ${nextRank.name}`;
    } else {
        document.getElementById('nextLevelGap').innerText = "0";
        document.getElementById('rankNextGoal').innerText = "Top Level!";
        const descEl = document.querySelector('.next-desc');
        if(descEl) descEl.innerText = "Maksimal";
    }
}

function initList() {
    window.sortData = (col) => {
        if(sortState.col === col) sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
        else { sortState.col = col; sortState.dir = 'asc'; }
        renderTable();
    };
    renderTable();
}
function renderTable() {
    const tbody = document.getElementById('membersTableBody');
    const { col, dir } = sortState;
    const sorted = [...myTeamData].sort((a, b) => {
        let valA = a[col]; let valB = b[col];
        if (col === 'joinDate') return dir === 'asc' ? valA - valB : valB - valA;
        valA = valA.toLowerCase(); valB = valB.toLowerCase();
        if(valA < valB) return dir === 'asc' ? -1 : 1;
        if(valA > valB) return dir === 'asc' ? 1 : -1;
        return 0;
    });
    let html = '';
    sorted.forEach((m, i) => {
        const d = m.joinDate;
        const dateStr = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
        const refUid = m.upline ? m.upline : '-';
        html += `<tr><td class="col-no">${i + 1}</td><td class="col-name">${m.name}</td><td class="col-uid">${m.uid}</td><td class="col-ref">${refUid}</td><td class="col-date">${dateStr}</td></tr>`;
    });
    tbody.innerHTML = html;
}
function initNetwork() {
    const myUid = sessionStorage.getItem('userUid');
    const $ = go.GraphObject.make;
    const diagram = $(go.Diagram, "networkDiagram", {
        padding: new go.Margin(150), scrollMode: go.Diagram.InfiniteScroll,
        layout: $(go.TreeLayout, { angle: 0, layerSpacing: 60, nodeSpacing: 10 }),
        "undoManager.isEnabled": true, "initialContentAlignment": go.Spot.Center, minScale: 0.1, maxScale: 2.0
    });
    diagram.nodeTemplate = $(go.Node, "Horizontal", { selectionObjectName: "PANEL" }, 
        $(go.Panel, "Auto", { name: "PANEL" },
            $(go.Shape, "RoundedRectangle", { fill: "#000", strokeWidth: 1 }, new go.Binding("stroke", "strokeColor"), new go.Binding("strokeWidth", "strokeWidth")),
            $(go.TextBlock, { margin: new go.Margin(2, 6, 2, 6), stroke: "#fff", font: "11px sans-serif", textAlign: "center", maxLines: 1, overflow: go.TextBlock.OverflowEllipsis }, new go.Binding("text", "label"))
        ),
        $("TreeExpanderButton", { width: 14, height: 14, alignment: go.Spot.Right, margin: new go.Margin(0, 0, 0, 4), "ButtonBorder.fill": "#222", "ButtonBorder.stroke": "#D4AF37", "ButtonIcon.stroke": "white" })
    );
    diagram.linkTemplate = $(go.Link, { routing: go.Link.Orthogonal, corner: 5 }, $(go.Shape, { strokeWidth: 1, stroke: "white" }));
    const nodes = myTeamData.map(m => {
        const d = m.joinDate;
        const dStr = `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}`;
        const totalTeam = countTotalTeam(m.uid);
        const isGold = totalTeam >= 5;
        return { key: m.uid, label: `${m.uid} / ${m.name} / ${dStr}`, strokeColor: isGold ? "#ffd700" : "#ffffff", strokeWidth: isGold ? 2 : 1 };
    });
    const links = myTeamData.filter(m => m.upline && m.upline !== "").map(m => ({ from: m.upline, to: m.uid }));
    diagram.model = new go.GraphLinksModel(nodes, links);
    const myNode = diagram.findNodeForKey(myUid);
    if(myNode) { diagram.centerRect(myNode.actualBounds); myNode.isSelected = true; }
    window.downloadNetworkImage = function() {
        const img = diagram.makeImage({ scale: 2, background: "#000", maxSize: new go.Size(Infinity, Infinity), padding: new go.Margin(50) });
        const link = document.createElement('a'); link.href = img.src; link.download = 'jaringan_dvteam.png';
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    };
}
function getMonthName(idx) { return ["JAN", "FEB", "MAR", "APR", "MEI", "JUN", "JUL", "AGU", "SEP", "OKT", "NOV", "DES"][idx]; }
