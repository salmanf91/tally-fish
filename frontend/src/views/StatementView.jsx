import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileSpreadsheet,
  RefreshCw,
  Share2,
  FileText,
  FileCheck,
  Send,
  X,
  AlertCircle,
  Download,
  Printer,
  Copy,
  Check,
} from 'lucide-react';
import { useBranch } from '../context/BranchContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

const CLIENT_PHONES = {
  AMR: '+91 98450 10001',
  RMS: '+91 98450 10002',
  'M RISHAN': '+91 98450 10003',
  PAM: '+91 98450 10004',
  AG: '+91 98450 10005',
  SUFAID: '+91 98450 10006',
  'M HANEEF': '+91 98450 10007',
};

// Reconstruct grouped box lots for display & exports
export function getEntryLots(entry) {
  if (!entry) return [];
  const boxes = Array.isArray(entry.boxes) ? entry.boxes : [];
  const rates = Array.isArray(entry.rates) ? entry.rates : [];

  if (boxes.length === 0) {
    if (rates.length > 0) {
      return [
        {
          groupId: 'default',
          box_count: 1,
          isMixed: rates.length > 1,
          avgRate: null,
          parts: rates.map((r) => ({
            fish: r.fish_name,
            pct: 100,
            rate: parseFloat(r.rate_per_kg) || 0,
          })),
        },
      ];
    }
    return [];
  }

  const groups = [];

  boxes.forEach((b, idx) => {
    // Find rate matching this box specifically by box_id, or fallback to fish_name
    const matchedRate =
      rates.find((r) => r.box_id && r.box_id === b.id) ||
      rates.find((r) => r.fish_name === b.fish_name);

    const rateVal =
      matchedRate && matchedRate.rate_per_kg !== null && matchedRate.rate_per_kg !== undefined
        ? parseFloat(matchedRate.rate_per_kg)
        : null;

    const partObj = {
      box_id: b.id,
      fish: b.fish_name,
      box_count: b.box_count,
      pct: parseFloat(b.mix_percentage) || 100,
      fish_count: b.fish_count || null,
      rate: rateVal,
    };

    const gId = b.box_group_id;

    if (gId) {
      let found = groups.find((g) => g.groupId === gId);
      if (!found) {
        found = {
          groupId: gId,
          box_count: b.box_count,
          parts: [],
        };
        groups.push(found);
      }
      found.parts.push(partObj);
    } else {
      // Group adjacent items if they have identical box_count and cumulative pct <= 100
      const pct = parseFloat(b.mix_percentage) || 100;
      const lastGroup = groups[groups.length - 1];
      const lastSumPct = lastGroup ? lastGroup.parts.reduce((s, p) => s + p.pct, 0) : 100;

      if (lastGroup && lastGroup.box_count === b.box_count && lastSumPct + pct <= 100.01) {
        lastGroup.parts.push(partObj);
      } else {
        groups.push({
          groupId: `lot_${idx}`,
          box_count: b.box_count,
          parts: [partObj],
        });
      }
    }
  });

  return groups.map((lot) => {
    const isMixed = lot.parts.length > 1 || (lot.parts[0]?.pct > 0 && lot.parts[0]?.pct < 100);
    let avgRate = null;
    if (isMixed) {
      let sum = 0;
      let totalPct = 0;
      lot.parts.forEach((p) => {
        if (p.rate !== null && p.rate !== undefined) {
          sum += p.rate * p.pct;
          totalPct += p.pct;
        }
      });
      avgRate = totalPct > 0 ? (sum / totalPct).toFixed(2) : null;
    } else if (lot.parts[0]?.rate !== null && lot.parts[0]?.rate !== undefined) {
      avgRate = Number(lot.parts[0].rate).toFixed(2);
    }

    return {
      ...lot,
      isMixed,
      avgRate,
    };
  });
}

