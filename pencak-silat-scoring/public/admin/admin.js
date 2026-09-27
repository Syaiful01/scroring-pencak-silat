const socket = io();
const statusBadge = document.getElementById('conn-status');

socket.on('connect', () => {
    statusBadge.textContent = 'Terhubung';
    statusBadge.className = 'text-xs font-semibold px-3 py-1 rounded-full bg-green-100 text-green-700';
    socket.emit('join_role', { role: 'admin' });
});
socket.on('disconnect', () => {
    statusBadge.textContent = 'Terputus';
    statusBadge.className = 'text-xs font-semibold px-3 py-1 rounded-full bg-red-100 text-red-700';
});
socket.on('admin:matches_updated', loadMatches);
socket.on('admin:match_activated', loadMatches);
socket.on('admin:match_finished', loadMatches);

const form = document.getElementById('match-form');
const cancelBtn = document.getElementById('cancel-edit');
const formTitle = document.getElementById('form-title');

async function loadMatches() {
    const res = await fetch('/api/matches');
    const matches = await res.json();
    const tbody = document.getElementById('match-list');
    tbody.innerHTML = '';

    if (matches.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-slate-400">Belum ada partai. Tambahkan di atas.</td></tr>`;
        return;
    }

    matches.forEach((m) => {
        const statusColor = {
            draft: 'bg-slate-100 text-slate-600',
            aktif: 'bg-green-100 text-green-700',
            selesai: 'bg-blue-100 text-blue-700',
        }[m.status];

        const row = document.createElement('tr');
        row.className = 'border-b last:border-0';
        row.innerHTML = `
            <td class="py-2 pr-2">${m.nomor_partai || '-'}</td>
            <td class="py-2 pr-2">${m.kelas || '-'}</td>
            <td class="py-2 pr-2"><span class="font-medium text-red-600">${m.merah_nama}</span><br><span class="text-xs text-slate-400">${m.merah_kontingen || ''}</span></td>
            <td class="py-2 pr-2"><span class="font-medium text-blue-600">${m.biru_nama}</span><br><span class="text-xs text-slate-400">${m.biru_kontingen || ''}</span></td>
            <td class="py-2 pr-2">${m.durasi_round}s</td>
            <td class="py-2 pr-2"><span class="text-xs px-2 py-1 rounded-full ${statusColor}">${m.status}</span></td>
            <td class="py-2 pr-2 space-x-1 whitespace-nowrap">
                ${m.status !== 'aktif' ? `<button data-action="activate" data-id="${m.id}" class="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700">Jadikan Aktif</button>` : `<span class="text-xs text-green-700 font-semibold">● Sedang di Gelanggang</span>`}
                <button data-action="edit" data-id="${m.id}" class="text-xs bg-amber-500 text-white px-2 py-1 rounded hover:bg-amber-600">Edit</button>
                <button data-action="delete" data-id="${m.id}" class="text-xs bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600">Hapus</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

document.getElementById('match-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;

    if (action === 'activate') {
        if (!confirm('Jadikan partai ini aktif di gelanggang? Skor & round akan direset ke awal.')) return;
        await fetch(`/api/matches/${id}/activate`, { method: 'POST' });
    } else if (action === 'delete') {
        if (!confirm('Hapus partai ini? Data tidak bisa dikembalikan.')) return;
        await fetch(`/api/matches/${id}`, { method: 'DELETE' });
        loadMatches();
    } else if (action === 'edit') {
        const res = await fetch(`/api/matches/${id}`);
        const m = await res.json();
        document.getElementById('match-id').value = m.id;
        document.getElementById('nomor_partai').value = m.nomor_partai || '';
        document.getElementById('kelas').value = m.kelas || '';
        document.getElementById('durasi_round').value = m.durasi_round;
        document.getElementById('babak_max').value = m.babak_max;
        document.getElementById('merah_nama').value = m.merah_nama;
        document.getElementById('merah_kontingen').value = m.merah_kontingen || '';
        document.getElementById('biru_nama').value = m.biru_nama;
        document.getElementById('biru_kontingen').value = m.biru_kontingen || '';
        formTitle.textContent = `Edit Partai #${m.id}`;
        cancelBtn.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
});

cancelBtn.addEventListener('click', () => {
    form.reset();
    document.getElementById('match-id').value = '';
    formTitle.textContent = 'Tambah Partai Baru';
    cancelBtn.classList.add('hidden');
});

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('match-id').value;
    const payload = {
        nomor_partai: document.getElementById('nomor_partai').value,
        kelas: document.getElementById('kelas').value,
        durasi_round: parseInt(document.getElementById('durasi_round').value, 10),
        babak_max: parseInt(document.getElementById('babak_max').value, 10),
        merah_nama: document.getElementById('merah_nama').value,
        merah_kontingen: document.getElementById('merah_kontingen').value,
        biru_nama: document.getElementById('biru_nama').value,
        biru_kontingen: document.getElementById('biru_kontingen').value,
    };

    if (id) {
        await fetch(`/api/matches/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    } else {
        await fetch('/api/matches', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    }
    form.reset();
    document.getElementById('match-id').value = '';
    formTitle.textContent = 'Tambah Partai Baru';
    cancelBtn.classList.add('hidden');
    loadMatches();
});

loadMatches();