export default function StatementView({ onNavigateToRates }) {
  const { activeBranchId, activeBranch, availableBranches, setActiveBranchId } = useBranch();
  const { user } = useAuth();

  const isBilling = activeBranch?.role === 'billingAdmin';
  const isOwner = activeBranch?.role === 'owner';

  const getLocalDateString = (d = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const TODAY = getLocalDateString();

  // Filters
  const [fromDate, setFromDate] = useState(TODAY);
  const [toDate, setToDate] = useState(TODAY);
  const [selectedParty, setSelectedParty] = useState('');
  const [statusFilter, setStatusFilter] = useState('All'); // 'All' | 'Rate pending' | 'Rate set'
  const [searchQuery, setSearchQuery] = useState('');

  // WhatsApp Share Modal state
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareParty, setShareParty] = useState('');
  const [shareFormat, setShareFormat] = useState('Excel');
  const [sharePhone, setSharePhone] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  // Fetch entries
  const { data: allEntries = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['entries', activeBranchId],
    queryFn: async () => {
      const res = await api.get('/entries');
      return res.data || [];
    },
    enabled: !!activeBranchId,
    refetchOnMount: 'always',
  });

  // Filter entries
  const filteredEntries = useMemo(() => {
    return allEntries.filter((e) => {
      const d = e.entry_date ? e.entry_date.split('T')[0] : '';
      if (d < fromDate || d > toDate) return false;
      if (selectedParty && e.party_name !== selectedParty) return false;
      if (statusFilter === 'Rate pending' && e.status !== 'RATE_PENDING') return false;
      if (statusFilter === 'Rate set' && e.status !== 'LOCKED') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const str = `${e.party_name} ${e.vehicle_no || ''} ${e.remarks || ''}`.toLowerCase();
        if (!str.includes(q)) return false;
      }
      return true;
    });
  }, [allEntries, fromDate, toDate, selectedParty, statusFilter, searchQuery]);

  // Statistics
  const totalNetKg = useMemo(() => {
    return filteredEntries.reduce((sum, e) => sum + (parseFloat(e.net_kg) || 0), 0);
  }, [filteredEntries]);

  const pendingRateCount = useMemo(() => {
    return filteredEntries.filter((e) => e.status === 'RATE_PENDING').length;
  }, [filteredEntries]);

  // Unique parties for filter
  const partiesInEntries = useMemo(() => {
    const set = new Set(allEntries.map((e) => e.party_name).filter(Boolean));
    return Array.from(set).sort();
  }, [allEntries]);

  const setDatePreset = (preset) => {
    const today = new Date();
    if (preset === 'today') {
      const str = today.toISOString().split('T')[0];
      setFromDate(str);
      setToDate(str);
    } else if (preset === 'yesterday') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const str = y.toISOString().split('T')[0];
      setFromDate(str);
      setToDate(str);
    } else if (preset === '7days') {
      const past = new Date(today);
      past.setDate(past.getDate() - 6);
      setFromDate(past.toISOString().split('T')[0]);
      setToDate(today.toISOString().split('T')[0]);
    }
  };

  // WhatsApp / Share Message generation
  const whatsappMessage = useMemo(() => {
    const isSingleDay = fromDate === toDate;
    const dateRangeLabel = isSingleDay ? fromDate : `${fromDate} to ${toDate}`;

    if (!shareParty) {
      let msg = `Indo Fish Meal & Oil Co. Pvt. Ltd.\nProcurement Statement · ${dateRangeLabel}\nBranch: ${activeBranch?.branch_name || 'Ullal'}\n\n`;
      let totalNet = 0;
      filteredEntries.forEach((e, idx) => {
        totalNet += parseFloat(e.net_kg) || 0;
        msg += `${idx + 1}) ${e.party_name} · ${e.vehicle_no || 'No Vehicle'} · ${Number(e.net_kg).toLocaleString()} kg\n`;
        const lots = getEntryLots(e);
        if (e.status === 'RATE_PENDING' || lots.length === 0) {
          msg += `   Rates: Rate Pending\n\n`;
        } else {
          lots.forEach((lot) => {
            const pStr = lot.parts
              .map((p) => `${p.fish}${lot.isMixed ? ` (${p.pct}%)` : ''} ₹${p.rate !== null && p.rate !== undefined ? p.rate : '—'}`)
              .join(', ');
            msg += `   ${lot.box_count} Box${lot.box_count > 1 ? 'es' : ''}: ${pStr}${
              lot.isMixed && lot.avgRate ? ` (Avg: ₹${lot.avgRate}/kg)` : ''
            }\n`;
          });
          msg += '\n';
        }
      });
      msg += `Total slips: ${filteredEntries.length}\nTotal net: ${Number(totalNet).toLocaleString()} kg\nFormat: ${shareFormat}`;
      return msg;
    }

    const partyEntries = allEntries.filter((e) => {
      const d = e.entry_date ? e.entry_date.split('T')[0] : '';
      return e.party_name === shareParty && d >= fromDate && d <= toDate;
    });

    let msg = `Indo Fish Meal & Oil Co. Pvt. Ltd.\nDaily rate statement · ${dateRangeLabel}\nParty: ${shareParty}\n\n`;
    let partyTotalNet = 0;

    partyEntries.forEach((e, idx) => {
      partyTotalNet += parseFloat(e.net_kg) || 0;
      msg += `${idx + 1}) ${e.vehicle_no || 'No Vehicle'} · ${Number(e.net_kg).toLocaleString()} kg\n`;
      const lots = getEntryLots(e);
      if (e.status === 'RATE_PENDING' || lots.length === 0) {
        msg += `   Rates: Rate Pending\n\n`;
      } else {
        lots.forEach((lot) => {
          const pStr = lot.parts
            .map((p) => `${p.fish}${lot.isMixed ? ` (${p.pct}%)` : ''} ₹${p.rate !== null && p.rate !== undefined ? p.rate : '—'}`)
            .join(', ');
          msg += `   ${lot.box_count} Box${lot.box_count > 1 ? 'es' : ''}: ${pStr}${
            lot.isMixed && lot.avgRate ? ` (Avg: ₹${lot.avgRate}/kg)` : ''
          }\n`;
        });
        msg += '\n';
      }
    });

    msg += `Total net: ${Number(partyTotalNet).toLocaleString()} kg\nReport attached (${shareFormat}).`;
    return msg;
  }, [shareParty, fromDate, toDate, allEntries, filteredEntries, shareFormat, activeBranch]);

  const handleOpenShare = () => {
    const defaultParty = selectedParty || partiesInEntries[0] || '';
    setShareParty(defaultParty);
    setSharePhone(CLIENT_PHONES[defaultParty] || '');
    setShareModalOpen(true);
  };

  const handleSendWhatsApp = () => {
    const cleanedPhone = sharePhone.replace(/\D/g, '');
    const url = `https://wa.me/${cleanedPhone}?text=${encodeURIComponent(whatsappMessage)}`;
    window.open(url, '_blank');
    setShareModalOpen(false);
    setToastMessage(`WhatsApp opened for ${shareParty || 'all clients'}`);
    setTimeout(() => setToastMessage(''), 4000);
  };

  const handleCopySummary = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(whatsappMessage);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = whatsappMessage;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setToastMessage('Summary copied to clipboard');
      setTimeout(() => setToastMessage(''), 3000);
    } catch (err) {
      console.warn('Copy error:', err);
      setToastMessage('Failed to copy to clipboard');
      setTimeout(() => setToastMessage(''), 3000);
    }
  };

  const handleShare = async () => {
    if (filteredEntries.length === 0) {
      setToastMessage('No entries to share');
      setTimeout(() => setToastMessage(''), 3000);
      return;
    }

    const branchName = activeBranch?.branch_name || 'Ullal';
    const dateRangeLabel = fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`;
    const title = `Daily Procurement Statement - ${branchName} (${dateRangeLabel})`;

    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: whatsappMessage,
        });
        setToastMessage('Statement shared successfully');
        setTimeout(() => setToastMessage(''), 3000);
        return;
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn('[Statement] navigator.share error:', err);
        }
      }
    }

    handleOpenShare();
  };

  const handleExportExcel = () => {
    if (filteredEntries.length === 0) {
      setToastMessage('No entries to export for selected dates/filters');
      setTimeout(() => setToastMessage(''), 3000);
      return;
    }

    const headers = [
      'SL No',
      'Date',
      'Slip No',
      'Party Name',
      'Vehicle No',
      'Gross Loaded (kg)',
      'Empty Tare (kg)',
      'Ice Deduction (kg)',
      'Net Weight (kg)',
      'Remarks / Box Mix',
      'Rate Details (₹/kg)',
      'Status',
    ];

    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = filteredEntries.map((e, idx) => {
      const lots = getEntryLots(e);
      let rateDetails = 'Rate Pending';
      if (e.status !== 'RATE_PENDING' && lots.length > 0) {
        rateDetails = lots
          .map((lot) => {
            const partsStr = lot.parts
              .map((p) => `${p.fish}${lot.isMixed ? ` (${p.pct}%)` : ''}: ₹${p.rate !== null && p.rate !== undefined ? p.rate : '—'}`)
              .join(', ');
            return `${lot.box_count} Box${lot.box_count > 1 ? 'es' : ''} [${partsStr}${
              lot.isMixed && lot.avgRate ? ` | Avg: ₹${lot.avgRate}/kg` : ''
            }]`;
          })
          .join('; ');
      }

      const dateStr = e.entry_date ? e.entry_date.split('T')[0] : '';

      return [
        idx + 1,
        escapeCSV(dateStr),
        escapeCSV(e.slip_no || `SL-${e.daily_sl_no || idx + 1}`),
        escapeCSV(e.party_name),
        escapeCSV(e.vehicle_no || ''),
        parseFloat(e.gross_loaded_kg) || 0,
        parseFloat(e.empty_tare_kg) || 0,
        parseFloat(e.ice_water_kg) || 0,
        parseFloat(e.net_kg) || 0,
        escapeCSV(e.remarks || ''),
        escapeCSV(rateDetails),
        escapeCSV(e.status || ''),
      ].join(',');
    });

    const totalGross = filteredEntries.reduce((s, e) => s + (parseFloat(e.gross_loaded_kg) || 0), 0);
    const totalTare = filteredEntries.reduce((s, e) => s + (parseFloat(e.empty_tare_kg) || 0), 0);
    const totalIce = filteredEntries.reduce((s, e) => s + (parseFloat(e.ice_water_kg) || 0), 0);
    const totalNet = filteredEntries.reduce((s, e) => s + (parseFloat(e.net_kg) || 0), 0);

    const totalsRow = [
      'TOTAL',
      '',
      '',
      '',
      '',
      totalGross,
      totalTare,
      totalIce,
      totalNet,
      '',
      '',
      '',
    ].join(',');

    const csvContent = '\uFEFF' + [headers.join(','), ...rows, totalsRow].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const branchCode = (activeBranch?.branch_code || 'BRANCH').toUpperCase();
    link.setAttribute('download', `TallyFish_${branchCode}_Statement_${fromDate}_to_${toDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setToastMessage(`Exported ${filteredEntries.length} slips to Excel/CSV`);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleExportPDF = () => {
    if (filteredEntries.length === 0) {
      setToastMessage('No entries to print for selected dates/filters');
      setTimeout(() => setToastMessage(''), 3000);
      return;
    }

    const branchCode = activeBranch?.branch_code || 'ULLAL';
    const branchName = activeBranch?.branch_name || 'Ullal Unit';
    const title = `Daily Procurement Statement - ${branchName}`;

    const totalGross = filteredEntries.reduce((s, e) => s + (parseFloat(e.gross_loaded_kg) || 0), 0);
    const totalTare = filteredEntries.reduce((s, e) => s + (parseFloat(e.empty_tare_kg) || 0), 0);
    const totalIce = filteredEntries.reduce((s, e) => s + (parseFloat(e.ice_water_kg) || 0), 0);
    const totalNet = filteredEntries.reduce((s, e) => s + (parseFloat(e.net_kg) || 0), 0);

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.print();
      return;
    }

    const tableRowsHtml = filteredEntries
      .map((e, idx) => {
        const lots = getEntryLots(e);
        const rateHtml =
          e.status === 'RATE_PENDING'
            ? '<span style="color:#b45309; font-weight: bold;">Rate Pending</span>'
            : lots.length > 0
            ? lots
                .map((l) => {
                  const partsHtml = l.parts
                    .map(
                      (p) =>
                        `<div style="display:flex; justify-content:space-between; gap:10px; font-size:10.5px; padding:1px 0;">
                           <span>${p.fish}${l.isMixed ? ` <span style="color:#64748b;">(${p.pct}%)</span>` : ''}</span>
                           <strong style="font-family:monospace;">₹${p.rate !== null && p.rate !== undefined ? p.rate : '—'}</strong>
                         </div>`
                    )
                    .join('');
                  return `
                    <div style="margin-bottom: 5px; padding: 4px 6px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; text-align: left;">
                      <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:10px; color:#334155; border-bottom:1px solid #e2e8f0; padding-bottom:2px; margin-bottom:3px;">
                        <span>${l.box_count} ${l.box_count === 1 ? 'Box' : 'Boxes'} ${l.isMixed ? '· Mixed' : ''}</span>
                        ${l.isMixed && l.avgRate ? `<span style="color:#1d4ed8; font-family:monospace;">Avg: ₹${l.avgRate}</span>` : ''}
                      </div>
                      ${partsHtml}
                    </div>
                  `;
                })
                .join('')
            : '—';

        const dateStr = e.entry_date ? e.entry_date.split('T')[0] : '';

        return `
          <tr>
            <td style="text-align: center; font-weight: bold;">${idx + 1}</td>
            <td>${dateStr}</td>
            <td style="font-family: monospace;">${e.slip_no || `#${e.daily_sl_no || idx + 1}`}</td>
            <td><strong>${e.party_name}</strong></td>
            <td style="font-family: monospace;">${e.vehicle_no || ''}</td>
            <td style="text-align: right; font-family: monospace;">${Number(e.gross_loaded_kg || 0).toLocaleString()}</td>
            <td style="text-align: right; font-family: monospace;">${Number(e.empty_tare_kg || 0).toLocaleString()}</td>
            <td style="text-align: right; font-family: monospace;">${Number(e.ice_water_kg || 0).toLocaleString()}</td>
            <td style="text-align: right; font-family: monospace; font-weight: bold;">${Number(e.net_kg || 0).toLocaleString()}</td>
            <td style="font-size: 11px;">${e.remarks || '—'}</td>
            <td style="text-align: right; font-family: monospace; font-size: 11px;">${rateHtml}</td>
          </tr>
        `;
      })
      .join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${title}</title>
          <style>
            @page {
              size: A4 landscape;
              margin: 10mm;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #0f172a;
              margin: 0;
              padding: 16px;
              font-size: 12px;
            }
            .header {
              border-bottom: 2px solid #0f172a;
              padding-bottom: 12px;
              margin-bottom: 16px;
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
            }
            .title {
              font-size: 18px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin: 0 0 4px 0;
            }
            .subtitle {
              font-size: 12px;
              color: #475569;
              margin: 0;
            }
            .meta-box {
              text-align: right;
              font-size: 11px;
              color: #334155;
            }
            .summary-strip {
              display: flex;
              gap: 16px;
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              padding: 10px 16px;
              border-radius: 8px;
              margin-bottom: 16px;
              font-size: 12px;
            }
            .summary-item strong {
              font-size: 13px;
              color: #0f172a;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 24px;
            }
            th {
              background-color: #f1f5f9;
              color: #334155;
              font-size: 11px;
              font-weight: 700;
              text-transform: uppercase;
              border: 1px solid #cbd5e1;
              padding: 6px 8px;
              text-align: left;
            }
            td {
              border: 1px solid #e2e8f0;
              padding: 6px 8px;
              vertical-align: middle;
            }
            tr:nth-child(even) td {
              background-color: #f8fafc;
            }
            .total-row td {
              background-color: #f1f5f9;
              font-weight: bold;
              border-top: 2px solid #334155;
              border-bottom: 2px solid #334155;
            }
            .signatures {
              margin-top: 40px;
              display: flex;
              justify-content: space-between;
              page-break-inside: avoid;
            }
            .signature-box {
              width: 28%;
              text-align: center;
              border-top: 1px solid #64748b;
              padding-top: 6px;
              font-size: 11px;
              font-weight: 600;
              color: #475569;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1 class="title">Indo Fish Meal &amp; Oil Co. Pvt. Ltd.</h1>
              <p class="subtitle">Procurement Statement · <strong>${branchName} (${branchCode})</strong></p>
            </div>
            <div class="meta-box">
              <div><strong>Period:</strong> ${fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`}</div>
              <div><strong>Generated:</strong> ${new Date().toLocaleString()}</div>
              <div><strong>Status:</strong> ${statusFilter}</div>
            </div>
          </div>

          <div class="summary-strip">
            <div class="summary-item">Total Slips: <strong>${filteredEntries.length}</strong></div>
            <div class="summary-item">Total Gross: <strong>${Number(totalGross).toLocaleString()} kg</strong></div>
            <div class="summary-item">Total Tare: <strong>${Number(totalTare).toLocaleString()} kg</strong></div>
            <div class="summary-item">Total Ice: <strong>${Number(totalIce).toLocaleString()} kg</strong></div>
            <div class="summary-item">Total Net Weight: <strong>${Number(totalNet).toLocaleString()} kg</strong></div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 30px; text-align: center;">#</th>
                <th>Date</th>
                <th>Slip No</th>
                <th>Party Name</th>
                <th>Vehicle No</th>
                <th style="text-align: right;">Gross (kg)</th>
                <th style="text-align: right;">Tare (kg)</th>
                <th style="text-align: right;">Ice (kg)</th>
                <th style="text-align: right;">Net (kg)</th>
                <th>Remarks / Mix</th>
                <th style="text-align: right;">Rate (₹/kg)</th>
              </tr>
            </thead>
            <tbody>
              ${tableRowsHtml}
              <tr class="total-row">
                <td colspan="5" style="text-align: right; padding-right: 12px;">TOTALS:</td>
                <td style="text-align: right; font-family: monospace;">${Number(totalGross).toLocaleString()}</td>
                <td style="text-align: right; font-family: monospace;">${Number(totalTare).toLocaleString()}</td>
                <td style="text-align: right; font-family: monospace;">${Number(totalIce).toLocaleString()}</td>
                <td style="text-align: right; font-family: monospace;">${Number(totalNet).toLocaleString()}</td>
                <td></td>
                <td></td>
              </tr>
            </tbody>
          </table>

          <div class="signatures">
            <div class="signature-box">Weighbridge Staff Signature</div>
            <div class="signature-box">Billing Admin Signature</div>
            <div class="signature-box">Authorized Signatory</div>
          </div>

          <script>
            window.focus();
            setTimeout(() => {
              window.print();
            }, 350);
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();

    setToastMessage('PDF report opened for print/save');
    setTimeout(() => setToastMessage(''), 3000);
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="light-card p-4 rounded-2xl flex items-center justify-between">
        <div>
          <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-amber-600" />
            Daily Procurement Statement
          </h2>
          <p className="text-xs text-slate-500">
            {fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`} · {activeBranch?.branch_name}
          </p>
        </div>

        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-amber-600' : ''}`} />
        </button>
      </div>

      {toastMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold">
          {toastMessage}
        </div>
      )}

      {/* Filter Control Box */}
      <div className="light-card p-4 rounded-2xl space-y-3">
        {/* Preset chips */}
        <div className="flex gap-1.5 overflow-x-auto">
          {[
            ['today', 'Today'],
            ['yesterday', 'Yesterday'],
            ['7days', 'Last 7 days'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setDatePreset(key)}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700"
            >
              {label}
            </button>
          ))}
        </div>

        {/* From - To date inputs */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
              From
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
              To
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800"
            />
          </div>
        </div>

        {/* Party dropdown and search query */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select
            value={selectedParty}
            onChange={(e) => setSelectedParty(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800"
          >
            <option value="">All Parties</option>
            {partiesInEntries.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Search vehicle, remarks"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800"
          />
        </div>

        {/* Status filter chips */}
        <div className="flex gap-1.5 pt-1">
          {['All', 'Rate pending', 'Rate set'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all ${
                statusFilter === s
                  ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
              }`}
            >
              {s}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setDatePreset('today');
              setSelectedParty('');
              setStatusFilter('All');
              setSearchQuery('');
            }}
            className="text-xs font-semibold px-3 py-1.5 rounded-xl text-slate-500 hover:text-slate-800 ml-auto"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Summary Stats Row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="light-card p-3 rounded-xl text-center">
          <span className="text-xl font-black font-mono text-slate-900 block">
            {filteredEntries.length}
          </span>
          <span className="text-[11px] text-slate-500">Entries</span>
        </div>
        <div className="light-card p-3 rounded-xl text-center">
          <span className="text-xl font-black font-mono text-blue-700 block">
            {filteredEntries.length} / {filteredEntries.length}
          </span>
          <span className="text-[11px] text-slate-500">Weighed</span>
        </div>
        <div className="light-card p-3 rounded-xl text-center">
          <span className="text-xl font-black font-mono text-slate-900 block">
            {Number(totalNetKg).toLocaleString()}
          </span>
          <span className="text-[11px] text-slate-500">Net kg</span>
        </div>
      </div>

      {/* Pending Rate Warning Banner */}
      {pendingRateCount > 0 && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-semibold flex items-center justify-between">
          <span>{pendingRateCount} entries still need a rate.</span>
          {isOwner ? (
            <button
              onClick={() => onNavigateToRates && onNavigateToRates()}
              className="underline font-bold text-amber-900 hover:text-amber-950"
            >
              Set Rates →
            </button>
          ) : (
            <span className="text-slate-500 font-normal">Waiting for owner</span>
          )}
        </div>
      )}

      {/* Procurement Slips Table */}
      <div className="light-card rounded-2xl overflow-hidden">
        {filteredEntries.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <p className="text-slate-500 text-xs font-medium">
              No entries found for {activeBranch?.branch_name} on {fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`}.
            </p>
            {availableBranches && availableBranches.length > 1 && (
              <div className="flex flex-wrap justify-center gap-2 pt-1">
                {availableBranches
                  .filter((b) => b.branch_id !== activeBranchId)
                  .map((other) => (
                    <button
                      key={other.branch_id}
                      type="button"
                      onClick={() => setActiveBranchId(other.branch_id)}
                      className="text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-xl px-3.5 py-2 transition-all shadow-sm"
                    >
                      Switch to {other.branch_name} ({other.branch_code}) →
                    </button>
                  ))}
              </div>
            )}
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-2.5 px-3">SL</th>
                <th className="py-2.5 px-3">Party / Vehicle</th>
                <th className="py-2.5 px-3 text-right">Net kg</th>
                <th className="py-2.5 px-3 text-right">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredEntries.map((e, idx) => {
                const needsRate = e.status === 'RATE_PENDING';
                return (
                  <tr key={e.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-3 font-mono font-bold text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-3">
                      <strong className="text-slate-900 block text-sm">{e.party_name}</strong>
                      <span className="text-slate-500 font-mono text-[11px]">
                        {e.vehicle_no || 'Weights pending'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-800">
                      {Number(e.net_kg).toLocaleString()}
                    </td>
                    <td
                      onClick={() => {
                        if (isOwner && onNavigateToRates) {
                          onNavigateToRates(e.id);
                        }
                      }}
                      className={`py-3 px-3 text-right font-mono ${
                        isOwner ? 'cursor-pointer hover:opacity-80' : ''
                      }`}
                    >
                      {needsRate ? (
                        <span className="text-amber-600 font-bold text-xs bg-amber-50 border border-amber-200 px-2 py-1 rounded-md inline-block">
                          Rate Pending
                        </span>
                      ) : (
                        <div className="space-y-1.5 inline-flex flex-col items-end">
                          {getEntryLots(e).map((lot, lIdx) => (
                            <div
                              key={lot.groupId || lIdx}
                              className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-left text-xs leading-tight min-w-[155px] shadow-2xs"
                            >
                              <div className="flex items-center justify-between gap-2 font-bold text-slate-700 pb-1 border-b border-slate-200/70 text-[10px]">
                                <span className="font-mono text-slate-800 font-black">
                                  {lot.box_count} {lot.box_count === 1 ? 'Box' : 'Boxes'} {lot.isMixed ? '· Mixed' : ''}
                                </span>
                                {lot.isMixed && lot.avgRate ? (
                                  <span className="text-blue-700 font-mono font-bold">
                                    Avg ₹{lot.avgRate}
                                  </span>
                                ) : !lot.isMixed && lot.avgRate ? (
                                  <span className="text-slate-900 font-mono font-bold">
                                    ₹{lot.avgRate}
                                  </span>
                                ) : null}
                              </div>
                              <div className="pt-1.5 space-y-1">
                                {lot.parts.map((p, pIdx) => (
                                  <div
                                    key={pIdx}
                                    className="flex items-center justify-between gap-3 text-slate-600 font-mono text-[11px]"
                                  >
                                    <span>
                                      {p.fish} {lot.isMixed ? `(${p.pct}%)` : ''}
                                    </span>
                                    <span className="font-bold text-slate-900">
                                      {p.rate !== null && p.rate !== undefined ? `₹${p.rate}` : '—'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer Actions */}
      {isBilling ? (
        <div className="light-card p-4 rounded-2xl space-y-3">
          <button
            type="button"
            onClick={handleOpenShare}
            className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 transition-all"
          >
            <Send className="w-4 h-4" /> Send to client on WhatsApp
          </button>
          <p className="text-[11px] text-slate-500 text-center">
            {selectedParty ? `Client: ${selectedParty}` : 'Choose a client in the filter or pick in the next step.'}
          </p>

          <div className="pt-2 border-t border-slate-100">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
              Daily Report · All Clients
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleExportExcel}
                className="py-2.5 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-700 hover:bg-slate-50 shadow-sm flex items-center justify-center gap-1.5 transition-all"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                Excel Export
              </button>
              <button
                type="button"
                onClick={handleExportPDF}
                className="py-2.5 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-700 hover:bg-slate-50 shadow-sm flex items-center justify-center gap-1.5 transition-all"
              >
                <Printer className="w-3.5 h-3.5 text-slate-500" />
                PDF Export
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={handleShare}
            className="py-2.5 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-700 hover:bg-slate-50 shadow-sm flex items-center justify-center gap-1.5 transition-all"
          >
            <Share2 className="w-3.5 h-3.5 text-slate-500" />
            Share
          </button>
          <button
            type="button"
            onClick={handleExportPDF}
            className="py-2.5 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-700 hover:bg-slate-50 shadow-sm flex items-center justify-center gap-1.5 transition-all"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            PDF
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="py-2.5 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-700 hover:bg-slate-50 shadow-sm flex items-center justify-center gap-1.5 transition-all"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            Excel
          </button>
        </div>
      )}

      {/* WhatsApp Share Modal Sheet */}
      {shareModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-3xl p-5 border border-slate-200 shadow-xl space-y-3.5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-bold text-base text-slate-900">Send Statement</h3>
              <button
                onClick={() => setShareModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Client / Vendor
              </label>
              <select
                value={shareParty}
                onChange={(e) => {
                  setShareParty(e.target.value);
                  setSharePhone(CLIENT_PHONES[e.target.value] || '');
                }}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800"
              >
                <option value="">All Clients (Full Statement)</option>
                {partiesInEntries.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            {shareParty && (
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Client WhatsApp Number
                </label>
                <input
                  type="text"
                  value={sharePhone}
                  onChange={(e) => setSharePhone(e.target.value)}
                  placeholder="+91 ..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800"
                />
              </div>
            )}

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Attach File Format
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShareFormat('Excel');
                    handleExportExcel();
                  }}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                    shareFormat === 'Excel'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Download className="w-3.5 h-3.5" />
                  Excel (.csv)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShareFormat('PDF');
                    handleExportPDF();
                  }}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                    shareFormat === 'PDF'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Printer className="w-3.5 h-3.5" />
                  PDF Report
                </button>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Message Preview
              </label>
              <textarea
                readOnly
                value={whatsappMessage}
                className="w-full h-32 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-mono text-slate-700 resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={handleCopySummary}
                className="py-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
              >
                <Copy className="w-4 h-4 text-slate-500" /> Copy Text
              </button>
              <button
                type="button"
                onClick={handleSendWhatsApp}
                className="py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md flex items-center justify-center gap-1.5 transition-all"
              >
                <Send className="w-4 h-4" /> Open WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
